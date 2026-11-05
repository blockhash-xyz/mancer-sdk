/**
 * The SDK's one reach into Mancer's own modules, so it signs and checks exactly what the site and the phone app do:
 *
 * - the contracts kit (packages/contracts/ts in Mancer's monorepo; src/kit, mirrored, in the published repository): the chain, the pinned addresses and code hashes, the router and orders
 *   ABIs, the router call's decoder and check (router-call.ts), every leg's reader and the pinned routing it holds legs to
 *   (router-legs.ts), the order typed data's reader and check (order-check.ts), the published fee schedule (fees.ts),
 *   the transfer calls (transfer.ts), the Books deployments and their call builders (books/), and a webhook delivery's
 *   signature check (webhooks.ts);
 * - the site's order builder (order-typed-data.ts), the one module the site's `usePlaceOrder` and the
 *   phone app build an order from;
 * - the site's launch envelope check (launch-execution.ts), which the site and the app run on an
 *   account-bound launch route before any setup call is signed.
 *
 * Each is pure: no fetch, no chain, no Node or browser API.
 */
export { BOOK_ABIS } from './kit/books/abis'
export { BOOK_DEPLOYMENTS, BOOK_SHARED, bookAbisFor, type BookDeployment } from './kit/books/deployments'
export { BOOK_EIP712_NAME, BOOK_EIP712_VERSION, hashBookQuote, bookTradeIntentFromQuote, parseBookQuote, type BookQuote, type BookTradeIntent } from './kit/books/typed-data'
export { KNOWN_TOKENS, MAINNET_UNISWAP_V3, MANCER_ORDERS_DEPLOYMENTS, MANCER_ROUTER_DEPLOYMENTS, pinnedAllowanceTarget } from './kit/addresses'
export { MANCER_ORDER_FEE_CEILING_BPS, publishedOrderFeeBps, publishedSwapFeeBps } from './kit/fees'
export { MANCER_ROUTER_LEG_TABLE_BLOCK, readRouterLegs, routerLegsMismatch, type LegExpectation, type LegReading } from './kit/router-legs'
export { ORDER_EIP712_TYPES_V3, ORDER_TYPEHASH_V3, ZERO_OCO_GROUP, cancelOrdersMessage, ordersDomainV3, type MancerOrderV3 } from './kit/orders'
export { abortCall, approveCall, armCall, bondCall, bookCallData, buyCall, buyEthCall, cancelOrderCall, claimCreatorCutCall, claimFeesCall, confirmTradeCall, executeTradeCall, graduateCall, harvestCall, liquidateCall, openBookCall, proposeTradeCall, redeemCall, revokeAllowanceCall, revokeOrdersCall, sellCall, stakeCall, sweepLeftoverCall, sweepUnownedCall, syncTaxCall, syncTrackedCall, unstakeCall, type BookCall, type OpenBookParams } from './kit/books/calls'
export { checkRouterCall, decodeRouterCall, routerCallMismatch, type RouterCallExpectation, type RouterCallReading } from './kit/router-call'
export { launchAdapterDeployment } from './kit/launch-deployments'
export { liquidationCallMismatch, vaultRouteMismatch } from './kit/books/checks'
export { mancerOrdersV3Abi, mancerRouterAbi, quoterV2Abi } from './kit/abi'
export { orderTypedDataMismatch, readOrderTypedData, type OrderExpectation, type OrderReading } from './kit/order-check'
export { robinhoodChain } from './kit/chain'
export { routerAllowlistDrift, type AllowlistDrift } from './kit/allowlist-drift'
export { transferCall, transferTransaction, type TransferAsset } from './kit/transfer'
// a webhook delivery's check (packages/contracts/ts/webhooks.ts): the signature the API's deliveries carry, read on the
// receiver's raw body with WebCrypto, in Node and in a browser alike
export { WEBHOOK_EVENT_ID_HEADER, WEBHOOK_EVENT_TYPE_HEADER, WEBHOOK_ID_HEADER, WEBHOOK_PING_KIND, WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER, WEBHOOK_TOLERANCE_SEC, checkWebhookSignature, parseWebhookSignature, verifyWebhookSignature, webhookSignatureOf, type ParsedWebhookSignature, type WebhookSignatureCheck, type WebhookSignatureFailure } from './kit/webhooks'
export { orderTypedDataV3, orderV3ToSign, type OrderSigner, type PlaceOrderParams } from './kit/site/order-typed-data'
export { executionEnvelopeMismatch, launchRouteChainMismatch, safeLaunchPadLaunchIdAbi, type ExecutionExpectation, type IntegratorExecution } from './kit/site/launch-execution'
