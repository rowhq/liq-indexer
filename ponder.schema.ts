import { createSchema } from "@ponder/core";

export default createSchema((p) => ({
  // Main position tracking table
  Position: p.createTable({
    id: p.string(), // tokenId
    tickLower: p.int(),
    tickUpper: p.int(),
    liquidity: p.bigint(),

    // Initial deposits (for calculating hold value)
    amount0Deposited: p.bigint(),
    amount1Deposited: p.bigint(),

    // Current amounts in position
    amount0Current: p.bigint(),
    amount1Current: p.bigint(),

    // Fees collected
    fees0Collected: p.bigint(),
    fees1Collected: p.bigint(),

    // IL calculation fields
    holdValue: p.bigint(), // What user would have if they held tokens
    positionValue: p.bigint(), // Current LP position value
    impermanentLoss: p.bigint(), // IL as percentage (basis points)

    // Position state
    isActive: p.boolean(),
    currentTick: p.int(),

    // Metadata
    createdAt: p.int(),
    lastUpdated: p.int(),
    txHash: p.string(),
  }),

  // Historical IL snapshots for each event
  ILSnapshot: p.createTable({
    id: p.string(), // tokenId-timestamp-txHash
    tokenId: p.string(),
    eventType: p.string(), // "rebalance", "increase", "decrease"

    // Position state at snapshot
    tickLower: p.int(),
    tickUpper: p.int(),
    liquidity: p.bigint(),
    amount0: p.bigint(),
    amount1: p.bigint(),

    // IL metrics
    impermanentLoss: p.bigint(), // IL in basis points
    holdValue: p.bigint(),
    positionValue: p.bigint(),

    // Swap loss (if applicable)
    swapLoss: p.bigint().optional(),

    // Event metadata
    timestamp: p.int(),
    blockNumber: p.bigint(),
    txHash: p.string(),
  }),

  // Track liquidity operations
  LiquidityOperation: p.createTable({
    id: p.string(), // txHash-logIndex
    tokenId: p.string(),
    operationType: p.string(), // "add", "remove", "rebalance"

    // Amounts
    amount0: p.bigint(),
    amount1: p.bigint(),
    liquidityDelta: p.bigint(),

    // Fees (for remove operations)
    fees0: p.bigint().optional(),
    fees1: p.bigint().optional(),

    // Context
    tickLower: p.int(),
    tickUpper: p.int(),
    currentTick: p.int(),

    // Metadata
    timestamp: p.int(),
    blockNumber: p.bigint(),
    txHash: p.string(),
  }),

  // Track rebalance events specifically
  Rebalance: p.createTable({
    id: p.string(), // txHash-logIndex
    oldTokenId: p.string(),
    newTokenId: p.string(),
    newTickLower: p.int(),
    newTickUpper: p.int(),

    // Metadata
    timestamp: p.int(),
    blockNumber: p.bigint(),
    txHash: p.string(),
  }),

  // Aggregate statistics per position
  PositionStats: p.createTable({
    id: p.string(), // tokenId

    // Counters
    totalRebalances: p.int(),
    totalIncreases: p.int(),
    totalDecreases: p.int(),

    // Totals
    totalFeesCollected0: p.bigint(),
    totalFeesCollected1: p.bigint(),
    totalSwapLoss: p.bigint(),

    // Peak IL
    maxImpermanentLoss: p.bigint(),
    minImpermanentLoss: p.bigint(),

    // Lifetime
    firstSeenAt: p.int(),
    lastActivityAt: p.int(),
  }),
}));
