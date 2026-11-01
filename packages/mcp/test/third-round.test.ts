import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { decodeFunctionData, encodeFunctionData, encodeFunctionResult, erc20Abi, getAddress, type Abi, type Address, type Hex } from 'viem'
import { bookAbisFor } from '../../sdk/src/shared'
import { pinnedContracts } from '@blockhash/mancer-sdk'
import { _resetTrustedForTests, trustedOf } from '../src/checks'
import { Connection } from '../src/connection'
import { configFrom } from '../src/config'
import { serveHttp } from '../src/http'
import { Limiter } from '../src/rate'
import { TOOLS, createServer } from '../src/server'
import { _resetTokenMemoForTests, tokenInfos, type ChainSource } from '../src/values'
import type { ApiAnswer, Asker } from '../src/api'
import { BOOK, BOOKS, KEY, ORDERS, QUOTED_OUT, SPENDER, USDG, VAULT, VENUE_ROUTES, WETH, buildAnswer, call, configFor, contractsAnswer, defaultRoutes, httpClient, launchEnvelope, routerEnvelope, standIn, type Route, type StandIn } from './helpers'

/**
 * The fixes of the second reader's second round (2026-10-31), each beside the test that shows it: what an agent names is
 * never dropped, a token's decimals are its contract's, a setup's approval is bounded by the API's own order list, the
 * contracts a tool names are the kit's, a local copy reads the chain on its own node, a confirm or an execute names its
 * pending trade, the contracts memo keeps no failure, and the HTTP door makes a caller pay before it reads a body.
 */

const TAKER = '0x00000000000000000000000000000000000000a1' as Address
const FRIEND = '0x00000000000000000000000000000000000000f1' as Address
const TOKEN = '0x00000000000000000000000000000000000070c1' as Address
const DECIMALS = '0x313ce567'
const word = (n: number | bigint) => `0x${BigInt(n).toString(16).padStart(64, '0')}` as Hex

afterEach(() => {
  _resetTokenMemoForTests()
  _resetTrustedForTests()
})

async function run(api: StandIn, name: string, args: Record<string, unknown>, headers: Record<string, string> = {}, env: Record<string, string> = {}) {
  const { client, close } = await httpClient(configFor(api, env), headers)
  try {
    return await call(client, name, args)
  } finally {
    await close()
  }
}

/** The stand-in's chain door, with one eth_call answered otherwise. */
function rpcWith(answer: (to: string, data: Hex) => Hex | null): Route {
  const base = defaultRoutes()['POST /rpc']!
  return (req) => {
    const body = req.body as { method: string; params: [{ to: string; data: Hex }] }
    if (body.method === 'eth_call') {
      const a = answer(body.params[0].to.toLowerCase(), body.params[0].data)
      if (a !== null) return { body: { jsonrpc: '2.0', id: 1, result: a } }
    }
    return base(req)
  }
}

// --------------------------------------------------------------------------------------------- every tool is strict

test("every tool refuses an argument it does not take, as its listing's additionalProperties: false says", async () => {
  const api = await standIn()
  let at = 0
  // a clock that leaves every bucket full: the refusal under test is the parser's
  const server = createServer({ config: configFor(api), connection: new Connection('strict'), inbound: () => null, limiter: new Limiter(() => (at += 60_000)), log: () => {} })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'strict', version: '1' })
  try {
    await server.connect(serverSide)
    await client.connect(clientSide)
    const { tools } = await client.listTools()
    assert.equal(tools.length, TOOLS.length)
    for (const t of tools) {
      assert.equal((t.inputSchema as { additionalProperties?: unknown }).additionalProperties, false, `${t.name} lists extra arguments as allowed`)
      const r = await call(client, t.name, { notAnArgumentOfAnyTool: '1' })
      assert.equal(r.isError, true, `${t.name} took an argument it does not name`)
      assert.equal(r.body.code, 'bad-argument', t.name)
      assert.match(r.body.error, /takes no argument named "notAnArgumentOfAnyTool"/, t.name)
    }
    assert.equal(api.seen.length, 0, 'a refused argument asks the API nothing')
  } finally {
    await client.close()
    await server.close()
    await api.close()
  }
})

// --------------------------------------------------------------------------------------------- the swap's own floor

test("build_swap sends the caller's floor as acceptedMinOut and signs the higher of it and the quote less slippage", async () => {
  const api = await standIn(VENUE_ROUTES)
  try {
    // a floor under the quote less 50 bps: the swap carries the quote's floor, and the API is told the caller's
    const r = await run(api, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, minOut: '20' })
    assert.equal(r.isError, false, r.text)
    const asked = api.seen.find((s) => s.path === '/v1/quote' && s.query.taker)!
    assert.equal(asked.query.acceptedMinOut, '20000000')
    assert.equal(BigInt(r.body.minOut.raw), (QUOTED_OUT * 9_950n) / 10_000n)
    // one over what the quote's own floor would be: the calldata's floor is under it, and nothing is answered to sign
    const over = (QUOTED_OUT * 9_950n) / 10_000n + 1n
    const refused = await run(api, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, minOut: (Number(over) / 1e6).toFixed(6) })
    assert.equal(refused.body.code, 'build-mismatch')
    assert.equal(refused.body.transactions, undefined)
    // more decimal places than USDG's 6 is no floor
    assert.equal((await run(api, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, minOut: '1.0000001' })).body.code, 'bad-amount')
  } finally {
    await api.close()
  }
})

test("build_swap refuses a launch coordinator's envelope outright: it asks with excludeAccountBound", async () => {
  // the envelope as the API builds an account-bound launch route (integrator-execution.ts
  // `buildSafeLaunchIntegratorExecution`, held to the helpers' builder by real-api.test.ts): the input's approval to the
  // coordinator's allowance target, the pad's operator authorization, the round trip's approval to the adapter, and the
  // router's own call through the pinned coordinator. Every check of the launch path would pass it: build_swap refuses
  // it by its entrypoint alone
  const launch = pinnedContracts(4663)!.launch!
  const api = await standIn({
    'GET /v1/quote': ({ query }) => {
      const a = buildAnswer(query, { venue: true }) as { quote: Record<string, any> }
      const amountIn = BigInt(query.amountIn!)
      const execution = launchEnvelope({
        chain: 'robinhood', chainId: 4663, direction: 'sell', taker: query.taker as Address, recipient: query.taker as Address,
        coordinator: launch.coordinator, coordinatorAllowanceTarget: launch.allowanceTarget, adapter: launch.pads[0]!.adapter, pad: launch.pads[0]!.pad,
        launchId: '369', launchToken: WETH, quoteToken: USDG, inputToken: WETH, amountIn, roundTripAllowance: 1_000n, swapData: a.quote.tx.data, swapValue: 0n,
      })
      a.quote.execution = execution
      a.quote.ready.steps = execution.transactions.map((t) => ({ kind: t.kind, to: t.to, data: t.data, value: t.value, gas: '100000', why: 'Swaps through the launch coordinator.' }))
      return { body: a }
    },
  })
  try {
    const r = await run(api, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, trustQuote: true })
    assert.equal(r.body.code, 'build-mismatch')
    assert.match(r.body.error, /launch route through the launch coordinator/)
    assert.equal(r.body.transactions, undefined)
  } finally {
    await api.close()
  }
})

test("build_swap answers the router's ordered envelope as the plain swap it is, and refuses one that carries anything more", async () => {
  // the envelope the API puts on every build for a taker (`buildRouterIntegratorExecution`, held to the helpers' builder by
  // real-api.test.ts), its steps the envelope's own transactions as the steps hook builds them
  let tamper: ((e: ReturnType<typeof routerEnvelope>) => void) | null = null
  const api = await standIn({
    'GET /v1/quote': ({ query }) => {
      const a = buildAnswer(query, { venue: true }) as { quote: Record<string, any> }
      const amountIn = BigInt(query.amountIn!)
      const tx = { ...a.quote.tx, approval: { token: WETH, spender: SPENDER, amount: amountIn.toString() } }
      const execution = routerEnvelope({ taker: query.taker as Address, recipient: (query.recipient ?? query.taker) as Address, amountIn, tx })
      tamper?.(execution)
      a.quote.tx = tx
      a.quote.execution = execution
      a.quote.ready.steps = execution.transactions.map((t) => ({ kind: t.kind, to: t.to, data: t.data, value: t.value, gas: '100000', why: 'As the envelope names it.' }))
      return { body: a }
    },
  })
  try {
    const ok = await run(api, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, recipient: FRIEND, trustQuote: true })
    assert.equal(ok.isError, false, ok.text)
    assert.deepEqual(ok.body.transactions.map((t: { kind: string }) => t.kind), ['approval', 'swap'])
    assert.equal(ok.body.recipient, FRIEND)
    assert.equal(ok.body.transactions[1].does.recipient, FRIEND)
    // a protocol's authorization in a router build's envelope, ahead of the swap: no plain swap carries one
    tamper = (e) => {
      e.requirements.push({ kind: 'protocol-operator', protocol: 'safe-launch-v2', target: FRIEND, launchId: '1', operator: FRIEND } as never)
      e.transactions.splice(1, 0, { chain: 'robinhood', chainId: 4663, kind: 'authorization', to: FRIEND, data: '0x12345678' as Hex, value: '0' })
    }
    const auth = await run(api, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, trustQuote: true })
    assert.equal(auth.body.code, 'build-mismatch')
    assert.match(auth.body.error, /protocol-operator/)
    // an envelope with no entrypoint this server reads
    tamper = (e) => { (e as { entrypoint: string }).entrypoint = 'somewhere' }
    const other = await run(api, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, trustQuote: true })
    assert.equal(other.body.code, 'build-mismatch')
    assert.match(other.body.error, /no router entrypoint/)
    // an envelope that pays someone else than the recipient asked
    tamper = (e) => { e.recipient = FRIEND }
    const elsewhere = await run(api, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, trustQuote: true })
    assert.equal(elsewhere.body.code, 'build-mismatch')
    assert.match(elsewhere.body.error, /another recipient/)
  } finally {
    await api.close()
  }
})

// --------------------------------------------------------------------------------------------------- decimals

/** A chain source over a stand-in asker that answers the chain door's eth_call of decimals() with `answer`. */
function sourceOf(answer: () => Hex | { error: true }, reads: { n: number }): ChainSource {
  const api: Asker = async (c): Promise<ApiAnswer> => {
    const ok = (body: unknown): ApiAnswer => ({ status: 200, body, headers: new Headers(), usedSession: false })
    if (c.path === '/v1/tokens/resolve') return ok({ tokens: [{ address: TOKEN, symbol: 'TOK', decimals: 0 }] })
    if (c.path === '/rpc') {
      reads.n++
      const a = answer()
      return ok(typeof a === 'string' ? { jsonrpc: '2.0', id: 1, result: a } : { jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted' } })
    }
    return { status: 404, body: { error: 'no', code: 'not-found', retryable: false }, headers: new Headers(), usedSession: false }
  }
  return { api, config: { rpcUrl: null, requestTimeoutMs: 5_000 } }
}

test("a token's decimals are its contract's, kept an hour at the most; no answer and more than 36 are refused", async () => {
  const reads = { n: 0 }
  let d: Hex | { error: true } = word(18)
  const src = sourceOf(() => d, reads)
  const t0 = 1_800_000_000_000
  assert.equal((await tokenInfos(src, [{ native: false, address: TOKEN }], t0)).get(TOKEN)!.decimals, 18)
  // the index's symbol stands beside the contract's decimals; its own decimals (0) are never read
  assert.equal((await tokenInfos(src, [{ native: false, address: TOKEN }], t0)).get(TOKEN)!.symbol, 'TOK')
  assert.equal(reads.n, 1, 'a reading is kept for the process')
  d = word(6)
  assert.equal((await tokenInfos(src, [{ native: false, address: TOKEN }], t0 + 59 * 60_000)).get(TOKEN)!.decimals, 18)
  assert.equal((await tokenInfos(src, [{ native: false, address: TOKEN }], t0 + 61 * 60_000)).get(TOKEN)!.decimals, 6, 'no reading stands past its hour')
  _resetTokenMemoForTests()
  for (const [answer, code] of [[word(37), 'bad-token-decimals'], [word(1n << 200n), 'bad-token-decimals'], ['0x' as Hex, 'unknown-token'], [{ error: true } as const, 'unknown-token']] as const) {
    d = answer
    await assert.rejects(tokenInfos(src, [{ native: false, address: TOKEN }], t0), (e: { refusal?: { code?: string } }) => e.refusal?.code === code)
  }
  // a refusal is never kept: the token's next answer is read
  d = word(8)
  assert.equal((await tokenInfos(src, [{ native: false, address: TOKEN }], t0)).get(TOKEN)!.decimals, 8)
  // WETH, USDG and ether are the kit's own, read from no one
  const before = reads.n
  const pinned = await tokenInfos(src, [{ native: false, address: WETH }, { native: false, address: USDG }, { native: true, address: '0x0000000000000000000000000000000000000000' }], t0)
  assert.deepEqual([pinned.get(WETH)!.decimals, pinned.get(USDG)!.decimals, pinned.get('0x0000000000000000000000000000000000000000')!.decimals], [18, 6, 18])
  assert.equal(reads.n, before)
})

// ------------------------------------------------------------------------------------------------- an order's setup

test("with a credential, a setup's approval is this order's pull and what the API's own order list says the other open orders pull, no more", async () => {
  const pull = 10n ** 18n
  const other = 3n * 10n ** 17n
  let approved = pull + other
  const api = await standIn({
    'GET /v1/orders/setup': ({ query }) => ({
      body: {
        authorizations: [],
        ready: {
          chainId: 4663, wallet: query.maker, readAfter: null, simulation: { ok: true }, need: { openPullsOf: 'key' },
          steps: [{ kind: 'approval', to: WETH, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [getAddress(ORDERS), approved] }), value: '0', gas: '60000', why: 'Approves the order book.' }],
        },
      },
    }),
    'GET /v1/orders': ({ query }) => ({
      body: {
        count: 4, truncated: false,
        orders: [
          // 0.1 a fill, 3 fills, none done: 0.3 still pulled
          { hash: `0x${'1'.repeat(64)}`, contract: ORDERS, maker: query.maker, status: 'open', fillsDone: 0, order: { tokenIn: WETH, amountPerFill: (10n ** 17n).toString(), totalFills: 3 } },
          // another token, another contract, a filled order: none of them pulls WETH here
          { hash: `0x${'2'.repeat(64)}`, contract: ORDERS, maker: query.maker, status: 'open', fillsDone: 0, order: { tokenIn: USDG, amountPerFill: '5', totalFills: 1 } },
          { hash: `0x${'3'.repeat(64)}`, contract: '0x000000000000000000000000000000000000dead', maker: query.maker, status: 'open', fillsDone: 0, order: { tokenIn: WETH, amountPerFill: '5', totalFills: 1 } },
          { hash: `0x${'4'.repeat(64)}`, contract: ORDERS, maker: query.maker, status: 'filled', fillsDone: 1, order: { tokenIn: WETH, amountPerFill: '5', totalFills: 1 } },
        ],
      },
    }),
  })
  try {
    const ask = () => run(api, 'prepare_limit_order', { wallet: TAKER, tokenIn: WETH, tokenOut: USDG, amount: '1', minOut: '3000' }, { authorization: `Bearer ${KEY}` })
    const ok = await ask()
    assert.equal(ok.isError, false, ok.text)
    assert.equal(ok.body.setup[0].does.raw, (pull + other).toString())
    const listed = api.seen.find((s) => s.path === '/v1/orders' && s.method === 'GET')!
    assert.deepEqual([listed.query.maker, listed.query.status], [TAKER, 'open'])
    approved = pull + other + 1n
    assert.equal((await ask()).body.code, 'build-mismatch')
  } finally {
    await api.close()
  }
})

test("an order of ether wraps at most its pull less the WETH the wallet holds", async () => {
  const pull = 10n ** 18n
  const held = 4n * 10n ** 17n
  let wrap = pull - held
  const balanceOf = encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [TAKER] })
  const api = await standIn({
    'POST /rpc': rpcWith((to, data) => (to === WETH && data === balanceOf ? word(held) : null)),
    'GET /v1/orders/setup': ({ query }) => ({
      body: { authorizations: [], ready: { chainId: 4663, wallet: query.maker, readAfter: null, simulation: { ok: true }, need: { openPullsOf: 'none' }, steps: [{ kind: 'wrap', to: WETH, data: '0xd0e30db0', value: wrap.toString(), gas: '50000', why: 'Wraps.' }] } },
    }),
  })
  try {
    const ask = () => run(api, 'prepare_limit_order', { wallet: TAKER, tokenIn: 'ETH', tokenOut: USDG, amount: '1', minOut: '3000' })
    const ok = await ask()
    assert.equal(ok.isError, false, ok.text)
    assert.equal(ok.body.setup[0].value, (pull - held).toString())
    wrap = pull - held + 1n
    assert.equal((await ask()).body.code, 'build-mismatch')
  } finally {
    await api.close()
  }
})

// ---------------------------------------------------------------------------------------------------- the contracts

test('get_contracts answers the kit’s pins once the API names the same, each code hash saying whose word it is', async () => {
  const api = await standIn()
  try {
    const r = await run(api, 'get_contracts', {})
    assert.equal(r.isError, false, r.text)
    const pins = pinnedContracts(4663)!
    assert.equal(r.body.router.address, pins.router.toLowerCase())
    assert.equal(r.body.router.codeHashFrom, 'kit')
    assert.equal(r.body.router.codeHash, pins.codeHashes[pins.router.toLowerCase()]!.toLowerCase())
    assert.equal(r.body.allowanceTarget.address, pins.allowanceTarget.toLowerCase())
    assert.equal(r.body.orders.eip712.domain.verifyingContract, pins.orders.toLowerCase())
    assert.equal(r.body.weth.address, pins.weth.toLowerCase())
    assert.equal(r.body.usdg.address, pins.usdg.toLowerCase())
  } finally {
    await api.close()
  }
})

test("the contracts memo keeps a pass alone, and a session never meets another session's refusal", async () => {
  let failFor: string | null = 'Bearer first'
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  const api = await standIn({
    'GET /v1/contracts': async ({ headers }) => {
      if (headers.authorization === failFor) {
        await held
        return { status: 401, body: { error: 'this session ended', code: 'session-revoked', retryable: false } }
      }
      return { body: contractsAnswer() }
    },
  })
  const config = configFor(api)
  const asker = (bearer: string): Asker => async (c) => {
    const res = await fetch(`${api.url}${c.path}`, { headers: { authorization: bearer } })
    return { status: res.status, body: await res.json(), headers: res.headers, usedSession: false }
  }
  try {
    // the first session's call is in flight and will be refused; the second's, beside it, is its own and passes
    const first = trustedOf({ api: asker('Bearer first'), config })
    const second = await trustedOf({ api: asker('Bearer second'), config })
    assert.ok(second.router)
    release()
    await assert.rejects(first, (e: { refusal?: { code?: string } }) => e.refusal?.code === 'session-revoked')
    // a refusal is never kept: once the route answers, the same caller passes
    _resetTrustedForTests()
    failFor = 'Bearer third'
    const third = trustedOf({ api: asker('Bearer third'), config })
    await assert.rejects(third, (e: { refusal?: { code?: string } }) => e.refusal?.code === 'session-revoked')
    failFor = null
    assert.ok(await trustedOf({ api: asker('Bearer third'), config }))
  } finally {
    await api.close()
  }
})

// ------------------------------------------------------------------------------------------------- a node of one's own

test('with MANCER_MCP_RPC_URL every chain read goes to that node, and none through the API’s chain door', async () => {
  const seen: Array<{ method: string; to?: string; data?: string }> = []
  const node = createHttpServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { method: string; params: Array<{ to?: string; data?: string }> }
    seen.push({ method: body.method, to: body.params[0]?.to, data: body.params[0]?.data })
    const result = body.method === 'eth_call' && body.params[0]?.data === DECIMALS && body.params[0]?.to === TOKEN ? word(9) : word(0)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }))
  })
  await new Promise<void>((r) => node.listen(0, '127.0.0.1', () => r()))
  const nodeUrl = `http://127.0.0.1:${(node.address() as AddressInfo).port}/rpc-token-in-the-path`
  const api = await standIn()
  try {
    const r = await run(api, 'build_transfer', { wallet: TAKER, to: FRIEND, token: TOKEN, amount: '1' }, {}, { MANCER_MCP_RPC_URL: nodeUrl })
    assert.equal(r.isError, false, r.text)
    const d = decodeFunctionData({ abi: erc20Abi, data: r.body.transactions[0].data as Hex })
    assert.equal((d.args as [Address, bigint])[1], 10n ** 9n, "the amount is scaled by the decimals the operator's own node read")
    assert.ok(seen.some((s) => s.method === 'eth_call' && s.to === TOKEN && s.data === DECIMALS))
    assert.equal(api.seen.filter((s) => s.path === '/rpc').length, 0, "no chain read went through the API's door")
    const receipt = await run(api, 'get_transaction_receipt', { hash: `0x${'ab'.repeat(32)}` }, {}, { MANCER_MCP_RPC_URL: nodeUrl })
    assert.equal(receipt.isError, false)
    assert.ok(seen.some((s) => s.method === 'eth_getTransactionReceipt'))
    assert.equal(api.seen.filter((s) => s.path === '/rpc').length, 0)
    // a node that does not answer is the chain's silence, and never names its URL
    node.close()
    node.closeAllConnections()
    _resetTokenMemoForTests()
    const silent = await run(api, 'build_transfer', { wallet: TAKER, to: FRIEND, token: TOKEN, amount: '1' }, {}, { MANCER_MCP_RPC_URL: nodeUrl })
    assert.equal(silent.body.code, 'chain-unavailable')
    assert.doesNotMatch(silent.text, /rpc-token-in-the-path|127\.0\.0\.1/)
  } finally {
    node.close()
    await api.close()
  }
  assert.throws(() => configFrom({ MANCER_MCP_RPC_URL: 'ftp://node' }), /http or https/)
})

// ------------------------------------------------------------------------------------------------------- Books

test('a confirm or an execute names the pending trade it means; no other act takes one', async () => {
  // the vault holds a pending trade of salt 6: another than the one the agent proposed (salt 5)
  const accountAbi = bookAbisFor(BOOKS).account as Abi
  const pendingCall = encodeFunctionData({ abi: accountAbi, functionName: 'pending' })
  const held = encodeFunctionResult({ abi: accountAbi, functionName: 'pending', result: ['0x00000000000000000000000000000000000ada97', getAddress(USDG), getAddress(WETH), 1000n, 990n, '0x', 1n, 1n, 6n, '0x'] as never })
  const api = await standIn({ 'POST /rpc': rpcWith((to, data) => (to === VAULT && data === pendingCall ? held : null)) })
  const pending = { salt: '5', tokenIn: USDG, tokenOut: WETH, amountIn: '1000', minOut: '990' }
  try {
    const none = await run(api, 'build_book_act', { token: BOOK, action: 'executeTrade', wallet: TAKER, trustQuote: true })
    assert.equal(none.body.code, 'pending-required')
    assert.equal((await run(api, 'build_book_act', { token: BOOK, action: 'arm', wallet: TAKER, expectPending: pending })).body.code, 'bad-argument')
    assert.equal((await run(api, 'build_book_act', { token: BOOK, action: 'confirmTrade', wallet: TAKER, trustQuote: true, expectPending: { ...pending, extra: 1 } })).body.code, 'bad-argument')
    // named, and the vault holds another: refused before anything is built
    const r = await run(api, 'build_book_act', { token: BOOK, action: 'executeTrade', wallet: TAKER, trustQuote: true, expectPending: pending })
    assert.equal(r.body.code, 'build-mismatch')
    assert.match(r.body.error, /another pending trade/)
    assert.equal(api.seen.filter((s) => s.path.endsWith('/steps')).length, 0)
  } finally {
    await api.close()
  }
})

test("a vault trade names what it buys before anything is asked", async () => {
  const api = await standIn()
  try {
    const r = await run(api, 'get_book_vault_quote', { token: BOOK, wallet: TAKER, purpose: 'trade', tokenIn: WETH, amountIn: '1', minOut: '3000' }, { authorization: `Bearer ${KEY}` })
    assert.equal(r.body.code, 'tokenout-required')
    assert.equal(api.seen.filter((s) => s.path.endsWith('/vault-quote')).length, 0)
  } finally {
    await api.close()
  }
})

// ------------------------------------------------------------------------------------------------------ the HTTP door

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }

test('the door reads no body before the session and the caller’s buckets, and none past its declared length', async () => {
  const api = await standIn()
  const handle = await serveHttp(configFor(api), { log: () => {} })
  try {
    const post = (headers: Record<string, string>, body: string) => fetch(handle.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body })
    // an unknown session is refused before its body (here no JSON) is parsed
    assert.equal((await post({ 'mcp-session-id': 'no-such-session' }, 'not json')).status, 404)
    // a body that declares more than the door takes is refused unread
    const big = 'x'.repeat((1 << 20) + 1)
    assert.equal((await post({}, big)).status, 413)
    // a request with no session pays the address's new-session bucket first: past its burst, the 21st is refused 429
    // before its (malformed) body is read, where the first twenty were each read and answered 400
    const statuses: number[] = []
    for (let i = 0; i < 21; i++) statuses.push((await post({}, 'not json')).status)
    assert.deepEqual([statuses.slice(0, 19).every((s) => s === 400), statuses[20]], [true, 429])
  } finally {
    await handle.close()
    await api.close()
  }
})

test('an edge proof this server does not hold is told once a minute at the most, and never named', async () => {
  const api = await standIn()
  const lines: string[] = []
  let at = 1_800_000_000_000
  const handle = await serveHttp(configFor(api, { MANCER_MCP_EDGE_SECRET: 'the-current-proof' }), { now: () => at, log: (l) => lines.push(l) })
  try {
    const open = (proof: string) => fetch(handle.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-mancer-edge': proof, 'cf-connecting-ip': '2001:db8::9' }, body: JSON.stringify(INIT) }).then((r) => r.text())
    await open('the-old-proof')
    await open('the-old-proof')
    await open('the-current-proof')
    assert.equal(lines.filter((l) => /X-Mancer-Edge/.test(l)).length, 1)
    at += 61_000
    await open('the-old-proof')
    const warned = lines.filter((l) => /X-Mancer-Edge/.test(l))
    assert.equal(warned.length, 2)
    assert.match(warned[1]!, /^mancer-mcp: warning: 2 requests since the last warning/)
    assert.doesNotMatch(lines.join('\n'), /the-old-proof|the-current-proof/)
  } finally {
    await handle.close()
    await api.close()
  }
})
