import { ponder } from "ponder:registry";
import {
  poolManagerInfo,
  interval,
  hourlyAggregation,
  rebalance,
} from "ponder:schema";

/**
 * Interval-Based Impermanent Loss Tracking
 *
 * This indexer tracks IL by creating discrete "intervals" for each liquidity provision period.
 * Each interval records token amounts IN (when liquidity is added) and OUT (when removed).
 * IL is calculated as the delta between IN and OUT amounts.
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Update hourly aggregation with interval deltas
 * Rounds timestamp to hour boundary and accumulates deltas
 */
async function updateHourlyAggregation(
  context: any,
  poolManager: string,
  timestamp: number,
  token0Delta: bigint,
  token1Delta: bigint
) {
  // Round to hour start (timestamp in seconds)
  const hourTimestamp = Math.floor(timestamp / 3600) * 3600;
  const id = `${poolManager}-${hourTimestamp}`;

  // Calculate date components for easier querying
  const date = new Date(hourTimestamp * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();

  // Check if hourly record exists
  const existing = await context.db.find(hourlyAggregation, { id });

  if (existing) {
    // Update existing record
    await context.db.update(hourlyAggregation, { id }).set({
      totalToken0Delta: existing.totalToken0Delta + token0Delta,
      totalToken1Delta: existing.totalToken1Delta + token1Delta,
      intervalCount: existing.intervalCount + 1,
    });
  } else {
    // Create new hourly record
    await context.db.insert(hourlyAggregation).values({
      id,
      poolManager,
      hourTimestamp,
      totalToken0Delta: token0Delta,
      totalToken1Delta: token1Delta,
      intervalCount: 1,
      year,
      month,
      day,
      hour,
    });
  }
}

/**
 * Find the active interval for a given pool manager and token ID
 */
async function findActiveInterval(
  context: any,
  poolManager: string,
  tokenId: bigint
) {
  const intervals = await context.db
    .find(interval, {
      poolManager,
      tokenId,
      isActive: true,
    })
    .sort((a: any, b: any) => Number(b.startTimestamp) - Number(a.startTimestamp))
    .limit(1);

  return intervals.length > 0 ? intervals[0] : null;
}

/**
 * Fetch token decimals from ERC20 contract
 */
async function getTokenDecimals(
  context: any,
  tokenAddress: string
): Promise<number> {
  try {
    const decimals = await context.client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: [
        {
          name: "decimals",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "uint8" }],
        },
      ],
      functionName: "decimals",
    });
    return Number(decimals);
  } catch (error) {
    console.warn(`Failed to fetch decimals for ${tokenAddress}, defaulting to 18`);
    return 18; // Default to 18 decimals if call fails
  }
}

// ============================================================================
// Factory Event Handler
// ============================================================================

/**
 * PoolManagerDeployed - Initialize pool manager metadata
 * This handler is called when a new pool manager is deployed via the factory
 */
ponder.on("PoolManagerFactory:PoolManagerDeployed", async ({ event, context }) => {
  const { protocol, pool, manager } = event.args;
  const timestamp = Number(event.block.timestamp);
  const blockNumber = event.block.number;

  console.log(`New pool manager deployed: ${manager} for protocol ${protocol}`);

  // Fetch token addresses from the pool manager
  let token0Address: string;
  let token1Address: string;

  try {
    [token0Address, token1Address] = await Promise.all([
      context.client.readContract({
        address: manager as `0x${string}`,
        abi: [
          {
            name: "token0",
            type: "function",
            stateMutability: "view",
            inputs: [],
            outputs: [{ type: "address" }],
          },
        ],
        functionName: "token0",
      }),
      context.client.readContract({
        address: manager as `0x${string}`,
        abi: [
          {
            name: "token1",
            type: "function",
            stateMutability: "view",
            inputs: [],
            outputs: [{ type: "address" }],
          },
        ],
        functionName: "token1",
      }),
    ]);
  } catch (error) {
    console.error(`Failed to fetch token addresses for ${manager}:`, error);
    return;
  }

  // Fetch token decimals
  const [token0Decimals, token1Decimals] = await Promise.all([
    getTokenDecimals(context, token0Address),
    getTokenDecimals(context, token1Address),
  ]);

  // Create pool manager info entry
  await context.db.insert(poolManagerInfo).values({
    id: manager.toLowerCase(),
    protocol,
    pool: pool.toLowerCase(),
    token0: token0Address.toLowerCase(),
    token1: token1Address.toLowerCase(),
    token0Decimals,
    token1Decimals,
    currentTokenId: 0n,
    createdAt: timestamp,
    createdAtBlock: blockNumber,
  });

  console.log(
    `Pool manager ${manager} initialized: ${token0Address}/${token1Address} (${token0Decimals}/${token1Decimals} decimals)`
  );
});

// ============================================================================
// Core Event Handlers - Interval Tracking
// ============================================================================

/**
 * LiquidityAdded - Start a new interval
 * Emitted when liquidity is added to a position (new mint or increase via rebalance)
 */
ponder.on("AerodromePoolManager:LiquidityAdded", async ({ event, context }) => {
  const {
    tokenId,
    tickLower,
    tickUpper,
    amount0Used,
    amount1Used,
    currentTick,
  } = event.args;

  const poolManager = event.log.address.toLowerCase();
  const timestamp = Number(event.block.timestamp);
  const blockNumber = event.block.number;
  const txHash = event.transaction.hash;

  // Create new interval
  const intervalId = `${poolManager}-${tokenId}-${timestamp}`;

  await context.db.insert(interval).values({
    id: intervalId,
    poolManager,
    tokenId,
    startTimestamp: timestamp,
    startBlock: blockNumber,
    endTimestamp: null,
    endBlock: null,
    token0In: amount0Used,
    token1In: amount1Used,
    token0Out: null,
    token1Out: null,
    token0Delta: null,
    token1Delta: null,
    tickLower: Number(tickLower),
    tickUpper: Number(tickUpper),
    currentTick: Number(currentTick),
    isActive: true,
    startTxHash: txHash,
    endTxHash: null,
  });

  // Update pool manager's current token ID
  const poolMgrInfo = await context.db.find(poolManagerInfo, { id: poolManager });
  if (poolMgrInfo) {
    await context.db.update(poolManagerInfo, { id: poolManager }).set({
      currentTokenId: tokenId,
    });
  }

  console.log(
    `Interval started: ${intervalId} (${amount0Used} token0, ${amount1Used} token1)`
  );
});

/**
 * LiquidityRemoved - Close an interval
 * Emitted when liquidity is removed from a position (full withdrawal during rebalance or decrease)
 */
ponder.on("AerodromePoolManager:LiquidityRemoved", async ({ event, context }) => {
  const {
    tokenId,
    amount0Removed,
    amount1Removed,
  } = event.args;

  const poolManager = event.log.address.toLowerCase();
  const timestamp = Number(event.block.timestamp);
  const blockNumber = event.block.number;
  const txHash = event.transaction.hash;

  // Find active interval for this position
  const activeInterval = await findActiveInterval(context, poolManager, tokenId);

  if (!activeInterval) {
    console.warn(
      `No active interval found for pool manager ${poolManager}, tokenId ${tokenId}`
    );
    return;
  }

  // Calculate deltas
  const token0Delta = amount0Removed - activeInterval.token0In;
  const token1Delta = amount1Removed - activeInterval.token1In;

  // Close the interval
  await context.db.update(interval, { id: activeInterval.id }).set({
    endTimestamp: timestamp,
    endBlock: blockNumber,
    token0Out: amount0Removed,
    token1Out: amount1Removed,
    token0Delta,
    token1Delta,
    isActive: false,
    endTxHash: txHash,
  });

  // Update hourly aggregation
  await updateHourlyAggregation(
    context,
    poolManager,
    timestamp,
    token0Delta,
    token1Delta
  );

  console.log(
    `Interval closed: ${activeInterval.id} (Δ0=${token0Delta}, Δ1=${token1Delta})`
  );
});

/**
 * PositionSnapshot - Handle liquidity increases/decreases
 * Emitted on increaseLiquidity and decreaseLiquidity operations
 * Shows position value before and after the operation
 */
ponder.on("AerodromePoolManager:PositionSnapshot", async ({ event, context }) => {
  const {
    tokenId,
    amount0Before,
    amount1Before,
    amount0After,
    amount1After,
    currentTick,
  } = event.args;

  const poolManager = event.log.address.toLowerCase();
  const timestamp = Number(event.block.timestamp);
  const blockNumber = event.block.number;
  const txHash = event.transaction.hash;

  // Find active interval for this position
  const activeInterval = await findActiveInterval(context, poolManager, tokenId);

  if (activeInterval) {
    // Close the existing interval using "before" amounts
    const token0Delta = amount0Before - activeInterval.token0In;
    const token1Delta = amount1Before - activeInterval.token1In;

    await context.db.update(interval, { id: activeInterval.id }).set({
      endTimestamp: timestamp,
      endBlock: blockNumber,
      token0Out: amount0Before,
      token1Out: amount1Before,
      token0Delta,
      token1Delta,
      isActive: false,
      endTxHash: txHash,
    });

    // Update hourly aggregation
    await updateHourlyAggregation(
      context,
      poolManager,
      timestamp,
      token0Delta,
      token1Delta
    );

    console.log(
      `Interval closed via snapshot: ${activeInterval.id} (Δ0=${token0Delta}, Δ1=${token1Delta})`
    );
  }

  // Create new interval with "after" amounts (if there's still liquidity)
  if (amount0After > 0n || amount1After > 0n) {
    const newIntervalId = `${poolManager}-${tokenId}-${timestamp}`;

    // Preserve tick info from previous interval if available
    const tickLower = activeInterval?.tickLower || 0;
    const tickUpper = activeInterval?.tickUpper || 0;

    await context.db.insert(interval).values({
      id: newIntervalId,
      poolManager,
      tokenId,
      startTimestamp: timestamp,
      startBlock: blockNumber,
      endTimestamp: null,
      endBlock: null,
      token0In: amount0After,
      token1In: amount1After,
      token0Out: null,
      token1Out: null,
      token0Delta: null,
      token1Delta: null,
      tickLower,
      tickUpper,
      currentTick: Number(currentTick),
      isActive: true,
      startTxHash: txHash,
      endTxHash: null,
    });

    console.log(
      `New interval started via snapshot: ${newIntervalId} (${amount0After} token0, ${amount1After} token1)`
    );
  } else {
    console.log(`Position fully closed for tokenId ${tokenId}`);
  }
});

/**
 * PositionRebalanced - Track rebalance events
 * Links old and new positions during rebalancing
 * Note: LiquidityRemoved and LiquidityAdded events handle the actual interval logic
 */
ponder.on("AerodromePoolManager:PositionRebalanced", async ({ event, context }) => {
  const { oldTokenId, newTokenId, newTickLower, newTickUpper } = event.args;

  const poolManager = event.log.address.toLowerCase();
  const timestamp = Number(event.block.timestamp);
  const blockNumber = event.block.number;
  const txHash = event.transaction.hash;

  // Create rebalance record for tracking position continuity
  const rebalanceId = `${txHash}-${event.log.logIndex}`;

  await context.db.insert(rebalance).values({
    id: rebalanceId,
    poolManager,
    oldTokenId,
    newTokenId,
    newTickLower: Number(newTickLower),
    newTickUpper: Number(newTickUpper),
    timestamp,
    blockNumber,
    txHash,
  });

  console.log(
    `Rebalance recorded: ${oldTokenId} → ${newTokenId} at ticks [${newTickLower}, ${newTickUpper}]`
  );
});
