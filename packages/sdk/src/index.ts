/**
 * @blockhash/mancer-sdk: Mancer's API for a bot with a wallet, on viem. A bot signs in with its own account, asks for every act as
 * steps ready to sign, and the SDK checks each against what was asked for and the contracts it pins before the account
 * signs and sends it. The account's key never leaves the caller: the SDK signs on this machine (a local account) or in
 * the wallet client handed in, and sends Mancer only signatures and the API's own requests.
 */
export { Mancer, ETH, executedOf, openBookParamsOf } from './mancer'
export { DEFAULT_MAX_DEVIATION_BPS, WETH_USDG_POOL_FEE, floorKind, holdSignedFloor, namedFloor, wethUsdgPoolOut } from './floor'
export { SDK_VERSION } from './version'
export type {
  BuiltSwap,
  FloorRule,
  LimitOrderInput,
  OrderOptions,
  PlacedOrder,
  RaiseCall,
  RaiseRequest,
  RecurringOrderInput,
  ReferenceFn,
  StopOrderInput,
  SwapRequest,
  SwapResult,
  TokenRef,
  TransferRequest,
} from './mancer'
export { MancerClient, DEFAULT_BASE_URL, DEFAULT_RPC_URL, MANCER_API_ORIGINS, newIdempotencyKey } from './client'
export type { Answer, MancerOptions, RequestOptions, Session } from './client'
export { MancerError, MancerCheckError, SDK_ERROR_CODES, isRetryable, readRateLimit, withRetry } from './errors'
export type { RateLimitInfo, RetryOptions } from './errors'
export { MancerStepError, sendCheckedSteps } from './send'
export type { SendOptions, SentStep } from './send'
export { bookActCalls, bookBasePairOf, bookQuoteDigest, bookRedeemPayouts, checkVaultQuote, potAfterSweep, raiseCalls, readBookRedemption, readBookSettleAsset, readChainBook, readVaultPending, redeemPayout, settlementCalls, settlementPaysAsset, vaultRouteCheck, verifyBookDeployment } from './books'
export type { BookAction, BookActArgs, BookPot, BookRedemption, ChainBook } from './books'
// perps inside Books: a trader's own half of a vault's split Lighter key (Mancer's split-key signer loaded from its pinned
// files, the share kept in a file of the caller's own), the checks every deposit and order is held to before it is signed,
// and the send to Lighter RH
export {
  BOOKS_PERPS_EXPIRY_MAX_MS,
  BOOKS_PERPS_EXPIRY_MIN_MS,
  BOOKS_PERPS_KINDS,
  BOOKS_PERPS_SEND_URL,
  LighterSendError,
  bookPerpsDepositQuoteOf,
  bookPerpsPendingDepositOf,
  bookPerpsTraderSlotOf,
  booksPerpsSplitFilesFrom,
  checkBookPerpsDepositQuote,
  checkBookPerpsKeyAnswer,
  checkBookPerpsOrderAnswer,
  checkBookPerpsOwnKey,
  checkBookPerpsTraderKey,
  fetchBooksPerpsSplitFiles,
  loadBooksPerpsSplit,
  newBooksPerpsKeyContext,
  readBookPerpsChain,
  readBooksPerpsShare,
  sendBookPerpsOrder,
  writeBooksPerpsShare,
} from './books-perps'
export type {
  BookPerpsBoundKey,
  BookPerpsChain,
  BookPerpsDepositAnswer,
  BookPerpsKeyAnswer,
  BookPerpsKeySlot,
  BookPerpsOrderAnswer,
  BookPerpsOrderReport,
  BookPerpsOrderRequest,
  BookPerpsRead,
  BooksPerpsFileReader,
  BooksPerpsSend,
  BooksPerpsShare,
  BooksPerpsShareFs,
  BooksPerpsSplitFiles,
} from './books-perps'
export { BOOK_PERPS_DEPLOYMENTS, MANCER_SPLIT_SIGNER, bookPerpsKeyAuthorization, bookPerpsTraderSlot } from './shared'
export type { BookPerpsDeployment, SplitAnswer, SplitCommitment, SplitKeyGenMsg, SplitKind, SplitShare, SplitSigned, SplitSigner, SplitTx } from './shared'
// the Books deployments the kit pins and what each one's contracts do: where a new Book opens, its pad's rules (`gen3` or
// `claims`, TraderBookPadV2), whether its settler settles in the base pair where chosen, and its vaults' EIP-712 name
export { BOOK_DEPLOYMENTS, bookLaunchDeployment, bookPadKind, bookSettlesInChosenAsset, bookVaultDomainName } from './shared'
export type { BookDeployment } from './shared'
export {
  bookDeploymentOf,
  checkBookSteps,
  checkCancelAllSteps,
  checkCancelSteps,
  checkDraftOpenSteps,
  checkExactBookCalls,
  checkOrderSetupSteps,
  checkSwapSteps,
  checkTransferSteps,
  launchRoundTripCap,
  readApproval,
  readyOf,
} from './checks'
export type { BookActCalls, BookSettlesIn, BookStepsCheck, CheckedSteps, DraftOpenCheck, OrderSetupCheck, StepReading, SwapCheck, TransferAssetInput, TransferCheck } from './checks'
export { contractsMismatch, pinnedContracts, readCodeHashes } from './contracts'
export type { TrustedContracts } from './contracts'
export { sessionClaims, signInMessageMismatch } from './auth'
export type { SessionClaims, SignInExpectation } from './auth'
export { AccountStream, DEFAULT_STREAM_URL, eventsSince, readEvents } from './events'
export type { AccountStreamOptions } from './events'
export { PhoenixChannel, websocketUrl } from './phoenix'
export type { WebSocketFactory, WebSocketLike } from './phoenix'
// the reference decoders and checks every client runs, from the contracts kit, and the Uniswap V3 QuoterV2 the pool
// reference reads (its address and ABI), for a client that prices another pair the same way
export {
  checkRouterCall,
  decodeRouterCall,
  orderTypedDataMismatch,
  publishedSwapFeeBps,
  readOrderTypedData,
  MAINNET_UNISWAP_V3,
  quoterV2Abi,
  MANCER_ROUTER_LEG_TABLE_BLOCK,
  readRouterLegs,
  robinhoodChain,
  routerAllowlistDrift,
  routerCallMismatch,
  routerLegsMismatch,
} from './shared'
export type { AllowlistDrift, LegExpectation, LegReading, OrderExpectation, OrderReading, RouterCallExpectation, RouterCallReading } from './shared'
// the order a maker signs, as mancer.xyz builds it (the terms, the maker's epoch and a nonce in; the wire order and its
// EIP-712 request out), the orders contract's ABI, and the message a signature cancel signs: for a client that hands the
// typed data to a wallet of its own to sign, as Mancer's MCP server does for an agent's wallet
export {
  MANCER_ORDER_FEE_CEILING_BPS,
  ZERO_OCO_GROUP,
  cancelOrdersMessage,
  mancerOrdersV3Abi,
  orderTypedDataV3,
  orderV3ToSign,
} from './shared'
export type { MancerOrderV3, OrderSigner, PlaceOrderParams } from './shared'
// a webhook delivery's check, on the raw body as it arrived (docs: /api/guides/webhooks)
export {
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_EVENT_TYPE_HEADER,
  WEBHOOK_ID_HEADER,
  WEBHOOK_PING_KIND,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_TOLERANCE_SEC,
  checkWebhookSignature,
  parseWebhookSignature,
  verifyWebhookSignature,
  webhookSignatureOf,
} from './shared'
export type { ParsedWebhookSignature, WebhookSignatureCheck, WebhookSignatureFailure } from './shared'
export { OPERATIONS } from './generated/openapi'
export type * from './generated/openapi'
