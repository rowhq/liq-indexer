import { onchainTable, index } from "ponder";

/**
 * Interval-Based IL Tracking Schema
 *
 * Core Concept: Each liquidity provision period is tracked as a separate "interval"
 * An interval starts when liquidity is added and ends when it's removed/modified
 * IL is calculated by comparing token amounts at interval start vs end
 */

// ============================================================================
// Pool Manager Info - Metadata for each pool manager contract
// ============================================================================
export const poolManagerInfo = onchainTable("pool_manager_info", (t) => ({
  id: t.text().primaryKey(), // Pool manager contract address

  // Protocol info
  protocol: t.text().notNull(), // "aerodrome", "blackhole", etc
  pool: t.text().notNull(), // Underlying pool address

  // Token info (fetched from contract)
  token0: t.text().notNull(), // Token0 address
  token1: t.text().notNull(), // Token1 address
  token0Decimals: t.integer().notNull(), // Token0 decimals (e.g., 6 for USDC, 18 for WETH)
  token1Decimals: t.integer().notNull(), // Token1 decimals

  // Current state
  currentTokenId: t.bigint().notNull(), // Current active position NFT tokenId

  // Metadata
  createdAt: t.integer().notNull(), // Timestamp when first seen
  createdAtBlock: t.bigint().notNull(), // Block when first seen
}));

// ============================================================================
// Interval - Core interval tracking for IL calculation
// ============================================================================
export const interval = onchainTable("interval", (t) => ({
  // Composite ID: poolManager-tokenId-startTimestamp
  id: t.text().primaryKey(),

  // Position identifiers
  poolManager: t.text().notNull(), // Pool manager contract address
  tokenId: t.bigint().notNull(), // Position NFT tokenId

  // Interval boundaries
  startTimestamp: t.integer().notNull(), // When liquidity was added
  startBlock: t.bigint().notNull(),
  endTimestamp: t.integer(), // When liquidity was removed (null if active)
  endBlock: t.bigint(), // Block when closed (null if active)

  // Token amounts deposited (interval start) - IN NATIVE DECIMALS
  token0In: t.bigint().notNull(), // Amount of token0 deposited
  token1In: t.bigint().notNull(), // Amount of token1 deposited

  // Token amounts withdrawn (interval end) - IN NATIVE DECIMALS
  token0Out: t.bigint(), // Amount of token0 withdrawn (null if active)
  token1Out: t.bigint(), // Amount of token1 withdrawn (null if active)

  // IL calculation - IN NATIVE DECIMALS
  token0Delta: t.bigint(), // token0Out - token0In (negative = loss)
  token1Delta: t.bigint(), // token1Out - token1In (negative = loss)

  // Position metadata (from events)
  tickLower: t.integer().notNull(),
  tickUpper: t.integer().notNull(),
  currentTick: t.integer().notNull(), // Tick at interval start

  // Status
  isActive: t.boolean().notNull(), // true if interval is still ongoing

  // Transaction metadata
  startTxHash: t.text().notNull(),
  endTxHash: t.text(), // Transaction that closed the interval
}), (table) => ({
  // Indexes for efficient queries
  poolManagerIdx: index().on(table.poolManager),
  tokenIdIdx: index().on(table.tokenId),
  isActiveIdx: index().on(table.isActive),
  startTimestampIdx: index().on(table.startTimestamp),
  endTimestampIdx: index().on(table.endTimestamp),
  // Composite index for finding active intervals
  poolManagerTokenIdIdx: index().on(table.poolManager, table.tokenId, table.isActive),
}));

// ============================================================================
// Hourly Aggregation - Time-series IL data
// ============================================================================
export const hourlyAggregation = onchainTable("hourly_aggregation", (t) => ({
  // Composite ID: poolManager-hourTimestamp
  id: t.text().primaryKey(),

  poolManager: t.text().notNull(), // Pool manager contract address
  hourTimestamp: t.integer().notNull(), // Timestamp rounded to hour start

  // Aggregated deltas for all intervals closed in this hour - IN NATIVE DECIMALS
  totalToken0Delta: t.bigint().notNull(), // Sum of all token0 deltas
  totalToken1Delta: t.bigint().notNull(), // Sum of all token1 deltas

  // Metrics
  intervalCount: t.integer().notNull(), // Number of intervals closed in this hour

  // For easier time-series queries
  year: t.integer().notNull(),
  month: t.integer().notNull(),
  day: t.integer().notNull(),
  hour: t.integer().notNull(),
}), (table) => ({
  poolManagerIdx: index().on(table.poolManager),
  hourTimestampIdx: index().on(table.hourTimestamp),
  poolManagerHourIdx: index().on(table.poolManager, table.hourTimestamp),
}));

// ============================================================================
// Rebalance - Track position rebalances for continuity
// ============================================================================
export const rebalance = onchainTable("rebalance", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex

  poolManager: t.text().notNull(), // Pool manager that performed rebalance
  oldTokenId: t.bigint().notNull(), // Old position NFT
  newTokenId: t.bigint().notNull(), // New position NFT

  // New position parameters
  newTickLower: t.integer().notNull(),
  newTickUpper: t.integer().notNull(),

  // Metadata
  timestamp: t.integer().notNull(),
  blockNumber: t.bigint().notNull(),
  txHash: t.text().notNull(),
}), (table) => ({
  poolManagerIdx: index().on(table.poolManager),
  oldTokenIdIdx: index().on(table.oldTokenId),
  newTokenIdIdx: index().on(table.newTokenId),
  timestampIdx: index().on(table.timestamp),
}));
