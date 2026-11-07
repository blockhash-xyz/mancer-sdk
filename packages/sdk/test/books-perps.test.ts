import nodeTest, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import { getAddress, keccak256, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { BOOKS_DEPLOYMENT, BOOK_SHARED, type BookDeployment } from '../src/kit/books/deployments'
import { BOOK_PERPS_DEPLOYMENTS, bookPerpsKeyAuthorization, encodeBookPerpsRoute, type BookPerpsDeployment } from '../src/kit/books/perps'
import { LIGHTER_RH_DEPLOYMENT } from '../src/kit/lighter/deployments'
import { MANCER_SPLIT_SIGNER, splitKeyHex, type SplitShare, type SplitSigner, type SplitTx } from '../src/kit/lighter/split'
import { bookCallData, confirmTradeCall, proposeTradeCall } from '../src/kit/books/calls'
import { bookTradeIntentFromQuote } from '../src/kit/books/typed-data'
import {
  BOOKS_PERPS_SEND_URL,
  Mancer,
  MancerCheckError,
  bookQuoteDigest,
  booksPerpsSplitFilesFrom,
  loadBooksPerpsSplit,
  readBooksPerpsShare,
  sendBookPerpsOrder,
  writeBooksPerpsShare,
  type BookPerpsBoundKey,
  type BookPerpsOrderRequest,
  type BooksPerpsShare,
  type ChainBook,
} from '../src/index'
import { NOW, SIM_OK, TRUSTED, codeAt, contractsAnswer, fakeChain, mockApi } from './helpers'

// Perps inside Books from a bot that holds its own half of the vault's split Lighter key, end to end against a stand-in
// API and chain: Mancer's half is the kit's own service side of the real split signer (the files the site serves, held to
// the kit's pin), so every signature here is a real two-party signature Lighter's verifier checks. Every key is made here
// and thrown away; nothing is sent anywhere.

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SERVED = join(repo, 'packages/web/public/lighter-split')
const LIGHTER_CHAIN = 466_324

const me = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const other = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a')
const attacker = privateKeyToAccount('0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6')
const mancerSigner = privateKeyToAccount('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a')
const sessionOf = (a: Address) => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: a.toLowerCase(), iat: 1, exp: 4_000_000_000 })).toString('base64url')}.x`

const BOOK = getAddress('0x' + 'aa'.repeat(20))
const VAULT = getAddress('0x' + 'bb'.repeat(20))
const NFT = getAddress('0x' + 'dd'.repeat(20))
const ACCOUNT = getAddress('0x' + 'ac'.repeat(20))
const INDEX = 700_123

const hashAt = (a: string) => keccak256(codeAt(a))
function standInDeployment(d: BookDeployment): BookDeployment {
  const pin = <T extends { address: Address; runtimeCodeHash: Hex }>(p: T): T => ({ ...p, runtimeCodeHash: hashAt(p.address) })
  return {
    ...d,
    factory: pin(d.factory), pad: pin(d.pad), settler: pin(d.settler), lpFees: pin(d.lpFees), locker: pin(d.locker), operatorNft: pin(d.operatorNft),
    ...(d.lockerV4 ? { lockerV4: pin(d.lockerV4) } : {}),
    adapters: { uniswap: pin(d.adapters.uniswap), ...(d.adapters.mancer ? { mancer: pin(d.adapters.mancer) } : {}) },
    bookTokenCodeHash: hashAt(BOOK), vaultCloneCodeHash: hashAt(VAULT),
  }
}
const D = standInDeployment(BOOKS_DEPLOYMENT)
const P0 = BOOK_PERPS_DEPLOYMENTS.find((p) => p.factory.toLowerCase() === D.factory.address.toLowerCase())!
const P: BookPerpsDeployment = { ...P0, runtimeCodeHash: hashAt(P0.adapter) }
const CHAIN_BOOK: ChainBook = { deployment: D, token: BOOK, bookId: 7n, vault: VAULT }

let split: SplitSigner
const dirs: string[] = []

// the split signer's files are the site's (packages/web/public/lighter-split), which the published repository does not
// carry: there, these tests skip and say why
const HAVE = fs.existsSync(join(SERVED, MANCER_SPLIT_SIGNER.wasm.file))
const test = HAVE ? nodeTest : (name: string, _fn: unknown) => nodeTest.skip(`${name} (the split signer's files are not in this tree)`)

before(async () => {
  if (!HAVE) return
  // a module that is not the pinned build runs nothing
  const bad = booksPerpsSplitFilesFrom(fs, SERVED)
  bad.wasm[4096] ^= 1
  await assert.rejects(loadBooksPerpsSplit(bad, { evaluate: () => assert.fail('nothing runs before the pin') }), /pinned build/)
  split = await loadBooksPerpsSplit(booksPerpsSplitFilesFrom(fs, SERVED), { evaluate: (code) => runInThisContext(code, { filename: MANCER_SPLIT_SIGNER.runtime.file }) })
  // a second load is held to the pin and answers the one running
  assert.equal(await loadBooksPerpsSplit(booksPerpsSplitFilesFrom(fs, SERVED)), split)
  bad.wasm[4096] ^= 1
  bad.wasm[100] ^= 1
  await assert.rejects(loadBooksPerpsSplit(bad), MancerCheckError)
})
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** Mancer's side, as the vault-key service runs it: a key generation per context, a share kept per joint key, and a half
 * signed over the hash it builds itself. */
class StandInService {
  shares = new Map<string, SplitShare>()
  keyGen(context: string, msg: Parameters<SplitSigner['serviceKeyGen']>[1]) {
    const r = split.serviceKeyGen(context, msg)
    this.shares.set(r.share.group, r.share)
    return r
  }
  sign(group: string, tx: SplitTx, commitment: Parameters<SplitSigner['serviceSign']>[3]) {
    const share = this.shares.get(group.replace(/^0x/, ''))!
    return split.serviceSign(share, LIGHTER_CHAIN, tx, commitment, split.txHash(tx).hash)
  }
}

interface Stand {
  m: Mancer
  api: Awaited<ReturnType<typeof mockApi>>
  service: StandInService
  state: { traders: Address[]; pending: unknown[] | null; bound: Map<number, BookPerpsBoundKey>; tamper: Record<string, (x: any) => any> }
  sent: Array<{ txType: number; txInfo: string; txHash: string }>
}

const NO_PENDING = ['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', 0n, 0n, '0x', 0n, 0n, 0n, '0x']

async function stand(wallet = me, traders: Address[] = [me.address]): Promise<Stand> {
  const service = new StandInService()
  const state: Stand['state'] = { traders, pending: null, bound: new Map(), tamper: {} }
  const sent: Stand['sent'] = []
  const chain = fakeChain({
    bookIdOfToken: ([t]) => (String(t).toLowerCase() === BOOK.toLowerCase() ? 7n : 0n),
    bookOf: () => [BOOK, VAULT, NFT],
    tradersOf: () => state.traders,
    perpsAccountOf: () => ACCOUNT,
    masterAccountIndex: () => BigInt(INDEX),
    mancerSigner: () => mancerSigner.address,
    tradeNonce: () => 3n,
    pending: () => state.pending ?? NO_PENDING,
  }) as PublicClient
  const t = (k: string, x: any) => (state.tamper[k] ? state.tamper[k]!(x) : x)
  const api = await mockApi({
    'GET /v1/contracts': () => ({ body: contractsAnswer() }),
    'POST /v1/books/:token/perps/keys': (req) => {
      const b = req.body as { wallet: Address; context: string; msg: Parameters<SplitSigner['serviceKeyGen']>[1]; signature: Hex }
      const slot = 42 + state.traders.findIndex((x) => x.toLowerCase() === b.wallet.toLowerCase())
      const r = service.keyGen(b.context, b.msg)
      const key: BookPerpsBoundKey = {
        slot, trader: b.wallet.toLowerCase(), context: b.context, traderMsg: b.msg, mancerMsg: r.msg, group: `0x${r.share.group}`,
        authorization: { message: bookPerpsKeyAuthorization({ token: BOOK, account: ACCOUNT, chainId: LIGHTER_CHAIN, slot, traderShare: splitKeyHex(b.msg.public), context: b.context }), signature: b.signature },
        createdAt: new Date().toISOString(),
      }
      state.bound.set(slot, key)
      return { body: t('key', { key, registered: false }) }
    },
    'POST /v1/books/:token/perps/deposit': async (req) => {
      const b = req.body as { wallet: Address; amount: string; key: Hex }
      const slot = 42 + state.traders.findIndex((x) => x.toLowerCase() === b.wallet.toLowerCase())
      const bound = state.bound.get(slot) ?? null
      const routeKey = t('routeKey', { slot, pubKey: (bound?.group ?? '0x') as Hex })
      const q = t('quote', {
        adapter: P.adapter, tokenIn: getAddress(LIGHTER_RH_DEPLOYMENT.collateral.token), tokenOut: getAddress(BOOK_SHARED.weth), amountIn: BigInt(b.amount), minOut: 0n,
        route: encodeBookPerpsRoute({ account: ACCOUNT, apiKeyIndex: routeKey.slot, pubKey: routeKey.pubKey }), deadline: BigInt(NOW + 300), salt: 99n,
      })
      const signature = await t('signer', mancerSigner).sign({ hash: bookQuoteDigest(CHAIN_BOOK, q) })
      const call = bookCallData(proposeTradeCall(D, VAULT, bookTradeIntentFromQuote({ ...q, signature }, 3n)))
      const wire = Object.fromEntries(Object.entries({ ...q, signature }).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : String(v).toLowerCase()]))
      return {
        body: t('deposit', {
          chainId: 4663, wallet: b.wallet.toLowerCase(), steps: [{ kind: 'proposeTrade', to: call.to.toLowerCase(), data: call.data, value: '0', gas: null, why: '' }],
          simulation: SIM_OK, readAfter: null, quote: wire, digest: bookQuoteDigest(CHAIN_BOOK, q), account: { address: ACCOUNT.toLowerCase(), deployed: true, accountIndex: INDEX },
          key: { slot, carried: routeKey.pubKey !== '0x', reason: 'first-deposit', bound: t('bound', bound) }, confirm: null,
        }),
      }
    },
    'POST /v1/books/:token/perps/orders': (req) => {
      const b = req.body as { wallet: Address; kind: SplitTx['kind']; params: SplitTx['params']; key: Hex; commitment: Parameters<SplitSigner['serviceSign']>[3] }
      const slot = 42 + state.traders.findIndex((x) => x.toLowerCase() === b.wallet.toLowerCase())
      const tx: SplitTx = t('tx', { chainId: LIGHTER_CHAIN, kind: b.kind, accountIndex: INDEX, apiKeyIndex: slot, nonce: 11, expiredAt: Date.now() + 50_000, params: b.params })
      const mancer = t('mancer', service.sign(b.key, tx, b.commitment))
      return {
        body: t('order', {
          tx, mancer, txType: mancer.txType, txHash: mancer.hash, nonce: tx.nonce, expiresAt: tx.expiredAt, account: { address: ACCOUNT.toLowerCase(), accountIndex: INDEX, slot, key: b.key },
          kind: b.kind, risk: 'adds', market: null, send: { url: BOOKS_PERPS_SEND_URL, fields: { tx_type: mancer.txType, tx_info: 'txInfo', price_protection: true }, why: '' },
          report: { method: 'POST', path: `/v1/books/${BOOK}/perps/orders/${mancer.hash}` },
        }),
      }
    },
    'POST /v1/books/:token/perps/orders/:hash': (req) => ({ body: { txHash: req.path.split('/').pop(), status: 'pending', nonce: 11, expiresAt: null } }),
    'GET /v1/books/:token/perps': () => ({
      body: {
        book: { token: BOOK.toLowerCase(), vault: VAULT.toLowerCase(), bookId: '7', factory: D.factory.address.toLowerCase(), phase: 'trading', traders: state.traders.map((x) => x.toLowerCase()) },
        trader: true, account: { address: ACCOUNT.toLowerCase(), deployed: true, accountIndex: INDEX },
        keys: state.traders.map((tr, i) => ({ slot: 42 + i, trader: tr.toLowerCase(), lighterKey: null, lighterKeyRead: true, bound: t('readBound', state.bound.get(42 + i) ?? null), registered: false })),
      },
    }),
    'POST /v1/books/:token/steps': (req) => {
      const b = req.body as { wallet: Address }
      const pending = state.pending!
      const [adapter, tokenIn, tokenOut, amountIn, minOut, route, nonce, deadline, quoteSalt, mancerSig] = pending as [Address, Address, Address, bigint, bigint, Hex, bigint, bigint, bigint, Hex]
      const call = bookCallData(confirmTradeCall(D, VAULT, { adapter, tokenIn, tokenOut, amountIn, minOut, route, nonce, deadline, quoteSalt, mancerSig }))
      return {
        body: {
          action: 'confirmTrade', book: { token: BOOK.toLowerCase(), bookId: '7', factory: D.factory.address.toLowerCase(), vault: VAULT.toLowerCase(), phase: 'trading' },
          chainId: 4663, wallet: b.wallet.toLowerCase(), steps: [{ kind: 'confirmTrade', to: call.to.toLowerCase(), data: call.data, value: '0', gas: null, why: '' }], simulation: SIM_OK, readAfter: null,
        },
      }
    },
  })
  const walletClient = { getChainId: async () => 4663, sendTransaction: async () => '0x' + '00'.repeat(32) } as unknown as WalletClient
  const m = new Mancer({ baseUrl: api.url, account: wallet, session: sessionOf(wallet.address), trusted: TRUSTED, bookDeployments: [D], bookPerpsDeployments: [P], publicClient: chain, walletClient })
  return { m, api, service, state, sent }
}

const order = (price = 9_711_000) => ({ kind: 'create-order' as const, params: { marketIndex: 1, clientOrderIndex: 515_151, baseAmount: 1200, price, isAsk: false, type: 0, timeInForce: 1, reduceOnly: false, triggerPrice: 0, orderExpiry: Date.now() + 27 * 86_400_000 } })

function sender(s: Stand) {
  return async (signed: { txType: number; txInfo: string; txHash: string }) => {
    // what Lighter's verifier checks: the signature over the transaction's own hash, under the registered (joint) key
    s.sent.push(signed)
    return { txHash: signed.txHash }
  }
}

test("a bot makes its half of the vault's key with Mancer's service, and keeps it in a file no other user reads", async () => {
  const s = await stand()
  try {
    const { share, key } = await s.m.bookPerpsSetupKey(BOOK, split)
    assert.equal(share.slot, 42)
    assert.equal(share.account, ACCOUNT)
    assert.equal(share.key, key.group)
    assert.equal(share.share.party, 1)
    // the request named the wallet's own signature over the kit's authorization of the share, and no secret
    const asked = s.api.seen.find((r) => r.path.endsWith('/perps/keys'))!.body as Record<string, unknown>
    assert.deepEqual(Object.keys(asked).sort(), ['context', 'msg', 'signature', 'wallet'])
    assert.ok(!JSON.stringify(asked).includes(share.share.secret))
    const dir = mkdtempSync(join(tmpdir(), 'sdk-perps-share-'))
    dirs.push(dir)
    const path = join(dir, 'share.json')
    writeBooksPerpsShare(fs, path, share)
    assert.equal(fs.statSync(path).mode & 0o777, 0o600)
    assert.deepEqual(readBooksPerpsShare(fs, path, { expect: { token: BOOK, wallet: me.address, slot: 42, key: share.key } }), share)
    // never over another share, and never read where another user may read it
    assert.throws(() => writeBooksPerpsShare(fs, path, share), /EEXIST/)
    fs.chmodSync(path, 0o644)
    assert.throws(() => readBooksPerpsShare(fs, path), /open to other users/)
    fs.chmodSync(path, 0o600)
    assert.throws(() => readBooksPerpsShare(fs, path, { expect: { slot: 43 } }), /another slot/)
    const forged = join(dir, 'forged.json')
    fs.writeFileSync(forged, JSON.stringify({ ...share, key: splitKeyHex(share.share.public) }), { mode: 0o600 })
    assert.throws(() => readBooksPerpsShare(fs, forged), /another key/)
  } finally {
    await s.api.close()
  }
})

test("a key answer that is not the key asked for is refused, and leaves no key generation open", async () => {
  const s = await stand()
  try {
    // another trader share named as ours
    s.state.tamper.key = (a) => ({ ...a, key: { ...a.key, traderMsg: { ...a.key.traderMsg, public: a.key.mancerMsg.public } } })
    await assert.rejects(s.m.bookPerpsSetupKey(BOOK, split), /another trader share/)
    // another joint key than Mancer's half and ours make
    s.state.tamper.key = (a) => ({ ...a, key: { ...a.key, group: splitKeyHex(a.key.traderMsg.public) } })
    await assert.rejects(s.m.bookPerpsSetupKey(BOOK, split), /joint key/)
    // Mancer's message of another key generation: its proof is bound to another context
    const elsewhere = split.serviceKeyGen(
      'mancer-books-perps:v1:chain=466324:account=0xacacacacacacacacacacacacacacacacacacacac:slot=42:session=' + '11'.repeat(16),
      split.keyGenStart('mancer-books-perps:v1:chain=466324:account=0xacacacacacacacacacacacacacacacacacacacac:slot=42:session=' + '11'.repeat(16)),
    )
    s.state.tamper.key = (a) => ({ ...a, key: { ...a.key, mancerMsg: { ...elsewhere.msg, context: a.key.context } } })
    await assert.rejects(s.m.bookPerpsSetupKey(BOOK, split), /does not finish/)
    // the module holds at most 64 open key generations: seventy refusals leave none of theirs open
    s.state.tamper.key = (a) => ({ ...a, key: { ...a.key, slot: 43 } })
    for (let i = 0; i < 70; i++) await assert.rejects(s.m.bookPerpsSetupKey(BOOK, split), /another slot/)
    s.state.tamper = {}
    assert.equal((await s.m.bookPerpsSetupKey(BOOK, split)).share.slot, 42)
    // a wallet that is no trader of the Book makes no key
    const stranger = await stand(attacker)
    try {
      await assert.rejects(stranger.m.bookPerpsSetupKey(BOOK, split), /not one of the Book's traders/)
    } finally {
      await stranger.api.close()
    }
  } finally {
    await s.api.close()
  }
})

test("a deposit's route carries the bot's own half plus Mancer's, at its slot, or the bot signs nothing", async () => {
  const s = await stand()
  try {
    const { share } = await s.m.bookPerpsSetupKey(BOOK, split)
    const ok = await s.m.bookPerpsDepositSteps(BOOK, split, share, 5_000_000n)
    assert.equal(ok.carried, true)
    assert.equal(ok.checked.steps.length, 1)
    assert.match(ok.checked.readings[0]!.does, /^proposeTrade/)
    // another key: a key the bot holds no half of
    const { share: second } = await s.m.bookPerpsSetupKey(BOOK, split)
    await assert.rejects(s.m.bookPerpsDepositSteps(BOOK, split, share, 5_000_000n), /another key generation|another trader share/)
    // the route's key is Mancer's share joined to another share than the bot's
    s.state.tamper.routeKey = (r) => ({ ...r, pubKey: splitKeyHex(split.join(share.share.public, second.share.peerPublic)) })
    await assert.rejects(s.m.bookPerpsDepositSteps(BOOK, split, second, 5_000_000n), /not this client’s half plus Mancer’s/)
    // another slot than the trader's
    s.state.tamper.routeKey = (r) => ({ ...r, slot: 43 })
    await assert.rejects(s.m.bookPerpsDepositSteps(BOOK, split, second, 5_000_000n), /another slot|a key the answer does not name/)
    // Mancer's message swapped for another's: the proof is of another share than the bot's half was made with
    s.state.tamper = { bound: (b) => ({ ...b, mancerMsg: { ...b.mancerMsg, public: share.share.peerPublic } }) }
    await assert.rejects(s.m.bookPerpsDepositSteps(BOOK, split, second, 5_000_000n), /Mancer’s share is not the one/)
    // a quote not signed by the factory's Mancer signer, or for another amount
    s.state.tamper = { signer: () => attacker }
    await assert.rejects(s.m.bookPerpsDepositSteps(BOOK, split, second, 5_000_000n), /Mancer signer/)
    s.state.tamper = { quote: (q) => ({ ...q, amountIn: q.amountIn + 1n }) }
    await assert.rejects(s.m.bookPerpsDepositSteps(BOOK, split, second, 5_000_000n), /another amount/)
    // a trade waiting on the vault, which a proposal would replace
    s.state.tamper = {}
    s.state.pending = [P.adapter, LIGHTER_RH_DEPLOYMENT.collateral.token, BOOK_SHARED.weth, 1n, 0n, '0x', 1n, 1n, 1n, '0x']
    await assert.rejects(s.m.bookPerpsDepositSteps(BOOK, split, second, 5_000_000n), /a trade waits/)
    s.state.pending = null
    assert.equal((await s.m.bookPerpsDepositSteps(BOOK, split, second, 5_000_000n)).carried, true)
  } finally {
    await s.api.close()
  }
})

test("a co-trader confirms another trader's deposit only where its key is that trader's signed half plus Mancer's", async () => {
  // the vault's traders: `other` at slot 42 proposes, `me` at slot 43 confirms
  const proposer = await stand(other, [other.address, me.address])
  const confirmer = await stand(me, [other.address, me.address])
  try {
    const { share } = await proposer.m.bookPerpsSetupKey(BOOK, split)
    const bound = proposer.state.bound.get(42)!
    confirmer.state.bound.set(42, bound)
    const route = encodeBookPerpsRoute({ account: ACCOUNT, apiKeyIndex: 42, pubKey: share.key })
    confirmer.state.pending = [P.adapter, LIGHTER_RH_DEPLOYMENT.collateral.token, BOOK_SHARED.weth, 5_000_000n, 0n, route, 3n, BigInt(NOW + 300), 99n, '0x' + '11'.repeat(65)]
    const ok = await confirmer.m.bookPerpsConfirmDepositSteps(BOOK, split)
    assert.equal(ok.carriesKey, true)
    assert.equal(ok.amount, 5_000_000n)
    assert.match(ok.checked.readings[0]!.does, /^confirmTrade/)
    // a forged authorization: signed by someone else than the slot's trader
    const forged = await attacker.signMessage({ message: bound.authorization.message })
    confirmer.state.bound.set(42, { ...bound, authorization: { ...bound.authorization, signature: forged } })
    await assert.rejects(confirmer.m.bookPerpsConfirmDepositSteps(BOOK, split), /did not sign/)
    // an authorization of another message than the kit's for that share
    confirmer.state.bound.set(42, { ...bound, authorization: { message: bound.authorization.message.replace('Key slot: 42', 'Key slot: 43'), signature: bound.authorization.signature } })
    await assert.rejects(confirmer.m.bookPerpsConfirmDepositSteps(BOOK, split), /not the kit’s message/)
    // the route's key is not the bound shares joined
    confirmer.state.bound.set(42, bound)
    const { share: mine } = await confirmer.m.bookPerpsSetupKey(BOOK, split)
    confirmer.state.pending = [P.adapter, LIGHTER_RH_DEPLOYMENT.collateral.token, BOOK_SHARED.weth, 5_000_000n, 0n, encodeBookPerpsRoute({ account: ACCOUNT, apiKeyIndex: 42, pubKey: mine.key }), 3n, BigInt(NOW + 300), 99n, '0x' + '11'.repeat(65)]
    await assert.rejects(confirmer.m.bookPerpsConfirmDepositSteps(BOOK, split), /not the slot trader’s share plus Mancer’s/)
    // a slot whose trader is not the bound one
    confirmer.state.pending = [P.adapter, LIGHTER_RH_DEPLOYMENT.collateral.token, BOOK_SHARED.weth, 5_000_000n, 0n, encodeBookPerpsRoute({ account: ACCOUNT, apiKeyIndex: 43, pubKey: share.key }), 3n, BigInt(NOW + 300), 99n, '0x' + '11'.repeat(65)]
    await assert.rejects(confirmer.m.bookPerpsConfirmDepositSteps(BOOK, split), /share plus Mancer’s/)
  } finally {
    await proposer.api.close()
    await confirmer.api.close()
  }
})

test('an order is signed by the two halves only after the answer is held to exactly what was asked, and verifies under the joint key', async () => {
  const s = await stand()
  try {
    const { share } = await s.m.bookPerpsSetupKey(BOOK, split)
    const r = await s.m.bookPerpsOrder(BOOK, split, share, order(), { send: sender(s) })
    assert.equal(r.report?.status, 'pending')
    assert.equal(s.sent.length, 1)
    // what Lighter takes: its own verifier, under the joint key and under neither share alone
    split.verify(r.signed.txType, r.signed.txInfo, LIGHTER_CHAIN, share.share.group)
    assert.throws(() => split.verify(r.signed.txType, r.signed.txInfo, LIGHTER_CHAIN, share.share.public))
    assert.throws(() => split.verify(r.signed.txType, r.signed.txInfo, LIGHTER_CHAIN, share.share.peerPublic))
    const info = JSON.parse(r.signed.txInfo)
    assert.equal(info.ApiKeyIndex, 42)
    assert.equal(info.AccountIndex, INDEX)
    assert.equal(info.Price, 9_711_000)
    // the request named the share's key and a commitment, never the share
    const asked = s.api.seen.filter((x) => x.path.endsWith('/perps/orders')).pop()!.body as Record<string, unknown>
    assert.deepEqual(Object.keys(asked).sort(), ['commitment', 'key', 'kind', 'params', 'wallet'])
    assert.ok(!JSON.stringify(asked).includes(share.share.secret))
    // a reused session: a round one is spent by its signature, and a second finish of it is refused
    const one = split.commit(share.share.group)
    const tx = { ...r.answer.tx, nonce: 12 }
    const half = s.service.sign(share.key, tx, one.commitment)
    split.finish(share.share.group, LIGHTER_CHAIN, one.session, one.commitment, tx, half)
    assert.throws(() => split.finish(share.share.group, LIGHTER_CHAIN, one.session, one.commitment, tx, half), /no such session/)
    // every kind
    const kinds: BookPerpsOrderRequest[] = [
      { kind: 'cancel-order' as const, params: { marketIndex: 1, orderIndex: 515_151 } },
      { kind: 'cancel-all-orders' as const, params: { timeInForce: 0, time: 0, marketIndex: null } },
      { kind: 'modify-order' as const, params: { marketIndex: 1, orderIndex: 515_151, baseAmount: 1300, price: 9_712_000, triggerPrice: 0, orderVersion: 0 } },
      { kind: 'update-leverage' as const, params: { marketIndex: 1, initialMarginFraction: 2000, marginMode: 0 } },
      { kind: 'update-margin' as const, params: { marketIndex: 1, usdcAmount: 2_500_000, direction: 1 } },
      { kind: 'create-order' as const, params: { marketIndex: 1, clientOrderIndex: 7, baseAmount: 1200, price: 9_000_000, isAsk: true, type: 1, timeInForce: 0, reduceOnly: true, triggerPrice: 0, orderExpiry: 0 } },
    ]
    for (const o of kinds) {
      const k = await s.m.bookPerpsOrder(BOOK, split, share, o, { send: sender(s), report: false })
      split.verify(k.signed.txType, k.signed.txInfo, LIGHTER_CHAIN, share.share.group)
    }
  } finally {
    await s.api.close()
  }
})

test("an order whose answer is not what was asked is refused before the bot's half signs, and leaves no round open", async () => {
  const s = await stand()
  try {
    const { share } = await s.m.bookPerpsSetupKey(BOOK, split)
    const cases: Array<[string, Record<string, (x: any) => any>, RegExp]> = [
      ['changed params (the worst price)', { tx: (t) => ({ ...t, params: { ...t.params, price: t.params.price + 1 } }) }, /params are not the ones asked/],
      ['another side', { tx: (t) => ({ ...t, params: { ...t.params, isAsk: true } }) }, /params are not the ones asked/],
      ['another kind', { order: (o) => ({ ...o, tx: { ...o.tx, kind: 'modify-order' } }) }, /another kind/],
      ['another slot', { tx: (t) => ({ ...t, apiKeyIndex: 43 }) }, /another slot/],
      ['another account', { tx: (t) => ({ ...t, accountIndex: INDEX + 1 }) }, /another Lighter account/],
      ['another chain', { order: (o) => ({ ...o, tx: { ...o.tx, chainId: 300 } }) }, /another Lighter chain/],
      ['an expiry far ahead', { tx: (t) => ({ ...t, expiredAt: Date.now() + 600_000 }) }, /expires too soon or too far/],
      ['another key', { order: (o) => ({ ...o, account: { ...o.account, key: splitKeyHex(share.share.public) } }) }, /another key, slot or account/],
      ['an answer over another hash', { mancer: (m) => ({ ...m, hash: 'ab'.repeat(40) }) }, /another hash/],
      ['another send address', { order: (o) => ({ ...o, send: { ...o.send, url: 'https://example.com/api/v1/sendTx' } }) }, /another address/],
      ['a field of its own', { order: (o) => ({ ...o, tx: { ...o.tx, integrator: 5 } }) }, /fields of its own/],
    ]
    for (const [what, tamper, why] of cases) {
      s.state.tamper = tamper
      await assert.rejects(s.m.bookPerpsOrder(BOOK, split, share, order(), { send: sender(s) }), why, what)
    }
    // a changed answer that passes every check of its fields: Mancer's partial altered, so the halves do not combine
    s.state.tamper = { mancer: (m) => ({ ...m, partial: { ...m.partial, z: (m.partial.z[0] === '0' ? '1' : '0') + m.partial.z.slice(1) } }) }
    await assert.rejects(s.m.bookPerpsOrder(BOOK, split, share, order(), { send: sender(s) }), /did not make a signature/)
    assert.equal(s.sent.length, 0)
    // the module holds at most 64 open rounds for a share: seventy refused answers leave none of theirs open
    s.state.tamper = { tx: (t) => ({ ...t, apiKeyIndex: 43 }) }
    for (let i = 0; i < 70; i++) await assert.rejects(s.m.bookPerpsOrder(BOOK, split, share, order(), { send: sender(s) }), /another slot/)
    s.state.tamper = {}
    await s.m.bookPerpsOrder(BOOK, split, share, order(), { send: sender(s), report: false })
    assert.equal(s.sent.length, 1)
    // a share of another slot is no share of this trader
    await assert.rejects(s.m.bookPerpsOrder(BOOK, split, { ...share, slot: 43 } as BooksPerpsShare, order(), { send: sender(s) }), /not of this trader's slot/)
  } finally {
    await s.api.close()
  }
})

test("the send goes to Lighter RH's pinned sendTx with price protection on, and Lighter's hash must be the one signed", async () => {
  const signed = { txType: 14, txInfo: '{"x":1}', txHash: 'ab'.repeat(40) }
  const asked: Array<{ url: string; body: string }> = []
  const lighter = (answer: unknown, status = 200) => (async (url: string, init: RequestInit) => {
    asked.push({ url: String(url), body: String(init.body) })
    return new Response(JSON.stringify(answer), { status })
  }) as unknown as typeof fetch
  assert.deepEqual(await sendBookPerpsOrder(signed, Date.now() + 30_000, { fetch: lighter({ code: 200, tx_hash: signed.txHash }) }), { txHash: signed.txHash })
  assert.equal(asked[0]!.url, 'https://api.rh.lighter.xyz/api/v1/sendTx')
  const form = new URLSearchParams(asked[0]!.body)
  assert.equal(form.get('price_protection'), 'true')
  assert.equal(form.get('tx_type'), '14')
  await assert.rejects(sendBookPerpsOrder(signed, Date.now() + 30_000, { fetch: lighter({ code: 200, tx_hash: 'cd'.repeat(40) }) }), /another transaction/)
  await assert.rejects(sendBookPerpsOrder(signed, Date.now() + 30_000, { fetch: lighter({ code: 20558, message: 'restricted jurisdiction' }) }), (e: { region?: boolean }) => e.region === true)
  await assert.rejects(sendBookPerpsOrder(signed, Date.now() - 1, { fetch: lighter({ code: 200 }) }), /ran out/)
})
