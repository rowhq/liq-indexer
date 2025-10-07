# Liq-Indexer

A [Ponder](https://ponder.sh/) indexer for tracking Impermanent Loss (IL) on liquidity manager positions.

## Features

- 📊 **Real-time IL tracking** - Calculate impermanent loss on every liquidity operation
- 📈 **Historical snapshots** - Track IL over time for each position
- 🔍 **Detailed analytics** - Position stats, fee collection, swap losses
- ⚡ **Fast indexing** - ~10x faster than The Graph
- 🔌 **GraphQL API** - Query your data with a built-in GraphQL interface

## Getting Started

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

1. **Update `.env`** with your contract address and start block:
   - RPC URL is pre-configured for Base network
   - Just add your contract deployment info in `ponder.config.ts`

2. **Update `ponder.config.ts`** with your contract addresses:
   ```typescript
   address: "0xYourContractAddress", // Replace with actual address
   startBlock: 12345678,              // Replace with deployment block
   ```

### Running

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run start
```

The GraphQL API will be available at `http://localhost:42069/graphql`

## Data Schema

### Position
Main position tracking with current state and IL metrics.

### ILSnapshot
Historical IL snapshots on each liquidity event (rebalance, increase, decrease).

### LiquidityOperation
Detailed records of all liquidity operations.

### Rebalance
Tracks position rebalances linking old and new positions.

### PositionStats
Aggregate statistics per position (total fees, rebalances, peak IL, etc.).

## Example Queries

### Get all active positions

```graphql
query {
  positions(where: { isActive: true }) {
    id
    liquidity
    impermanentLoss
    fees0Collected
    fees1Collected
  }
}
```

### Get IL history for a position

```graphql
query {
  iLSnapshots(
    where: { tokenId: "123" }
    orderBy: "timestamp"
    orderDirection: "desc"
  ) {
    id
    eventType
    impermanentLoss
    timestamp
  }
}
```

### Get position statistics

```graphql
query {
  positionStats(id: "123") {
    totalRebalances
    totalFeesCollected0
    totalFeesCollected1
    maxImpermanentLoss
    totalSwapLoss
  }
}
```

## Tracked Events

- `LiquidityAdded` - When liquidity is added to a position
- `LiquidityRemoved` - When liquidity is removed (also tracks fees)
- `PositionRebalanced` - When a position is rebalanced to new ticks
- `SwapExecuted` - Swap operations and associated losses

## IL Calculation

Currently uses a simplified ratio-based calculation:

```typescript
IL = (currentValue - initialValue) / initialValue * 10000
```

**Note:** For production, integrate with price oracles (Chainlink, Uniswap TWAP, etc.) to get accurate USD values.

## Development

```bash
# Generate types
npm run codegen

# Run in dev mode
npm run dev
```

## Deployment

See [Ponder deployment docs](https://ponder.sh/docs/production/deploy) for production deployment options.

Common platforms:
- Railway
- Render
- Fly.io
- Self-hosted with Docker

## TODO

- [ ] Integrate price oracles for accurate IL calculation
- [ ] Add USD value tracking
- [ ] Add APR/APY calculations
- [ ] Add support for multiple pool managers
- [ ] Add webhook notifications for IL thresholds
- [ ] Add historical price data backfill

## Resources

- [Ponder Docs](https://ponder.sh/docs)
- [GraphQL Query Language](https://graphql.org/learn/queries/)
- [Impermanent Loss Explained](https://uniswap.org/blog/impermanent-loss)

## License

ISC
