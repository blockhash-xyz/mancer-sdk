// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { decodeErrorResult, encodeFunctionData, getAddress, parseAbi, type Address, type Hex } from 'viem'

export type TransferAsset =
  | { kind: 'native' }
  | { kind: 'erc20'; token: Address }
  | { kind: 'erc721'; collection: Address; tokenId: bigint }
  | { kind: 'erc1155'; collection: Address; tokenId: bigint }

export function assetContract(asset: TransferAsset): Address | null {
  if (asset.kind === 'native') return null
  return asset.kind === 'erc20' ? asset.token : asset.collection
}

export const ERC721_INTERFACE_ID = '0x80ac58cd' as const
export const ERC1155_INTERFACE_ID = '0xd9b67a26' as const
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead'

export const ERC20_TRANSFER_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])

export const ERC721_TRANSFER_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function name() view returns (string)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
])

export const ERC1155_TRANSFER_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
])

export const TRANSFER_ERRORS_ABI = parseAbi([
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InvalidSender(address sender)',
  'error ERC20InvalidReceiver(address receiver)',
  'error ERC721NonexistentToken(uint256 tokenId)',
  'error ERC721IncorrectOwner(address sender, uint256 tokenId, address owner)',
  'error ERC721InvalidSender(address sender)',
  'error ERC721InvalidReceiver(address receiver)',
  'error ERC721InsufficientApproval(address operator, uint256 tokenId)',
  'error ERC1155InsufficientBalance(address sender, uint256 balance, uint256 needed, uint256 tokenId)',
  'error ERC1155InvalidSender(address sender)',
  'error ERC1155InvalidReceiver(address receiver)',
  'error ERC1155MissingApprovalForAll(address operator, address owner)',
  'error TransferToNonERC721ReceiverImplementer()',
  'error TransferToNonERC1155ReceiverImplementer()',
  'error TransferFromIncorrectOwner()',
  'error OwnerQueryForNonexistentToken()',
  'error TokenDoesNotExist()',
  'error NotOwnerNorApproved()',
  'error TransferToZeroAddress()',
  'error InsufficientBalance()',
])

export type TransferCall =
  | { kind: 'native'; to: Address; value: bigint }
  | { kind: 'erc20'; address: Address; abi: typeof ERC20_TRANSFER_ABI; functionName: 'transfer'; args: readonly [Address, bigint] }
  | { kind: 'erc721'; address: Address; abi: typeof ERC721_TRANSFER_ABI; functionName: 'safeTransferFrom'; args: readonly [Address, Address, bigint] }
  | {
      kind: 'erc1155'
      address: Address
      abi: typeof ERC1155_TRANSFER_ABI
      functionName: 'safeTransferFrom'
      args: readonly [Address, Address, bigint, bigint, Hex]
    }

export function transferCall(asset: TransferAsset, from: Address, to: Address, amount: bigint): TransferCall {
  switch (asset.kind) {
    case 'native':
      return { kind: 'native', to, value: amount }
    case 'erc20':
      return { kind: 'erc20', address: asset.token, abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [to, amount] }
    case 'erc721':
      return { kind: 'erc721', address: asset.collection, abi: ERC721_TRANSFER_ABI, functionName: 'safeTransferFrom', args: [from, to, asset.tokenId] }
    case 'erc1155':
      return {
        kind: 'erc1155',
        address: asset.collection,
        abi: ERC1155_TRANSFER_ABI,
        functionName: 'safeTransferFrom',
        args: [from, to, asset.tokenId, amount, '0x'],
      }
  }
}

export function transferTransaction(call: TransferCall): { to: Address; data: Hex | undefined; value: bigint } {
  switch (call.kind) {
    case 'native':
      return { to: call.to, data: undefined, value: call.value }
    case 'erc20':
      return { to: call.address, data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args }), value: 0n }
    case 'erc721':
      return { to: call.address, data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args }), value: 0n }
    case 'erc1155':
      return { to: call.address, data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args }), value: 0n }
  }
}

export type RecipientProblem = 'invalid' | 'checksum' | 'zero' | 'self' | 'contract'

export type RecipientRead = { ok: true; address: Address } | { ok: false; problem: RecipientProblem; message: string }

export function parseRecipient(raw: string, context: { self?: string | null; contract?: string | null; nft?: boolean } = {}): RecipientRead | null {
  const s = raw.trim()
  if (!s) return null
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) {
    return { ok: false, problem: 'invalid', message: 'Enter an address: 0x and then 40 letters and numbers.' }
  }
  const mixed = /[a-f]/.test(s.slice(2)) && /[A-F]/.test(s.slice(2))
  const address = getAddress(s.toLowerCase())
  if (mixed && address !== s) {
    return { ok: false, problem: 'checksum', message: "This address's capital letters don't match its checksum. Check it for a typo." }
  }
  const lower = address.toLowerCase()
  if (lower === ZERO_ADDRESS) return { ok: false, problem: 'zero', message: 'This is the zero address. Anything sent to it is gone for good.' }
  if (context.self && lower === context.self.toLowerCase()) return { ok: false, problem: 'self', message: 'This is the wallet you are sending from.' }
  if (context.contract && lower === context.contract.toLowerCase()) {
    return {
      ok: false,
      problem: 'contract',
      message: context.nft
        ? "This is the collection's own contract. An NFT sent to it is usually lost for good."
        : "This is the token's own contract. Tokens sent to it are usually lost for good.",
    }
  }
  return { ok: true, address }
}

export function recipientKind(code: Hex | null | undefined): 'wallet' | 'delegated' | 'contract' {
  if (!code || code === '0x') return 'wallet'
  return /^0xef0100[0-9a-fA-F]{40}$/.test(code) ? 'delegated' : 'contract'
}

export function recipientWarning(address: string, kind: 'wallet' | 'delegated' | 'contract'): string | null {
  if (address.toLowerCase() === DEAD_ADDRESS) return 'This is a burn address. Nothing sent to it can be moved again.'
  if (kind === 'contract') return 'This address is a contract, not a wallet. Send only if you know it can move what it receives.'
  return null
}

export function usernameOfRecipient(raw: string): string | null {
  const s = raw.trim()
  if (/^0x/i.test(s)) return null
  const name = s.startsWith('@') ? s.slice(1) : s
  return /^[A-Za-z0-9]{3,20}$/.test(name) ? name.toLowerCase() : null
}

export function nftStandard(answers: { erc721: boolean | null; erc1155: boolean | null }, balance: bigint | null): 'erc721' | 'erc1155' {
  if (answers.erc1155 === true && answers.erc721 !== true) return 'erc1155'
  if (answers.erc721 === true && answers.erc1155 !== true) return 'erc721'
  return balance !== null && balance > 1n ? 'erc1155' : 'erc721'
}

export type CallAnswer = { kind: 'result'; data: Hex } | { kind: 'refused'; data: Hex | null; message: string | null } | { kind: 'unanswered' }

export function readCallAnswer(body: unknown): CallAnswer {
  if (!body || typeof body !== 'object') return { kind: 'unanswered' }
  const { result, error } = body as { result?: unknown; error?: unknown }
  if (error && typeof error === 'object') {
    const { code, message, data } = error as { code?: unknown; message?: unknown; data?: unknown }
    const said = typeof message === 'string' ? message : null

    if (code !== 3 && !/revert|insufficient funds/i.test(said ?? '')) return { kind: 'unanswered' }
    const hex = typeof data === 'string' ? data : data && typeof data === 'object' && typeof (data as { data?: unknown }).data === 'string' ? (data as { data: string }).data : null
    return { kind: 'refused', data: hex && /^0x[0-9a-fA-F]*$/.test(hex) ? (hex as Hex) : null, message: said }
  }
  if (typeof result === 'string' && /^0x[0-9a-fA-F]*$/.test(result)) return { kind: 'result', data: result as Hex }
  return { kind: 'unanswered' }
}

export function erc20Answered(data: Hex | null | undefined): boolean {
  if (!data || data === '0x') return true
  if (data.length !== 66) return true
  return BigInt(data) !== 0n
}

export function refusalText(data: Hex | null | undefined, message: string | null | undefined, kind: TransferAsset['kind'], symbol?: string): string {
  const nft = kind === 'erc721' || kind === 'erc1155'
  const holds = kind === 'erc20' ? `The wallet holds less ${symbol ?? 'of this token'} than this amount.` : kind === 'erc1155' ? 'The wallet holds fewer of this NFT than this amount.' : 'This wallet no longer holds this NFT.'
  const noTaker = nft ? 'The recipient is a contract that does not take NFTs.' : 'The token refuses this recipient.'
  if (kind === 'native') {
    if (/insufficient funds/i.test(message ?? '')) return 'The wallet holds less ETH than this amount.'
    return 'The recipient is a contract, and it refused the ETH.'
  }
  const reason = (said: string) => {
    if (/exceeds balance|insufficient balance|balance too low|insufficient funds/i.test(said)) return holds
    if (/receiver|non[- ]?erc(721|1155)|transfer to non/i.test(said)) return noTaker
    if (/not (the )?owner|incorrect owner|owner query|nonexistent|invalid token id|not own/i.test(said)) return 'This wallet no longer holds this NFT.'
    if (/paused/i.test(said)) return 'The token is paused, and it refuses every transfer for now.'
    return `The token refused this transfer: “${said.trim()}”.`
  }
  if (data && data.length >= 10) {
    try {
      const decoded = decodeErrorResult({ abi: TRANSFER_ERRORS_ABI, data })
      const name: string = decoded.errorName
      const args = (decoded.args ?? []) as readonly unknown[]
      switch (name) {
        case 'Error':
          return reason(String(args[0] ?? ''))
        case 'Panic':
          return `The token's contract failed on this transfer (panic 0x${BigInt(args[0] as bigint).toString(16)}).`
        case 'ERC20InsufficientBalance':
        case 'ERC1155InsufficientBalance':
        case 'InsufficientBalance':
          return holds
        case 'ERC20InvalidReceiver':
        case 'ERC721InvalidReceiver':
        case 'ERC1155InvalidReceiver':
        case 'TransferToNonERC721ReceiverImplementer':
        case 'TransferToNonERC1155ReceiverImplementer':
        case 'TransferToZeroAddress':
          return noTaker
        case 'ERC721NonexistentToken':
        case 'ERC721IncorrectOwner':
        case 'TransferFromIncorrectOwner':
        case 'OwnerQueryForNonexistentToken':
        case 'TokenDoesNotExist':
          return 'This wallet no longer holds this NFT.'
        default:
          return 'This wallet is not allowed to move this asset now.'
      }
    } catch {
      return `The token refused this transfer (its error ${data.slice(0, 10)}).`
    }
  }
  const said = /execution reverted:\s*(.+)$/i.exec(message ?? '')?.[1]
  if (said) return reason(said)
  return 'The token refused this transfer and gave no reason.'
}
