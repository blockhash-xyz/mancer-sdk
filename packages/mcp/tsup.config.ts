import { defineConfig } from 'tsup'
import { stripCommentsPlugin } from '../../scripts/npm/strip-comments.mjs'

// The published build: ESM JavaScript for Node 22, the bin (dist/cli.js, with its node shebang) and the library (dist/index.js
// and its declarations), sharing one chunk. Every dependency stays one: the SDK (@blockhash/mancer-sdk), the MCP SDK, viem
// and zod. This package's tsconfig sends @blockhash/mancer-sdk to the SDK's source for the typecheck and the tests; the
// build leaves it external, so dist imports the published package by its name.
export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: true,
  sourcemap: false,
  minify: false,
  external: [/^@blockhash\/mancer-sdk(\/|$)/, /^@modelcontextprotocol\/sdk(\/|$)/, /^viem(\/|$)/, /^zod(\/|$)/],
  // the declarations name Node's own types (NodeJS.Platform, NodeJS.ProcessEnv), so they say where those come from: a
  // consumer whose tsconfig lists no types still reads them
  dts: { entry: { index: 'src/index.ts' }, banner: '/// <reference types="node" />' },
  esbuildOptions(options) {
    options.legalComments = 'none'
  },
  // the source is a monorepo's, written for its own readers: the JavaScript carries no comment, and the declarations
  // keep the doc comments, each read as published text (scripts/npm/pack-check.mjs scans both)
  plugins: [stripCommentsPlugin],
})
