/**
 * Real-Time Intelligence Event Bus
 * 
 * Internal pub/sub system. Events:
 * MARKET_UPDATE, PRICE_MOVE, VOLUME_SPIKE, REGIME_CHANGE, SIGNAL_CREATED,
 * SIGNAL_INVALIDATED, NEWS_EVENT, RISK_THRESHOLD, LOSS_STREAK, BEHAVIOR_ALERT,
 * TRADE_OPENED, TRADE_CLOSED, STRATEGY_ALERT, THESIS_CREATED, GUARDRAIL_TRIGGERED
 * 
 * These events feed AI, alerts, risk, behavior, portfolio and UI layers.
 * No module depends on another module's internals — only on events.
 */
const EventEmitter = require('events');

class EventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(100);
        this.history = [];
        this.maxHistory = 500;
        this.alertSubscriptions = new Map(); // eventType → Set<subscriberId>
    }

    /**
     * Publish an event
     */
    emitEvent(type, payload = {}) {
        const event = {
            id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            type,
            payload,
            timestamp: new Date().toISOString()
        };

        this.history.push(event);
        if (this.history.length > this.maxHistory) this.history.shift();
        this.emit(type, event);
        return event;
    }

    /**
     * Subscribe to an event type (with optional routing key)
     * @returns unsubscribe function
     */
    onEvent(type, handler, subscriberId = 'anon') {
        const wrapped = (event) => {
            try {
                handler(event);
            } catch (error) {
                console.error(`[event-bus] handler for ${type} failed:`, error.message);
            }
        };
        this.on(type, wrapped);

        if (!this.alertSubscriptions.has(type)) this.alertSubscriptions.set(type, new Set());
        this.alertSubscriptions.get(type).add(subscriberId);

        return () => this.removeListener(type, wrapped);
    }

    /**
     * Get recent events filtered by type
     */
    getEvents({ type, since, limit = 50 } = {}) {
        let events = this.history;
        if (type) events = events.filter(e => e.type === type);
        if (since) {
            const sinceTs = new Date(since).getTime();
            events = events.filter(e => new Date(e.timestamp).getTime() >= sinceTs);
        }
        return events.slice(-limit).reverse();
    }

    /**
     * Convenience wrappers
     */
    tradeOpened(trade) { return this.emitEvent('TRADE_OPENED', trade); }
    tradeClosed(trade) { return this.emitEvent('TRADE_CLOSED', trade); }
    regimeChanged(regime) { return this.emitEvent('REGIME_CHANGE', regime); }
    signalCreated(signal) { return this.emitEvent('SIGNAL_CREATED', signal); }
    behaviorAlert(alert) { return this.emitEvent('BEHAVIOR_ALERT', alert); }
    riskThreshold(risk) { return this.emitEvent('RISK_THRESHOLD', risk); }
    lossStreak(streak) { return this.emitEvent('LOSS_STREAK', streak); }
    guardrailTriggered(guardrail) { return this.emitEvent('GUARDRAIL_TRIGGERED', guardrail); }

    getStats() {
        const counts = {};
        for (const e of this.history) {
            counts[e.type] = (counts[e.type] || 0) + 1;
        }
        return { total: this.history.length, counts };
    }

    destroy() {
        this.removeAllListeners();
        this.history = [];
    }
}

module.exports = EventBus;