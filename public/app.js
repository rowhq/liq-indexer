// Configuration
const GRAPHQL_URL = 'http://localhost:42069/graphql';
const GECKOTERMINAL_API_KEY = 'CG-greLVRibDvmonaVGngN46qCD'; // Pro API key
const GECKOTERMINAL_API_URL = 'https://pro-api.geckoterminal.com/api/v2';

// State
let currentTab = 'active';
let poolManagersData = [];
let chart = null;
let priceCache = {}; // { tokenAddress: { price: number, timestamp: number } }
const PRICE_CACHE_TTL = 60000; // Cache prices for 1 minute

// GraphQL Queries
async function fetchGraphQL(query) {
    try {
        const response = await fetch(GRAPHQL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        const result = await response.json();
        if (result.errors) {
            console.error('GraphQL errors:', result.errors);
            return null;
        }
        return result.data;
    } catch (error) {
        console.error('Fetch error:', error);
        return null;
    }
}

async function fetchPoolManagers() {
    const query = `
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
                createdAt
            }
        }
    `;
    const data = await fetchGraphQL(query);
    return data?.poolManagerInfos || [];
}

async function fetchActiveIntervals() {
    const query = `
        query {
            intervals(where: { isActive: true }, orderBy: "startTimestamp", orderDirection: "desc") {
                id
                poolManager
                tokenId
                startTimestamp
                startBlock
                token0In
                token1In
                tickLower
                tickUpper
                currentTick
                startTxHash
            }
        }
    `;
    const data = await fetchGraphQL(query);
    return data?.intervals || [];
}

async function fetchClosedIntervals(limit = 50) {
    const query = `
        query {
            intervals(
                where: { isActive: false }
                orderBy: "endTimestamp"
                orderDirection: "desc"
                limit: ${limit}
            ) {
                id
                poolManager
                tokenId
                startTimestamp
                endTimestamp
                token0In
                token1In
                token0Out
                token1Out
                token0Delta
                token1Delta
                tickLower
                tickUpper
                startTxHash
                endTxHash
            }
        }
    `;
    const data = await fetchGraphQL(query);
    return data?.intervals || [];
}

async function fetchHourlyAggregations(limit = 168) { // Last 7 days
    const query = `
        query {
            hourlyAggregations(
                orderBy: "hourTimestamp"
                orderDirection: "desc"
                limit: ${limit}
            ) {
                id
                poolManager
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
    `;
    const data = await fetchGraphQL(query);
    return data?.hourlyAggregations || [];
}

async function fetchRebalances(limit = 50) {
    const query = `
        query {
            rebalances(
                orderBy: "timestamp"
                orderDirection: "desc"
                limit: ${limit}
            ) {
                id
                poolManager
                oldTokenId
                newTokenId
                newTickLower
                newTickUpper
                timestamp
                txHash
            }
        }
    `;
    const data = await fetchGraphQL(query);
    return data?.rebalances || [];
}

// Utility Functions
function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(timestamp) {
    return new Date(timestamp * 1000).toLocaleString();
}

function formatAmount(amount, decimals) {
    const value = Number(amount) / Math.pow(10, decimals);
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6
    });
}

/**
 * Fetch token prices from GeckoTerminal Pro API in batch
 * Requires Pro API key with increased rate limits
 *
 * @param {string[]} tokenAddresses - Array of token addresses to fetch prices for
 * @returns {Promise<Object>} Object mapping token addresses to USD prices
 */
async function fetchTokenPrices(tokenAddresses) {
    if (!tokenAddresses || tokenAddresses.length === 0) {
        return {};
    }

    // Filter out already cached prices that are still fresh
    const now = Date.now();
    const needsFetch = tokenAddresses.filter(addr => {
        const cached = priceCache[addr.toLowerCase()];
        return !cached || (now - cached.timestamp) > PRICE_CACHE_TTL;
    });

    // If all prices are cached and fresh, return from cache
    if (needsFetch.length === 0) {
        updatePriceIndicator('cached');
        const prices = {};
        tokenAddresses.forEach(addr => {
            const cached = priceCache[addr.toLowerCase()];
            if (cached) {
                prices[addr.toLowerCase()] = cached.price;
            }
        });
        return prices;
    }

    // Update price indicator
    updatePriceIndicator('fetching');

    try {
        // GeckoTerminal Pro supports batch requests
        // Pro tier has higher limits than free tier
        const addressesParam = needsFetch.join(',');
        const url = `${GECKOTERMINAL_API_URL}/networks/base/tokens/multi/${addressesParam}`;

        console.log(`Fetching prices for ${needsFetch.length} tokens from GeckoTerminal Pro...`);

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'X-Api-Key': GECKOTERMINAL_API_KEY
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('GeckoTerminal Pro API error:', response.status, response.statusText, errorText);
            updatePriceIndicator('error');
            throw new Error(`GeckoTerminal API failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        updatePriceIndicator('live');

        // Update cache with fresh prices
        // GeckoTerminal returns data in { data: [ { id, attributes: { address, price_usd } } ] }
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach(token => {
                const addr = token.attributes.address.toLowerCase();
                const priceUsd = parseFloat(token.attributes.price_usd);

                if (priceUsd && !isNaN(priceUsd)) {
                    priceCache[addr] = {
                        price: priceUsd,
                        timestamp: now
                    };
                    console.log(`Price cached for ${addr}: $${priceUsd}`);
                }
            });
        }

        // Return all prices from cache (now includes fresh data)
        const prices = {};
        tokenAddresses.forEach(addr => {
            const cached = priceCache[addr.toLowerCase()];
            if (cached) {
                prices[addr.toLowerCase()] = cached.price;
            } else {
                console.warn(`No price found for token ${addr}`);
            }
        });

        return prices;
    } catch (error) {
        console.error('Error fetching token prices:', error);
        updatePriceIndicator('error');

        // Don't fallback - throw error to show something is wrong
        throw error;
    }
}

/**
 * Get all unique token addresses from pool managers
 */
function getAllTokenAddresses() {
    const addresses = new Set();
    poolManagersData.forEach(pm => {
        addresses.add(pm.token0.toLowerCase());
        addresses.add(pm.token1.toLowerCase());
    });
    return Array.from(addresses);
}

/**
 * Get token price from cache
 * Returns null if not available - no fallback defaults
 */
function getTokenPrice(tokenAddress) {
    const cached = priceCache[tokenAddress.toLowerCase()];
    if (cached && (Date.now() - cached.timestamp) < PRICE_CACHE_TTL) {
        return cached.price;
    }
    return null; // No price available
}

/**
 * Calculate USD value for a token amount
 * Returns null if price not available
 */
function calculateUsdValue(amount, decimals, tokenAddress) {
    const normalized = Number(amount) / Math.pow(10, decimals);
    const price = getTokenPrice(tokenAddress);
    if (price === null) {
        return null; // Price not available
    }
    return normalized * price;
}

function getPoolManagerInfo(address) {
    return poolManagersData.find(pm => pm.id.toLowerCase() === address.toLowerCase());
}

/**
 * Update price indicator in header
 */
function updatePriceIndicator(status) {
    const indicator = document.getElementById('priceIndicator');
    if (!indicator) return;

    const dot = indicator.querySelector('span:first-child');
    const text = indicator.querySelector('span:last-child');

    switch (status) {
        case 'fetching':
            dot.className = 'inline-block w-2 h-2 bg-yellow-500 rounded-full animate-pulse';
            text.textContent = 'Prices: Updating...';
            break;
        case 'live':
            dot.className = 'inline-block w-2 h-2 bg-green-500 rounded-full';
            text.textContent = 'Prices: Live';
            break;
        case 'error':
            dot.className = 'inline-block w-2 h-2 bg-red-500 rounded-full';
            text.textContent = 'Prices: Error';
            break;
        case 'cached':
            dot.className = 'inline-block w-2 h-2 bg-blue-500 rounded-full';
            text.textContent = 'Prices: Cached';
            break;
    }
}

// Render Functions
function renderPoolManagers(poolManagers) {
    poolManagersData = poolManagers;
    const container = document.getElementById('poolManagers');

    if (poolManagers.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-400">
                <p class="text-lg">No pool managers found</p>
                <p class="text-sm mt-2">Waiting for PoolManagerDeployed events...</p>
            </div>
        `;
        return;
    }

    container.innerHTML = poolManagers.map(pm => {
        const price0 = getTokenPrice(pm.token0);
        const price1 = getTokenPrice(pm.token1);

        const price0Display = price0 !== null
            ? `$${price0.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}`
            : '<span class="text-yellow-400">Fetching...</span>';

        const price1Display = price1 !== null
            ? `$${price1.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}`
            : '<span class="text-yellow-400">Fetching...</span>';

        return `
            <div class="card bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div class="flex items-center justify-between mb-4">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-900 text-blue-200">
                        ${pm.protocol}
                    </span>
                    <span class="text-xs text-gray-400">Token ID: ${pm.currentTokenId}</span>
                </div>
                <div class="space-y-2 text-sm">
                    <div>
                        <span class="text-gray-400">Manager:</span>
                        <a href="https://basescan.org/address/${pm.id}" target="_blank" class="text-blue-400 hover:text-blue-300 ml-2">
                            ${formatAddress(pm.id)}
                        </a>
                    </div>
                    <div>
                        <span class="text-gray-400">Pool:</span>
                        <a href="https://basescan.org/address/${pm.pool}" target="_blank" class="text-blue-400 hover:text-blue-300 ml-2">
                            ${formatAddress(pm.pool)}
                        </a>
                    </div>
                    <div class="pt-2 border-t border-gray-700">
                        <div class="flex items-center justify-between">
                            <span class="text-gray-400">Token0:</span>
                            <span class="text-gray-300">${formatAddress(pm.token0)} (${pm.token0Decimals}d)</span>
                        </div>
                        <div class="flex items-center justify-between text-xs text-gray-500">
                            <span>Price:</span>
                            <span class="text-green-400">${price0Display}</span>
                        </div>
                        <div class="flex items-center justify-between mt-2">
                            <span class="text-gray-400">Token1:</span>
                            <span class="text-gray-300">${formatAddress(pm.token1)} (${pm.token1Decimals}d)</span>
                        </div>
                        <div class="flex items-center justify-between text-xs text-gray-500">
                            <span>Price:</span>
                            <span class="text-green-400">${price1Display}</span>
                        </div>
                    </div>
                    <div class="text-xs text-gray-500 pt-2">
                        Created: ${formatTimestamp(pm.createdAt)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderActiveIntervals(intervals) {
    const container = document.getElementById('activeIntervals');

    if (intervals.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <p class="text-lg">No active intervals</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-700">
                    <thead class="bg-gray-900">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Pool Manager</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token ID</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token0 In</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token1 In</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Ticks</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Started</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">TX</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700">
                        ${intervals.map(interval => {
                            const pmInfo = getPoolManagerInfo(interval.poolManager);
                            return `
                                <tr class="hover:bg-gray-700">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-gray-300">${formatAddress(interval.poolManager)}</div>
                                        ${pmInfo ? `<div class="text-xs text-gray-500">${pmInfo.protocol}</div>` : ''}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${interval.tokenId}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        ${pmInfo ? formatAmount(interval.token0In, pmInfo.token0Decimals) : interval.token0In}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        ${pmInfo ? formatAmount(interval.token1In, pmInfo.token1Decimals) : interval.token1In}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                        [${interval.tickLower}, ${interval.tickUpper}]
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                        ${formatTimestamp(interval.startTimestamp)}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                                        <a href="https://basescan.org/tx/${interval.startTxHash}" target="_blank" class="text-blue-400 hover:text-blue-300">
                                            ${formatAddress(interval.startTxHash)}
                                        </a>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderClosedIntervals(intervals) {
    const container = document.getElementById('closedIntervals');

    if (intervals.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <p class="text-lg">No closed intervals</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-700">
                    <thead class="bg-gray-900">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Pool Manager</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token ID</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token0 Δ</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token1 Δ</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">USD IL</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Duration</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Ended</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700">
                        ${intervals.map(interval => {
                            const pmInfo = getPoolManagerInfo(interval.poolManager);
                            const delta0 = BigInt(interval.token0Delta || 0);
                            const delta1 = BigInt(interval.token1Delta || 0);

                            let usdIL = null;
                            let usdILDisplay = '<span class="text-yellow-400 text-xs">Price N/A</span>';

                            if (pmInfo) {
                                const usd0 = calculateUsdValue(delta0, pmInfo.token0Decimals, pmInfo.token0);
                                const usd1 = calculateUsdValue(delta1, pmInfo.token1Decimals, pmInfo.token1);

                                // Only calculate if both prices are available
                                if (usd0 !== null && usd1 !== null) {
                                    usdIL = usd0 + usd1;
                                    const isLoss = usdIL < 0;
                                    usdILDisplay = `
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isLoss ? 'badge-negative' : 'badge-positive'}">
                                            ${isLoss ? '-' : '+'}$${Math.abs(usdIL).toFixed(2)}
                                        </span>
                                    `;
                                }
                            }

                            const duration = interval.endTimestamp - interval.startTimestamp;
                            const hours = Math.floor(duration / 3600);
                            const mins = Math.floor((duration % 3600) / 60);

                            return `
                                <tr class="hover:bg-gray-700">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-gray-300">${formatAddress(interval.poolManager)}</div>
                                        ${pmInfo ? `<div class="text-xs text-gray-500">${pmInfo.protocol}</div>` : ''}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${interval.tokenId}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="text-sm ${delta0 < 0 ? 'text-red-400' : 'text-green-400'}">
                                            ${pmInfo ? formatAmount(delta0, pmInfo.token0Decimals) : interval.token0Delta}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="text-sm ${delta1 < 0 ? 'text-red-400' : 'text-green-400'}">
                                            ${pmInfo ? formatAmount(delta1, pmInfo.token1Decimals) : interval.token1Delta}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        ${usdILDisplay}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                        ${hours}h ${mins}m
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                        ${formatTimestamp(interval.endTimestamp)}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderHourlyAggregations(aggregations) {
    const container = document.getElementById('hourlyAggregations');

    if (aggregations.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <p class="text-lg">No hourly data available</p>
            </div>
        `;
        return;
    }

    // Render chart
    renderHourlyChart(aggregations);

    // Render table
    container.innerHTML = `
        <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-700">
                    <thead class="bg-gray-900">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Time</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Pool Manager</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token0 Δ</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token1 Δ</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Intervals</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">USD IL</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700">
                        ${aggregations.map(agg => {
                            const pmInfo = getPoolManagerInfo(agg.poolManager);
                            const delta0 = BigInt(agg.totalToken0Delta || 0);
                            const delta1 = BigInt(agg.totalToken1Delta || 0);

                            let usdIL = null;
                            let usdILDisplay = '<span class="text-yellow-400 text-xs">Price N/A</span>';

                            if (pmInfo) {
                                const usd0 = calculateUsdValue(delta0, pmInfo.token0Decimals, pmInfo.token0);
                                const usd1 = calculateUsdValue(delta1, pmInfo.token1Decimals, pmInfo.token1);

                                // Only calculate if both prices are available
                                if (usd0 !== null && usd1 !== null) {
                                    usdIL = usd0 + usd1;
                                    const isLoss = usdIL < 0;
                                    usdILDisplay = `
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isLoss ? 'badge-negative' : 'badge-positive'}">
                                            ${isLoss ? '-' : '+'}$${Math.abs(usdIL).toFixed(2)}
                                        </span>
                                    `;
                                }
                            }

                            return `
                                <tr class="hover:bg-gray-700">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        ${formatTimestamp(agg.hourTimestamp)}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-gray-300">${formatAddress(agg.poolManager)}</div>
                                        ${pmInfo ? `<div class="text-xs text-gray-500">${pmInfo.protocol}</div>` : ''}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="text-sm ${delta0 < 0 ? 'text-red-400' : 'text-green-400'}">
                                            ${pmInfo ? formatAmount(delta0, pmInfo.token0Decimals) : agg.totalToken0Delta}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="text-sm ${delta1 < 0 ? 'text-red-400' : 'text-green-400'}">
                                            ${pmInfo ? formatAmount(delta1, pmInfo.token1Decimals) : agg.totalToken1Delta}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                        ${agg.intervalCount}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        ${usdILDisplay}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderHourlyChart(aggregations) {
    const ctx = document.getElementById('hourlyChart');

    if (!ctx) return;

    // Prepare data (reverse to show chronologically)
    const sortedData = [...aggregations].reverse();
    const labels = sortedData.map(a => new Date(a.hourTimestamp * 1000).toLocaleDateString());
    const usdILData = sortedData.map(agg => {
        const pmInfo = getPoolManagerInfo(agg.poolManager);
        if (!pmInfo) return null;

        const usd0 = calculateUsdValue(BigInt(agg.totalToken0Delta), pmInfo.token0Decimals, pmInfo.token0);
        const usd1 = calculateUsdValue(BigInt(agg.totalToken1Delta), pmInfo.token1Decimals, pmInfo.token1);

        // Only include in chart if both prices available
        if (usd0 === null || usd1 === null) return null;

        return usd0 + usd1;
    });

    if (chart) {
        chart.destroy();
    }

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'USD IL per Hour',
                data: usdILData,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: { color: '#9ca3af' }
                }
            },
            scales: {
                y: {
                    ticks: { color: '#9ca3af' },
                    grid: { color: '#374151' }
                },
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { color: '#374151' }
                }
            }
        }
    });
}

function renderRebalances(rebalances) {
    const container = document.getElementById('rebalancesList');

    if (rebalances.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <p class="text-lg">No rebalances found</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-700">
                    <thead class="bg-gray-900">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Pool Manager</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Old Token ID</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">New Token ID</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">New Ticks</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Timestamp</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">TX</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700">
                        ${rebalances.map(rebalance => {
                            const pmInfo = getPoolManagerInfo(rebalance.poolManager);
                            return `
                                <tr class="hover:bg-gray-700">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-gray-300">${formatAddress(rebalance.poolManager)}</div>
                                        ${pmInfo ? `<div class="text-xs text-gray-500">${pmInfo.protocol}</div>` : ''}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${rebalance.oldTokenId}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-green-400">${rebalance.newTokenId}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                        [${rebalance.newTickLower}, ${rebalance.newTickUpper}]
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                        ${formatTimestamp(rebalance.timestamp)}
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                                        <a href="https://basescan.org/tx/${rebalance.txHash}" target="_blank" class="text-blue-400 hover:text-blue-300">
                                            ${formatAddress(rebalance.txHash)}
                                        </a>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Tab Management
function showTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('border-blue-500', 'text-blue-400');
        btn.classList.add('border-transparent', 'text-gray-500');
    });
    document.getElementById(`tab-${tabName}`).classList.remove('border-transparent', 'text-gray-500');
    document.getElementById(`tab-${tabName}`).classList.add('border-blue-500', 'text-blue-400');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    document.getElementById(`content-${tabName}`).classList.remove('hidden');

    // Load data if needed
    loadTabData(tabName);
}

async function loadTabData(tabName) {
    switch (tabName) {
        case 'active':
            const activeIntervals = await fetchActiveIntervals();
            renderActiveIntervals(activeIntervals);
            break;
        case 'closed':
            const closedIntervals = await fetchClosedIntervals();
            renderClosedIntervals(closedIntervals);
            break;
        case 'hourly':
            const hourlyData = await fetchHourlyAggregations();
            renderHourlyAggregations(hourlyData);
            break;
        case 'rebalances':
            const rebalances = await fetchRebalances();
            renderRebalances(rebalances);
            break;
    }
}

// Refresh all data
async function refreshAll() {
    try {
        const poolManagers = await fetchPoolManagers();
        renderPoolManagers(poolManagers);

        // Fetch token prices for all tokens
        if (poolManagersData.length > 0) {
            const tokenAddresses = getAllTokenAddresses();
            try {
                await fetchTokenPrices(tokenAddresses);
                console.log(`✓ Fetched prices for ${tokenAddresses.length} tokens from GeckoTerminal Pro`);
            } catch (priceError) {
                console.error('Failed to fetch prices:', priceError);
                // Don't stop rendering - show UI with "Price N/A" messages
            }
        }

        await loadTabData(currentTab);

        document.getElementById('lastUpdate').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error('Error refreshing data:', error);
        updatePriceIndicator('error');
    }
}

// Initialize
async function init() {
    showTab('active');
    await refreshAll();

    // Auto-refresh every 30 seconds
    setInterval(refreshAll, 30000);
}

// Start the app
init();
