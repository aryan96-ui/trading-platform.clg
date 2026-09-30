// services/exportService.js - Multi-Format Report & Portfolio Exporter
class ExportService {
    // Generate CSV for Portfolio
    generatePortfolioCSV(user, currentPrices) {
        const portfolio = user.portfolio || {};
        const lines = [
            'ProTrader Portfolio Valuation & Holdings Report',
            `Generated: ${new Date().toISOString()}`,
            `Account: ${user.email}`,
            `Cash Balance: ₹${(user.balance || 0).toFixed(2)}`,
            '',
            'Symbol,Asset Type,Quantity,Avg Buy Price (₹),Current Price (₹),Invested Value (₹),Current Value (₹),Unrealized PnL (₹),PnL (%)'
        ];

        let totalInvested = 0;
        let totalCurrent = 0;

        for (const [symbol, pos] of Object.entries(portfolio)) {
            const qty = pos.quantity || 0;
            if (qty <= 0) continue;

            const avgPrice = pos.avgPrice || 0;
            const liveState = currentPrices.get(symbol);
            const curPrice = liveState ? liveState.price : avgPrice;

            const investedVal = qty * avgPrice;
            const currentVal = qty * curPrice;
            const pnl = currentVal - investedVal;
            const pnlPct = investedVal > 0 ? (pnl / investedVal) * 100 : 0;

            totalInvested += investedVal;
            totalCurrent += currentVal;

            lines.push(`"${symbol}","${pos.assetType || 'stocks'}",${qty},${avgPrice.toFixed(2)},${curPrice.toFixed(2)},${investedVal.toFixed(2)},${currentVal.toFixed(2)},${pnl.toFixed(2)},${pnlPct.toFixed(2)}%`);
        }

        const totalPnl = totalCurrent - totalInvested;
        const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

        lines.push('');
        lines.push(`Total Portfolio Value,₹${(totalCurrent + (user.balance || 0)).toFixed(2)}`);
        lines.push(`Total Invested Capital,₹${totalInvested.toFixed(2)}`);
        lines.push(`Total Unrealized PnL,₹${totalPnl.toFixed(2)} (${totalPnlPct.toFixed(2)}%)`);

        return lines.join('\n');
    }

    // Generate CSV for Trade History
    generateTradesCSV(trades, email) {
        const lines = [
            'ProTrader Execution History & Transaction Ledger',
            `Account: ${email}`,
            `Exported: ${new Date().toISOString()}`,
            '',
            'Date & Time,Symbol,Asset Type,Order Type,Action,Quantity,Execution Price (₹),Total Value (₹),Realized PnL (₹)'
        ];

        trades.forEach(t => {
            lines.push(`"${new Date(t.timestamp).toLocaleString()}","${t.symbol}","${t.assetType || 'stocks'}","${t.orderType || 'MARKET'}","${(t.type || '').toUpperCase()}",${t.quantity},${t.price.toFixed(2)},${t.totalAmount.toFixed(2)},${(t.pnl || 0).toFixed(2)}`);
        });

        return lines.join('\n');
    }
}

module.exports = new ExportService();
