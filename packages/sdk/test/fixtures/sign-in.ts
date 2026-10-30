import { getAddress } from 'viem'

/**
 * Mancer's sign-in message for mancer.xyz, line for line as the API writes it: the stand-in API's message in these tests,
 * which the SDK's check must accept. api-parity.test.ts holds it equal to the API's own builder, in the repository the
 * API lives in.
 */
export function loginMessage(address: string, nonce: string, issuedAtSec: number): string {
  return [
    'mancer.xyz wants you to sign in with your Ethereum account:',
    getAddress(address),
    '',
    'Sign in to Mancer.',
    '',
    'URI: https://mancer.xyz',
    'Version: 1',
    'Chain ID: 4663',
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(issuedAtSec * 1000).toISOString()}`,
  ].join('\n')
}
