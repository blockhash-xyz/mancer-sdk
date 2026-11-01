/**
 * @blockhash/mancer-mcp: Mancer's MCP server. An AI agent reads Mancer through it, and builds swaps, sends, orders and
 * Books acts as unsigned transactions, typed data or messages its own wallet signs. The server signs nothing and holds no
 * wallet's key; its agent signs in to Mancer with its own wallet where an account's tool needs it, and the server keeps
 * that session for the connection alone. Over stdio (`serveStdio`) or Streamable HTTP (`serveHttp`), as Mancer runs it at
 * https://mcp.mancer.xyz.
 */
export { createServer, INSTRUCTIONS, TOOLS } from './server'
export type { ServerDeps } from './server'
export { serveHttp } from './http'
export type { HttpHandle, HttpOptions } from './http'
export { serveStdio } from './stdio'
export { ConfigError, DEFAULT_API_URL, DEFAULT_HOST, DEFAULT_PORT, MANCER_API_ORIGINS, configFrom } from './config'
export type { Config, HttpSettings } from './config'
export { Connection } from './connection'
export type { PendingSignIn, SignedIn } from './connection'
export { FORWARDED, askerFor, credentialOf, forwardedHeaders } from './api'
export type { ApiAnswer, ApiCall, Asker, Inbound } from './api'
export { Limiter, callerAddress, callerBuckets } from './rate'
export type { BucketRule } from './rate'
export { ToolRefusal } from './values'
export type { Refusal, UnsignedTx } from './values'
export type { ToolContext, ToolKind, ToolSpec } from './tool'
export { main, parseArgs } from './main'
export type { Command } from './main'
export { SERVER_NAME, SERVER_VERSION } from './version'
