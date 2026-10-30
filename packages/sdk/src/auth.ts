import { getAddress, type Address } from 'viem'

/**
 * The sign-in message's check, and a session token's claims. Mancer's sign-in message is Sign-In with Ethereum
 * (EIP-4361): the SDK signs it only where every line is the one it expects, so an answer can never make the wallet sign
 * another site's sign-in, another wallet's, another chain's, or a message that is no sign-in at all.
 */

export interface SignInExpectation {
  address: Address
  nonce: string
  /** The domain the message must name: `mancer.xyz` for a client that sends no `Origin`, as a server or a bot does. */
  domain?: string
  chainId?: number
  /** Now, in seconds (injectable for tests). */
  nowSec?: number
  /** How far the message's Issued At may stand from now, in seconds. Default 600: a nonce lives ten minutes. */
  skewSec?: number
}

/** null where the message is Mancer's sign-in for this wallet, chain and nonce; otherwise what is wrong with it. */
export function signInMessageMismatch(message: string, e: SignInExpectation): string | null {
  const domain = e.domain ?? 'mancer.xyz'
  const lines = message.split('\n')
  if (lines.length !== 10) return 'the message is not a sign-in of ten lines'
  const want = [
    `${domain} wants you to sign in with your Ethereum account:`,
    getAddress(e.address),
    '',
    'Sign in to Mancer.',
    '',
    `URI: https://${domain}`,
    'Version: 1',
    `Chain ID: ${e.chainId ?? 4663}`,
    `Nonce: ${e.nonce}`,
  ]
  const names = ['domain', 'address', 'blank line', 'statement', 'blank line', 'URI', 'version', 'chain id', 'nonce']
  for (let i = 0; i < want.length; i++) {
    if (lines[i] !== want[i]) return `the message's ${names[i]} is not the expected one`
  }
  const m = /^Issued At: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/.exec(lines[9] ?? '')
  if (!m) return "the message's Issued At is not a time"
  const issued = Date.parse(m[1]!) / 1000
  const now = e.nowSec ?? Date.now() / 1000
  if (!Number.isFinite(issued) || Math.abs(now - issued) > (e.skewSec ?? 600)) return "the message's Issued At is not now"
  return null
}

/** A session token's claims, read without its signature (which only the API can check): whom it names and when it ends. */
export interface SessionClaims {
  wallet: Address
  issuedAt: number | null
  expiresAt: number
}

function base64UrlText(part: string): string {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
  // atob is in Node 16+ and every browser
  const binary = atob(b64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** The claims of a session token, or null where it is no session token. */
export function sessionClaims(token: string): SessionClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(base64UrlText(parts[1]!)) as { sub?: unknown; iat?: unknown; exp?: unknown }
    if (typeof payload.sub !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(payload.sub)) return null
    if (typeof payload.exp !== 'number') return null
    return { wallet: getAddress(payload.sub), issuedAt: typeof payload.iat === 'number' ? payload.iat : null, expiresAt: payload.exp }
  } catch {
    return null
  }
}

/** Whether a string looks like an issued API key rather than a session token. */
export function isApiKey(credential: string): boolean {
  return credential.startsWith('mancer_')
}
