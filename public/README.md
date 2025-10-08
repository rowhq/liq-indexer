# IL Tracker Dashboard

A real-time dashboard for visualizing interval-based impermanent loss tracking across all pool managers.

## Features

- **Pool Manager Overview**: All discovered pool managers with token information
- **Active Intervals**: Monitor currently open liquidity positions in real-time
- **Closed Intervals**: Analyze completed intervals with IL deltas and USD calculations
- **Hourly Aggregations**: Time-series charts and tables showing IL trends over time
- **Rebalance History**: Track position rebalances and continuity
- **Auto-refresh**: Dashboard updates every 30 seconds

## Running the Dashboard

1. **Start the Ponder indexer** (in the root directory):
   ```bash
   npm run dev
   ```

2. **Start the frontend server** (in a separate terminal):
   ```bash
   npm run frontend
   ```

3. **Open in browser**:
   - Navigate to `http://localhost:8000`
   - The dashboard will automatically connect to the GraphQL API at `http://localhost:42069/graphql`

## Real-time Token Prices (GeckoTerminal Pro Integration)

The dashboard automatically fetches real-time token prices from **GeckoTerminal Pro API**:

### How it Works

1. **Auto-discovery**: Dashboard detects all unique tokens from pool managers
2. **Batch fetching**: Single API call fetches prices for all tokens with Pro authentication
3. **Smart caching**: Prices cached for 1 minute to reduce API calls
4. **No fallbacks**: Shows "Price N/A" if pricing fails (ensures data accuracy)
5. **Pro API key**: Uses paid GeckoTerminal Pro with increased rate limits

### Features

- ✅ Live DEX prices displayed on Pool Manager cards
- ✅ Accurate USD IL calculations in Closed Intervals
- ✅ Real-time USD values in Hourly Aggregations
- ✅ Automatic refresh every 30 seconds
- ✅ Error handling (no silent fallbacks)
- ✅ Visual price indicator in header (Live/Cached/Error/Updating status)
- ✅ Detailed logging in browser console

### API Configuration

The dashboard uses GeckoTerminal Pro API configured in `app.js`:

```javascript
const GECKOTERMINAL_API_KEY = 'CG-greLVRibDvmonaVGngN46qCD'; // Pro API key
const GECKOTERMINAL_API_URL = 'https://pro-api.geckoterminal.com/api/v2';
const PRICE_CACHE_TTL = 60000; // Cache for 1 minute
```

### API Endpoint

GeckoTerminal Pro batch endpoint:
```
GET /networks/base/tokens/multi/{addresses}
Headers: X-Api-Key: YOUR_API_KEY
```

Example:
```javascript
// Fetch prices for multiple tokens on Base with Pro API
const url = `https://pro-api.geckoterminal.com/api/v2/networks/base/tokens/multi/0x4200...,0x8335...`;

const response = await fetch(url, {
    headers: {
        'Accept': 'application/json',
        'X-Api-Key': GECKOTERMINAL_API_KEY
    }
});
```

Response format:
```json
{
  "data": [
    {
      "id": "base_0x4200...",
      "attributes": {
        "address": "0x4200...",
        "name": "Wrapped Ether",
        "symbol": "WETH",
        "price_usd": "3000.45"
      }
    }
  ]
}
```

### Why GeckoTerminal Pro?

- **DEX-based pricing**: Gets prices directly from on-chain DEXes (Uniswap, Aerodrome, etc.)
- **More accurate for DeFi**: Better reflects actual trading prices vs CEX aggregators
- **Pro tier benefits**: Higher rate limits for production use
- **Batch support**: Efficient multi-token queries
- **Real-time**: Live prices from on-chain data
- **Reliable**: No silent fallbacks ensures data integrity

### Price Display Behavior

- **"Fetching..."**: Yellow text shown while prices are being fetched
- **"Price N/A"**: Yellow text shown if price unavailable (no default fallback)
- **Live price**: Green text with actual USD price from API
- **Console logging**: Detailed price fetch logs in browser console

### Using Your Own API Key

To use your own GeckoTerminal Pro API key:

1. Get a Pro API key from [GeckoTerminal](https://www.geckoterminal.com/)
2. Update `GECKOTERMINAL_API_KEY` in `app.js`

### Alternative Price Sources

You can also integrate other price sources by modifying `fetchTokenPrices()`:
- **Chainlink Price Feeds**: On-chain oracle prices
- **Uniswap TWAP**: Time-weighted average prices
- **1inch Price API**: Aggregated DEX prices
- **CoinGecko Pro**: CEX + DEX aggregated prices

## Tech Stack

- **Vanilla JavaScript**: No framework dependencies, just modern JS
- **Tailwind CSS**: Utility-first CSS via CDN
- **Chart.js**: Beautiful, responsive charts for time-series data
- **GraphQL**: Queries to Ponder's built-in GraphQL API

## Dashboard Views

### Pool Managers
Shows all discovered pool managers with:
- Protocol name (aerodrome, blackhole, etc.)
- Pool and manager addresses
- Token addresses and decimals
- Current position token ID

### Active Intervals
Displays all currently open intervals with:
- Token amounts deposited (IN)
- Tick ranges
- Start timestamps
- Transaction links

### Closed Intervals
Shows completed intervals with:
- Token deltas (OUT - IN)
- USD IL calculations
- Duration
- Color-coded losses (red) and gains (green)

### Hourly Aggregations
Time-series view with:
- Line chart showing USD IL over time
- Table with hourly rollups
- Interval counts per hour
- Total token deltas

### Rebalances
History of position rebalances:
- Old and new token IDs
- New tick ranges
- Timestamps and transaction links

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

ISC
