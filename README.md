# Liq-Indexer

A [Ponder](https://ponder.sh/) indexer for tracking **Interval-Based Impermanent Loss (IL)** on liquidity manager positions across multiple DEX protocols.

## 🎯 Overview

This indexer implements **interval-based IL tracking** where each liquidity provision period is tracked as a separate interval. An interval starts when liquidity is added and ends when it's removed or modified. IL is calculated by comparing token amounts IN (at interval start) vs OUT (at interval end).

### Key Concepts

- **Interval**: A discrete period where specific token amounts are staked in a position
- **IL Delta**: `tokenOut - tokenIn` (negative = loss, positive = gain from fees)
- **Hourly Aggregation**: Time-series rollups of IL deltas for analytics
- **Multi-Protocol Support**: Dynamically discovers pool managers via factory pattern

## 🏗️ Architecture

### Interval Lifecycle

```
1. LiquidityAdded Event       → Create Interval (tokenIn amounts recorded)
2. Position is active          → Interval remains open
3. LiquidityRemoved Event      → Close Interval (tokenOut amounts, calculate deltas)
   OR PositionSnapshot Event   → Close old interval, create new one
4. Hourly Aggregation Updated  → Accumulate deltas for time-series data
```

### Event Flow Examples

**First Position Creation:**
```
LiquidityAdded → Create Interval (isActive=true)
```

**Position Rebalance:**
```
LiquidityRemoved → Close old interval (calculate deltas)
PositionRebalanced → Record rebalance metadata
LiquidityAdded → Create new interval (new tokenId)
```

**Increase Liquidity:**
```
PositionSnapshot → Close old interval (use "before" amounts)
                → Create new interval (use "after" amounts)
```

**Decrease Liquidity:**
```
PositionSnapshot → Close old interval (use "before" amounts)
                → Create new interval if liquidity remains (use "after" amounts)
```

## 📊 Data Schema

### Core Tables

#### `pool_manager_info`
Metadata for each pool manager contract discovered via factory.

| Field | Type | Description |
|-------|------|-------------|
| id | text | Pool manager contract address |
| protocol | text | Protocol name ("aerodrome", "blackhole", etc) |
| pool | text | Underlying pool address |
| token0 | text | Token0 address |
| token1 | text | Token1 address |
| token0Decimals | integer | Token0 decimals (6 for USDC, 18 for WETH) |
| token1Decimals | integer | Token1 decimals |
| currentTokenId | bigint | Current active position NFT |

#### `interval`
Core interval tracking with token amounts IN/OUT.

| Field | Type | Description |
|-------|------|-------------|
| id | text | Composite: `poolManager-tokenId-startTimestamp` |
| poolManager | text | Pool manager address |
| tokenId | bigint | Position NFT ID |
| startTimestamp | integer | When liquidity was added |
| endTimestamp | integer | When liquidity was removed (null if active) |
| token0In | bigint | Token0 amount deposited (native decimals) |
| token1In | bigint | Token1 amount deposited (native decimals) |
| token0Out | bigint | Token0 amount withdrawn (native decimals) |
| token1Out | bigint | Token1 amount withdrawn (native decimals) |
| token0Delta | bigint | `token0Out - token0In` (negative = loss) |
| token1Delta | bigint | `token1Out - token1In` (negative = loss) |
| isActive | boolean | True if interval is still ongoing |

#### `hourly_aggregation`
Time-series IL data aggregated by hour.

| Field | Type | Description |
|-------|------|-------------|
| id | text | `poolManager-hourTimestamp` |
| poolManager | text | Pool manager address |
| hourTimestamp | integer | Timestamp rounded to hour start |
| totalToken0Delta | bigint | Sum of all token0 deltas in hour |
| totalToken1Delta | bigint | Sum of all token1 deltas in hour |
| intervalCount | integer | Number of intervals closed in hour |

#### `rebalance`
Tracks position rebalances for continuity.

| Field | Type | Description |
|-------|------|-------------|
| id | text | `txHash-logIndex` |
| poolManager | text | Pool manager address |
| oldTokenId | bigint | Previous position NFT |
| newTokenId | bigint | New position NFT |
| newTickLower | integer | New position lower tick |
| newTickUpper | integer | New position upper tick |

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### Configuration

1. **Update `.env`** with your RPC URL:
   ```bash
   PONDER_RPC_URL_8453=https://mainnet.base.org
   # Or use a premium RPC for better performance
   ```

2. **Update `ponder.config.ts`** with your factory address:
   ```typescript
   {
     name: "PoolManagerFactory",
     network: "base",
     address: "0xYourFactoryAddress", // Replace with actual address
     startBlock: 12345678,              // Replace with deployment block
   }
   ```

### Running

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run start
```

The GraphQL API will be available at `http://localhost:42069/graphql`

## 🎨 Frontend Dashboard

A beautiful, real-time dashboard is included to visualize IL tracking data across all pool managers.

### Accessing the Dashboard

1. **Start Ponder in dev mode**:
   ```bash
   npm run dev
   ```

2. **Serve the frontend** (in a separate terminal):
   ```bash
   npm run frontend
   ```
   Or use any static file server:
   ```bash
   cd public && python3 -m http.server 8000
   ```

3. **Open in browser**:
   - Frontend: `http://localhost:8000` (or whichever port your server uses)
   - The dashboard will automatically connect to the GraphQL API at `http://localhost:42069/graphql`

### Dashboard Features

- **📊 Pool Manager Overview**: View all discovered pool managers with token info and decimals
- **⚡ Active Intervals**: Monitor currently open liquidity positions
- **📉 Closed Intervals**: Analyze completed intervals with IL deltas
- **📈 Hourly Aggregations**: Time-series charts and tables showing IL trends
- **🔄 Rebalance History**: Track position rebalances across time
- **💰 USD IL Calculations**: Real-time USD values (customize token prices in `app.js`)
- **🔄 Auto-refresh**: Dashboard updates every 30 seconds

### Real-time Token Prices

The dashboard automatically fetches real-time token prices from **GeckoTerminal Pro API** with batch queries:

- **Automatic discovery**: Fetches DEX prices for all tokens in all pool managers
- **Batch queries**: Single API call for efficient multi-token pricing
- **Price caching**: 1-minute cache to reduce API calls
- **USD IL calculations**: Accurate IL values using live DEX prices
- **Pro API**: Uses paid GeckoTerminal Pro with increased rate limits
- **No fallbacks**: Shows "Price N/A" if pricing fails (ensures data accuracy)

Prices are displayed in:
- Pool Manager cards (live token prices shown)
- Closed Intervals table (USD IL badges with accurate calculations)
- Hourly Aggregations (USD IL values and interactive chart)

**Why GeckoTerminal Pro?**
- **On-chain DEX prices**: More accurate for DeFi than CEX aggregators
- **Higher rate limits**: Pro tier supports higher request volumes
- **Batch endpoint**: Efficient multi-token queries
- **Real-time data**: Live prices from Uniswap, Aerodrome, and other DEXes on Base
- **Reliable**: No fallback to default prices ensures data integrity

## 📈 GraphQL Queries

### Get all active intervals

```graphql
query {
  intervals(where: { isActive: true }) {
    id
    poolManager
    tokenId
    token0In
    token1In
    startTimestamp
  }
}
```

### Get closed intervals for a pool manager

```graphql
query {
  intervals(
    where: {
      poolManager: "0x...",
      isActive: false
    }
    orderBy: "endTimestamp"
    orderDirection: "desc"
  ) {
    id
    tokenId
    token0In
    token1In
    token0Out
    token1Out
    token0Delta
    token1Delta
    startTimestamp
    endTimestamp
  }
}
```

### Get hourly IL aggregations

```graphql
query {
  hourlyAggregations(
    where: { poolManager: "0x..." }
    orderBy: "hourTimestamp"
    orderDirection: "desc"
  ) {
    id
    hourTimestamp
    totalToken0Delta
    totalToken1Delta
    intervalCount
    year
    month
    day
    hour
  }
}
```

### Get pool manager info

```graphql
query {
  poolManagerInfos {
    id
    protocol
    pool
    token0
    token1
    token0Decimals
    token1Decimals
    currentTokenId
  }
}
```

### Get rebalance history

```graphql
query {
  rebalances(
    where: { poolManager: "0x..." }
    orderBy: "timestamp"
    orderDirection: "desc"
  ) {
    id
    oldTokenId
    newTokenId
    newTickLower
    newTickUpper
    timestamp
  }
}
```

## 💰 Calculating USD IL Losses

Token amounts are stored in **native decimals** (e.g., USDC = 6 decimals, WETH = 18 decimals). You must normalize by decimals when calculating USD values.

### Example: Calculate USD IL for a specific interval

```typescript
// 1. Query interval and pool manager info
const interval = await fetch('http://localhost:42069/graphql', {
  method: 'POST',
  body: JSON.stringify({
    query: `
      query {
        interval(id: "0x...-123-1234567890") {
          token0Delta
          token1Delta
          poolManager
        }
      }
    `
  })
});

const poolManagerInfo = await fetch('http://localhost:42069/graphql', {
  method: 'POST',
  body: JSON.stringify({
    query: `
      query {
        poolManagerInfo(id: "0x...") {
          token0
          token1
          token0Decimals
          token1Decimals
        }
      }
    `
  })
});

// 2. Fetch token prices (from Chainlink, Uniswap TWAP, etc.)
const price0 = await getTokenPrice(poolManagerInfo.token0); // e.g., $3000 for WETH
const price1 = await getTokenPrice(poolManagerInfo.token1); // e.g., $1 for USDC

// 3. Normalize by decimals and calculate USD IL
const normalizedDelta0 = Number(interval.token0Delta) / Math.pow(10, poolManagerInfo.token0Decimals);
const normalizedDelta1 = Number(interval.token1Delta) / Math.pow(10, poolManagerInfo.token1Decimals);

const usdIL = (normalizedDelta0 * price0) + (normalizedDelta1 * price1);

console.log(`IL Loss: $${usdIL.toFixed(2)}`);
```

### Example: WETH/USDC Pool

For a WETH/USDC pool on Base:
- WETH = 18 decimals
- USDC = 6 decimals

If `token0Delta = -1000000000000000000` (WETH, -1 token) and `token1Delta = 3000000000` (USDC, +3000 tokens):

```typescript
// WETH delta (18 decimals)
const wethDelta = -1000000000000000000n / 10n**18n; // -1 WETH
const wethUsdValue = -1 * 3000; // -$3000

// USDC delta (6 decimals)
const usdcDelta = 3000000000n / 10n**6n; // 3000 USDC
const usdcUsdValue = 3000 * 1; // $3000

// Total IL
const totalIL = -3000 + 3000; // $0 (balanced)
```

### Example: Hourly IL time-series

```typescript
// Query hourly aggregations for last 7 days
const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);

const hourlyData = await fetch('http://localhost:42069/graphql', {
  method: 'POST',
  body: JSON.stringify({
    query: `
      query {
        hourlyAggregations(
          where: {
            poolManager: "0x...",
            hourTimestamp_gte: ${sevenDaysAgo}
          }
          orderBy: "hourTimestamp"
        ) {
          hourTimestamp
          totalToken0Delta
          totalToken1Delta
          intervalCount
        }
      }
    `
  })
});

// Calculate USD IL for each hour
for (const hour of hourlyData) {
  const price0 = await getTokenPriceAtTimestamp(token0Address, hour.hourTimestamp);
  const price1 = await getTokenPriceAtTimestamp(token1Address, hour.hourTimestamp);

  const normalizedDelta0 = Number(hour.totalToken0Delta) / Math.pow(10, token0Decimals);
  const normalizedDelta1 = Number(hour.totalToken1Delta) / Math.pow(10, token1Decimals);

  const usdIL = (normalizedDelta0 * price0) + (normalizedDelta1 * price1);

  console.log(`${new Date(hour.hourTimestamp * 1000).toISOString()}: $${usdIL.toFixed(2)} IL`);
}
```

## 🔧 Factory Pattern Setup

This indexer uses Ponder's factory pattern to automatically discover and index pool managers as they're deployed.

### How it works:

1. **Factory emits `PoolManagerDeployed` event**
   - Contains: `protocol`, `pool`, `manager` (pool manager address)

2. **Ponder automatically starts indexing the new pool manager**
   - No need to manually add each pool manager to config
   - Events from all pool managers are tracked

3. **PoolManagerDeployed handler initializes metadata**
   - Fetches token addresses from pool manager
   - Fetches token decimals from token contracts
   - Stores in `pool_manager_info` table

### Adding support for more protocols:

Simply emit `PoolManagerDeployed` events from your factory with different protocol names. The indexer will automatically track them all.

## 🧪 Testing

### Edge Cases Handled

- ✅ First position creation (only LiquidityAdded)
- ✅ Rebalance (LiquidityRemoved → LiquidityAdded in same tx)
- ✅ IncreaseLiquidity (PositionSnapshot with before/after)
- ✅ DecreaseLiquidity partial (PositionSnapshot, liquidity remains)
- ✅ DecreaseLiquidity full (PositionSnapshot, zero liquidity after)
- ✅ Multiple pool managers (isolated by poolManager address)
- ✅ Negative deltas (IL losses)
- ✅ Different decimal tokens (6 vs 18)

## 📚 Resources

- [Ponder Docs](https://ponder.sh/docs)
- [GraphQL Query Language](https://graphql.org/learn/queries/)
- [Impermanent Loss Explained](https://uniswap.org/blog/impermanent-loss)
- [Factory Pattern in Ponder](https://ponder.sh/docs/indexing/factory-contracts)

## 🎯 Roadmap

- [ ] Add price oracle integration (Chainlink, Uniswap TWAP)
- [ ] Real-time IL alerts via webhooks
- [ ] APR/APY calculations
- [ ] USD value tracking in database
- [ ] Historical price data backfill
- [ ] Dashboard UI for IL visualization

## 📄 License

ISC
