import { defineConfig } from 'tsup'
import { stripCommentsPlugin } from '../../scripts/npm/strip-comments.mjs'

// The published build: ESM JavaScript and one declaration file, for plain Node 22 and any bundler.
//
// What the SDK reaches beyond its own files (the contracts it pins, their ABIs and the checks every client runs) is
// bundled into dist, the JavaScript and the types alike. Only what the entry reaches is kept: esbuild drops the modules no
// export reaches, and the declaration bundler keeps only the types the SDK's own exports name. viem stays a dependency.
// The JavaScript carries no comment; the declarations keep the doc comments, each read as published text
// (scripts/npm/pack-check.mjs scans both).

const kit = { dts: true }

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  // no Node or browser API in the source: the bundle must build for neither, and a Node module bundled in fails here
  platform: 'neutral',
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: false,
  external: [/^viem(\/|$)/],
  ...kit,
  esbuildOptions(options) {
    options.legalComments = 'none'
  },
  plugins: [stripCommentsPlugin],
})
