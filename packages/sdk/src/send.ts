import { zeroAddress, type Abi, type Hash, type TransactionReceipt } from 'viem'
import type { CheckedSteps } from './checks'
import type { MancerClient } from './client'
import { MancerCheckError } from './errors'
import { BOOK_SHARED, bookAbisFor, robinhoodChain } from './shared'

/** The pad over the node's own estimate: the API's own (30% and 10,000 gas, for the chain's L1 data share). */
const GAS_PAD_PCT = 30n
const GAS_MARGIN = 10_000n
/** How far the API's gas may stand from the node's estimate, either way, as a factor: half to four times it. */
const GAS_FAR = 2n

/** A step the chain ran: its transaction and its receipt. */
export interface SentStep {
  step: number
  kind: string
  hash: Hash
  receipt: TransactionReceipt
}

/** A step the chain reverted, or that never landed: nothing after it was sent. */
export class MancerStepError extends Error {
  readonly step: number
  readonly kind: string
  readonly hash: Hash | null
  readonly receipt: TransactionReceipt | null
  /** The steps sent before it, each with its receipt. */
  readonly sent: SentStep[]

  constructor(message: string, init: { step: number; kind: string; hash: Hash | null; receipt: TransactionReceipt | null; sent: SentStep[] }) {
    super(message)
    this.name = 'MancerStepError'
    this.step = init.step
    this.kind = init.kind
    this.hash = init.hash
    this.receipt = init.receipt
    this.sent = init.sent
  }
}

export interface SendOptions {
  /** Told of each step before it is sent and once it has its receipt. */
  onStep?: (event: { step: number; kind: string; phase: 'sending' | 'sent' | 'landed'; hash?: Hash; receipt?: TransactionReceipt }) => void
  /** How long to wait for one receipt, in milliseconds. Default 120,000. */
  receiptTimeoutMs?: number
}

/**
 * Sends checked steps from the client's own wallet, in order, each once the one before it has its receipt. Each step's
 * gas limit is estimated on the caller's own node at its turn (and refused where the API's figure stands far from it).
 * A step the check gave a least gas of its own (`StepReading.minGas`: a TraderBookPadV2 `graduate`, or a buy that closes
 * a curve, which bonds the Book in the same transaction only with the gas the bond needs) is sent with at least that,
 * and the API may name up to that much. The wallet signs every transaction on this machine (a local account) or in its
 * own wallet client; the SDK sends nothing for it. A step that reverts, or never lands, stops the rest.
 */
export async function sendCheckedSteps(client: MancerClient, checked: CheckedSteps, options: SendOptions = {}): Promise<SentStep[]> {
  const wallet = client.walletClient
  const account = client.account
  if (!wallet || !account) throw new MancerCheckError('wallet', 'this client has no account to send with')
  if (account.address.toLowerCase() !== checked.wallet.toLowerCase()) throw new MancerCheckError('wallet', 'the steps are for another wallet than this account')
  const chainId = await wallet.getChainId()
  if (chainId !== robinhoodChain.id) throw new MancerCheckError('wallet', `the wallet client is on chain ${chainId}, not Robinhood Chain (4663)`)
  const sent: SentStep[] = []
  for (const [i, step] of checked.steps.entries()) {
    options.onStep?.({ step: i, kind: step.kind, phase: 'sending' })
    // a settlement's sales each pay the asset they were signed into, and on a settler that settles in the base pair where
    // chosen a trader or the creator can move it until the liquidation runs, which then runs none of them: the settler's
    // word is read on your node right before the step, and nothing is sent where it names another
    const settles = checked.readings.find((r) => r.step === i)?.settlesIn
    if (settles) {
      let named: string
      try {
        named = String(await client.publicClient.readContract({ address: settles.settler, abi: bookAbisFor({ abiSet: settles.abiSet }).settler as Abi, functionName: 'settleAssetFor', args: [settles.bookId] }))
      } catch (e) {
        throw new MancerStepError(`step ${i} (${step.kind}): the Book's settlement asset did not read on your node, so nothing more was sent: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`, { step: i, kind: step.kind, hash: null, receipt: null, sent })
      }
      const asset = named.toLowerCase() === zeroAddress ? BOOK_SHARED.weth : named
      if (asset.toLowerCase() !== settles.pays.toLowerCase()) {
        throw new MancerStepError(`step ${i} (${step.kind}): the Book now settles in ${asset}, not the ${settles.pays} its sales pay, so nothing more was sent: ask for the settlement again (settleSteps)`, { step: i, kind: step.kind, hash: null, receipt: null, sent })
      }
    }
    const tx = { to: step.to as `0x${string}`, data: step.data as `0x${string}`, value: BigInt(step.value) }
    // the gas limit is the caller's own node's estimate, made once the step before has landed: the API's figure is
    // held to it and never sent
    let own: bigint
    try {
      own = await client.publicClient.estimateGas({ account, ...tx })
    } catch (e) {
      throw new MancerStepError(`step ${i} (${step.kind}) would fail on your node: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`, { step: i, kind: step.kind, hash: null, receipt: null, sent })
    }
    const named = step.gas === null ? null : BigInt(step.gas)
    // the check's own least gas for the step (a bond in the same transaction), never the API's
    const floor = checked.readings.find((r) => r.step === i)?.minGas ?? null
    const most = own * GAS_FAR * GAS_FAR
    if (named !== null && (named * GAS_FAR < own || named > (floor !== null && floor > most ? floor : most))) {
      throw new MancerStepError(`step ${i} (${step.kind}): the API's gas (${named}) is far from your node's estimate (${own}), so nothing more was sent`, { step: i, kind: step.kind, hash: null, receipt: null, sent })
    }
    const padded = (own * (100n + GAS_PAD_PCT)) / 100n + GAS_MARGIN
    const gas = floor !== null && floor > padded ? floor : padded
    let hash: Hash
    try {
      hash = await wallet.sendTransaction({ account, chain: robinhoodChain, ...tx, gas })
    } catch (e) {
      throw new MancerStepError(`step ${i} (${step.kind}) was not sent: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`, { step: i, kind: step.kind, hash: null, receipt: null, sent })
    }
    options.onStep?.({ step: i, kind: step.kind, phase: 'sent', hash })
    let receipt: TransactionReceipt
    try {
      receipt = await client.publicClient.waitForTransactionReceipt({ hash, timeout: options.receiptTimeoutMs ?? 120_000 })
    } catch (e) {
      throw new MancerStepError(`step ${i} (${step.kind}) has no receipt yet: ${hash}`, { step: i, kind: step.kind, hash, receipt: null, sent })
    }
    if (receipt.status !== 'success') {
      throw new MancerStepError(`step ${i} (${step.kind}) reverted: ${hash}`, { step: i, kind: step.kind, hash, receipt, sent })
    }
    sent.push({ step: i, kind: step.kind, hash, receipt })
    options.onStep?.({ step: i, kind: step.kind, phase: 'landed', hash, receipt })
  }
  return sent
}
