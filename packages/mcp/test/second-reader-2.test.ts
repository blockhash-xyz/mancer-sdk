import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFunctionData, encodeFunctionData, encodeFunctionResult, erc20Abi, getAddress, parseAbi, type Address, type Hex } from 'viem'
import { serveHttp } from '../src/http'
import { _resetTrustedForTests } from '../src/checks'
import { _resetTokenMemoForTests } from '../src/values'
import { BOOK, KEY, ORDERS, QUOTED_OUT, USDG, VAULT, VENUE_ROUTES, WETH, call, configFor, contractsAnswer, defaultRoutes, httpClient, standIn, type Route, type StandIn } from './helpers'

/**
 * The second reader's second round on the unified server (2026-10-31), each a test that fails on the change as written.
 */

const TAKER = '0x00000000000000000000000000000000000000a1' as Address
const FRIEND = '0x00000000000000000000000000000000000000f1' as Address
/** A token the kit pins nothing of. */
const TOKEN = '0x00000000000000000000000000000000000070c1' as Address

afterEach(() => {
  _resetTokenMemoForTests()
  _resetTrustedForTests()
})

async function run(api: StandIn, name: string, args: Record<string, unknown>, headers: Record<string, string> = {}) {
  const { client, close } = await httpClient(configFor(api), headers)
  try {
    return await call(client, name, args)
  } finally {
    await close()
  }
}

/** The stand-in chain door, with one read answered otherwise. */
function rpcWith(answer: (to: string, data: Hex) => Hex | null): Route {
  const base = defaultRoutes()['POST /rpc']!
  return (req) => {
    const body = req.body as { method: string; params: [{ to: string; data: Hex }] }
    if (body.method === 'eth_call') {
      const [c] = body.params
      const a = answer(c.to.toLowerCase(), c.data)
      if (a !== null) return { body: { jsonrpc: '2.0', id: 1, result: a } }
    }
    return base(req)
  }
}

// ------------------------------------------------------------------------------------------------ the swap's floor

test("build_swap takes the caller's own floor, or refuses the argument: it never drops minOut and answers the quote's floor", async () => {
  // The agents' own guide says to set the floor from a price of the agent's own and send it (`acceptedMinOut`), and
  // build_book_raise_trade takes `minOut`. build_swap has neither, and its arguments are parsed by `z.object`, which
  // strips any key it does not name while the listed JSON Schema says `additionalProperties: false`: an agent that names
  // its own floor of 30 USDG gets the quote's floor of 22.34 USDG to sign, and no word that its floor was dropped.
  const api = await standIn(VENUE_ROUTES)
  try {
    for (const floor of [{ minOut: '30' }, { acceptedMinOut: '30000000' }]) {
      const r = await run(api, 'build_swap', { tokenIn: WETH, tokenOut: USDG, amount: '0.01', wallet: TAKER, ...floor })
      assert.equal(r.isError, true, `answered to sign with a floor of ${r.body.minOut?.raw} where the caller named ${JSON.stringify(floor)}`)
    }
  } finally {
    await api.close()
  }
  assert.ok(QUOTED_OUT < 30_000_000n)
})

// --------------------------------------------------------------------------------------------- a token's decimals

test("USDG's decimals are 6 whatever the token index answers: a send of 1 USDG is 1,000,000 units", async () => {
  // Every amount a tool takes is scaled by the decimals the API's token index answers (values.ts `tokenInfos`), and every
  // readback (`spends`, `does`) is scaled by the same number, so an index that answers 18 for USDG has the agent sign a
  // send (or a swap, or an order's floor) a trillion times what it asked while every line it reads says "1".
  const api = await standIn({
    'POST /v1/tokens/resolve': () => ({ body: { tokens: [{ address: USDG, symbol: 'USDG', decimals: 18 }] } }),
  })
  try {
    const r = await run(api, 'build_transfer', { wallet: TAKER, to: FRIEND, token: USDG, amount: '1' })
    if (r.isError) return // a refusal of the disagreement is an answer too
    const d = decodeFunctionData({ abi: erc20Abi, data: r.body.transactions[0].data as Hex })
    assert.equal((d.args as [Address, bigint])[1], 1_000_000n, `signs a send of ${(d.args as [Address, bigint])[1]} units for "1 USDG"`)
  } finally {
    await api.close()
  }
})

test("a token's decimals are its contract's own word, not the index's, and a wrong answer is not kept for the process", async () => {
  // The index has stored a token as unreadable with 0 decimals before (a token a launch pad named before the token
  // existed), and tokenInfos takes the index's number over the token's own `decimals()`, then keeps it for the life of
  // the process for every session. A limit order's floor of "1000" TOKEN is then 1000 units, a thousand-trillionth of
  // what the agent asked, and the order fills at any price.
  const decimalsCall = encodeFunctionData({ abi: parseAbi(['function decimals() view returns (uint8)']), functionName: 'decimals' })
  let indexDecimals = 0
  const api = await standIn({
    'POST /v1/tokens/resolve': ({ body }) => ({
      body: {
        tokens: ((body as { addresses: string[] }).addresses ?? []).map((a) =>
          a === TOKEN ? { address: TOKEN, symbol: 'TOK', decimals: indexDecimals } : a === WETH ? { address: WETH, symbol: 'WETH', decimals: 18 } : a === USDG ? { address: USDG, symbol: 'USDG', decimals: 6 } : null,
        ).filter(Boolean),
      },
    }),
    'POST /rpc': rpcWith((to, data) => (to === TOKEN && data === decimalsCall ? encodeFunctionResult({ abi: parseAbi(['function decimals() view returns (uint8)']), functionName: 'decimals', result: 18 }) : null)),
  })
  try {
    const first = await run(api, 'build_transfer', { wallet: TAKER, to: FRIEND, token: TOKEN, amount: '1' })
    if (!first.isError) {
      const d = decodeFunctionData({ abi: erc20Abi, data: first.body.transactions[0].data as Hex })
      assert.equal((d.args as [Address, bigint])[1], 10n ** 18n, `signs a send of ${(d.args as [Address, bigint])[1]} units for "1 TOK", whose contract says 18 decimals`)
    }
    // the index heals; a new connection of the same process must not keep the old number
    indexDecimals = 18
    const later = await run(api, 'build_transfer', { wallet: TAKER, to: FRIEND, token: TOKEN, amount: '1' })
    assert.equal(later.isError, false, later.text)
    const d = decodeFunctionData({ abi: erc20Abi, data: later.body.transactions[0].data as Hex })
    assert.equal((d.args as [Address, bigint])[1], 10n ** 18n, 'the decimals the index answered once are kept for every later session of the process')
  } finally {
    await api.close()
  }
})

// ------------------------------------------------------------------------------------------------- an order's setup

test("with no credential the API counts no other order, so an order's setup approves its own pull at the most, whatever the chain door reads", async () => {
  // checkOrderSetupSteps bounds the approval by the allowance read now plus this order's pull. The server reads that
  // allowance through the API's own chain door, so the API that answers the setup also names the bound: an allowance it
  // reads as 2^128 - pull - 1 lets it approve the orders contract for 2^128 - 1, effectively unbounded. With no
  // credential the API's own builder counts no other open order (steps/orders.ts `openPullsScopeOf` 'none'), so its
  // honest approval is the pull alone.
  const pull = 10n ** 18n
  const lie = (1n << 128n) - pull - 1n
  const allowanceSel = '0xdd62ed3e'
  const api = await standIn({
    'POST /rpc': rpcWith((to, data) => (to === WETH && data.startsWith(allowanceSel) ? encodeFunctionResult({ abi: erc20Abi, functionName: 'allowance', result: lie }) : null)),
    'GET /v1/orders/setup': ({ query }) => ({
      body: {
        authorizations: [],
        ready: {
          chainId: 4663, wallet: query.maker, readAfter: null, simulation: { ok: true },
          steps: [{ kind: 'approval', to: WETH, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [getAddress(ORDERS), (1n << 128n) - 1n] }), value: '0', gas: '60000', why: 'Approves the order book.' }],
        },
        need: { openPullsOf: 'none' },
      },
    }),
  })
  try {
    const r = await run(api, 'prepare_limit_order', { wallet: TAKER, tokenIn: WETH, tokenOut: USDG, amount: '1', minOut: '3000' })
    assert.equal(r.isError, true, `answered a setup that approves the orders contract for ${r.body.setup?.[0]?.does?.raw} on an order that pulls ${pull}`)
  } finally {
    await api.close()
  }
})

test("an order's wrap is at most what the order pulls: the wallet's allowance to the orders contract is no bound on its ether", async () => {
  // The SDK's wrap bound is the allowance plus the pull (`most`), but a wrap spends the wallet's ether, which the allowance
  // says nothing of. A maker that approved 100 WETH to the orders contract before is wrapped 50 ETH for an order of 1,
  // which can leave the wallet no ether for gas.
  const allowanceSel = '0xdd62ed3e'
  const api = await standIn({
    'POST /rpc': rpcWith((to, data) => (to === WETH && data.startsWith(allowanceSel) ? encodeFunctionResult({ abi: erc20Abi, functionName: 'allowance', result: 100n * 10n ** 18n }) : null)),
    'GET /v1/orders/setup': ({ query }) => ({
      body: {
        authorizations: [],
        ready: {
          chainId: 4663, wallet: query.maker, readAfter: null, simulation: { ok: true },
          steps: [{ kind: 'wrap', to: WETH, data: '0xd0e30db0', value: (50n * 10n ** 18n).toString(), gas: '50000', why: 'Wraps.' }],
        },
        need: { openPullsOf: 'none' },
      },
    }),
  })
  try {
    const r = await run(api, 'prepare_limit_order', { wallet: TAKER, tokenIn: 'ETH', tokenOut: USDG, amount: '1', minOut: '3000' })
    assert.equal(r.isError, true, `answered a wrap of ${r.body.setup?.[0]?.value} wei for an order of 1 ETH`)
  } finally {
    await api.close()
  }
})

// ------------------------------------------------------------------------------------------------------- sessions

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cap', version: '1' } } }
const PROOF = 'the-edge-proof'

async function open(url: string, headers: Record<string, string>): Promise<string> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(INIT) })
  await r.text()
  const id = r.headers.get('mcp-session-id')
  assert.ok(id, `no session opened (${r.status})`)
  return id
}

async function alive(url: string, id: string): Promise<boolean> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-session-id': id, 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  })
  await r.text()
  return r.status === 200
}

test("at the cap of all a newcomer takes the place of a session of a prefix over its fair share, and never of one at or under it", async () => {
  // Past MANCER_MCP_MAX_SESSIONS the oldest session of anyone used to go, so 125 /64s (4,000 / 32) dropped every other
  // caller's. The round after made a full server refuse every newcomer instead, which let the /64s of one /48 hold every
  // place (final-check.test.ts). Now (2026-10-31, the final reading's availability find): an address that holds a session gives up
  // its own; one that holds none takes the place of the least lately used session of the prefix (an IPv6 /48) holding the
  // most, where that prefix holds more than its fair share, the places over every prefix holding one, the newcomer's own
  // counted. A prefix at or under its share never loses a session to another's newcomer.
  const api = await standIn()
  let at = 1_800_000_000_000
  const handle = await serveHttp(configFor(api, { MANCER_MCP_MAX_SESSIONS: '3', MANCER_MCP_MAX_SESSIONS_PER_ADDRESS: '2', MANCER_MCP_EDGE_SECRET: PROOF }), { now: () => (at += 1_100), log: () => {} })
  const by = (ip: string) => ({ 'cf-connecting-ip': ip, 'x-mancer-edge': PROOF })
  try {
    const a1 = await open(handle.url, by('2001:db8:a::1'))
    const a2 = await open(handle.url, by('2001:db8:a::1'))
    const b1 = await open(handle.url, by('2001:db8:b::1'))
    // full at 3. C holds none: its share is one place of three, and A's /48 holds two of them: A's least lately used goes
    const c1 = await open(handle.url, by('2001:db8:c::1'))
    assert.deepEqual([await alive(handle.url, a1), await alive(handle.url, a2), await alive(handle.url, b1), await alive(handle.url, c1)], [false, true, true, true])
    // an address at the cap of all with a session of its own opens a new one in place of its own least lately used
    const a3 = await open(handle.url, by('2001:db8:a::2'))
    assert.deepEqual([await alive(handle.url, a2), await alive(handle.url, a3), await alive(handle.url, b1), await alive(handle.url, c1)], [false, true, true, true])
  } finally {
    await handle.close()
  }
  // a full server whose prefixes all stand at their share refuses a newcomer whose own prefix holds one of them: 503, with
  // Retry-After and a JSON-RPC error, and nobody's session goes
  const full = await serveHttp(configFor(api, { MANCER_MCP_MAX_SESSIONS: '4', MANCER_MCP_MAX_SESSIONS_PER_ADDRESS: '2', MANCER_MCP_EDGE_SECRET: PROOF }), { now: () => (at += 1_100), log: () => {} })
  try {
    const held = [await open(full.url, by('2001:db8:a::1')), await open(full.url, by('2001:db8:a::1')), await open(full.url, by('2001:db8:b::1')), await open(full.url, by('2001:db8:b::1'))]
    const c = await fetch(full.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...by('2001:db8:a:1::1') }, body: JSON.stringify(INIT) })
    const refusal = (await c.json()) as { error?: { code?: number } }
    assert.equal(c.status, 503)
    assert.ok(Number(c.headers.get('retry-after')) > 0)
    assert.equal(refusal.error?.code, -32000)
    assert.equal(c.headers.get('mcp-session-id'), null)
    for (const id of held) assert.equal(await alive(full.url, id), true)
  } finally {
    await full.close()
    await api.close()
  }
})

// --------------------------------------------------------------------------------------------- the reads it vouches

test("get_contracts answers the contracts every build is held to, or refuses: never another router the API names", async () => {
  // Its description tells the agent to check a transaction's to and an approval's spender against what it answers, and it
  // answers `GET /v1/contracts` as it came, unchecked: an API that names its own router there has the agent check against
  // that router, while every build is held to the kit's (checks.ts `trustedOf`).
  const OTHER = '0x000000000000000000000000000000000000beef'
  const api = await standIn({ 'GET /v1/contracts': () => { const c = contractsAnswer(); return { body: { ...c, router: { ...c.router, address: OTHER }, allowanceTarget: { ...c.allowanceTarget, address: OTHER } } } } })
  try {
    const r = await run(api, 'get_contracts', {})
    if (r.isError) return
    assert.notEqual(String(r.body.router?.address).toLowerCase(), OTHER, 'get_contracts names a router no build is held to')
  } finally {
    await api.close()
  }
})

test("a vault trade's quote names what it buys: with no tokenOut, the API chooses, and minOut is read in the API's token", async () => {
  // checkVaultQuote holds tokenOut only where the body names one. A trade asked with none is answered for whatever token
  // the API chose, and the agent's minOut ("3000", meant in USDG) is scaled by that token's decimals.
  const JUNK = '0x000000000000000000000000000000000000d00d'
  const api = await standIn({
    'POST /v1/books/:token/vault-quote': ({ body }) => {
      const b = body as Record<string, string>
      return { body: { purpose: 'trade', vault: VAULT, tokenIn: b.tokenIn, tokenOut: JUNK, amountIn: b.amountIn ?? '1', minOut: '0', route: '0x', adapter: '0x0000000000000000000000000000000000000000', deadline: '0', salt: '1', signature: '0x' } }
    },
  })
  try {
    const r = await run(api, 'get_book_vault_quote', { token: BOOK, wallet: TAKER, purpose: 'trade', tokenIn: WETH, amountIn: '1', minOut: '3000' }, { authorization: `Bearer ${KEY}` })
    assert.equal(r.isError, true, `answered a vault trade for ${r.body.tokenOut}, a token the caller never named`)
  } finally {
    await api.close()
  }
})
