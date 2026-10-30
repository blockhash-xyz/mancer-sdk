# A Mancer trading bot

A bot with its own wallet that does everything on Mancer through [`@blockhash/mancer-sdk`](https://www.npmjs.com/package/@blockhash/mancer-sdk), and an AI agent whose trades the bot's own code checks.

`bot.ts` runs, in order:

1. It signs in with its wallet through the SDK: the nonce's message is checked line by line, signed on this machine, and turned into a session.
2. It swaps 0.001 ETH into USDG: the quote, the floor and what set it, each step read back from its calldata, the simulation, the swap sent, and what arrived by the router's `Executed` event.
3. It places a limit order of 0.25 ETH into USDG, half again over the market by default so it rests: the setup's wrap and approval checked and sent, then the order signed (EIP-712) and placed.
4. It sends ETH to `SEND_TO`, where one is set.
5. It trades a Book's vault, where `BOOK_TOKEN` names a Book the wallet is a trader of, on Mancer's signed quote.
6. It joins the account's live events, replays what the run did, prints each event as it lands, and rejoins from its cursor after a drop.

`agent.ts` asks a model for one `propose_swap`, as the [AI agents](https://docs.mancer.xyz/agents/ai-agents) page defines it.
The bot's rails decide: the tokens it lists, the largest trade, the daily cap, the gas floor, the price impact and Mancer's simulation.
The rails' numbers are in `.env`, and the model never holds a key or writes an amount.

## Every floor is one the bot can justify

The SDK checks every step against what the bot asked for and the contracts it pins.
A floor taken from the API's own quote would let a wrong quote set it, so the SDK asks every swap and vault trade to name its floor rule.
The bot names a reference on its own RPC (`reference.ts`) with `maxSlippageBps` at `SLIPPAGE_BPS`.
For ETH against USDG the reference is the SDK's own `poolReference()`, Uniswap V3's WETH/USDG pool.
For any other pair it is the best Uniswap V3 fee tier by Uniswap's QuoterV2.
Mancer's build is held to it: a route that pays less is refused before anything is signed.
The limit order's price and the agent's valuations come from the same references.
A pair no Uniswap V3 pool prices is refused, unless `TRUST_QUOTE=1` lets Mancer's quote set the floor.
The output says which set each floor.

## Run it with real money

Use a fresh wallet that holds only what the bot may trade.
The key in `.env` can spend everything in that wallet, and the bot sends real transactions on Robinhood Chain (chain `4663`).

1. Make a new wallet, and send it a little ETH on Robinhood Chain: the defaults spend 0.001 ETH on the swap, set aside 0.25 ETH for the limit order, and pay gas. Lower `LIMIT_AMOUNT` for a smaller wallet.
2. Copy this folder anywhere, and in the copy run `npm install @blockhash/mancer-sdk`: it installs the bot's dependencies, the SDK from npm among them.
3. `cp .env.example .env`, and set `BOT_PRIVATE_KEY` to the new wallet's key.
4. Run `npx tsx --env-file=.env bot.ts`. Node reads the key from `.env` into the bot's process alone, so the command line and the shell's history carry none.
5. Stop it with Ctrl-C once you have seen its events.

The limit order rests at half again over the market and expires in seven days.
Cancel it sooner with the SDK's `cancelOrders([hash])`, which costs no gas.
Set `LIMIT_VS_MARKET_PCT=-1` for an order Mancer's executor fills at once.

## The agent

1. Set `ANTHROPIC_API_KEY` in `.env`, or `MODEL_PROVIDER=stub` to propose `STUB_PROPOSAL` with no model asked.
2. Run `npx tsx --env-file=.env agent.ts`. It builds, checks and simulates the proposal, and signs nothing.
3. Set `AGENT_SEND=1` to sign and send a proposal that passes every rail. Each sent trade is booked in `agent-ledger.json` for the daily cap.

`model.ts` is the one call to the model, through Anthropic's SDK.
Replace `anthropicProposal` with your provider's call: OpenAI's and xAI's tools take the same JSON Schema as `parameters`.

## Tests

`npm test` runs the agent's rails with the offline stub: a proposal over each rail is refused before anything is built or sent, and one within them reaches the build with its exact amount and, in a dry run, is signed by nobody.
It also holds the floor rule: a pair no pool prices names Mancer's quote only where `TRUST_QUOTE=1` says so.
`npm run typecheck` checks every file against the SDK's types.

## Proof on a fork

In a checkout of Mancer's own repository, the bot runs on the SDK's source beside it, and `fork/` runs the whole bot on a local fork of the chain against the API's own server: `fork/README.md` there says how.
