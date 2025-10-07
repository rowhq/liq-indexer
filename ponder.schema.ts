import { onchainTable, index, primaryKey } from "ponder";

// Main position tracking table
export const position = onchainTable("position", (t) => ({
  id: t.text().primaryKey(), // tokenId
  tickLower: t.integer().notNull(),
  tickUpper: t.integer().notNull(),
  liquidity: t.bigint().notNull(),

  // Initial deposits (for calculating hold value)
  amount0Deposited: t.bigint().notNull(),
  amount1Deposited: t.bigint().notNull(),

  // Current amounts in position
  amount0Current: t.bigint().notNull(),
  amount1Current: t.bigint().notNull(),

  // Fees collected
  fees0Collected: t.bigint().notNull(),
  fees1Collected: t.bigint().notNull(),

  // IL calculation fields
  holdValue: t.bigint().notNull(), // What user would have if they held tokens
  positionValue: t.bigint().notNull(), // Current LP position value
  impermanentLoss: t.bigint().notNull(), // IL as percentage (basis points)

  // Position state
  isActive: t.boolean().notNull(),
  currentTick: t.integer().notNull(),

  // Metadata
  createdAt: t.integer().notNull(),
  lastUpdated: t.integer().notNull(),
  txHash: t.text().notNull(),
}));

// Historical IL snapshots for each event
export const ilSnapshot = onchainTable("il_snapshot", (t) => ({
  id: t.text().primaryKey(), // tokenId-timestamp-txHash
  tokenId: t.text().notNull(),
  eventType: t.text().notNull(), // "rebalance", "increase", "decrease"

  // Position state at snapshot
  tickLower: t.integer().notNull(),
  tickUpper: t.integer().notNull(),
  liquidity: t.bigint().notNull(),
  amount0: t.bigint().notNull(),
  amount1: t.bigint().notNull(),

  // IL metrics
  impermanentLoss: t.bigint().notNull(), // IL in basis points
  holdValue: t.bigint().notNull(),
  positionValue: t.bigint().notNull(),

  // Swap loss (if applicable)
  swapLoss: t.bigint(),

  // Event metadata
  timestamp: t.integer().notNull(),
  blockNumber: t.bigint().notNull(),
  txHash: t.text().notNull(),
}), (table) => ({
  tokenIdIdx: index().on(table.tokenId),
  timestampIdx: index().on(table.timestamp),
}));

// Track liquidity operations
export const liquidityOperation = onchainTable("liquidity_operation", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  tokenId: t.text().notNull(),
  operationType: t.text().notNull(), // "add", "remove", "rebalance"

  // Amounts
  amount0: t.bigint().notNull(),
  amount1: t.bigint().notNull(),
  liquidityDelta: t.bigint().notNull(),

  // Fees (for remove operations)
  fees0: t.bigint(),
  fees1: t.bigint(),

  // Context
  tickLower: t.integer().notNull(),
  tickUpper: t.integer().notNull(),
  currentTick: t.integer().notNull(),

  // Metadata
  timestamp: t.integer().notNull(),
  blockNumber: t.bigint().notNull(),
  txHash: t.text().notNull(),
}), (table) => ({
  tokenIdIdx: index().on(table.tokenId),
  timestampIdx: index().on(table.timestamp),
}));

// Track rebalance events specifically
export const rebalance = onchainTable("rebalance", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  oldTokenId: t.text().notNull(),
  newTokenId: t.text().notNull(),
  newTickLower: t.integer().notNull(),
  newTickUpper: t.integer().notNull(),

  // Metadata
  timestamp: t.integer().notNull(),
  blockNumber: t.bigint().notNull(),
  txHash: t.text().notNull(),
}), (table) => ({
  oldTokenIdIdx: index().on(table.oldTokenId),
  newTokenIdIdx: index().on(table.newTokenId),
}));

// Aggregate statistics per position
export const positionStats = onchainTable("position_stats", (t) => ({
  id: t.text().primaryKey(), // tokenId

  // Counters
  totalRebalances: t.integer().notNull(),
  totalIncreases: t.integer().notNull(),
  totalDecreases: t.integer().notNull(),

  // Totals
  totalFeesCollected0: t.bigint().notNull(),
  totalFeesCollected1: t.bigint().notNull(),
  totalSwapLoss: t.bigint().notNull(),

  // Peak IL
  maxImpermanentLoss: t.bigint().notNull(),
  minImpermanentLoss: t.bigint().notNull(),

  // Lifetime
  firstSeenAt: t.integer().notNull(),
  lastActivityAt: t.integer().notNull(),
}));
