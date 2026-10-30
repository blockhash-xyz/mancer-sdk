// Takes every comment out of a built JavaScript file (or a TypeScript one), for the package Mancer publishes to npm (packages/sdk,
// through its tsup.config.ts). Its source is this monorepo's, written for its own readers; what a package
// ships is read by anyone. A comment that tells a bundler something is kept: `/* @__PURE__ */` and `/* #__PURE__ */`
// (what lets a consumer's bundler drop an unused `new Set(...)`), `/* @__NO_SIDE_EFFECTS__ */`, and a file's `#!` line.
//
// The comments are found by TypeScript's parser, never by a pattern: a regular expression or a string can hold `//` or
// `/*`. Every comment is trivia before some token, so walking every token of the tree finds each one once.
import ts from 'typescript'

const KEPT = /^\/\*\s*[@#]__(PURE|NO_SIDE_EFFECTS)__\s*\*\/$|^\/\/\s*@ts-|^\/\/\/\s*<reference /

/** TypeScript source keeps its compiler directives (`// @ts-expect-error`, `/// <reference …>`) too. */
const kindOf = (fileName) => (/\.[cm]?tsx?$/.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JS)

/** Every comment's [start, end) in `code`, in order, with no duplicates. */
function commentRanges(code, fileName) {
  const file = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kindOf(fileName))
  const seen = new Map()
  const at = (pos) => {
    for (const r of ts.getLeadingCommentRanges(code, pos) ?? []) seen.set(r.pos, r.end)
    for (const r of ts.getTrailingCommentRanges(code, pos) ?? []) seen.set(r.pos, r.end)
  }
  const walk = (node) => {
    // a JSDoc node lies inside its comment, which the node it documents already found
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return
    at(node.pos)
    at(node.end)
    for (const child of node.getChildren(file)) walk(child)
  }
  walk(file)
  return { file, ranges: [...seen].sort((a, b) => a[0] - b[0]) }
}

/** Fails where `code` does not parse, or holds a comment a bundler does not read. */
function assertStripped(code, fileName) {
  const body = code.startsWith('#!') ? code.slice(code.indexOf('\n') + 1) : code
  const { file, ranges } = commentRanges(body, fileName)
  const errors = file.parseDiagnostics ?? []
  if (errors.length) throw new Error(`${fileName}: the stripped code does not parse: ${ts.flattenDiagnosticMessageText(errors[0].messageText, '\n')}`)
  const left = ranges.map(([s, e]) => body.slice(s, e)).filter((t) => !KEPT.test(t))
  if (left.length) throw new Error(`${fileName}: ${left.length} comments left, the first ${JSON.stringify(left[0].slice(0, 80))}`)
}

/** The code with every comment but a bundler's annotations taken out, and the blank lines that leaves collapsed. */
export function stripComments(code, fileName = 'chunk.js') {
  const shebang = code.startsWith('#!') ? code.slice(0, code.indexOf('\n') + 1) : ''
  const body = code.slice(shebang.length)
  let out = ''
  let last = 0
  for (const [start, end] of commentRanges(body, fileName).ranges) {
    if (start < last) continue
    const text = body.slice(start, end)
    if (KEPT.test(text)) continue
    out += body.slice(last, start)
    // a comment between two tokens on one line keeps them apart
    const before = body[start - 1] ?? '\n'
    const after = body[end] ?? '\n'
    if (!/\s/.test(before) && !/\s/.test(after)) out += ' '
    last = end
  }
  out += body.slice(last)
  const lines = out.split('\n').map((l) => l.replace(/[ \t]+$/, ''))
  const kept = []
  for (const l of lines) {
    if (l === '' && (kept.length === 0 || kept[kept.length - 1] === '')) continue
    kept.push(l)
  }
  const stripped = shebang + kept.join('\n').replace(/\n*$/, '\n')
  assertStripped(stripped, fileName)
  return stripped
}

/** A tsup plugin: every JavaScript chunk tsup writes, its comments taken out, or the build fails. */
export const stripCommentsPlugin = {
  name: 'strip-comments',
  renderChunk(code, info) {
    if (!/\.(c|m)?js$/.test(info.path)) return
    return { code: stripComments(code, info.path) }
  },
}
