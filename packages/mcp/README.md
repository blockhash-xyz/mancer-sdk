# @blockhash/mancer-mcp

Mancer's [Model Context Protocol](https://modelcontextprotocol.io) server.
Mancer is the dex aggregator and order layer of Robinhood Chain.
An AI agent connected to it reads Mancer and builds what its own wallet signs: swaps, sends, limit, stop and recurring orders, and Books acts.

The server signs nothing and holds no wallet's key.
Every build comes back as unsigned transactions, EIP-712 typed data or a message, each read back from its own bytes.
Before it is answered, each build is held to the checks `@blockhash/mancer-sdk` runs before a wallet signs, against the contracts its kit pins; one that fails is refused `build-mismatch`.
A tool refuses an argument it does not take, and reads every token's decimals from the token's own contract (WETH, USDG and ether are the kit's own).
The agent's own wallet signs each one and sends it.

## Connect

Mancer runs this server at `https://mcp.mancer.xyz`, over Streamable HTTP:

```bash
claude mcp add --transport http mancer https://mcp.mancer.xyz
```

No key is needed.
An API key, sent as `Authorization: Bearer <key>`, is the API's to read as it reads any key: it raises the rate limits, lifts the stock geofence for its holder, reads back the orders submitted through it, and carries the terms Mancer gave it (a partner's fee terms, Books signing).
The guide for every client is at [docs.mancer.xyz/agents/mcp](https://docs.mancer.xyz/agents/mcp).

The API reads every call as the caller's own request, by the address Cloudflare proves.
Agents behind one shared address, such as a hosted agent platform's, share the API's buckets for a caller with no credential, its anonymous builds' among them.
A sign-in lifts them: the wallet pays a bucket of its own, under the API's ceiling for every caller of one address.
An API key's limits are the key's.

## A swap's floor

`build_swap` names its floor, one of two:

- `minOut`, the least the swap may deliver, from a price of your own; the floor is at least it, and at least the quote less `slippageBps`;
- `trustQuote: true`, Mancer's quote less `slippageBps` (50 by default). For WETH against USDG, ether as WETH, the floor is refused more than 300 bps under what the Uniswap pool pays, read on your own node where `MANCER_MCP_RPC_URL` names one. For any other pair it is Mancer's word alone.

A floor from Mancer's word is never built unless you choose it, as `@blockhash/mancer-sdk` holds it.
The answer names the floor it carries and where it came from.
`get_quote` names the floor `trustQuote` builds at, and neither tool answers the API's transaction or steps unread.

## Run it yourself

The same server runs on your own machine: the code the hosted copy runs.
It needs Node 22.12 or newer.

From npm:

```bash
claude mcp add mancer -- npx -y @blockhash/mancer-mcp   # over stdio, for a client that starts it
npx -y @blockhash/mancer-mcp serve                      # over Streamable HTTP at http://127.0.0.1:8790/
```

From its source, in a clone of [github.com/blockhash-xyz/mancer-sdk](https://github.com/blockhash-xyz/mancer-sdk):

```bash
npm ci --ignore-scripts
node packages/mcp/scripts/run-source.mjs          # over stdio
node packages/mcp/scripts/run-source.mjs serve    # over Streamable HTTP
```

A local copy calls `https://api.mancer.xyz` as any client of the API does.
Its checks read the chain (a token's decimals, a Book's id and vault, a balance, a vault's pending trade) through the API's own chain endpoint unless `MANCER_MCP_RPC_URL` names a node of your own.
Name one to take no API's word for chain state.

| Setting | What it does |
| --- | --- |
| `MANCER_API_URL` | The API it calls. `https://api.mancer.xyz` by default. |
| `MANCER_API_KEY` | An API key sent on every call that carries no sign-in. Optional. Over stdio a wallet key's wallet is then the default where no wallet is named; `serve` defaults nobody to it. |
| `MANCER_MCP_RPC_URL` | A node of your own: every chain read the checks make goes there, and none through the API. Optional; never printed. A signed transaction is still sent through the API. Its token goes in the path or the query: credentials before the host (`user:password@`) are refused at the start, as Node's `fetch` refuses them. |
| `MANCER_MCP_HOST`, `MANCER_MCP_PORT` | Where `serve` listens. `127.0.0.1:8790` by default. |
| `MANCER_MCP_ALLOWED_HOSTS` | The `Host` values `serve` answers. The loopback names of its port by default. |
| `MANCER_MCP_ALLOWED_ORIGINS` | The browser origins `serve` answers. None by default. |
| `MANCER_MCP_SESSION_IDLE_SEC` | How long a connection's sign-in is kept with no request. 3,600 by default. |
| `MANCER_MCP_MAX_SESSIONS`, `MANCER_MCP_MAX_SESSIONS_PER_ADDRESS`, `MANCER_MCP_MAX_SESSIONS_PER_PREFIX` | How many connections `serve` holds, and how many not signed in one caller's address holds (an IPv6 address by its /64) and one block of addresses holds (an IPv6 /48, an IPv4 /24). 2,000, 32 and 256 by default. Past its own cap an address or a block gives up its least lately used connection that is not signed in. At the cap of all, a new connection takes the place of its own address's least lately used; from an address that holds none, of the least lately used of the block holding the most, where that block holds more than its fair share (the places over every block holding one, the newcomer's own counted); and is refused 503 with `Retry-After` where none does. A block at or under its share keeps every connection. A caller the hosted copy cannot place (no edge proof) takes no proven caller's place. |
| `MANCER_MCP_MAX_SIGNED_IN_PER_WALLET`, `MANCER_MCP_MAX_SIGNED_IN` | How many signed-in connections one wallet holds, its own least lately used going past it, and how many `serve` holds in all, a sign-in past it refused. 8, and three quarters of `MANCER_MCP_MAX_SESSIONS`, by default. A signed-in connection is its wallet's and no address's: callers behind one shared address never end each other's, and none is ended for another wallet's. |
| `MANCER_MCP_FORWARD_EDGE`, `MANCER_MCP_EDGE_SECRET` | Mancer's hosted copy alone: forward each caller's Cloudflare identity, and the proof that places it. The first needs the second. |

No setting takes a wallet's key.

## Signing in

The account's own tools (the profile, follows, notifications, votes and theses, a Book's record, and Mancer's signed quotes for a Book's vault) need a signed-in wallet.

1. `sign_in` with the wallet's address answers Mancer's sign-in message for it.
2. The wallet signs the message with `personal_sign`.
3. `complete_sign_in` with the signature finishes the sign-in.

The server checks the message line by line before it is answered: Mancer's domain, the wallet, chain 4663, the nonce, the time.
It keeps the session for that one connection, in memory, and sends it on that connection's calls.
The sign-in lives with the connection's session id: whoever holds the id holds the sign-in, until `sign_out` ends it, the client ends the session, or it is idle past its bound.
Over HTTP each connection keeps its own pace of this server's tool calls; the API's own buckets are the API's (above).
No answer, refusal or log line carries it.
Once signed in, every build defaults to that wallet as taker, recipient and order maker.
A wallet key (one a wallet's sign-in minted at mancer.xyz/account, in the app or through `/v1/me/api-keys`) acts as that wallet, within its scopes, in place of a sign-in on each connection. With its `read` scope, a build that names no wallet is for the key's wallet, and its answer says so (`defaultWallet`): sign it from that wallet alone. A key proves no signer, so never put a wallet key on a connection others share. A partner's key acts as no wallet, a build with one names its wallet, and over HTTP only the key the caller sends defaults a build, never one `serve` was started with.
A sign-in wins over an API key: the session is the bearer while it stands.

## Library

```ts
import { configFrom, serveHttp } from '@blockhash/mancer-mcp'

const handle = await serveHttp(configFrom(process.env))
console.log(handle.url)
```

`createServer`, `serveStdio`, `serveHttp` and `TOOLS` are exported, with the types of their settings.

## License

MIT, © Blockhash.
