import test from 'node:test'
import assert from 'node:assert/strict'
import { privateKeyToAccount } from 'viem/accounts'
import { Mancer } from '../src/index'
import { TRUSTED, fakeChain, mockApi } from './helpers'

// The second reader's L6 of the accounts fixes: the account scope is the primary wallet's, so the SDK's default revoke
// ended in 403 primary-wallet-only for a bot on a linked wallet. The default is the wallet's own sessions, and a scope
// named is the one sent.

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')

function jwt(sub: string, iat: number, exp: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: sub.toLowerCase(), iat, exp })}.c2lnbmF0dXJl`
}

test("revokeSessions ends the wallet's own sessions by default, and sends the scope it is given", async () => {
  const now = Math.floor(Date.now() / 1000)
  const asked: unknown[] = []
  const api = await mockApi({
    'POST /v1/me/sessions/revoke': (r) => {
      asked.push(r.body)
      const scope = (r.body as { scope?: string }).scope
      return { body: { token: jwt(account.address, now + 1, now + 7 * 86_400), scope, ended: 1, pausedWebhooks: [] } }
    },
  })
  try {
    const m = new Mancer({ baseUrl: api.url, account, trusted: TRUSTED, publicClient: fakeChain() })
    m.useSession(jwt(account.address, now, now + 7 * 86_400))
    const out = (await m.revokeSessions()) as unknown as { scope: string; token: string }
    assert.deepEqual(asked, [{ scope: 'wallet' }], 'the default is the wallet scope, which any wallet of an account may ask')
    assert.equal(out.scope, 'wallet')
    assert.equal(m.session!.token, out.token, 'the fresh session is kept')
    await m.revokeSessions('account')
    assert.deepEqual(asked.at(-1), { scope: 'account' }, 'the account scope, named, is sent as named')
  } finally {
    await api.close()
  }
})
