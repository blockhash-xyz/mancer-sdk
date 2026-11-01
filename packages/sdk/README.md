# @blockhash/mancer-sdk

Mancer's API for a bot with a wallet, in TypeScript on [viem](https://viem.sh).
Mancer is the dex aggregator and order layer of Robinhood Chain.
The SDK signs in with the bot's own account, swaps, places and cancels orders, sends, acts on Books and hears the account's events.
It asks Mancer for every act as steps ready to sign, and checks each step against what you asked for before your account signs it.
Your account signs on your machine, or in the wallet client you hand in.
The SDK never logs, sends or stores a private key.

## Install

```bash
npm install @blockhash/mancer-sdk viem
```

It needs Node 22 or newer, and runs in a browser as well.

## A swap

```ts
import { privateKeyToAccount } from 'viem/accounts'
import { ETH, Mancer } from '@blockhash/mancer-sdk'

const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168'
const mancer = new Mancer({ account: privateKeyToAccount(process.env.BOT_PRIVATE_KEY as `0x${string}`) })

const swap = await mancer.swap({
  tokenIn: ETH,
  tokenOut: USDG,
  amountIn: 1_000_000_000_000_000n,
  // the floor: what the deepest Uniswap pool of WETH and USDG pays on your node, less 1%
  reference: mancer.poolReference(),
  maxSlippageBps: 100,
})
console.log(`received ${swap.executed?.amountOut} USDG units`)
```

`swap()` signs in where it needs to, builds the swap with your wallet as its recipient, checks it, and sends its approval and then the swap.
`buildSwap()` does the same and sends nothing.

## The floor is yours

The floor is the least a swap may deliver, and the chain holds it.
Within the floor, a wrong or hostile quote can still route the swap through a pool that pays the floor and no more.
So each swap names exactly one floor rule, or it is refused before anything is asked:

| Name | The floor |
| --- | --- |
| `minOut` | Your own number, in raw units of the output. |
| `reference` with `maxSlippageBps` | Your function's answer for the order, less `maxSlippageBps`. |
| `trustQuote: true` | Mancer's quote, less `slippageBps`. A wrong quote is then a wrong floor. |

`poolReference()` prices WETH against USDG from Uniswap's QuoterV2 on your own RPC.
For any other pair, pass a function of your own.

## What is checked

The SDK checks every step before a signature: the chain, the wallet, the approval, the router call's tokens, amount, recipient, floor, deadline and fee, and every leg against the contracts of Mancer's own routing.
A check that fails throws a `MancerCheckError` naming the first field that is not what you asked for, and nothing is signed or sent after it.

## Docs

The full guide is at [docs.mancer.xyz/agents/sdk](https://docs.mancer.xyz/agents/sdk): orders, sends, Books, events, errors, keys and every route of the API.

## Source

The source is at [github.com/blockhash-xyz/mancer-sdk](https://github.com/blockhash-xyz/mancer-sdk), with the MCP server and an [example bot](https://github.com/blockhash-xyz/mancer-sdk/tree/main/examples/trading-bot).

## License

MIT, © Blockhash.
