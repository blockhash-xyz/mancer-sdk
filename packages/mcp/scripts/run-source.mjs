#!/usr/bin/env node
// Runs the server from the repository's TypeScript source, with the SDK's source beside it:
//   node /path/to/mancer/packages/mcp/scripts/run-source.mjs            over stdio
//   node /path/to/mancer/packages/mcp/scripts/run-source.mjs serve      over Streamable HTTP
// The published package's bin is dist/cli.js, which `npm run build` makes; this file is the repository's way to run the
// server with no build, and the way its tests start it.
// tsx is resolved from this file's place in the repository, whatever directory the client starts it in. Both of its
// loaders are registered: the SDK reaches the site's shared modules, which are CommonJS TypeScript. The ESM loader reads
// this package's tsconfig.json, whose `paths` send @blockhash/mancer-sdk to packages/sdk/src rather than to its build.
import { fileURLToPath } from 'node:url'
import { register as registerCommonJs } from 'tsx/cjs/api'
import { register } from 'tsx/esm/api'

registerCommonJs()
register({ tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) })
const { main } = await import('../src/main.ts')
await main()
