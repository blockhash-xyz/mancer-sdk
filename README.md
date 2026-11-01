# Mancer SDK

TypeScript for building on [Mancer](https://mancer.xyz), the dex aggregator and order layer of Robinhood Chain.

| Folder | Package | What it is |
| --- | --- | --- |
| `packages/sdk` | [`@blockhash/mancer-sdk`](https://www.npmjs.com/package/@blockhash/mancer-sdk) | Mancer's API for a bot with a wallet: sign in, swap, orders, sends, Books and account events, every build checked before it is signed. |
| `packages/mcp` | `@blockhash/mancer-mcp` | Mancer's Model Context Protocol server: an AI agent reads Mancer and builds what its own wallet signs. It signs nothing and holds no key. Mancer runs it at `https://mcp.mancer.xyz`, and it runs on your own machine from this source. |
| `examples/trading-bot` | not published | A bot with its own wallet that does everything on Mancer through the SDK, and an AI agent whose trades the bot's own code checks. |

The guides are at [docs.mancer.xyz/agents](https://docs.mancer.xyz/agents).

## Working on it

It needs Node 22.12 or newer.

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run scan
npm run pack-check
```

- In this repository the MCP server and the example bot run on the SDK's source: each one's tsconfig names `packages/sdk/src` in `paths`, which tsx and the typecheck both read.
- `node packages/mcp/scripts/run-source.mjs` runs the MCP server over stdio, and `node packages/mcp/scripts/run-source.mjs serve` over Streamable HTTP at `http://127.0.0.1:8790/`: [packages/mcp/README.md](packages/mcp/README.md) has its settings.
- `npm run build` writes each package's `dist`, the only code npm publishes.
- `npm run scan` reads every file of the tree for secrets and for text that is not public.
- `npm run pack-check` packs both packages, installs the tarballs into a fresh folder from a lock, and runs them there in plain Node.
- The MCP server names each dependency by its exact version, and its tarball carries an `npm-shrinkwrap.json` made from this repository's lock at each pack: `npx` and `npm install -g` install the tree its checks ran on.

## Where the code comes from

This repository is mirrored from Mancer's own repository at each release.
Issues and pull requests are welcome here: a change that lands is carried into Mancer's repository, and comes back with the next release.
`packages/sdk/src/kit` is the part of Mancer's contracts kit the SDK uses: the contracts it pins, their ABIs, and the checks every Mancer client runs.
`packages/sdk/openapi.yaml` is Mancer's API reference, also served at [docs.mancer.xyz/openapi.yaml](https://docs.mancer.xyz/openapi.yaml), and the SDK's types are generated from it.

## Releases

A tag `v<version>` on a commit of `main` publishes both packages to npm from GitHub Actions, with provenance and no npm token in the repository.
One job checks, builds and packs with no credential; a second, approved by a person, publishes those same tarballs and runs no code of this repository.

## Security

Report a vulnerability as [SECURITY.md](SECURITY.md) says, and not in a public issue.

## License

MIT, © Blockhash.
