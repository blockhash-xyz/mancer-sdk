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
export { bookActCalls, readChainBook, vaultRouteCheck, verifyBookDeployment } from './books'
export type { BookAction, BookActArgs, ChainBook } from './books'
export {
  bookDeploymentOf,
  checkBookSteps,
  checkCancelAllSteps,
  checkCancelSteps,
  checkDraftOpenSteps,
  checkOrderSetupSteps,
  checkSwapSteps,
  checkTransferSteps,
  readApproval,
  readyOf,
} from './checks'
export type { BookActCalls, BookStepsCheck, CheckedSteps, DraftOpenCheck, OrderSetupCheck, StepReading, SwapCheck, TransferAssetInput, TransferCheck } from './checks'
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
export { OPERATIONS } from './generated/openapi'
export type * from './generated/openapi'
