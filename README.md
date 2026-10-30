# Mancer SDK

TypeScript for building on [Mancer](https://mancer.xyz), the dex aggregator and order layer of Robinhood Chain.

| Folder | Package | What it is |
| --- | --- | --- |
| `packages/sdk` | [`@blockhash/mancer-sdk`](https://www.npmjs.com/package/@blockhash/mancer-sdk) | Mancer's API for a bot with a wallet: sign in, swap, orders, sends, Books and account events, every build checked before it is signed. |
| `examples/trading-bot` | not published | A bot with its own wallet that does everything on Mancer through the SDK, and an AI agent whose trades the bot's own code checks. |

The guides are at [docs.mancer.xyz/agents](https://docs.mancer.xyz/agents).

## Working on it

It needs Node 22 or newer.

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run pack-check
```

- In this repository the example bot runs on the SDK's source: its tsconfig names `packages/sdk/src` in `paths`, which tsx and the typecheck both read.
- `npm run build` writes the SDK's `dist`, the only code npm publishes.
- `npm run pack-check` packs the SDK, installs the tarball into a fresh folder, and runs it there in plain Node.

## Where the code comes from

This repository is mirrored from Mancer's own repository at each release.
Issues and pull requests are welcome here: a change that lands is carried into Mancer's repository, and comes back with the next release.
`packages/sdk/src/kit` is the part of Mancer's contracts kit the SDK uses: the contracts it pins, their ABIs, and the checks every Mancer client runs.
`packages/sdk/openapi.yaml` is Mancer's API reference, also served at [docs.mancer.xyz/openapi.yaml](https://docs.mancer.xyz/openapi.yaml), and the SDK's types are generated from it.

## Releases

A tag `v<version>` publishes the SDK to npm from GitHub Actions, with provenance and no npm token in the repository.

## Security

Report a vulnerability as [SECURITY.md](SECURITY.md) says, and not in a public issue.

## License

MIT, © Blockhash.
