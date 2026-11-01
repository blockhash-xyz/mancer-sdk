import { z } from 'zod'
import { getAddress, type Address } from 'viem'
import { sessionClaims, signInMessageMismatch } from '@blockhash/mancer-sdk'
import { address, tool, type ToolSpec } from './tool'
import { PENDING_SIGN_IN_MS } from './connection'
import { addressOf, ask, badArgument, ToolRefusal } from './values'

/**
 * The sign-in, through the agent's own wallet, which keeps the account tied to the wallet in use. `sign_in` asks the API for Mancer's sign-in message for the wallet (`GET /auth/nonce`), holds it to the
 * one line by line (the SDK's `signInMessageMismatch`: Mancer's domain, this wallet, chain 4663, this nonce, now), and
 * answers it for the agent's wallet to sign with `personal_sign`. `complete_sign_in` trades the signature for a session
 * (`POST /auth/verify`) and keeps it for this connection alone, never in an answer (connection.ts). From then on the
 * account's tools read and write that wallet's account, and every build defaults to it as taker, recipient and maker.
 * The server signs nothing here either: the wallet signs the message, as it signs every transaction.
 */

export const SESSION_TOOLS: ToolSpec[] = [
  tool({
    name: 'sign_in',
    title: 'Begin signing in with your wallet',
    kind: 'session',
    description: "Begin a sign-in to Mancer with your own wallet. It answers Mancer's sign-in message for that wallet: sign it exactly as given with personal_sign (EIP-191) from the wallet, then call complete_sign_in with the signature. A sign-in reaches the account's own tools and makes the wallet every build's default.",
    shape: { wallet: address('The wallet that signs in') },
    run: async ({ api, config, connection }, a) => {
      const wallet = addressOf(a.wallet, 'wallet')
      if (!config.signInDomain) {
        throw new ToolRefusal({ error: "This server's API is not Mancer's own, and its operator named no sign-in domain: it asks no wallet to sign Mancer's sign-in here.", code: 'sign-in-unavailable', retryable: false })
      }
      const n = await ask<{ nonce?: unknown; message?: unknown }>(api, { method: 'GET', path: '/auth/nonce', query: { address: wallet }, credential: 'none' })
      if (typeof n.nonce !== 'string' || typeof n.message !== 'string') {
        throw new ToolRefusal({ error: 'The sign-in message did not read.', code: 'auth-unavailable', retryable: true })
      }
      const wrong = signInMessageMismatch(n.message, { address: getAddress(wallet), nonce: n.nonce, domain: config.signInDomain })
      if (wrong) throw new ToolRefusal({ error: `The sign-in message is not Mancer's for this wallet (${wrong}): nothing to sign.`, code: 'sign-in-mismatch', retryable: false })
      connection.begin({ wallet, nonce: n.nonce, message: n.message })
      return {
        wallet,
        message: n.message,
        signWith: 'personal_sign (EIP-191), from the wallet named, of the message exactly as given',
        expiresInSeconds: PENDING_SIGN_IN_MS / 1000,
        next: `Sign message with personal_sign from ${wallet}, then call complete_sign_in with the signature within ten minutes.`,
      }
    },
  }),
  tool({
    name: 'complete_sign_in',
    title: 'Finish signing in',
    kind: 'session',
    description: "Finish the sign-in sign_in began, with your wallet's personal_sign signature of its message. This server keeps the session for this connection and never shows it. Until it ends (seven days at most), the account's tools act for that wallet and builds default to it.",
    shape: { signature: z.string().regex(/^0x[0-9a-fA-F]{130,}$/).max(20_000).describe("The wallet's personal_sign signature of the message sign_in answered.") },
    run: async ({ api, connection }, a) => {
      const pending = connection.pending()
      if (!pending) throw badArgument('No sign-in is waiting on this connection: call sign_in first.', 'no-sign-in')
      // a process that holds as many signed-in sessions as it can refuses this one before its nonce is spent: the sign-ins
      // that stand are never ended for it (http.ts)
      const refused = connection.guard?.admit(connection, pending.wallet) ?? null
      if (refused) throw new ToolRefusal({ error: refused, code: 'sessions-full', retryable: true, retryAfterSeconds: 60, hint: 'Wait, then call complete_sign_in again: the sign-in begun stands for ten minutes. Every read and build answers with no sign-in.' })
      let v: { token?: unknown; account?: unknown }
      try {
        v = await ask<{ token?: unknown; account?: unknown }>(api, { method: 'POST', path: '/auth/verify', body: { address: pending.wallet, signature: a.signature, nonce: pending.nonce }, credential: 'none' })
      } catch (e) {
        // the nonce is spent whatever the answer: a new sign-in begins with a new message
        connection.signOut()
        throw e
      }
      const claims = typeof v.token === 'string' ? sessionClaims(v.token) : null
      if (!claims || claims.wallet.toLowerCase() !== pending.wallet) {
        connection.signOut()
        throw new ToolRefusal({ error: 'The API answered no session for this wallet.', code: 'sign-in-mismatch', retryable: false })
      }
      const account = typeof v.account === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.account) ? (v.account.toLowerCase() as Address) : null
      connection.complete(v.token as string, { wallet: pending.wallet, account, expiresAt: claims.expiresAt })
      return {
        signedIn: true,
        wallet: pending.wallet,
        account,
        expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
        next: 'The account tools now act for this wallet, and every build defaults to it as taker, recipient and order maker. When the sign-in ends, a tool says so: sign in again.',
      }
    },
  }),
  tool({
    name: 'sign_out',
    title: 'Sign out',
    kind: 'session',
    description: "Forget this connection's sign-in. Builds then name their wallet (or take a wallet key's, where the connection sends one), and the account's tools wait for a new sign-in. It ends nothing on Mancer's side: the session is never sent again.",
    shape: {},
    run: async ({ connection }) => {
      const was = connection.signedIn()?.wallet ?? null
      connection.signOut()
      return { signedIn: false, wallet: was }
    },
  }),
]
