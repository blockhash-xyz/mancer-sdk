// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { parseAbi } from 'viem'
import type { OrdersGeneration } from './orders'

export const erc8056Abi = parseAbi([
  'function uiMultiplier() view returns (uint256)',
  'function newUIMultiplier() view returns (uint256)',
  'function effectiveAt() view returns (uint256)',
])

export const uniswapV3FactoryAbi = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
])

export const uniswapV3PoolAbi = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function tickSpacing() view returns (int24)',
  'function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)',
  'function observations(uint256 index) view returns (uint32 blockTimestamp, int56 tickCumulative, uint160 secondsPerLiquidityCumulativeX128, bool initialized)',
  'function increaseObservationCardinalityNext(uint16 observationCardinalityNext)',
])

export const swapRouter02Abi = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params) payable returns (uint256 amountOut)',

  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to) payable returns (uint256 amountOut)',
  'function wrapETH(uint256 value) payable',

  'function unwrapWETH9(uint256 amountMinimum, address recipient) payable',
  'function multicall(bytes[] data) payable returns (bytes[] results)',
])

export const uniswapV2FactoryAbi = parseAbi([
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)',
])

export const uniswapV2PairAbi = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',

  'function token1() view returns (address)',
])

export const quoterV2Abi = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) view returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
])

export const v4PoolManagerAbi = parseAbi([
  'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)',
])

export const v4QuoterAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct PathKey { address intermediateCurrency; uint24 fee; int24 tickSpacing; address hooks; bytes hookData; }',
  'function quoteExactInputSingle((PoolKey poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) view returns (uint256 amountOut, uint256 gasEstimate)',
  'function quoteExactInput((address exactCurrency, PathKey[] path, uint128 exactAmount) params) view returns (uint256 amountOut, uint256 gasEstimate)',
])

export const v4StateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)',
  'function getTickBitmap(bytes32 poolId, int16 wordPos) view returns (uint256 tickBitmap)',
  'function getTickLiquidity(bytes32 poolId, int24 tick) view returns (uint128 liquidityGross, int128 liquidityNet)',
])

export const universalRouterAbi = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
])

export const v4PoolManagerAdapterAbi = parseAbi([
  'struct AdapterPoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct AdapterExactInputParams { AdapterPoolKey keyA; bool zeroForOneA; bytes hookDataA; AdapterPoolKey keyB; bool zeroForOneB; bytes hookDataB; uint128 amountIn; uint128 amountOutMinimum; }',
  'function swapExactInputSingle(AdapterPoolKey key, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData) returns (uint256 amountOut)',
  'function swapExactInput(AdapterExactInputParams params) returns (uint256 amountOut)',
  'function weth() view returns (address)',
  'function poolManager() view returns (address)',
])

export const exactV4AdapterAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function swapExactInputSingle(PoolKey poolKey, bool zeroForOne, uint128 amountIn, uint128 minAmountOut, bytes hookData) returns (uint256 amountOut)',
  'struct ExactInputParams { PoolKey firstPool; bool firstZeroForOne; bytes firstHookData; PoolKey secondPool; bool secondZeroForOne; bytes secondHookData; uint128 amountIn; uint128 minAmountOut; }',
  'function swapExactInput(ExactInputParams params) returns (uint256 amountOut)',
])

export const infinityClAdapterAbi = parseAbi([
  'struct InfinityPoolKey { address currency0; address currency1; address hooks; address poolManager; uint24 fee; bytes32 parameters; }',
  'struct InfinityExactInputParams { InfinityPoolKey keyA; bool zeroForOneA; bytes hookDataA; InfinityPoolKey keyB; bool zeroForOneB; bytes hookDataB; uint128 amountIn; uint128 amountOutMinimum; }',
  'function swapExactInputSingle(InfinityPoolKey key, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData) returns (uint256 amountOut)',
  'function swapExactInput(InfinityExactInputParams params) returns (uint256 amountOut)',
  'function weth() view returns (address)',
  'function vault() view returns (address)',
  'function poolManager() view returns (address)',
])

export const infinityClQuoterAbi = parseAbi([
  'struct InfinityQuoteKey { address currency0; address currency1; address hooks; address poolManager; uint24 fee; bytes32 parameters; }',
  'struct InfinityQuoteExactSingleParams { InfinityQuoteKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
  'function quoteExactInputSingle(InfinityQuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
])

export const mantaAmmAbi = parseAbi([
  'function OWNER() view returns (address)',
  'function isActive(address tokenIn, address tokenOut) view returns (bool active)',
  'function getPairs() view returns ((address token0, address token1)[] pairs)',
  'function quote(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256 amountOut)',
  'function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient, uint256 deadline) returns (uint256 amountOut)',
])

export const mantaPropAdapterAbi = parseAbi([
  'function swapExactInput(address amm, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMinimum, uint256 deadline) returns (uint256 amountOut)',
  'function isMantaAmm(address amm) view returns (bool)',
  'function mantaOwner() view returns (address)',
])

export const metricPropAdapterAbi = parseAbi([
  'function swapExactInput(address pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMinimum, uint256 deadline) returns (uint256 amountOut)',
  'function quoteExactInput(address pool, bool zeroForOne, uint256 amountIn) view returns (uint256 amountOut)',
  'function quoteMany(address pool, bool zeroForOne, uint256[] amounts) view returns (uint256[] amountsOut)',
  'function poolTokens(address pool) view returns (address token0, address token1)',
  'function isMetricPool(address pool) view returns (bool)',
  'function factory() view returns (address)',
])

export const fermiPoolAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function traderVault() view returns (address)',
  'function isActive() view returns (bool)',
  'function getAmountOut(bool zeroForOne, uint256 amountIn) view returns (uint256 amountOut)',
  'function swapExactIn(bool zeroForOne, uint256 amountIn, uint256 amountOutMinimum, address to, uint256 deadline) returns (uint256 amountOut)',
])

export const fermiPropAdapterAbi = parseAbi([
  'function swapExactInput(address pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMinimum, uint256 deadline) returns (uint256 amountOut)',
  'function isFermiPool(address pool) view returns (bool)',
  'function fermiVault() view returns (address)',
])

export const elfomofiAbi = parseAbi([
  'function getAmountOut(address fromToken, address toToken, uint256 fromAmount) view returns (uint256)',
  'function getAmountIn(address fromToken, address toToken, uint256 toAmount) view returns (uint256)',
  'function getSupportedPairs() view returns ((address tokenA, address tokenB)[])',
  'function swap(address fromToken, address toToken, int256 amount, uint256 minOut, address receiver, uint256 partnerId)',
  'function swapWithContractBalance(address fromToken, address toToken, uint256 amount, address receiver, uint256 partnerId)',
])

export const elfomofiAdapterAbi = parseAbi([
  'function swapExactInput(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMinimum, uint256 deadline) returns (uint256 amountOut)',
  'function quoteExactInput(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)',
  'function elfomofi() view returns (address)',
])

export const tesseraSwapAbi = parseAbi([
  'function tesseraSwapViewAmounts(address tokenIn, address tokenOut, int256 amountSpecified) view returns (uint256 amountIn, uint256 amountOut)',
  'function tesseraSwapWithAllowances(address tokenIn, address tokenOut, int256 amountSpecified, uint256 amountLimit, address to, bytes data)',
])

export const tesseraIndexerAbi = parseAbi(['function getTesseraPairs() view returns (address[][])'])
export const tesseraEngineAbi = parseAbi([
  'function getTesseraPool(address token0, address token1) view returns (bool exists, address pool)',
])
export const tesseraPoolAbi = parseAbi([
  'function tradingEnabled() view returns (bool)',
  'function isInitialised() view returns (bool)',
])

export const tesseraAdapterAbi = parseAbi([
  'function swapExactInput(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMinimum, uint256 deadline) returns (uint256 amountOut)',
  'function quoteExactInput(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)',
  'function tesseraSwap() view returns (address)',
])

export const permit2Abi = parseAbi([
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
])

export const up33ClRouterAbi = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, int24 tickSpacing, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
])

export const up33ClAdapterAbi = parseAbi([
  'function swapExactInputSingle(address tokenIn, address tokenOut, int24 tickSpacing, uint256 deadline, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) returns (uint256 amountOut)',
  'function router() view returns (address)',
  'function venue() view returns (address)',
  'function weth() view returns (address)',
  'function dustRecipient() view returns (address)',
])

export const liveAmountAdapterAbi = parseAbi([
  'function callWithLiveAmount(address target, bytes data, uint256 amountOffset, address tokenIn, address tokenOut)',
  'function admits(address target, bytes4 selector) view returns (bool)',
  'function router() view returns (address)',
  'function routerAllowanceTarget() view returns (address)',
  'function clear(address token)',
  'error NotRouter()',
  'error InvalidPath()',
  'error NothingFunded()',
  'error CallNotAdmitted(address target, bytes4 selector)',
  'error AmountOutOfBounds(uint256 offset, uint256 length)',
  'error VenueCallFailed(bytes reason)',
])

export const v2PairAdapterAbi = parseAbi([
  'function swap(address tokenIn, address tokenOut, uint256 venue, uint256 amountOutMin) returns (uint256 amountOut)',
  'function venueOf(uint256 venue) view returns (address factory, bytes32 initCodeHash, uint256 feeNumerator, uint256 feeDenominator)',
  'function pairFor(uint256 venue, address tokenA, address tokenB) view returns (address)',
  'function router() view returns (address)',
  'function venueCount() view returns (uint256)',
  'error NotRouter()',
  'error ZeroAddress()',
  'error InvalidPath()',
  'error BadVenue(uint256 venue)',
  'error NoPair(address pair)',
  'error NothingFunded()',
  'error NothingArrived()',
  'error TooLittleOut(uint256 amountOut, uint256 amountOutMin)',
])

export const up33RouterAbi = parseAbi([
  'struct Route { address from; address to; bool stable; address factory; }',
  'function getAmountsOut(uint256 amountIn, Route[] routes) view returns (uint256[] amounts)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
])

export const ekuboCoreAbi = parseAbi([
  'event PoolInitialized(bytes32 poolId, (address token0, address token1, bytes32 config) poolKey, int32 tick, uint96 sqrtRatio)',
])

export const ekuboRouterAbi = parseAbi([
  'function quote((address token0, address token1, bytes32 config) poolKey, bool isToken1, int128 amount, uint96 sqrtRatioLimit, uint256 skipAhead) view returns (bytes32 balanceUpdate, bytes32 stateAfter)',
])

export const mancerOrdersAbi = parseAbi([
  'struct Order { address maker; address tokenIn; address tokenOut; uint128 amountPerFill; uint32 totalFills; uint32 everySec; uint40 startAt; uint40 expiry; uint128 minOutPerFill; uint128 triggerOutPerFill; uint128 maxOutPerFill; uint16 maxFeeBps; uint64 epoch; uint256 nonce; }',
  'struct FillExec { address target; bytes payload; uint16 feeBps; bool feeOnOutput; uint256 minAmountOut; uint256 deadline; }',
  'struct FillExecVia { address cash; address targetA; bytes payloadA; address targetB; bytes payloadB; uint16 feeBps; uint256 minCashOut; uint256 minAmountOut; uint256 deadline; }',
  'struct OrderState { uint32 fillsDone; uint40 nextDueAt; bool cancelled; }',
  'function fill(Order o, bytes sig, FillExec x) returns (uint256 amountOut)',
  'function fillVia(Order o, bytes sig, FillExecVia x) returns (uint256 amountOut)',
  'function cancel(Order o)',
  'function cancelAll()',
  'function hashOrder(Order o) view returns (bytes32)',
  'function orderState(bytes32 orderHash) view returns (OrderState)',
  'function isValidOrderSignature(Order o, bytes sig) view returns (bool)',
  'function makerEpoch(address maker) view returns (uint64)',
  'function paused() view returns (bool)',
  'function ORDER_TYPEHASH() view returns (bytes32)',
  'event Filled(bytes32 indexed orderHash, address indexed maker, address executor, uint32 fillIndex, uint256 amountIn, uint256 amountOut, uint16 feeBps, uint40 nextDueAt)',
  'event Cancelled(bytes32 indexed orderHash, address indexed maker)',
  'event CancelledAll(address indexed maker, uint64 newEpoch)',
])

export const mancerOrdersV2Abi = parseAbi([
  'struct Order { address maker; address tokenIn; address tokenOut; uint128 amountPerFill; uint32 totalFills; uint32 everySec; uint40 startAt; uint40 expiry; uint128 minOutPerFill; uint128 triggerOutPerFill; uint128 maxOutPerFill; uint16 maxFeeBps; uint64 epoch; uint256 nonce; bytes32 ocoGroup; }',
  'struct Leg { address target; bytes payload; address tokenIn; address tokenOut; uint256 amountIn; uint8 fund; }',
  'struct FillPlan { uint16 feeBps; uint8 feeMode; address feeAsset; uint16 feeAfterLeg; uint256 minFeeBasis; uint256 minAmountOut; uint256 deadline; Leg[] legs; }',
  'struct OrderState { uint32 fillsDone; uint40 nextDueAt; bool cancelled; }',
  'function fill(Order o, bytes sig, FillPlan x) returns (uint256 amountOut)',
  'function cancel(Order o)',
  'function cancelAll()',
  'function hashOrder(Order o) view returns (bytes32)',
  'function orderState(bytes32 orderHash) view returns (OrderState)',
  'function isValidOrderSignature(Order o, bytes sig) view returns (bool)',
  'function makerEpoch(address maker) view returns (uint64)',
  'function ocoFilledBy(address maker, bytes32 group) view returns (bytes32)',
  'function paused() view returns (bool)',
  'function ORDER_TYPEHASH() view returns (bytes32)',
  'event Filled(bytes32 indexed orderHash, address indexed maker, address executor, uint32 fillIndex, uint256 amountIn, uint256 amountOut, uint16 feeBps, uint40 nextDueAt)',
  'event Cancelled(bytes32 indexed orderHash, address indexed maker)',
  'event CancelledAll(address indexed maker, uint64 newEpoch)',
])

export const mancerOrdersV3Abi = parseAbi([
  'struct Order { address maker; address tokenIn; address tokenOut; uint128 amountPerFill; uint32 totalFills; uint32 everySec; uint32 fillWindowSec; uint40 startAt; uint40 expiry; uint128 minOutPerFill; uint128 triggerOutPerFill; uint128 maxOutPerFill; uint16 maxFeeBps; bytes32 epoch; uint256 nonce; bytes32 ocoGroup; }',
  'struct Leg { address target; bytes payload; address tokenIn; address tokenOut; uint256 amountIn; uint8 fund; }',
  'struct FillPlan { uint16 feeBps; uint8 feeMode; address feeAsset; uint16 feeAfterLeg; uint256 minFeeBasis; uint256 minAmountOut; uint256 deadline; Leg[] legs; }',
  'struct OrderState { uint32 fillsDone; uint40 nextDueAt; bool cancelled; }',
  'function fill(Order o, bytes sig, FillPlan x) returns (uint256 amountOut)',
  'function cancel(Order o)',
  'function cancelAll(bytes32 salt)',
  'function hashOrder(Order o) view returns (bytes32)',
  'function orderState(bytes32 orderHash) view returns (OrderState)',
  'function isValidOrderSignature(Order o, bytes sig) view returns (bool)',
  'function makerEpoch(address maker) view returns (bytes32)',
  'function ocoFilledBy(address maker, bytes32 group) view returns (bytes32)',
  'function paused() view returns (bool)',
  'function ORDER_TYPEHASH() view returns (bytes32)',
  'event Filled(bytes32 indexed orderHash, address indexed maker, address executor, uint32 fillIndex, uint256 amountIn, uint256 amountOut, uint16 feeBps, uint40 nextDueAt)',
  'event Cancelled(bytes32 indexed orderHash, address indexed maker)',
  'event CancelledAll(address indexed maker, bytes32 newEpoch)',
])

export function ordersAbiFor(gen: OrdersGeneration) {
  if (gen === 'v3') return mancerOrdersV3Abi
  return gen === 'v2' ? mancerOrdersV2Abi : mancerOrdersAbi
}

export const mancerRouterAbi = parseAbi([
  'struct Swap { address tokenIn; address tokenOut; uint256 amountIn; uint256 minAmountOut; address recipient; uint256 deadline; address target; bytes payload; uint16 feeBps; bool feeOnOutput; }',
  'function swap(Swap s) payable returns (uint256 amountOut)',
  'struct SwapVia { address tokenIn; address cash; address tokenOut; uint256 amountIn; uint256 minCashOut; uint256 minAmountOut; address targetA; bytes payloadA; address targetB; bytes payloadB; uint16 feeBps; address recipient; uint256 deadline; }',
  'function swapVia(SwapVia s) payable returns (uint256 amountOut)',
  'struct Leg { address target; bytes payload; address tokenIn; address tokenOut; uint256 amountIn; uint8 fund; }',
  'struct Plan { address tokenIn; address tokenOut; uint256 amountIn; uint256 minAmountOut; address recipient; uint256 deadline; uint16 feeBps; uint8 feeMode; address feeAsset; uint16 feeAfterLeg; uint256 minFeeBasis; Leg[] legs; }',
  'function execute(Plan p) payable returns (uint256 amountOut)',
  'function permit2() view returns (address)',
  'function isTarget(address target) view returns (bool)',
  'function callAllowed(address target, bytes4 selector) view returns (bool)',
  'function allowanceTarget() view returns (address)',
  'function setPermit2(address permit2_)',
  'event Swapped(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address feeAsset, uint256 feeAmount, address target)',
  'event Executed(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address feeAsset, uint256 feeAmount, uint16 feeBps, uint8 feeMode, uint256 legCount)',
])

export const safeLaunchV2OperatorAbi = parseAbi([
  'function setOperator(uint256 id, address operator, bool allowed)',
  'function operatorOf(address account, uint256 id, address operator) view returns (bool)',
])

export const safeLaunchExecutionCoordinatorAbi = parseAbi([
  'struct Leg { address target; bytes payload; address tokenIn; address tokenOut; uint256 amountIn; uint8 fund; }',
  'struct Plan { address tokenIn; address tokenOut; uint256 amountIn; uint256 minAmountOut; address recipient; uint256 deadline; uint16 feeBps; uint8 feeMode; address feeAsset; uint16 feeAfterLeg; uint256 minFeeBasis; Leg[] legs; }',
  'function execute(Plan p) payable returns (uint256 amountOut)',
  'function allowanceTarget() view returns (address)',
  'function router() view returns (address)',
  'function orders() view returns (address)',
  'function weth() view returns (address)',
  'function isAdapter(address adapter) view returns (bool)',
  'function isOrderExecutor(address executor) view returns (bool)',
  'function paused() view returns (bool)',
])

export const safeLaunchV2AdapterAbi = parseAbi([
  'function buy(uint256 launchId, address launchToken, uint256 quoteIn, uint256 minTokensOut) returns (uint256 amountToRouter)',
  'function sell(uint256 launchId, address launchToken, uint256 tokensIn, uint256 minQuoteOut) returns (uint256 amountToRouter)',
  'function router() view returns (address)',
  'function coordinator() view returns (address)',
  'function pad() view returns (address)',
  'function quoteToken() view returns (address)',
  'function weth() view returns (address)',
])

export const ponsV2AdapterAbi = parseAbi([
  'function buy(address curve, address launchToken, uint256 quoteIn, uint256 minTokensOut) returns (uint256 amountToRouter)',
  'function sell(address curve, address launchToken, uint256 tokensIn, uint256 minQuoteOut) returns (uint256 amountToRouter)',
  'function router() view returns (address)',
  'function factory() view returns (address)',
  'function weth() view returns (address)',
])
