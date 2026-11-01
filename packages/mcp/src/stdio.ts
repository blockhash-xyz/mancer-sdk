import { randomUUID } from 'node:crypto'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Config } from './config'
import { Connection } from './connection'
import { createServer } from './server'

/**
 * The server over stdio, as an MCP client that starts a local server runs it: one connection, the client's, with one
 * sign-in held in memory for as long as the process runs. Nothing is written to disk, and nothing but MCP's own messages
 * goes to stdout: every log line goes to stderr.
 */
export async function serveStdio(config: Config, options: { fetch?: typeof fetch; log?: (line: string) => void } = {}): Promise<Server> {
  const server = createServer({ config, connection: new Connection(randomUUID()), inbound: () => null, envKeyDefaults: true, fetch: options.fetch, log: options.log })
  await server.connect(new StdioServerTransport())
  return server
}
