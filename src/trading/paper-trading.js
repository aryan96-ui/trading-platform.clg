/**
 * Paper Trading Service
 *
 * The single owner of account, order, position and P&L state for the unified
 * ProTrader workspace.
 *
 * Design rules:
 *  - Every price comes from the Market Gateway. There is no second price
 *    source in this file, so a fill, a holding and the chart always agree.
 *  - Placing an order runs the real pre-trade risk check and the guardrail
 *    engine. Risky trades are *explained and can be overridden*, never
 *    silently blocked or silently allowed.
 *  - A filled entry opens a Trading Journal trade carrying the regime,
 *    strategy and risk at entry, and a close resolves it. That link is what
 *    lets post-trade learning, behavior analytics and the strategy x regime
 *    matrix reason about trades the user actually placed.
 *  - Excursions (MFE/MAE) are measured from real bars. When no bars cover the
 *    holding period they are reported as null, never estimated.
 */

const IndicatorEngine = require('../engine/indicator-engine');

const FILL_COMMISSION_RATE = 0.0005; // 0.05% per side, disclosed on every fill

let orderSeq = 0;
let positionSeq = 0;

class PaperTradingService {
    constructor({ gateway, instrumentMaster, journal, guardrails, preTradeRisk, positionSizing, regimeEngine, eventBus, computeExcursions } = {}) {
        this.gateway = gateway;
        this.instrumentMaster = instrumentMaster;
        this.journal = journal;
        this.guardrails = guardrails;
        this.preTradeRisk = preTradeRisk;
        this.positionSizing = positionSizing;
        this.regimeEngine = regimeEngine;
        this.eventBus = eventBus;
        this.computeExcursions = computeExcursions || null;
        this.startingBalance = 100000;
        this.accounts = new Map();
    }

    // ========================================
    // ACCOUNT
    // ========================================

    _account(email) {
        if (!this.accounts.has(email)) {
            this.accounts.set(email, {
                email,
                startingBalance: this.startingBalance,
                balance: this.startingBalance,
                orders: [],
                positions: new Map(),
                fills: [],
                realizedPnl: 0,
                feesPaid: 0,
                createdAt: new Date().toISOString()
            });
        }
        return this.accounts.get(email);
    }

    _instrument(symbol) {
        return this.instrumentMaster?.getBySymbol?.(symbol) || null;
    }

    /**
     * Live quote for pricing. Returns null when no provider can price the
     * symbol — callers must surface DATA UNAVAILABLE rather than invent one.
     */
    async _quote(symbol) {
        try {
            const inst = this._instrument(symbol);
            const q = await this.gateway.getQuote(symbol, inst?.exchange);
            if (!q || !isFinite(q.price) || q.price <= 0) return null;
            return q;
        } catch (e) {
            return null;
        }
    }

    async _markPrice(symbol) {
        const q = await this._quote(symbol);
        return q ? q.price : null;
    }

    // ========================================
    // PORTFOLIO SNAPSHOT (feeds the risk engines)
    // ========================================

    /**
     * Build the portfolio shape the risk/heat engines expect, with live
     * mark-to-market. Prices that cannot be sourced stay null.
     */
    async snapshot(email) {
        const acct = this._account(email);
        const positions = [];
        let marketValue = 0;
        let costBasis = 0;

        for (const p of acct.positions.values()) {
            const price = await this._markPrice(p.symbol);
            const value = price === null ? null : price * p.quantity;
            const cost = p.avgPrice * p.quantity;
            if (value !== null) marketValue += value;
            costBasis += cost;
            positions.push({
                ...this._publicPosition(p),
                currentPrice: price,
                marketValue: value,
                unrealizedPnl: price === null ? null : value - cost,
                unrealizedPnlPercent: price === null || cost === 0 ? null : ((value - cost) / cost) * 100,
                priceSource: price === null ? null : 'gateway'
            });
        }

        const equity = acct.balance + marketValue;
        return {
            email,
            balance: round(acct.balance),
            positions,
            holdings: positions.filter(p => p.quantity > 0),
            openOrders: acct.orders.filter(o => o.status === 'open').length,
            marketValue: round(marketValue),
            costBasis: round(costBasis),
            equity: round(equity),
            unrealizedPnl: round(marketValue - costBasis),
            realizedPnl: round(acct.realizedPnl),
            totalPnl: round(acct.realizedPnl + (marketValue - costBasis)),
            feesPaid: round(acct.feesPaid),
            returnPercent: round(((equity - acct.startingBalance) / acct.startingBalance) * 100),
            asOf: new Date().toISOString()
        };
    }

    _publicPosition(p) {
        return {
            id: p.id,
            symbol: p.symbol,
            exchange: p.exchange,
            assetType: p.assetType,
            sector: p.sector,
            quantity: p.quantity,
            avgPrice: round(p.avgPrice),
            stopLoss: p.stopLoss,
            target: p.target,
            strategy: p.strategy,
            openedAt: p.openedAt,
            feesPaid: round(p.feesPaid),
            journalTradeIds: p.journalTradeIds
        };
    }

    /**
     * Portfolio shape for PreTradeRiskCheck / PortfolioHeat / RiskTerminal.
     */
    async riskPortfolio(email) {
        const snap = await this.snapshot(email);
        const byAssetClass = {};
        const sectorExposure = {};
        for (const p of snap.positions) {
            if (p.marketValue === null) continue;
            const key = p.assetType || 'unknown';
            byAssetClass[key] = (byAssetClass[key] || 0) + p.marketValue;
            if (p.sector) sectorExposure[p.sector] = (sectorExposure[p.sector] || 0) + p.marketValue;
        }
        return {
            totalValue: snap.equity,
            cash: snap.balance,
            holdings: snap.positions.map(p => ({
                symbol: p.symbol,
                quantity: p.quantity,
                avgPrice: p.avgPrice,
                currentPrice: p.currentPrice,
                value: p.marketValue,
                sector: p.sector,
                assetType: p.assetType,
                stopLoss: p.stopLoss
            })),
            byAssetClass,
            sectorExposure,
            unrealizedPnl: snap.unrealizedPnl,
            realizedPnl: snap.realizedPnl,
            returnPercent: snap.returnPercent
        };
    }

    /**
     * Realised volatility as a fraction of price: ATR(14) / last close, from
     * the same indicator engine the screener and AI use. Returns null when
     * there are not enough bars, so the risk check falls back to its own
     * default rather than a number this service invented.
     */
    async _volatility(symbol) {
        try {
            const bars = await this.gateway.getHistory(symbol, undefined, '1D', 40) || [];
            if (bars.length < 20) return null;
            const atr = IndicatorEngine.atr(bars, 14);
            const last = bars[bars.length - 1].close;
            if (!isFinite(atr) || !isFinite(last) || last <= 0) return null;
            return atr / last;
        } catch (e) {
            return null;
        }
    }

    // ========================================
    // ORDERS
    // ========================================

    /**
     * Place a paper order.
     *
     * @param {object} req { email, symbol, side, quantity, orderType, limitPrice,
     *                       stopLoss, target, strategy, notes, acknowledgeGuardrails }
     */
    async placeOrder(req) {
        const email = req.email;
        const symbol = String(req.symbol || '').toUpperCase();
        const side = req.side === 'sell' ? 'sell' : 'buy';
        const quantity = Number(req.quantity);
        const orderType = req.orderType === 'limit' ? 'limit' : 'market';

        if (!email) return err('email is required');
        if (!symbol) return err('symbol is required');
        if (!isFinite(quantity) || quantity <= 0) return err('quantity must be a positive number');
        if (orderType === 'limit' && !(Number(req.limitPrice) > 0)) return err('limit orders require a positive limitPrice');

        const acct = this._account(email);
        const inst = this._instrument(symbol);
        const quote = await this._quote(symbol);
        if (!quote) {
            return {
                success: false,
                code: 'DATA_UNAVAILABLE',
                error: `No price available for ${symbol}. Order not placed — refusing to fill against an invented price.`
            };
        }

        const referencePrice = orderType === 'limit' ? Number(req.limitPrice) : quote.price;

        // ---- Guardrails: controlled friction, not a silent block ----
        const holdings = await this.snapshot(email);
        const todayRealized = await this._todayRealizedPnl(acct);
        const guardrailContext = {
            // Newest first: the guardrail streak check walks the array from the
            // front, so most-recent-first is what makes it mean "current streak".
            recentTrades: (this.journal?.getTrades?.(email) || []).slice().reverse().slice(0, 30),
            dayPnlPercent: holdings.equity > 0 ? (todayRealized / holdings.equity) * 100 : 0,
            accountValue: holdings.equity,
            portfolioValue: holdings.equity,
            cash: acct.balance,
            dailyTrades: this._todayTrades(acct).length,
            dailyPnl: todayRealized
        };
        const guardrailCheck = this.guardrails
            ? this.guardrails.checkTrade(email, {
                symbol, side, quantity,
                entryPrice: referencePrice,
                stopLoss: req.stopLoss ? Number(req.stopLoss) : null,
                value: quantity * referencePrice
            }, guardrailContext)
            : { passed: true, blocks: [], warnings: [] };

        if (guardrailCheck.blocks && guardrailCheck.blocks.length && !req.acknowledgeGuardrails) {
            return {
                success: false,
                code: 'GUARDRAIL_BLOCK',
                error: 'Guardrail check requires acknowledgement before this order can be placed.',
                data: {
                    warnings: guardrailCheck.blocks,
                    alerts: guardrailCheck.warnings || [],
                    reasonOptions: guardrailCheck.reasonOptions,
                    stage: 'pre-trade'
                }
            };
        }

        // ---- Pre-trade risk (advisory, always explained) ----
        const riskPortfolio = await this.riskPortfolio(email);
        const volatility = await this._volatility(symbol);
        const regimeRecord = this.regimeEngine?.getHistory?.()?.slice(-1)[0] || null;
        const risk = this.preTradeRisk
            ? this.preTradeRisk.runCheck({
                symbol, side, quantity,
                entryPrice: referencePrice,
                value: quantity * referencePrice,
                stopLoss: req.stopLoss ? Number(req.stopLoss) : null,
                target: req.target ? Number(req.target) : null,
                sector: inst?.sector || null,
                assetType: inst?.assetType || 'stock'
            }, riskPortfolio, {
                volatility: volatility === null ? undefined : volatility,
                volatilitySource: volatility === null ? null : 'ATR(14)/close from gateway bars',
                regime: regimeRecord ? { regime: regimeRecord.regime } : null
            })
            : null;

        // ---- Sell path needs the units ----
        if (side === 'sell') {
            const pos = acct.positions.get(symbol);
            const free = pos ? pos.quantity : 0;
            if (free < quantity) {
                return err(`Insufficient holdings: you hold ${free} ${symbol}, tried to sell ${quantity}`);
            }
        }

        const order = {
            id: `ord_${Date.now().toString(36)}_${(++orderSeq).toString(36)}`,
            email,
            symbol,
            exchange: inst?.exchange || quote.exchange || null,
            assetType: inst?.assetType || 'stock',
            sector: inst?.sector || null,
            side,
            quantity,
            orderType,
            limitPrice: orderType === 'limit' ? Number(req.limitPrice) : null,
            status: 'pending',
            filledQuantity: 0,
            avgFillPrice: null,
            fills: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            stopLoss: req.stopLoss ? Number(req.stopLoss) : null,
            target: req.target ? Number(req.target) : null,
            strategy: req.strategy || 'discretionary',
            notes: req.notes || '',
            guardrails: {
                checked: true,
                warnings: (guardrailCheck.blocks || []).concat(guardrailCheck.warnings || []),
                acknowledged: !!req.acknowledgeGuardrails,
                acknowledgedReason: req.guardrailReason || null
            },
            risk: risk ? { level: risk.overallLevel, summary: risk.summary, findings: risk.findings } : null,
            priceSource: quote.source,
            priceQuality: quote.quality || null,
            quoteAtPlacement: quote.price,
            rejectReason: null
        };

        // A guardrail override is recorded whether or not the trade proceeds.
        if (guardrailCheck.blocks?.length && req.acknowledgeGuardrails) {
            try {
                this.guardrails.confirmTrade(email, {
                    symbol, side, quantity, entryPrice: referencePrice,
                    stopLoss: req.stopLoss ? Number(req.stopLoss) : null,
                    value: quantity * referencePrice
                }, {
                    blockIds: guardrailCheck.blocks.map(b => b.type),
                    reason: req.guardrailReason || 'user override',
                    notes: req.notes || '',
                    context: guardrailContext
                });
            } catch (e) { /* override logging is best effort */ }
        }

        acct.orders.push(order);

        if (orderType === 'market' || this._crossesLimit(side, quote.price, order.limitPrice)) {
            await this._fill(order, quote);
        } else {
            order.status = 'open';
            this._emit('ORDER_OPENED', { order });
        }

        return {
            success: true,
            data: {
                order: this._publicOrder(order),
                account: await this.snapshot(email),
                risk,
                guardrail: { warnings: order.guardrails.warnings, acknowledged: order.guardrails.acknowledged }
            }
        };
    }

    _crossesLimit(side, price, limit) {
        if (!limit) return false;
        return side === 'buy' ? price <= limit : price >= limit;
    }

    async _fill(order, quote) {
        const acct = this._account(order.email);
        const price = quote.price;
        const gross = price * order.quantity;
        const fee = gross * FILL_COMMISSION_RATE;

        if (order.side === 'buy' && gross + fee > acct.balance) {
            order.status = 'rejected';
            order.rejectReason = `Insufficient balance: need ${round(gross + fee)}, have ${round(acct.balance)}`;
            order.updatedAt = new Date().toISOString();
            this._emit('ORDER_REJECTED', { order });
            return;
        }

        order.status = 'filled';
        order.filledQuantity = order.quantity;
        order.avgFillPrice = price;
        order.updatedAt = new Date().toISOString();
        order.fills.push({
            at: order.updatedAt,
            quantity: order.quantity,
            price,
            fee: round(fee),
            source: quote.source,
            quality: quote.quality || null
        });
        acct.fills.push({ ...order.fills[order.fills.length - 1], orderId: order.id, symbol: order.symbol, side: order.side });
        acct.feesPaid += fee;

        let pos = acct.positions.get(order.symbol);
        const regime = this.regimeEngine?.getHistory?.()?.slice(-1)[0] || null;

        if (order.side === 'buy') {
            acct.balance -= gross + fee;
            if (!pos) {
                pos = {
                    id: `pos_${Date.now().toString(36)}_${(++positionSeq).toString(36)}`,
                    symbol: order.symbol,
                    exchange: order.exchange,
                    assetType: order.assetType,
                    sector: order.sector,
                    quantity: 0,
                    avgPrice: 0,
                    stopLoss: order.stopLoss,
                    target: order.target,
                    strategy: order.strategy,
                    openedAt: order.updatedAt,
                    feesPaid: 0,
                    journalTradeIds: []
                };
                acct.positions.set(order.symbol, pos);
            }
            const newQty = pos.quantity + order.quantity;
            pos.avgPrice = ((pos.avgPrice * pos.quantity) + gross) / newQty;
            pos.quantity = newQty;
            pos.feesPaid += fee;
            if (order.stopLoss) pos.stopLoss = order.stopLoss;
            if (order.target) pos.target = order.target;

            // Link the fill to the intelligence layer: the journal trade carries
            // the regime, strategy and risk that were known at entry.
            try {
                const trade = this.journal.openTrade(order.email, {
                    symbol: order.symbol,
                    direction: 'long',
                    type: 'buy',
                    quantity: order.quantity,
                    entryPrice: price,
                    stopLoss: order.stopLoss,
                    target: order.target,
                    strategy: order.strategy,
                    sector: order.sector,
                    fees: round(fee),
                    notes: order.notes,
                    marketRegime: regime?.regime || null,
                    orderId: order.id
                });
                if (trade?.id) {
                    pos.journalTradeIds.push({ tradeId: trade.id, quantity: order.quantity, at: order.updatedAt });
                    order.journalTradeId = trade.id;
                }
            } catch (e) { /* journal linkage is best effort */ }
        } else {
            // Selling reduces (or closes) the position
            acct.balance += gross - fee;
            if (pos) {
                const sold = Math.min(pos.quantity, order.quantity);
                const entryCost = pos.avgPrice * sold;
                const realized = (price - pos.avgPrice) * sold - fee;
                acct.realizedPnl += realized;
                pos.quantity -= sold;
                pos.feesPaid += fee;

                // Measure the real excursion over the holding period before the
                // journal resolves the trade, so the review carries measured
                // MFE/MAE rather than a guess.
                let excursions = null;
                if (this.computeExcursions) {
                    try {
                        excursions = await this.computeExcursions(this.gateway, order.symbol, {
                            openedAt: pos.openedAt,
                            closedAt: order.updatedAt,
                            entryPrice: pos.avgPrice,
                            direction: 'long'
                        });
                    } catch (e) { excursions = null; }
                }

                // Resolve the matching journal trade(s) so post-trade learning runs.
                // Only the units actually sold are resolved; a scale-out leaves
                // the remainder open in the journal.
                let remaining = sold;
                pos.journalTradeIds = (pos.journalTradeIds || []).filter(link => {
                    if (remaining <= 0) return true;
                    const take = Math.min(link.quantity, remaining);
                    remaining -= take;
                    try {
                        const closed = this.journal.closeTrade(order.email, link.tradeId, price, {
                            regime,
                            accountValue: acct.balance + pos.quantity * price,
                            excursions,
                            quantity: take
                        });
                        if (closed) order.closedTrades = (order.closedTrades || []).concat(closed.id);
                    } catch (e) { /* best effort */ }
                    if (take < link.quantity) {
                        link.quantity -= take;
                        return true;
                    }
                    return false;
                });

                if (pos.quantity <= 0) acct.positions.delete(order.symbol);
                order.realizedPnl = round(realized);
                order.entryPrice = round(pos.avgPrice);
                order.costBasis = round(entryCost);
            } else {
                order.status = 'rejected';
                order.rejectReason = `No open position in ${order.symbol}`;
                order.updatedAt = new Date().toISOString();
                this._emit('ORDER_REJECTED', { order });
                return;
            }
        }

        this._emit('ORDER_FILLED', { order, price, regime: regime?.regime || null });
    }

    /**
     * Evaluate resting limit orders against current quotes.
     */
    async tryFillOpenOrders(email) {
        const acct = email ? this._account(email) : null;
        const accounts = acct ? [acct] : [...this.accounts.values()];
        const filled = [];

        for (const a of accounts) {
            for (const order of a.orders) {
                if (order.status !== 'open') continue;
                const quote = await this._quote(order.symbol);
                if (!quote) continue;
                if (this._crossesLimit(order.side, quote.price, order.limitPrice)) {
                    await this._fill(order, quote);
                    filled.push(this._publicOrder(order));
                }
            }
        }
        return filled;
    }

    cancelOrder(email, orderId) {
        const acct = this._account(email);
        const order = acct.orders.find(o => o.id === orderId);
        if (!order) return err('Order not found');
        if (order.status !== 'open') return err(`Cannot cancel an order that is ${order.status}`);
        order.status = 'cancelled';
        order.updatedAt = new Date().toISOString();
        this._emit('ORDER_CANCELLED', { order });
        return { success: true, data: this._publicOrder(order) };
    }

    /**
     * Close (part of) a position at the live quote.
     */
    async closePosition(email, symbol, quantity, reason = 'manual') {
        symbol = String(symbol || '').toUpperCase();
        const pos = this._account(email).positions.get(symbol);
        if (!pos) return err(`No open position in ${symbol}`);
        const qty = quantity ? Number(quantity) : pos.quantity;
        if (!isFinite(qty) || qty <= 0) return err('quantity must be positive');
        if (qty > pos.quantity) return err(`You hold ${pos.quantity} ${symbol}`);

        const res = await this.placeOrder({
            email, symbol, side: 'sell', quantity: qty, orderType: 'market',
            notes: `position close (${reason})`
        });
        if (res.success) res.data.closedPosition = true;
        return res;
    }

    /**
     * Update the protective stop on an open position. Repeated stop moves are
     * a behavior the guardrail engine watches, so every move is recorded.
     */
    async updateStop(email, symbol, stopLoss) {
        symbol = String(symbol || '').toUpperCase();
        const acct = this._account(email);
        const pos = acct.positions.get(symbol);
        if (!pos) return err(`No open position in ${symbol}`);
        const stop = Number(stopLoss);
        if (!isFinite(stop) || stop <= 0) return err('stopLoss must be a positive number');

        const previous = pos.stopLoss;
        pos.stopLoss = stop;
        (pos.stopHistory = pos.stopHistory || []).push({
            at: new Date().toISOString(), from: previous, to: stop
        });
        return { success: true, data: { symbol, previousStop: previous, stopLoss: stop, moves: pos.stopHistory.length } };
    }

    // ========================================
    // READS
    // ========================================

    _publicOrder(o) {
        return {
            id: o.id, symbol: o.symbol, side: o.side, quantity: o.quantity,
            orderType: o.orderType, limitPrice: o.limitPrice, status: o.status,
            filledQuantity: o.filledQuantity, avgFillPrice: o.avgFillPrice,
            stopLoss: o.stopLoss, target: o.target, strategy: o.strategy,
            assetType: o.assetType, exchange: o.exchange, sector: o.sector,
            createdAt: o.createdAt, updatedAt: o.updatedAt,
            priceSource: o.priceSource, priceQuality: o.priceQuality,
            quoteAtPlacement: o.quoteAtPlacement, rejectReason: o.rejectReason,
            realizedPnl: o.realizedPnl ?? null, notes: o.notes,
            guardrails: o.guardrails, riskLevel: o.risk?.level || null,
            value: o.avgFillPrice ? round(o.avgFillPrice * o.quantity) : round((o.limitPrice || o.quoteAtPlacement || 0) * o.quantity)
        };
    }

    getOrders(email, { status, symbol, limit = 100 } = {}) {
        let orders = this._account(email).orders.slice().reverse();
        if (status) orders = orders.filter(o => o.status === status);
        if (symbol) orders = orders.filter(o => o.symbol === String(symbol).toUpperCase());
        return { orders: orders.slice(0, limit).map(o => this._publicOrder(o)), total: orders.length };
    }

    getFills(email, { limit = 100, symbol } = {}) {
        let fills = this._account(email).fills.slice().reverse();
        if (symbol) fills = fills.filter(f => f.symbol === String(symbol).toUpperCase());
        return { fills: fills.slice(0, limit), total: fills.length };
    }

    /**
     * P&L breakdown: realized, unrealized, daily and per symbol.
     */
    async getPnl(email) {
        const acct = this._account(email);
        const snap = await this.snapshot(email);
        const bySymbol = {};

        for (const f of acct.fills) {
            bySymbol[f.symbol] = bySymbol[f.symbol] || { symbol: f.symbol, bought: 0, sold: 0, fees: 0, realized: 0 };
            bySymbol[f.symbol].fees += f.fee;
            if (f.side === 'buy') bySymbol[f.symbol].bought += f.quantity * f.price;
            else bySymbol[f.symbol].sold += f.quantity * f.price;
        }
        for (const o of acct.orders) {
            if (o.realizedPnl != null && bySymbol[o.symbol]) bySymbol[o.symbol].realized += o.realizedPnl;
        }
        for (const p of snap.positions) {
            bySymbol[p.symbol] = bySymbol[p.symbol] || { symbol: p.symbol, bought: 0, sold: 0, fees: 0, realized: 0 };
            bySymbol[p.symbol].unrealized = p.unrealizedPnl;
            bySymbol[p.symbol].openQuantity = p.quantity;
        }

        return {
            equity: snap.equity,
            balance: snap.balance,
            realizedPnl: snap.realizedPnl,
            unrealizedPnl: snap.unrealizedPnl,
            totalPnl: snap.totalPnl,
            returnPercent: snap.returnPercent,
            feesPaid: snap.feesPaid,
            startingBalance: acct.startingBalance,
            daily: this._dailyPnl(acct),
            bySymbol: Object.values(bySymbol).map(s => ({
                ...s, bought: round(s.bought), sold: round(s.sold), fees: round(s.fees), realized: round(s.realized),
                unrealized: s.unrealized == null ? null : round(s.unrealized)
            })),
            asOf: new Date().toISOString()
        };
    }

    _dailyPnl(acct) {
        const days = {};
        for (const f of acct.fills) {
            const d = f.at.slice(0, 10);
            days[d] = days[d] || { date: d, cashFlow: 0, fees: 0 };
            days[d].cashFlow += (f.side === 'buy' ? -1 : 1) * f.quantity * f.price;
            days[d].fees += f.fee;
        }
        const out = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
        let equity = acct.startingBalance;
        return out.map(d => {
            equity += d.cashFlow - d.fees;
            return { date: d.date, cashFlow: round(d.cashFlow), fees: round(d.fees), equity: round(equity) };
        });
    }

    _todayTrades(acct) {
        const today = new Date().toISOString().slice(0, 10);
        return acct.orders.filter(o => o.status === 'filled' && o.updatedAt.slice(0, 10) === today);
    }

    async _todayRealizedPnl(acct) {
        const today = new Date().toISOString().slice(0, 10);
        return acct.orders
            .filter(o => o.realizedPnl != null && o.updatedAt.slice(0, 10) === today)
            .reduce((s, o) => s + o.realizedPnl, 0);
    }

    /**
     * Exposure / concentration analytics for the Portfolio view.
     */
    async getAnalytics(email) {
        const snap = await this.snapshot(email);
        const bySector = {};
        const byAssetClass = {};
        let largest = null;

        for (const p of snap.positions) {
            if (p.marketValue === null) continue;
            const sector = p.sector || 'unclassified';
            bySector[sector] = (bySector[sector] || 0) + p.marketValue;
            byAssetClass[p.assetType || 'unknown'] = (byAssetClass[p.assetType || 'unknown'] || 0) + p.marketValue;
            if (!largest || p.marketValue > largest.marketValue) largest = p;
        }

        const gross = snap.marketValue;
        const equity = snap.equity || 1;
        // Herfindahl index on position weights: 1 = fully concentrated.
        const hhi = snap.positions.reduce((s, p) => {
            if (p.marketValue === null) return s;
            const w = p.marketValue / (gross || 1);
            return s + w * w;
        }, 0);

        const closed = this.journal?.getTrades?.(email) || [];
        const stats = this.journal?.getPerformanceStats?.(email) || null;

        return {
            exposure: {
                gross: round(gross),
                net: round(gross),
                cash: snap.balance,
                equity: snap.equity,
                investedPercent: round((gross / equity) * 100),
                openPositions: snap.positions.length
            },
            bySector: Object.entries(bySector).map(([sector, value]) => ({
                sector, value: round(value), percent: round((value / equity) * 100)
            })).sort((a, b) => b.value - a.value),
            byAssetClass: Object.entries(byAssetClass).map(([assetType, value]) => ({
                assetType, value: round(value), percent: round((value / equity) * 100)
            })),
            concentration: {
                hhi: round(hhi, 4),
                largestPosition: largest ? { symbol: largest.symbol, percent: round((largest.marketValue / equity) * 100) } : null,
                level: hhi > 0.5 ? 'HIGH' : hhi > 0.25 ? 'MODERATE' : 'LOW'
            },
            performance: {
                realizedPnl: snap.realizedPnl,
                unrealizedPnl: snap.unrealizedPnl,
                returnPercent: snap.returnPercent,
                closedTrades: closed.length,
                winRate: stats?.winRate ?? null,
                expectancy: stats?.expectancy ?? null
            },
            asOf: new Date().toISOString()
        };
    }

    /**
     * Pre-trade intelligence for a proposed order: portfolio risk plus
     * guardrail warnings, evaluated against the server's own account state.
     * The client sends only the trade, so the portfolio shape keeps one owner.
     */
    async preCheck(email, trade = {}) {
        const symbol = String(trade.symbol || '').toUpperCase();
        const quantity = Number(trade.quantity);
        const referencePrice = Number(trade.entryPrice) || await this._markPrice(symbol);

        if (!symbol || !isFinite(quantity) || quantity <= 0) {
            return err('symbol and a positive quantity are required');
        }
        if (!isFinite(referencePrice) || referencePrice <= 0) {
            return { success: false, code: 'DATA_UNAVAILABLE', error: `No price available for ${symbol}` };
        }

        const inst = this._instrument(symbol);
        const holdings = await this.snapshot(email);
        const acct = this._account(email);
        const tradeShape = {
            symbol,
            side: trade.side === 'sell' ? 'sell' : 'buy',
            quantity,
            entryPrice: referencePrice,
            value: quantity * referencePrice,
            stopLoss: trade.stopLoss ? Number(trade.stopLoss) : null,
            target: trade.target ? Number(trade.target) : null,
            sector: inst?.sector || trade.sector || null,
            assetType: inst?.assetType || trade.assetType || 'stock'
        };

        const todayRealized = await this._todayRealizedPnl(acct);
        const guardrailContext = {
            recentTrades: (this.journal?.getTrades?.(email) || []).slice().reverse().slice(0, 30),
            dayPnlPercent: holdings.equity > 0 ? (todayRealized / holdings.equity) * 100 : 0,
            accountValue: holdings.equity,
            portfolioValue: holdings.equity,
            cash: acct.balance
        };

        const volatility = await this._volatility(symbol);
        const regimeRecord = this.regimeEngine?.getHistory?.()?.slice(-1)[0] || null;

        return {
            success: true,
            data: {
                trade: tradeShape,
                risk: this.preTradeRisk
                    ? this.preTradeRisk.runCheck(tradeShape, await this.riskPortfolio(email), {
                        volatility: volatility === null ? undefined : volatility,
                        volatilitySource: volatility === null ? null : 'ATR(14)/close from gateway bars',
                        regime: regimeRecord ? { regime: regimeRecord.regime } : null
                    })
                    : null,
                guardrail: this.guardrails ? this.guardrails.checkTrade(email, tradeShape, guardrailContext) : null,
                account: holdings
            }
        };
    }

    _emit(type, payload) {
        if (!this.eventBus) return;
        try {
            // emitEvent wraps the payload in the bus's event envelope; emit sends
            // it raw. Prefer the envelope so subscribers get { type, payload }.
            if (typeof this.eventBus.emitEvent === 'function') this.eventBus.emitEvent(type, payload);
            else if (typeof this.eventBus.emit === 'function') this.eventBus.emit(type, payload);
        } catch (e) { /* events are best effort */ }
    }
}

function round(n, dp = 2) {
    if (n === null || n === undefined || isNaN(n)) return null;
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
}

function err(message) {
    return { success: false, error: message };
}

module.exports = PaperTradingService;
module.exports.FILL_COMMISSION_RATE = FILL_COMMISSION_RATE;
