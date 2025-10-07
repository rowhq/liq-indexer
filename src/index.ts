import { ponder } from "ponder";
import { eq } from "ponder";
import {
  position,
  ilSnapshot,
  liquidityOperation,
  rebalance,
  positionStats,
} from "../ponder.schema";

/**
 * Helper function to calculate Impermanent Loss
 *
 * IL = (position value - hold value) / hold value * 10000 (in basis points)
 *
 * For now, this is a simplified version that tracks token amounts.
 * TODO: Integrate price oracles to calculate actual USD values
 */
function calculateIL(
  amount0Deposited: bigint,
  amount1Deposited: bigint,
  amount0Current: bigint,
  amount1Current: bigint,
  fees0: bigint,
  fees1: bigint
): bigint {
  // Simple ratio-based IL calculation
  // This is a placeholder - ideally you'd use actual token prices

  // Total current holdings = current amounts + fees
  const total0 = amount0Current + fees0;
  const total1 = amount1Current + fees1;

  // If initial deposits were zero, return 0
  if (amount0Deposited === 0n && amount1Deposited === 0n) {
    return 0n;
  }

  // Simple ratio comparison (assuming tokens have similar value)
  // In production, multiply by actual prices from an oracle
  const initialValue = amount0Deposited + amount1Deposited;
  const currentValue = total0 + total1;

  if (initialValue === 0n) return 0n;

  // IL in basis points (10000 = 100%)
  const il = ((currentValue - initialValue) * 10000n) / initialValue;

  return il;
}

/**
 * LiquidityAdded Event Handler
 * Tracks new liquidity additions and updates position state
 */
ponder.on("CorePoolManager:LiquidityAdded", async ({ event, context }) => {
  const {
    tokenId,
    tickLower,
    tickUpper,
    liquidityAdded,
    amount0Desired,
    amount1Desired,
    amount0Used,
    amount1Used,
    idle0,
    idle1,
    swapLoss,
    currentTick,
  } = event.args;

  const timestamp = Number(event.block.timestamp);
  const blockNumber = event.block.number;
  const txHash = event.transaction.hash;
  const positionId = tokenId.toString();

  // Check if position exists
  const existingPosition = await context.db
    .select()
    .from(position)
    .where(eq(position.id, positionId))
    .limit(1);

  if (existingPosition.length === 0) {
    // New position - insert
    await context.db.insert(position).values({
      id: positionId,
      tickLower: Number(tickLower),
      tickUpper: Number(tickUpper),
      liquidity: liquidityAdded,
      amount0Deposited: amount0Used,
      amount1Deposited: amount1Used,
      amount0Current: amount0Used,
      amount1Current: amount1Used,
      fees0Collected: 0n,
      fees1Collected: 0n,
      holdValue: 0n,
      positionValue: 0n,
      impermanentLoss: 0n,
      isActive: true,
      currentTick: Number(currentTick),
      createdAt: timestamp,
      lastUpdated: timestamp,
      txHash,
    });

    // Initialize stats
    await context.db.insert(positionStats).values({
      id: positionId,
      totalRebalances: 0,
      totalIncreases: 1,
      totalDecreases: 0,
      totalFeesCollected0: 0n,
      totalFeesCollected1: 0n,
      totalSwapLoss: swapLoss,
      maxImpermanentLoss: 0n,
      minImpermanentLoss: 0n,
      firstSeenAt: timestamp,
      lastActivityAt: timestamp,
    });
  } else {
    // Update existing position
    const pos = existingPosition[0];
    const newAmount0 = pos.amount0Current + amount0Used;
    const newAmount1 = pos.amount1Current + amount1Used;
    const newLiquidity = pos.liquidity + liquidityAdded;

    // Calculate IL
    const il = calculateIL(
      pos.amount0Deposited,
      pos.amount1Deposited,
      newAmount0,
      newAmount1,
      pos.fees0Collected,
      pos.fees1Collected
    );

    await context.db.update(position, { id: positionId }).set({
      liquidity: newLiquidity,
      amount0Current: newAmount0,
      amount1Current: newAmount1,
      impermanentLoss: il,
      currentTick: Number(currentTick),
      lastUpdated: timestamp,
      txHash,
    });

    // Update stats
    await context.db
      .update(positionStats, { id: positionId })
      .set((row) => ({
        totalIncreases: row.totalIncreases + 1,
        totalSwapLoss: row.totalSwapLoss + swapLoss,
        maxImpermanentLoss:
          il > row.maxImpermanentLoss ? il : row.maxImpermanentLoss,
        minImpermanentLoss:
          il < row.minImpermanentLoss ? il : row.minImpermanentLoss,
        lastActivityAt: timestamp,
      }));
  }

  // Create liquidity operation record
  await context.db.insert(liquidityOperation).values({
    id: `${txHash}-${event.log.logIndex}`,
    tokenId: positionId,
    operationType: "add",
    amount0: amount0Used,
    amount1: amount1Used,
    liquidityDelta: liquidityAdded,
    tickLower: Number(tickLower),
    tickUpper: Number(tickUpper),
    currentTick: Number(currentTick),
    timestamp,
    blockNumber,
    txHash,
  });

  // Get updated position for IL snapshot
  const updatedPosition = await context.db
    .select()
    .from(position)
    .where(eq(position.id, positionId))
    .limit(1);

  if (updatedPosition.length > 0) {
    const pos = updatedPosition[0];
    await context.db.insert(ilSnapshot).values({
      id: `${positionId}-${timestamp}-${txHash}`,
      tokenId: positionId,
      eventType: "increase",
      tickLower: pos.tickLower,
      tickUpper: pos.tickUpper,
      liquidity: pos.liquidity,
      amount0: pos.amount0Current,
      amount1: pos.amount1Current,
      impermanentLoss: pos.impermanentLoss,
      holdValue: pos.holdValue,
      positionValue: pos.positionValue,
      swapLoss,
      timestamp,
      blockNumber,
      txHash,
    });
  }
});

/**
 * LiquidityRemoved Event Handler
 * Tracks liquidity removals and fee collection
 */
ponder.on("CorePoolManager:LiquidityRemoved", async ({ event, context }) => {
  const {
    tokenId,
    tickLower,
    tickUpper,
    liquidityRemoved,
    liquidityRemaining,
    amount0Removed,
    amount1Removed,
    fees0Collected,
    fees1Collected,
    currentTick,
  } = event.args;

  const timestamp = Number(event.block.timestamp);
  const blockNumber = event.block.number;
  const txHash = event.transaction.hash;
  const positionId = tokenId.toString();

  // Get position
  const existingPosition = await context.db
    .select()
    .from(position)
    .where(eq(position.id, positionId))
    .limit(1);

  if (existingPosition.length === 0) {
    console.warn(`Position ${positionId} not found for LiquidityRemoved event`);
    return;
  }

  const pos = existingPosition[0];

  // Update position
  const newAmount0 = pos.amount0Current - amount0Removed;
  const newAmount1 = pos.amount1Current - amount1Removed;
  const newFees0 = pos.fees0Collected + fees0Collected;
  const newFees1 = pos.fees1Collected + fees1Collected;

  // Calculate IL
  const il = calculateIL(
    pos.amount0Deposited,
    pos.amount1Deposited,
    newAmount0,
    newAmount1,
    newFees0,
    newFees1
  );

  await context.db.update(position, { id: positionId }).set({
    liquidity: liquidityRemaining,
    amount0Current: newAmount0 > 0n ? newAmount0 : 0n,
    amount1Current: newAmount1 > 0n ? newAmount1 : 0n,
    fees0Collected: newFees0,
    fees1Collected: newFees1,
    impermanentLoss: il,
    isActive: liquidityRemaining > 0n,
    currentTick: Number(currentTick),
    lastUpdated: timestamp,
    txHash,
  });

  // Update stats
  await context.db
    .update(positionStats, { id: positionId })
    .set((row) => ({
      totalDecreases: row.totalDecreases + 1,
      totalFeesCollected0: row.totalFeesCollected0 + fees0Collected,
      totalFeesCollected1: row.totalFeesCollected1 + fees1Collected,
      maxImpermanentLoss:
        il > row.maxImpermanentLoss ? il : row.maxImpermanentLoss,
      minImpermanentLoss:
        il < row.minImpermanentLoss ? il : row.minImpermanentLoss,
      lastActivityAt: timestamp,
    }));

  // Create liquidity operation record
  await context.db.insert(liquidityOperation).values({
    id: `${txHash}-${event.log.logIndex}`,
    tokenId: positionId,
    operationType: "remove",
    amount0: amount0Removed,
    amount1: amount1Removed,
    liquidityDelta: liquidityRemoved,
    fees0: fees0Collected,
    fees1: fees1Collected,
    tickLower: Number(tickLower),
    tickUpper: Number(tickUpper),
    currentTick: Number(currentTick),
    timestamp,
    blockNumber,
    txHash,
  });

  // Create IL snapshot
  await context.db.insert(ilSnapshot).values({
    id: `${positionId}-${timestamp}-${txHash}`,
    tokenId: positionId,
    eventType: "decrease",
    tickLower: Number(tickLower),
    tickUpper: Number(tickUpper),
    liquidity: liquidityRemaining,
    amount0: newAmount0 > 0n ? newAmount0 : 0n,
    amount1: newAmount1 > 0n ? newAmount1 : 0n,
    impermanentLoss: il,
    holdValue: pos.holdValue,
    positionValue: pos.positionValue,
    timestamp,
    blockNumber,
    txHash,
  });
});

/**
 * PositionRebalanced Event Handler
 * Tracks position rebalances (close old, open new)
 */
ponder.on("CorePoolManager:PositionRebalanced", async ({ event, context }) => {
  const { oldTokenId, newTokenId, newTickLower, newTickUpper } = event.args;

  const timestamp = Number(event.block.timestamp);
  const blockNumber = event.block.number;
  const txHash = event.transaction.hash;
  const oldPositionId = oldTokenId.toString();
  const newPositionId = newTokenId.toString();

  // Mark old position as inactive
  const oldPosition = await context.db
    .select()
    .from(position)
    .where(eq(position.id, oldPositionId))
    .limit(1);

  if (oldPosition.length > 0) {
    await context.db.update(position, { id: oldPositionId }).set({
      isActive: false,
      lastUpdated: timestamp,
    });
  }

  // Create rebalance record
  await context.db.insert(rebalance).values({
    id: `${txHash}-${event.log.logIndex}`,
    oldTokenId: oldPositionId,
    newTokenId: newPositionId,
    newTickLower: Number(newTickLower),
    newTickUpper: Number(newTickUpper),
    timestamp,
    blockNumber,
    txHash,
  });

  // Update stats for old position
  const oldStats = await context.db
    .select()
    .from(positionStats)
    .where(eq(positionStats.id, oldPositionId))
    .limit(1);

  if (oldStats.length > 0) {
    await context.db
      .update(positionStats, { id: oldPositionId })
      .set((row) => ({
        totalRebalances: row.totalRebalances + 1,
        lastActivityAt: timestamp,
      }));
  }

  // Note: The new position will be created by subsequent LiquidityAdded event
});

/**
 * SwapExecuted Event Handler (optional)
 * Track swap losses separately
 */
ponder.on("CorePoolManager:SwapExecuted", async ({ event, context }) => {
  // const {
  //   tokenIn,
  //   tokenOut,
  //   amountIn,
  //   amountOut,
  //   expectedAmountOut,
  //   swapLoss,
  //   tickBefore,
  //   tickAfter,
  // } = event.args;

  // You can add custom tracking for swap events here if needed
  // For now, swap losses are tracked in the LiquidityAdded event
});
