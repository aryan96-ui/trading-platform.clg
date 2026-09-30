// services/newsService.js - Financial Market News Aggregator & Live Ticker
const webSocketService = require('./webSocketService');

class NewsService {
    constructor() {
        this.headlines = [
            { id: 1, title: "RBI Holds Repo Rate Steady at 6.5%, Signals Vigilant Eye on Inflation", source: "Reuters", category: "Macro", sentiment: 0.25, time: "5m ago" },
            { id: 2, title: "Reliance Retail Expands Quick Commerce Footprint Across Tier-2 Cities", source: "Bloomberg", category: "Stocks", symbol: "RELIANCE", sentiment: 0.65, time: "12m ago" },
            { id: 3, title: "Bitcoin Surges Past ₹58,00,000 as Institutional Spot Inflows Accelerate", source: "CoinDesk", category: "Crypto", symbol: "BTC", sentiment: 0.82, time: "18m ago" },
            { id: 4, title: "TCS Secures Multi-Million Dollar Cloud Modernization Contract in Europe", source: "Economic Times", category: "Stocks", symbol: "TCS", sentiment: 0.70, time: "25m ago" },
            { id: 5, title: "Gold Prices Hit Fresh Highs Amid Geopolitical Uncertainty & Central Bank Buying", source: "CNBC", category: "Commodities", symbol: "GOLD", sentiment: 0.55, time: "32m ago" },
            { id: 6, title: "Crude Oil Consolidates Around $78/bbl on OPEC+ Output Guidance", source: "FXStreet", category: "Commodities", symbol: "CRUDEOIL", sentiment: -0.10, time: "40m ago" },
            { id: 7, title: "HDFC Bank Reports 18% YoY Net Profit Growth, Asset Quality Stable", source: "Mint", category: "Stocks", symbol: "HDFCBANK", sentiment: 0.75, time: "48m ago" },
            { id: 8, title: "US Dollar Index (DXY) Stabilizes Ahead of Federal Reserve Minutes", source: "ForexLive", category: "Forex", symbol: "USD/INR", sentiment: 0.15, time: "1h ago" }
        ];

        // Periodically inject fresh news updates
        this.startNewsFeed();
    }

    startNewsFeed() {
        const interval = setInterval(() => {
            const randomHeadline = this.headlines[Math.floor(Math.random() * this.headlines.length)];
            const liveNews = {
                ...randomHeadline,
                id: Date.now(),
                time: "Just now",
                timestamp: Date.now()
            };
            webSocketService.broadcastNews(liveNews);
        }, 45000);
        if (interval.unref) interval.unref();
    }

    getHeadlines(category = 'all', symbol = null) {
        let filtered = this.headlines;
        if (category && category !== 'all') {
            filtered = filtered.filter(h => h.category.toLowerCase() === category.toLowerCase());
        }
        if (symbol) {
            filtered = filtered.filter(h => h.symbol === symbol.toUpperCase());
        }
        return filtered;
    }
}

module.exports = new NewsService();
