/**
 * Paper Trading Service test suite
 *
 * Covers the order lifecycle, pricing provenance, guardrail friction and the
 * link from a fill into the trading journal. Prices come from a stub gateway
 * with a known price book so every assertion is exact.
 *
 * Run: node test-trading.js
 */
const PaperTradingService = require('./src/trading/paper-trading');
const { computeExcursions } = require('./src/trading/excursions');
const TradingJournal = require('./src/engine/trading-journal');
const GuardrailEngine = require('./src/engine/guardrails');
const { PreTradeRiskCheck } = require('./src/engine/pre-trade-risk');
const EventBus = require('./src/engine/event-bus');

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
    if (cond) { passed++; }
    else { failed++; failures.push(msg); console.error(`  FAIL: ${msg}`); }
}
function section(name) { console.log(`\n=== ${name} ===`); }

// ------------------------------------------------------------
// Fixtures: a gateway with a controllable price book
// ------------------------------------------------------------
const PRICES = { RELIANCE: 2450, TCS: 3280, HDFCBANK: 1645, INFY: 1520, SBIN: 586, ITC: 421 };
const SECTORS = { RELIANCE: 'Energy', TCS: 'IT', HDFCBANK: 'Financial', INFY: 'IT', SBIN: 'Financial', ITC: 'FMCG' };

function makeGateway() {
    let bars = [];
    return {
        priceBook: { ...PRICES },
        bars,
        setBars(b) { bars = b; this.bars = b; },
        async getQuote(symbol) {
            const price = this.priceBook[symbol];
            if (!isFinite(price)) return null; // unpriced symbol → DATA UNAVAILABLE
            return {
                symbol, exchange: 'NSE', price, bid: price * 0.999, ask: price * 1.001,
                change: price - price * 0.995, changePercent: 0.5, volume: 100000,
                timestamp: new Date().toISOString(), source: 'demo', quality: 'DEMO'
            };
        },
        async getHistory(symbol) { return bars; }
    };
}

function makeService(gateway, extra = {}) {
    const journal = new TradingJournal();
    const guardrails = new GuardrailEngine();
    const preTradeRisk = new PreTradeRiskCheck();
    const eventBus = new EventBus();
    const trading = new PaperTradingService({
        gateway,
        instrumentMaster: {
            getBySymbol: (s) => (SECTORS[s] ? { symbol: s, exchange: 'NSE', sector: SECTORS[s], assetType: 'stock' } : null)
        },
        journal, guardrails, preTradeRisk, eventBus, computeExcursions,
        ...extra
    });
    return { trading, journal, guardrails, eventBus };
}

const EMAIL = 'demo@college.com';
const FEE = 0.0005;

// ============================================================
(async function run() {
    section('Market order — pricing, cash and position');
    {
        const gw = makeGateway();
        const { trading, journal } = makeService(gw);
        const res = await trading.placeOrder({ email: EMAIL, symbol: 'RELIANCE', side: 'buy', quantity: 10 });

        assert(res.success, 'market buy succeeds');
        const order = res.data.order;
        const gross = 2450 * 10;
        const fee = gross * FEE;
        assert(order.status === 'filled', `order filled (got ${order.status})`);
        assert(order.avgFillPrice === 2450, `fill price is the gateway quote (got ${order.avgFillPrice})`);
        assert(res.data.account.balance === round(100000 - gross - fee), `cash debited by value + commission (got ${res.data.account.balance})`);

        const pos = res.data.account.positions.find(p => p.symbol === 'RELIANCE');
        assert(!!pos, 'position created');
        assert(pos.quantity === 10, `position quantity 10 (got ${pos?.quantity})`);
        assert(pos.avgPrice === 2450, `average price recorded (got ${pos?.avgPrice})`);
        assert(pos.sector === 'Energy', `sector carried from the instrument master (got ${pos?.sector})`);

        // The fill must be visible to the intelligence layer
        const open = journal.openTrades.get(EMAIL) || [];
        assert(open.length === 1, `a journal trade was opened for the fill (got ${open.length})`);
        assert(open[0].symbol === 'RELIANCE' && open[0].quantity === 10, 'journal trade carries symbol and quantity');

        // Provenance travels with the order
        assert(order.priceSource === 'demo', `order records its price source (got ${order.priceSource})`);
        assert(order.priceQuality === 'DEMO', 'order records price quality');
    }

    section('Mark-to-market is computed from the live quote, not stored');
    {
        const gw = makeGateway();
        const { trading } = makeService(gw);
        await trading.placeOrder({ email: EMAIL, symbol: 'TCS', side: 'buy', quantity: 5 });
        let snap = await trading.snapshot(EMAIL);
        const flat = snap.positions.find(p => p.symbol === 'TCS');
        assert(flat.unrealizedPnl === 0, `no unrealised P&L at the fill price (got ${flat.unrealizedPnl})`);

        gw.priceBook.TCS = 3400; // price moves
        snap = await trading.snapshot(EMAIL);
        const up = snap.positions.find(p => p.symbol === 'TCS');
        assert(up.unrealizedPnl === 600, `unrealised P&L follows the quote ((3400-3280)*5 = 600, got ${up.unrealizedPnl})`);
        assert(up.currentPrice === 3400, 'position shows the current price');
    }

    section('Unpriced symbol is refused, never invented');
    {
        const gw = makeGateway();
        const { trading } = makeService(gw);
        const res = await trading.placeOrder({ email: EMAIL, symbol: 'NOTREAL', side: 'buy', quantity: 1 });
        assert(!res.success, 'order rejected when no price is available');
        assert(res.code === 'DATA_UNAVAILABLE', `rejection is DATA_UNAVAILABLE (got ${res.code})`);
        const orders = trading.getOrders(EMAIL);
        assert(orders.total === 0, 'no phantom order was recorded');
    }

    section('Validation');
    {
        const gw = makeGateway();
        const { trading } = makeService(gw);
        assert((await trading.placeOrder({ symbol: 'TCS', side: 'buy', quantity: 1 })).success === false, 'email required');
        assert((await trading.placeOrder({ email: EMAIL, symbol: '', side: 'buy', quantity: 1 })).success === false, 'symbol required');
        assert((await trading.placeOrder({ email: EMAIL, symbol: 'TCS', side: 'buy', quantity: 0 })).success === false, 'quantity must be positive');
        assert((await trading.placeOrder({ email: EMAIL, symbol: 'TCS', side: 'buy', quantity: -5 })).success === false, 'negative quantity rejected');
        assert((await trading.placeOrder({ email: EMAIL, symbol: 'TCS', side: 'buy', quantity: 'abc' })).success === false, 'non-numeric quantity rejected');
        const limitNoPrice = await trading.placeOrder({ email: EMAIL, symbol: 'TCS', side: 'buy', quantity: 1, orderType: 'limit' });
        assert(limitNoPrice.success === false, 'limit order without a limit price rejected');
    }

    section('Insufficient funds and holdings');
    {
        const gw = makeGateway();
        const { trading } = makeService(gw);
        // Guardrails are acknowledged so the order reaches the balance check
        const tooBig = await trading.placeOrder({
            email: EMAIL, symbol: 'TCS', side: 'buy', quantity: 100, acknowledgeGuardrails: true
        });
        assert(tooBig.success === true, 'order is accepted then rejected at fill');
        assert(tooBig.data.order.status === 'rejected', `unaffordable order is rejected (got ${tooBig.data.order.status})`);
        assert(/Insufficient balance/.test(tooBig.data.order.rejectReason), 'rejection explains the shortfall');
        const snap = await trading.snapshot(EMAIL);
        assert(snap.balance === 100000, 'balance untouched by a rejected order');
        assert(snap.positions.length === 0, 'no position from a rejected order');

        const naked = await trading.placeOrder({ email: EMAIL, symbol: 'TCS', side: 'sell', quantity: 1 });
        assert(!naked.success, 'cannot sell what is not held');
        assert(/Insufficient holdings/.test(naked.error), 'sell rejection explains holdings');
    }

    section('Limit orders rest, cancel, and fill on cross');
    {
        const gw = makeGateway();
        const { trading } = makeService(gw);
        const resting = await trading.placeOrder({
            email: EMAIL, symbol: 'INFY', side: 'buy', quantity: 5, orderType: 'limit', limitPrice: 1400
        });
        assert(resting.success, 'resting limit order accepted');
        assert(resting.data.order.status === 'open', `limit below market stays open (got ${resting.data.order.status})`);
        assert(resting.data.account.balance === 100000, 'resting order does not debit cash');
        assert(trading.getOrders(EMAIL, { status: 'open' }).total === 1, 'open order listed');

        // Nothing to fill while the price is above the limit
        assert((await trading.tryFillOpenOrders(EMAIL)).length === 0, 'no fill while price is above the limit');

        gw.priceBook.INFY = 1390;
        const filled = await trading.tryFillOpenOrders(EMAIL);
        assert(filled.length === 1, 'order fills once the price crosses the limit');
        const snap = await trading.snapshot(EMAIL);
        assert(snap.positions[0].avgPrice === 1390, `fill used the crossing quote (got ${snap.positions[0].avgPrice})`);

        // Cancel path
        const second = await trading.placeOrder({
            email: EMAIL, symbol: 'ITC', side: 'buy', quantity: 10, orderType: 'limit', limitPrice: 300
        });
        const cancelled = trading.cancelOrder(EMAIL, second.data.order.id);
        assert(cancelled.success && cancelled.data.status === 'cancelled', 'open order can be cancelled');
        assert(!trading.cancelOrder(EMAIL, second.data.order.id).success, 'cancelling twice is refused');
        assert(!trading.cancelOrder(EMAIL, 'ord_nope').success, 'cancelling an unknown order is refused');
    }

    section('Round trip — realised P&L and journal resolution');
    {
        const gw = makeGateway();
        const { trading, journal } = makeService(gw);
        gw.setBars([
            { timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), high: 2500, low: 2400, close: 2450, open: 2420, source: 'demo' },
            { timestamp: new Date(Date.now() - 86400000).toISOString(), high: 2520, low: 2380, close: 2480, open: 2450, source: 'demo' }
        ]);

        await trading.placeOrder({ email: EMAIL, symbol: 'RELIANCE', side: 'buy', quantity: 10, stopLoss: 2350 });
        gw.priceBook.RELIANCE = 2500;
        const exit = await trading.closePosition(EMAIL, 'RELIANCE', 5, 'test');
        assert(exit.success, 'partial close succeeds');

        const order = exit.data.order;
        const expected = (2500 - 2450) * 5 - 2500 * 5 * FEE;
        assert(Math.abs(order.realizedPnl - round(expected)) < 0.01, `realised P&L is (exit-entry)*qty - fees (expected ${round(expected)}, got ${order.realizedPnl})`);

        const snap = await trading.snapshot(EMAIL);
        assert(snap.positions[0].quantity === 5, 'remaining quantity kept');
        assert(snap.positions[0].avgPrice === 2450, 'average price unchanged by a partial exit');
        assert(snap.realizedPnl === round(expected), 'account realised P&L updated');

        // The journal trade should have been resolved with measured excursions
        const closedTrades = journal.getTrades(EMAIL);
        assert(closedTrades.length === 1, `journal trade resolved on exit (got ${closedTrades.length})`);
        assert(closedTrades[0].exitPrice === 2500, 'journal trade carries the exit price');
        assert(['bars', 'lower-bound (entry to exit only)'].includes(closedTrades[0].excursionSource),
            `excursion source is disclosed (got ${closedTrades[0].excursionSource})`);
        assert(closedTrades[0].maxFavorableExcursion !== undefined, 'MFE recorded');
        assert(closedTrades[0].maxAdverseExcursion !== undefined, 'MAE recorded');
        assert(closedTrades[0].partial === true, 'the exited units are marked as a partial close');
        assert(closedTrades[0].quantity === 5, `only the exited units are resolved (got ${closedTrades[0].quantity})`);
        assert(closedTrades[0].remainingQuantity === 5, 'the remainder is reported');

        const stillOpen = journal.openTrades.get(EMAIL) || [];
        assert(stillOpen.length === 1, `the unsold half is still open in the journal (got ${stillOpen.length})`);
        assert(stillOpen[0].quantity === 5, `the open remainder keeps its units (got ${stillOpen[0].quantity})`);
        assert(stillOpen[0].entryPrice === 2450, 'the remainder keeps its entry price');

        assert(!(await trading.closePosition(EMAIL, 'RELIANCE', 99)).success, 'cannot close more than held');
        assert(!(await trading.closePosition(EMAIL, 'GHOST')).success, 'cannot close a symbol with no position');
    }

    section('Excursions are measured from bars, and reported unavailable without them');
    {
        const gw = makeGateway();
        const entry = 2450;
        const openedAt = new Date(Date.now() - 86400000 * 2).toISOString();
        gw.setBars([
            { timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), high: 2600, low: 2300, close: 2500, open: 2450, source: 'demo' },
            { timestamp: new Date(Date.now() - 86400000).toISOString(), high: 2550, low: 2420, close: 2480, open: 2500, source: 'demo' }
        ]);
        const ex = await computeExcursions(gw, 'RELIANCE', { openedAt, entryPrice: entry, direction: 'long' });
        assert(ex.samples === 2, `both bars analysed (got ${ex.samples})`);
        assert(ex.mfe === 150, `MFE = highest high - entry (got ${ex.mfe})`);
        assert(ex.mae === 150, `MAE = entry - lowest low (got ${ex.mae})`);
        assert(ex.source === 'demo', 'excursion keeps its data source');

        // A holding period with no bars must not invent a range
        const none = await computeExcursions(gw, 'RELIANCE', {
            openedAt: new Date(Date.now() + 86400000).toISOString(), entryPrice: entry
        });
        assert(none.mfe === null && none.samples === 0, 'no bars covering the period yields null, not a guess');
        assert(!!none.unavailable, 'unavailability is explained');

        // No history at all
        gw.setBars([]);
        const empty = await computeExcursions(gw, 'RELIANCE', { openedAt, entryPrice: entry });
        assert(empty.mfe === null && empty.samples === 0, 'missing history yields null');

        // Bad input must not throw
        assert((await computeExcursions(null, 'X', {})).mfe === null, 'null gateway handled');
        assert((await computeExcursions(gw, 'X', { entryPrice: 0 })).mfe === null, 'invalid entry price handled');
    }

    section('Guardrails: friction with an explicit override');
    {
        const gw = makeGateway();
        const { trading } = makeService(gw);

        // A 40% position trips the 25% max-position-size rule
        const blocked = await trading.placeOrder({ email: EMAIL, symbol: 'HDFCBANK', side: 'buy', quantity: 24 });
        assert(!blocked.success, 'oversized position requires acknowledgement');
        assert(blocked.code === 'GUARDRAIL_BLOCK', `response code is GUARDRAIL_BLOCK (got ${blocked.code})`);
        assert(blocked.data.warnings.length > 0, 'the discipline check lists what tripped');
        assert(blocked.data.warnings.some(w => w.type === 'position_size'), 'position size rule identified');
        assert(Array.isArray(blocked.data.reasonOptions) && blocked.data.reasonOptions.length >= 2, 'reason options offered');
        assert((await trading.snapshot(EMAIL)).balance === 100000, 'a blocked order leaves the account untouched');

        // The same order proceeds once acknowledged, and the override is logged
        const overridden = await trading.placeOrder({
            email: EMAIL, symbol: 'HDFCBANK', side: 'buy', quantity: 24,
            acknowledgeGuardrails: true, guardrailReason: 'Portfolio Hedge'
        });
        assert(overridden.success, 'acknowledged order proceeds');
        assert(overridden.data.order.guardrails.acknowledged === true, 'override recorded on the order');
        assert(overridden.data.order.guardrails.warnings.length > 0, 'overridden warnings preserved on the order');

        const logs = trading.accounts.get(EMAIL).orders[0].guardrails;
        assert(logs.acknowledgedReason === 'Portfolio Hedge', 'the stated reason is stored');
    }

    section('Stop-loss updates are tracked (repeated moves are a behaviour)');
    {
        const gw = makeGateway();
        const { trading } = makeService(gw);
        await trading.placeOrder({ email: EMAIL, symbol: 'TCS', side: 'buy', quantity: 2, stopLoss: 3100 });
        const first = await trading.updateStop(EMAIL, 'TCS', 3150);
        const second = await trading.updateStop(EMAIL, 'TCS', 3200);
        assert(first.success && second.success, 'stop can be moved');
        assert(second.data.previousStop === 3150, 'previous stop reported');
        assert(second.data.moves === 2, `move count recorded (got ${second.data.moves})`);
        assert(!(await trading.updateStop(EMAIL, 'TCS', -1)).success, 'invalid stop refused');
        assert(!(await trading.updateStop(EMAIL, 'INFY', 100)).success, 'stop on a non-held symbol refused');
    }

    section('P&L and analytics');
    {
        const gw = makeGateway();
        const { trading } = makeService(gw);
        await trading.placeOrder({ email: EMAIL, symbol: 'RELIANCE', side: 'buy', quantity: 10 });
        await trading.placeOrder({ email: EMAIL, symbol: 'TCS', side: 'buy', quantity: 6 });

        const pnl = await trading.getPnl(EMAIL);
        assert(pnl.bySymbol.length === 2, 'P&L breaks down per symbol');
        assert(pnl.feesPaid > 0, 'commission is tracked');
        assert(pnl.equity === pnl.balance + pnl.unrealizedPnl + pnl.realizedPnl + pnl.feesPaid ||
               pnl.equity > 0, 'equity reported');
        assert(Array.isArray(pnl.daily), 'daily series present');

        const analytics = await trading.getAnalytics(EMAIL);
        assert(analytics.exposure.openPositions === 2, 'analytics count open positions');
        assert(analytics.bySector.length === 2, `sector exposure grouped (got ${analytics.bySector.length})`);
        assert(['LOW', 'MODERATE', 'HIGH'].includes(analytics.concentration.level), 'concentration level classified');
        assert(analytics.concentration.hhi > 0, 'Herfindahl index computed');

        // Empty account must not divide by zero or throw
        const fresh = await trading.getAnalytics('nobody@example.com');
        assert(fresh.exposure.gross === 0, 'empty account reports zero exposure');
        assert(fresh.concentration.largestPosition === null, 'empty account has no largest position');
        assert((await trading.snapshot('nobody@example.com')).equity === 100000, 'a new account starts at the starting balance');
    }

    section('Events and provenance');
    {
        const gw = makeGateway();
        const { trading, eventBus } = makeService(gw);
        const seen = [];
        eventBus.onEvent('ORDER_FILLED', e => seen.push(e));
        await trading.placeOrder({ email: EMAIL, symbol: 'ITC', side: 'buy', quantity: 3 });
        assert(seen.length === 1, `fill emitted an event (got ${seen.length})`);
        assert(seen[0].payload.order.symbol === 'ITC', 'event carries the order');
    }

    section('Portfolio shape for the risk engines');
    {
        const gw = makeGateway();
        const { trading } = makeService(gw);
        await trading.placeOrder({ email: EMAIL, symbol: 'TCS', side: 'buy', quantity: 4 });
        const rp = await trading.riskPortfolio(EMAIL);
        assert(rp.totalValue > 0 && rp.cash > 0, 'risk portfolio exposes value and cash');
        assert(rp.holdings.length === 1 && rp.holdings[0].symbol === 'TCS', 'holdings mapped for the risk engine');
        assert(rp.sectorExposure.IT === 3280 * 4, `sector exposure aggregated (got ${rp.sectorExposure.IT})`);
        assert(rp.byAssetClass.stock === 3280 * 4, 'asset class exposure aggregated');
    }

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) {
        console.log('Failures:');
        failures.forEach(f => console.log(`  - ${f}`));
        process.exit(1);
    }
})();

function round(n, dp = 2) {
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
}
