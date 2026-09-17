/**
 * ProTrader — core/state
 *
 * The single owner of client state. Views read from here and never own their
 * own copy of market or account data.
 */
const state = {
    // ---- market context ----
    assetType: 'stock',
    selectedSymbol: null,
    instruments: [],
    quotes: {},
    view: 'dashboard',
    filters: [{ field: 'sector', operator: '=', value: 'IT' }],
    tape: { paused: false, anomaliesOnly: false, largeOnly: false, entries: [] },

    // ---- paper trading account (server-owned; mirrored here for rendering) ----
    email: 'demo@college.com',
    account: null,      // { balance, equity, positions[], marketValue, ... }
    analytics: null,    // exposure + concentration
    pnl: null,          // realised / unrealised / daily
    orders: [],
    fills: [],
    accountError: null,

    // ---- chrome ----
    dock: { tab: 'openOrders', collapsed: false },
    rightPane: 'aiPane',
    chart: {
        type: 'candles',       // candles | line | area
        interval: '1D',
        overlays: { ema20: true, ema50: true, bb: false },
        sub: 'volume',         // volume | rsi | macd
        drawing: false,
        lines: []
    },
    widgets: {}                // widget id → false when collapsed
};
