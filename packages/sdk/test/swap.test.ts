import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeEventTopics, encodeAbiParameters, getAddress, zeroAddress, type Hex, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mancerRouterAbi } from '../src/kit/abi'
import { ETH, Mancer, MancerCheckError, MancerStepError } from '../src/index'
import { NOW, SIM_OK, TRUSTED, approveData, contractsAnswer, executeData, fakeChain, mockApi, venueLeg } from './helpers'

// A swap end to end against a stand-in API and chain: the build asked for with the bot's own wallet as recipient, the
// floor the bot chose (its own, sent as acceptedMinOut; a reference's less its slippage; or the quote's, by name, set
// beside the Uniswap pool its node reads), the steps checked, then sent one at a time with the gas its own node
// estimates, each after the last one's receipt, and what the router's own event says it did.

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const session = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: account.address.toLowerCase(), iat: 1, exp: 4_000_000_000 })).toString('base64url')}.x`

/** The router call as a quote of ether against the dollar carries it: the published 2 bps, a floor of 995. */
const exec = (over: Partial<Record<string, unknown>> = {}) => executeData({ feeBps: 2, minAmountOut: 995n, ...over })

function quoteAnswer(over: { data?: Hex; approval?: boolean; quotedAmountOut?: string; value?: string; feeBps?: number } = {}) {
  const steps = [
    ...(over.approval === false ? [] : [{ kind: 'approval', to: TRUSTED.usdg.toLowerCase(), data: approveData(TRUSTED.allowanceTarget, 1_000_000n), value: '0', gas: '60000', why: '' }]),
    { kind: 'swap', to: TRUSTED.router.toLowerCase(), data: over.data ?? exec(), value: over.value ?? '0', gas: '150000', why: '' },
  ]
  return {
    quote: {
      amountOut: '1000', quotedAmountOut: over.quotedAmountOut ?? '1000', minOut: '995', fee: { bps: over.feeBps ?? 2, side: 'input' }, latencyMs: 3, cached: false,
      tx: { to: TRUSTED.router, data: steps.at(-1)!.data, value: '0', approval: null },
      ready: { chainId: 4663, wallet: account.address.toLowerCase(), steps, simulation: SIM_OK, readAfter: null },
    },
  }
}

/** A stand-in wallet: each transaction kept, a hash for each, and the chain's receipt as the test decides. */
function standInWallet(receipts: Array<'success' | 'reverted'>, pool = 1_000n) {
  const sent: Array<{ to: string; data: string; value: bigint; gas?: bigint }> = []
  const wallet = {
    getChainId: async () => 4663,
    sendTransaction: async (tx: { to: string; data: string; value: bigint; gas?: bigint }) => {
      sent.push(tx)
      return (`0x${String(sent.length).padStart(64, '0')}`) as Hex
    },
  } as unknown as WalletClient
  const executed = {
    address: TRUSTED.router,
    topics: encodeEventTopics({ abi: mancerRouterAbi, eventName: 'Executed', args: { sender: account.address, tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint16' }, { type: 'uint8' }, { type: 'uint256' }], [1_000_000n, 1_002n, TRUSTED.usdg, 1_000n, 10, 0, 1n]),
  }
  const chain = {
    // the Uniswap pool's QuoterV2 answer on the bot's own node
    ...fakeChain({ quoteExactInputSingle: () => [pool, 0n, 0, 0n] }),
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => {
      const i = Number(BigInt(hash)) - 1
      return { status: receipts[i] ?? 'success', transactionHash: hash, logs: i === 1 ? [executed] : [] }
    },
  } as unknown as PublicClient
  return { wallet, chain, sent }
}

async function stand(answer: unknown, receipts: Array<'success' | 'reverted'> = ['success', 'success'], pool = 1_000n) {
  const api = await mockApi({ 'GET /v1/contracts': () => ({ body: contractsAnswer() }), 'GET /v1/quote': () => ({ body: answer }) })
  const w = standInWallet(receipts, pool)
  const m = new Mancer({ baseUrl: api.url, account, session, trusted: TRUSTED, publicClient: w.chain, walletClient: w.wallet })
  return { api, m, ...w }
}

test('a swap that names no floor is refused before the API is asked to build it', async () => {
  const { api, m, sent } = await stand(quoteAnswer())
  try {
    await assert.rejects(m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, slippageBps: 50 }), (e) => e instanceof MancerCheckError && /name the floor/.test(e.reason))
    await assert.rejects(m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, minOut: 990n, trustQuote: true }), (e) => e instanceof MancerCheckError && /name one/.test(e.reason))
    await assert.rejects(m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, reference: async () => 1_000n }), (e) => e instanceof MancerCheckError && /maxSlippageBps/.test(e.reason))
    assert.equal(api.seen.filter((s) => s.path === '/v1/quote').length, 0)
    assert.equal(sent.length, 0)
  } finally {
    await api.close()
  }
})

test("with trustQuote, the floor is the quote's at the slippage asked, sent with the gas your own node estimates", async () => {
  const { api, m, sent } = await stand(quoteAnswer())
  try {
    const r = await m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, slippageBps: 50, trustQuote: true })
    const ask = api.seen.find((s) => s.path === '/v1/quote')!
    assert.equal(ask.query.get('recipient'), account.address)
    assert.equal(ask.query.get('steps'), '1')
    assert.equal(ask.query.get('slippageBps'), '50')
    assert.equal(ask.query.get('acceptedMinOut'), null)
    assert.equal(r.minOut, 995n, "the floor is the estimate's at the slippage asked")
    assert.equal(sent.length, 2)
    assert.equal(sent[0]!.to.toLowerCase(), TRUSTED.usdg.toLowerCase())
    assert.equal(sent[0]!.gas, 140_000n, "the gas limit is the stand-in node's estimate of 100,000, padded, never the API's 60,000")
    assert.equal(sent[1]!.to.toLowerCase(), TRUSTED.router.toLowerCase())
    assert.deepEqual(r.executed, { amountIn: 1_000_000n, amountOut: 1_002n, feeAsset: TRUSTED.usdg, feeAmount: 1_000n })
  } finally {
    await api.close()
  }
})

test("with trustQuote, a quote of ether against the dollar far under your node's Uniswap pool is refused", async () => {
  const { api, m, sent } = await stand(quoteAnswer(), ['success', 'success'], 1_040n)
  try {
    await assert.rejects(m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, trustQuote: true }), (e) => e instanceof MancerCheckError && /under the 1040 the Uniswap pool/.test(e.reason))
    // a wider deviation the bot names by itself
    const r = await m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, trustQuote: true, maxDeviationBps: 500 })
    assert.equal(r.minOut, 995n)
    assert.equal(sent.length, 2)
  } finally {
    await api.close()
  }
})

test("a reference's price less its slippage is the floor, sent as acceptedMinOut", async () => {
  const { api, m } = await stand(quoteAnswer())
  try {
    const asked: unknown[] = []
    const r = await m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, reference: async (q) => { asked.push(q); return 1_000n }, maxSlippageBps: 100 })
    assert.deepEqual(asked, [{ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n }])
    assert.equal(r.minOut, 990n)
    assert.equal(api.seen.find((s) => s.path === '/v1/quote')!.query.get('acceptedMinOut'), '990')
    // poolReference reads the pool on the bot's own node, for WETH against USDG alone
    const pool = await m.poolReference()({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n })
    assert.equal(pool, 1_000n)
    await assert.rejects(m.poolReference()({ tokenIn: TRUSTED.usdg, tokenOut: getAddress('0x' + '99'.repeat(20)), amountIn: 1n }), /WETH against USDG alone/)
  } finally {
    await api.close()
  }
})

test("the router's fee is held to the published rate unless the bot accepts more by name", async () => {
  const { api, m, sent } = await stand(quoteAnswer({ feeBps: 10, data: exec({ feeBps: 10 }) }))
  try {
    await assert.rejects(m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, minOut: 990n }), (e) => e instanceof MancerCheckError && /over the 2 you accept/.test(e.reason))
    assert.equal(sent.length, 0)
    const r = await m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, minOut: 990n, maxFeeBps: 10 })
    assert.equal(r.minOut, 990n)
  } finally {
    await api.close()
  }
})

test("a floor of the bot's own is sent as acceptedMinOut, and a build under it is refused unsigned", async () => {
  const { api, m, sent } = await stand(quoteAnswer())
  try {
    await assert.rejects(m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, minOut: 999n }), (e) => e instanceof MancerCheckError && /floor/.test(e.reason))
    assert.equal(api.seen.find((s) => s.path === '/v1/quote')!.query.get('acceptedMinOut'), '999')
    assert.equal(sent.length, 0, 'nothing was signed or sent')
  } finally {
    await api.close()
  }
})

test('a build whose router call pays someone else is refused, and nothing is sent', async () => {
  const thief = getAddress('0x' + '44'.repeat(20))
  const { api, m, sent } = await stand(quoteAnswer({ data: exec({ recipient: thief }) }))
  try {
    await assert.rejects(m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, minOut: 990n }), (e) => e instanceof MancerCheckError && /recipient/.test(e.reason))
    assert.equal(sent.length, 0)
  } finally {
    await api.close()
  }
})

test("ether is spent as nativeIn on WETH's route and carried as the swap's value", async () => {
  const data = exec({ tokenIn: zeroAddress, tokenOut: TRUSTED.usdg, deadline: BigInt(NOW + 600), legs: [venueLeg({ tokenIn: TRUSTED.weth, tokenOut: TRUSTED.usdg })] })
  const { api, m, sent } = await stand(quoteAnswer({ data, approval: false, value: '1000000' }))
  try {
    const r = await m.swap({ tokenIn: ETH, tokenOut: TRUSTED.usdg, amountIn: 1_000_000n, minOut: 990n })
    const ask = api.seen.find((s) => s.path === '/v1/quote')!
    assert.equal(ask.query.get('nativeIn'), '1')
    assert.equal(ask.query.get('tokenIn'), TRUSTED.weth)
    assert.equal(sent.length, 1)
    assert.equal(sent[0]!.value, 1_000_000n)
    assert.equal(r.checked.readings[0]!.router?.spends.token, null, 'native ether reads as no token')
  } finally {
    await api.close()
  }
})

test('a step the chain reverts stops the rest, and the error names it and what was sent before it', async () => {
  const { api, m, sent } = await stand(quoteAnswer(), ['success', 'reverted'])
  try {
    const e = await m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, minOut: 990n }).then(() => null, (x) => x)
    assert.ok(e instanceof MancerStepError)
    assert.equal(e.step, 1)
    assert.equal(e.kind, 'swap')
    assert.equal(e.sent.length, 1)
    assert.equal(sent.length, 2)
  } finally {
    await api.close()
  }
})

test("the gas limit is the bot's own node's estimate, and an API's figure far from it stops the steps before any is sent", async () => {
  const answer = quoteAnswer()
  answer.quote.ready.steps[0]!.gas = '1000000'
  const { api, m, sent } = await stand(answer)
  try {
    const e = await m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, minOut: 990n }).then(() => null, (x) => x)
    assert.ok(e instanceof MancerStepError && /far from your node's estimate/.test(e.message))
    assert.equal(sent.length, 0)
  } finally {
    await api.close()
  }
})

test('what is sent is the copy the check read, whatever the answer object holds after it', async () => {
  const { api, m, sent } = await stand(quoteAnswer())
  try {
    const built = await m.buildSwap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, minOut: 990n })
    const thief = getAddress('0x' + '44'.repeat(20))
    // the API's own step objects, changed after the check
    ;(built.quote.ready as { steps: Array<{ to: string; data: string }> }).steps[1]!.to = thief
    assert.throws(() => { (built.checked.steps[1] as { to: string }).to = thief }, TypeError, 'the checked copy is frozen')
    await m.sendSteps(built.checked)
    assert.equal(sent[1]!.to.toLowerCase(), TRUSTED.router.toLowerCase())
  } finally {
    await api.close()
  }
})

test("a launch route is checked against the launch stack's reviewed code on the bot's own node first", async () => {
  const answer = quoteAnswer() as unknown as { quote: Record<string, unknown> }
  answer.quote.execution = { version: 1, taker: account.address, recipient: account.address, entrypoint: 'launch-coordinator', requirements: [], transactions: [{ chain: 'robinhood', chainId: 4663, kind: 'swap', to: TRUSTED.launch!.coordinator, data: exec(), value: '0' }] }
  const { api, m, sent } = await stand(answer)
  try {
    await assert.rejects(m.swap({ tokenIn: TRUSTED.usdg, tokenOut: TRUSTED.weth, amountIn: 1_000_000n, minOut: 990n }), (e) => e instanceof MancerCheckError && /launch stack's reviewed build/.test(e.reason))
    assert.equal(sent.length, 0)
  } finally {
    await api.close()
  }
})
