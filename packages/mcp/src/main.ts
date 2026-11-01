import { ConfigError, configFrom, type Config } from './config'
import { serveHttp } from './http'
import { serveStdio } from './stdio'
import { SERVER_VERSION } from './version'

/**
 *   mancer-mcp                                 the server over stdio, for an MCP client that starts it
 *   mancer-mcp serve [--host H] [--port N]     the server over Streamable HTTP, as Mancer hosts it at mcp.mancer.xyz
 *   mancer-mcp --version | --help
 *
 * Its settings are its environment's (config.ts): MANCER_API_URL, MANCER_API_KEY and the rest. No flag or setting takes a
 * wallet's key: the server signs nothing.
 */

const HELP = `mancer-mcp ${SERVER_VERSION}: Mancer's MCP server. It reads Mancer and builds what your agent's own wallet signs, and signs nothing.

  mancer-mcp                                over stdio, for an MCP client that starts it
  mancer-mcp serve [--host H] [--port N]    over Streamable HTTP (127.0.0.1:8790 by default)

Environment: MANCER_API_URL (https://api.mancer.xyz), MANCER_API_KEY (optional: the API reads it as it reads any key),
MANCER_MCP_HOST, MANCER_MCP_PORT, MANCER_MCP_ALLOWED_HOSTS, MANCER_MCP_ALLOWED_ORIGINS, MANCER_MCP_SESSION_IDLE_SEC,
MANCER_MCP_MAX_SESSIONS, MANCER_MCP_MAX_SESSIONS_PER_ADDRESS, MANCER_MCP_MAX_SESSIONS_PER_PREFIX,
MANCER_MCP_MAX_SIGNED_IN_PER_WALLET, MANCER_MCP_MAX_SIGNED_IN. Guide: https://docs.mancer.xyz/agents/mcp`

export type Command = { kind: 'stdio' } | { kind: 'serve'; host?: string; port?: number } | { kind: 'help' } | { kind: 'version' }

export function parseArgs(argv: readonly string[]): Command {
  if (argv.length === 0) return { kind: 'stdio' }
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { kind: 'help' }
  if (argv.length === 1 && (argv[0] === '--version' || argv[0] === '-v')) return { kind: 'version' }
  if (argv[0] !== 'serve') throw new ConfigError(`unknown argument ${JSON.stringify(argv[0]).slice(0, 40)}: mancer-mcp --help says what it takes`)
  const out: { kind: 'serve'; host?: string; port?: number } = { kind: 'serve' }
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--host' && value) {
      out.host = value
      i++
    } else if (flag === '--port' && value && /^\d{1,5}$/.test(value) && Number(value) <= 65_535) {
      out.port = Number(value)
      i++
    } else {
      throw new ConfigError(`serve takes --host and --port: ${JSON.stringify(flag).slice(0, 40)} is neither, or has no value`)
    }
  }
  return out
}

export async function main(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<void> {
  let command: Command
  let config: Config
  try {
    command = parseArgs(argv)
    config = configFrom(env, command.kind === 'serve' ? { host: command.host, port: command.port } : {})
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e
    console.error(`mancer-mcp: ${e.message}`)
    process.exitCode = 2
    return
  }
  if (command.kind === 'help') return void console.log(HELP)
  if (command.kind === 'version') return void console.log(SERVER_VERSION)
  if (command.kind === 'stdio') {
    await serveStdio(config)
    console.error(`mancer-mcp ${SERVER_VERSION} on stdio, asking ${config.apiUrl}`)
    return
  }
  const handle = await serveHttp(config)
  console.error(`mancer-mcp ${SERVER_VERSION} serving ${handle.url}, asking ${config.apiUrl}${config.forwardEdge ? ', forwarding the caller for Cloudflare' : ''}`)
  const stop = () => void handle.close().then(() => process.exit(0))
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}
