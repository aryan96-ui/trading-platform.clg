// advancedCharting.js - Professional TradingView-Grade Charting Engine

// Technical indicators math engine
class TechnicalIndicators {
    static SMA(data, length) {
        const sma = [];
        for (let i = 0; i < data.length; i++) {
            if (i < length - 1) {
                sma.push(null);
            } else {
                let sum = 0;
                for (let j = 0; j < length; j++) {
                    sum += data[i - j];
                }
                sma.push(sum / length);
            }
        }
        return sma;
    }

    static EMA(data, length) {
        const ema = [];
        if (data.length === 0) return ema;
        const k = 2 / (length + 1);
        let emaVal = data[0];
        ema.push(emaVal);
        for (let i = 1; i < data.length; i++) {
            emaVal = data[i] * k + emaVal * (1 - k);
            ema.push(emaVal);
        }
        return ema;
    }

    static RSI(data, length = 14) {
        const rsi = [];
        if (data.length <= length) {
            return data.map(() => 50); // fallback
        }
        
        let gains = 0;
        let losses = 0;
        
        // Initial average gains/losses
        for (let i = 1; i <= length; i++) {
            const diff = data[i] - data[i - 1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
        
        let avgGain = gains / length;
        let avgLoss = losses / length;
        
        // Default values for first 'length' entries
        for (let i = 0; i < length; i++) {
            rsi.push(50);
        }
        
        // Wilders smoothing
        for (let i = length; i < data.length; i++) {
            const diff = data[i] - data[i - 1];
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;
            
            avgGain = (avgGain * (length - 1) + gain) / length;
            avgLoss = (avgLoss * (length - 1) + loss) / length;
            
            if (avgLoss === 0) {
                rsi.push(100);
            } else {
                const rs = avgGain / avgLoss;
                rsi.push(100 - (100 / (1 + rs)));
            }
        }
        return rsi;
    }

    static MACD(data, fast = 12, slow = 26, signal = 9) {
        const emaFast = this.EMA(data, fast);
        const emaSlow = this.EMA(data, slow);
        
        const macdLine = [];
        for (let i = 0; i < data.length; i++) {
            macdLine.push(emaFast[i] - emaSlow[i]);
        }
        
        const signalLine = this.EMA(macdLine, signal);
        
        const histogram = [];
        for (let i = 0; i < data.length; i++) {
            histogram.push(macdLine[i] - signalLine[i]);
        }
        
        return { macdLine, signalLine, histogram };
    }

    static BollingerBands(data, length = 20, stdDev = 2) {
        const sma = this.SMA(data, length);
        const upper = [];
        const lower = [];
        
        for (let i = 0; i < data.length; i++) {
            if (sma[i] === null) {
                upper.push(null);
                lower.push(null);
            } else {
                let variance = 0;
                for (let j = 0; j < length; j++) {
                    variance += Math.pow(data[i - j] - sma[i], 2);
                }
                const sd = Math.sqrt(variance / length);
                upper.push(sma[i] + stdDev * sd);
                lower.push(sma[i] - stdDev * sd);
            }
        }
        return { middle: sma, upper, lower };
    }
}

// Chart drawing tools classes
class DrawingTool {
    constructor(engine, type) {
        this.engine = engine;
        this.type = type;
    }

    activate() {
        this.engine.activeTool = this.type;
        console.log(`Drawing Tool Activated: ${this.type}`);
    }
}
class TrendLineTool extends DrawingTool { constructor(e) { super(e, 'trendLine'); } }
class FibonacciTool extends DrawingTool { constructor(e) { super(e, 'fibonacci'); } }
class HorizontalLineTool extends DrawingTool { constructor(e) { super(e, 'horizontalLine'); } }
class RectangleTool extends DrawingTool { constructor(e) { super(e, 'rectangle'); } }
class TextTool extends DrawingTool { constructor(e) { super(e, 'text'); } }


// Custom plugin for drawing lines, Fibonacci levels, etc. on Chart.js canvas
const drawingPlugin = {
    id: 'drawingPlugin',
    afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        const xAxis = chart.scales.x;
        const yAxis = chart.scales.y;
        
        // Retrieve drawings
        const drawings = chart.drawings || [];
        drawings.forEach(drawing => {
            ctx.save();
            ctx.strokeStyle = drawing.color || '#2962ff';
            ctx.lineWidth = 2;
            ctx.fillStyle = drawing.color || '#2962ff';
            
            if (drawing.type === 'trendLine' && drawing.points.length === 2) {
                const p1 = drawing.points[0];
                const p2 = drawing.points[1];
                const x1 = xAxis.getPixelForValue(p1.x);
                const y1 = yAxis.getPixelForValue(p1.y);
                const x2 = xAxis.getPixelForValue(p2.x);
                const y2 = yAxis.getPixelForValue(p2.y);
                
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            } else if (drawing.type === 'fibonacci' && drawing.points.length === 2) {
                const p1 = drawing.points[0]; // Swing point 1
                const p2 = drawing.points[1]; // Swing point 2
                const y1 = yAxis.getPixelForValue(p1.y);
                const y2 = yAxis.getPixelForValue(p2.y);
                const startX = xAxis.left;
                const endX = xAxis.right;
                
                const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
                const diff = p2.y - p1.y;
                
                levels.forEach(level => {
                    const priceVal = p1.y + diff * level;
                    const y = yAxis.getPixelForValue(priceVal);
                    
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 4]);
                    ctx.moveTo(startX, y);
                    ctx.lineTo(endX, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    
                    ctx.font = '10px monospace';
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                    ctx.fillText(`Fib ${level.toFixed(3)} - ${priceVal.toFixed(2)}`, startX + 12, y - 4);
                });
            } else if (drawing.type === 'horizontalLine') {
                const y = yAxis.getPixelForValue(drawing.y);
                ctx.beginPath();
                ctx.moveTo(xAxis.left, y);
                ctx.lineTo(xAxis.right, y);
                ctx.stroke();
            } else if (drawing.type === 'rectangle' && drawing.points.length === 2) {
                const p1 = drawing.points[0];
                const p2 = drawing.points[1];
                const x1 = xAxis.getPixelForValue(p1.x);
                const y1 = yAxis.getPixelForValue(p1.y);
                const x2 = xAxis.getPixelForValue(p2.x);
                const y2 = yAxis.getPixelForValue(p2.y);
                
                ctx.fillStyle = 'rgba(41, 98, 255, 0.08)';
                ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            } else if (drawing.type === 'text') {
                const x = xAxis.getPixelForValue(drawing.x);
                const y = yAxis.getPixelForValue(drawing.y);
                ctx.font = '11px sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(drawing.text, x, y - 4);
            }
            ctx.restore();
        });
        
        // Render temporary drawing (while mouse dragging)
        if (chart.tempDrawing) {
            const drawing = chart.tempDrawing;
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            
            const p1 = drawing.points[0];
            const p2 = drawing.points[1];
            if (p1 && p2) {
                const x1 = xAxis.getPixelForValue(p1.x);
                const y1 = yAxis.getPixelForValue(p1.y);
                const x2 = xAxis.getPixelForValue(p2.x);
                const y2 = yAxis.getPixelForValue(p2.y);
                
                if (drawing.type === 'trendLine') {
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                } else if (drawing.type === 'fibonacci') {
                    const diff = p2.y - p1.y;
                    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
                    levels.forEach(level => {
                        const y = yAxis.getPixelForValue(p1.y + diff * level);
                        ctx.beginPath();
                        ctx.moveTo(xAxis.left, y);
                        ctx.lineTo(xAxis.right, y);
                        ctx.stroke();
                    });
                } else if (drawing.type === 'rectangle') {
                    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                }
            }
            ctx.restore();
        }
    }
};

// Custom plugin to sync crosshairs across all charts stacked vertically
const syncCrosshairPlugin = {
    id: 'syncCrosshair',
    afterInit: (chart, args, options) => {
        const canvas = chart.canvas;
        const engine = options.engine;

        canvas.addEventListener('mousemove', (e) => {
            const points = chart.getElementsAtEventForMode(e, 'index', { intersect: false }, true);
            if (points.length === 0) return;
            const index = points[0].index;
            
            // Dispatch index to all other charts in engine
            engine.charts.forEach(otherChart => {
                const meta = otherChart.getDatasetMeta(0);
                if (meta && meta.data[index]) {
                    const element = meta.data[index];
                    otherChart.tooltip.setActiveElements([{
                        datasetIndex: 0,
                        index: index
                    }], {
                        x: element.x,
                        y: element.y
                    });
                    
                    otherChart.crosshairIndex = index;
                    otherChart.update('none');
                }
            });
        });
        
        canvas.addEventListener('mouseleave', () => {
            engine.charts.forEach(otherChart => {
                otherChart.tooltip.setActiveElements([], {});
                otherChart.crosshairIndex = null;
                otherChart.update('none');
            });
        });
    },
    afterDraw: (chart) => {
        if (chart.crosshairIndex !== undefined && chart.crosshairIndex !== null) {
            const ctx = chart.ctx;
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;
            const meta = chart.getDatasetMeta(0);
            if (meta && meta.data[chart.crosshairIndex]) {
                const x = meta.data[chart.crosshairIndex].x;
                
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(x, yAxis.top);
                ctx.lineTo(x, yAxis.bottom);
                ctx.stroke();
                ctx.restore();
            }
        }
    }
};

// Register custom plugins globally
Chart.register(drawingPlugin);
Chart.register(syncCrosshairPlugin);

// Main Professional Charting Engine class
class ProfessionalChartEngine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.charts = new Map(); // name -> Chart instance
        this.indicators = new Set(); // active indicators
        this.layouts = {};
        this.activeTool = null; // active drawing tool
        this.historyData = { labels: [], prices: [] };
        this.selectedSymbol = 'BTC';
        this.drawingToolbar = null;
    }

    // Set dataset historical parameters
    setHistoricalData(labels, prices, symbol = 'BTC') {
        this.historyData = { labels, prices };
        this.selectedSymbol = symbol;
        this.updateAllCharts();
    }

    createMultiPaneChart() {
        console.log('ProfessionalChartEngine: Creating Multi-Pane Layout...');
        this.container.innerHTML = '';
        this.charts.clear();

        // Create layout wrappers
        const layout = document.createElement('div');
        layout.className = 'professional-chart-layout';
        layout.style.display = 'flex';
        layout.style.flexDirection = 'column';
        layout.style.gap = '8px';
        layout.style.width = '100%';
        layout.style.height = '100%';

        this.container.appendChild(layout);

        // Standard setup: stack 4 panes (Main, Volume, RSI, MACD)
        const panes = [
            { id: 'main', height: '55%', title: this.selectedSymbol },
            { id: 'volume', height: '15%', title: 'Volume' },
            { id: 'rsi', height: '15%', title: 'RSI (14)' },
            { id: 'macd', height: '15%', title: 'MACD (12, 26, 9)' }
        ];

        panes.forEach(pane => {
            const wrapper = document.createElement('div');
            wrapper.id = `pane-wrapper-${pane.id}`;
            wrapper.className = 'chart-pane-wrapper';
            wrapper.style.position = 'relative';
            wrapper.style.width = '100%';
            wrapper.style.height = pane.height;
            wrapper.style.background = 'var(--bg-panel)';
            wrapper.style.borderRadius = '8px';
            wrapper.style.border = '1px solid var(--border-color)';
            wrapper.style.padding = '8px';
            
            // Header for pane title
            const header = document.createElement('div');
            header.style.position = 'absolute';
            header.style.top = '10px';
            header.style.left = '12px';
            header.style.fontSize = '11px';
            header.style.color = 'var(--text-secondary)';
            header.style.zIndex = '10';
            header.style.fontWeight = '700';
            header.style.textTransform = 'uppercase';
            header.textContent = pane.title;
            header.id = `pane-title-${pane.id}`;

            const canvas = document.createElement('canvas');
            canvas.id = `canvas-${pane.id}`;
            
            wrapper.appendChild(header);
            wrapper.appendChild(canvas);
            layout.appendChild(wrapper);

            // Initialize chart pane
            this.initializePaneChart(pane.id, canvas);
        });

        // Add interactive drawing toolbar and setup event listeners on main pane
        const mainChart = this.charts.get('main');
        if (mainChart) {
            this.setupDrawingInteraction(mainChart);
            this.addDrawingTools(mainChart);
        }

        // Toggle panes initially based on active indicator list
        this.togglePaneVisibility();

        return layout;
    }

    initializePaneChart(id, canvas) {
        const ctx = canvas.getContext('2d');
        let chartConfig = {
            type: 'line',
            data: {
                labels: this.historyData.labels,
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#141930',
                        titleColor: '#ffffff',
                        bodyColor: '#8b92b5',
                        borderColor: '#2a2f4a',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false
                    },
                    syncCrosshair: { engine: this }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(42, 47, 74, 0.4)', drawBorder: false },
                        ticks: { color: '#8b92b5', font: { size: 10 } }
                    },
                    y: {
                        position: 'right',
                        grid: { color: 'rgba(42, 47, 74, 0.4)', drawBorder: false },
                        ticks: { color: '#8b92b5', font: { size: 10 } }
                    }
                }
            }
        };

        // Custom config options per pane
        if (id === 'main') {
            chartConfig.data.datasets.push({
                label: this.selectedSymbol,
                data: this.historyData.prices,
                borderColor: '#2962ff',
                backgroundColor: 'rgba(41, 98, 255, 0.08)',
                fill: true,
                tension: 0.2,
                borderWidth: 2,
                pointRadius: 0
            });
        } else if (id === 'volume') {
            chartConfig.type = 'bar';
            const volumeData = this.generateVolumeData();
            chartConfig.data.datasets.push({
                label: 'Volume',
                data: volumeData,
                backgroundColor: volumeData.map((v, i) => {
                    const price = this.historyData.prices[i];
                    const prevPrice = this.historyData.prices[i - 1] || price;
                    return price >= prevPrice ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)';
                }),
                borderWidth: 0
            });
        } else if (id === 'rsi') {
            const rsiData = TechnicalIndicators.RSI(this.historyData.prices);
            chartConfig.data.datasets.push({
                label: 'RSI',
                data: rsiData,
                borderColor: '#ab47bc',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.2
            });
            // Add RSI bounds lines (30, 70)
            chartConfig.options.scales.y.suggestedMin = 10;
            chartConfig.options.scales.y.suggestedMax = 90;
        } else if (id === 'macd') {
            const macd = TechnicalIndicators.MACD(this.historyData.prices);
            chartConfig.data.datasets.push(
                {
                    label: 'MACD',
                    data: macd.macdLine,
                    borderColor: '#26a69a',
                    borderWidth: 1.5,
                    pointRadius: 0
                },
                {
                    label: 'Signal',
                    data: macd.signalLine,
                    borderColor: '#ef5350',
                    borderWidth: 1.5,
                    pointRadius: 0
                },
                {
                    label: 'Hist',
                    data: macd.histogram,
                    backgroundColor: macd.histogram.map(val => val >= 0 ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)'),
                    type: 'bar',
                    borderWidth: 0
                }
            );
        }

        const chart = new Chart(ctx, chartConfig);
        chart.drawings = [];
        this.charts.set(id, chart);
    }

    generateVolumeData() {
        const prices = this.historyData.prices;
        const volume = [];
        prices.forEach((p, idx) => {
            const baseVol = 1000 + (p * 0.1);
            volume.push(Math.round(baseVol * (0.5 + Math.random())));
        });
        return volume;
    }

    updateAllCharts() {
        if (this.charts.size === 0) return;

        // Main Chart Update
        const main = this.charts.get('main');
        if (main) {
            main.data.labels = this.historyData.labels;
            main.data.datasets[0].data = this.historyData.prices;
            main.data.datasets[0].label = this.selectedSymbol;
            
            // Recalculate overlay indicators (Bollinger, EMA)
            this.recalculateMainIndicators(main);
            
            // Update pane title
            const titleEl = document.getElementById('pane-title-main');
            if (titleEl) titleEl.textContent = this.selectedSymbol;
            
            main.update('none');
        }

        // Volume Update
        const volume = this.charts.get('volume');
        if (volume) {
            volume.data.labels = this.historyData.labels;
            const volumeData = this.generateVolumeData();
            volume.data.datasets[0].data = volumeData;
            volume.data.datasets[0].backgroundColor = volumeData.map((v, i) => {
                const price = this.historyData.prices[i];
                const prevPrice = this.historyData.prices[i - 1] || price;
                return price >= prevPrice ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)';
            });
            volume.update('none');
        }

        // RSI Update
        const rsi = this.charts.get('rsi');
        if (rsi) {
            rsi.data.labels = this.historyData.labels;
            rsi.data.datasets[0].data = TechnicalIndicators.RSI(this.historyData.prices);
            rsi.update('none');
        }

        // MACD Update
        const macd = this.charts.get('macd');
        if (macd) {
            macd.data.labels = this.historyData.labels;
            const macdData = TechnicalIndicators.MACD(this.historyData.prices);
            macd.data.datasets[0].data = macdData.macdLine;
            macd.data.datasets[1].data = macdData.signalLine;
            macd.data.datasets[2].data = macdData.histogram;
            macd.data.datasets[2].backgroundColor = macdData.histogram.map(val => val >= 0 ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)');
            macd.update('none');
        }
    }

    recalculateMainIndicators(mainChart) {
        // Clear previous overlays (only keep index 0 which is base asset price)
        mainChart.data.datasets = mainChart.data.datasets.slice(0, 1);

        const prices = this.historyData.prices;

        if (this.indicators.has('EMA_20')) {
            mainChart.data.datasets.push({
                label: 'EMA 20',
                data: TechnicalIndicators.EMA(prices, 20),
                borderColor: '#ffeb3b',
                borderWidth: 1.2,
                pointRadius: 0,
                tension: 0.1
            });
        }
        if (this.indicators.has('EMA_50')) {
            mainChart.data.datasets.push({
                label: 'EMA 50',
                data: TechnicalIndicators.EMA(prices, 50),
                borderColor: '#ff9800',
                borderWidth: 1.2,
                pointRadius: 0,
                tension: 0.1
            });
        }
        if (this.indicators.has('Bollinger Bands')) {
            const bb = TechnicalIndicators.BollingerBands(prices, 20, 2);
            mainChart.data.datasets.push(
                {
                    label: 'BB Upper',
                    data: bb.upper,
                    borderColor: 'rgba(255, 87, 34, 0.5)',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.1
                },
                {
                    label: 'BB Middle',
                    data: bb.middle,
                    borderColor: 'rgba(255, 87, 34, 0.3)',
                    borderWidth: 1,
                    borderDash: [3, 3],
                    pointRadius: 0,
                    tension: 0.1
                },
                {
                    label: 'BB Lower',
                    data: bb.lower,
                    borderColor: 'rgba(255, 87, 34, 0.5)',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.1
                }
            );
        }
    }

    addProfessionalIndicators(chart, indicators = ['RSI', 'MACD', 'Bollinger Bands', 'EMA_20', 'EMA_50']) {
        this.indicators.clear();
        indicators.forEach(ind => this.indicators.add(ind));
        
        this.togglePaneVisibility();
        this.updateAllCharts();
    }

    togglePaneVisibility() {
        const volumeWrapper = document.getElementById('pane-wrapper-volume');
        const rsiWrapper = document.getElementById('pane-wrapper-rsi');
        const macdWrapper = document.getElementById('pane-wrapper-macd');
        const mainWrapper = document.getElementById('pane-wrapper-main');

        let activePaneCount = 1; // main always visible
        
        if (volumeWrapper) {
            const hasVol = this.indicators.has('Volume');
            volumeWrapper.style.display = hasVol ? 'block' : 'none';
            if (hasVol) activePaneCount++;
        }
        if (rsiWrapper) {
            const hasRsi = this.indicators.has('RSI');
            rsiWrapper.style.display = hasRsi ? 'block' : 'none';
            if (hasRsi) activePaneCount++;
        }
        if (macdWrapper) {
            const hasMacd = this.indicators.has('MACD');
            macdWrapper.style.display = hasMacd ? 'block' : 'none';
            if (hasMacd) activePaneCount++;
        }

        // Dynamically adjust heights
        if (mainWrapper) {
            if (activePaneCount === 1) mainWrapper.style.height = '95%';
            else if (activePaneCount === 2) mainWrapper.style.height = '75%';
            else if (activePaneCount === 3) mainWrapper.style.height = '60%';
            else mainWrapper.style.height = '50%';
        }
    }

    addDrawingTools(mainChart) {
        const tools = {
            trendLine: new TrendLineTool(this),
            fibonacci: new FibonacciTool(this),
            horizontalLine: new HorizontalLineTool(this),
            rectangle: new RectangleTool(this),
            text: new TextTool(this)
        };

        this.createDrawingToolbar(tools);
        return tools;
    }

    createDrawingToolbar(tools) {
        // Check if toolbar exists, otherwise create it
        let toolbar = document.getElementById('chart-drawing-toolbar');
        if (!toolbar) {
            const chartMain = document.querySelector('.chart-main');
            if (!chartMain) return;

            toolbar = document.createElement('div');
            toolbar.id = 'chart-drawing-toolbar';
            toolbar.style.display = 'flex';
            toolbar.style.gap = '8px';
            toolbar.style.background = 'var(--bg-panel)';
            toolbar.style.padding = '6px 12px';
            toolbar.style.borderBottom = '1px solid var(--border-color)';
            toolbar.style.alignItems = 'center';
            toolbar.style.position = 'absolute';
            toolbar.style.top = '0';
            toolbar.style.left = '48px';
            toolbar.style.right = '0';
            toolbar.style.zIndex = '100';

            // Insert at the top of the chart pane
            chartMain.insertBefore(toolbar, chartMain.firstChild);
        }

        toolbar.innerHTML = `
            <div style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-right: 8px; border-right: 1px solid var(--border-color); padding-right: 12px;">Tools</div>
            <button class="tool-btn active" id="btn-select-tool" onclick="proTrader.chartEngine.setTool(null)" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Pointer</button>
            <button class="tool-btn" id="btn-trendLine" onclick="proTrader.chartEngine.setTool('trendLine')" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Trendline</button>
            <button class="tool-btn" id="btn-fibonacci" onclick="proTrader.chartEngine.setTool('fibonacci')" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Fib Retracement</button>
            <button class="tool-btn" id="btn-horizontalLine" onclick="proTrader.chartEngine.setTool('horizontalLine')" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Horizontal</button>
            <button class="tool-btn" id="btn-rectangle" onclick="proTrader.chartEngine.setTool('rectangle')" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Box</button>
            <button class="tool-btn" id="btn-text" onclick="proTrader.chartEngine.setTool('text')" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Text</button>
            <button class="tool-btn" onclick="proTrader.chartEngine.clearDrawings()" style="background: transparent; border: none; color: var(--accent-red); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: auto;">Clear All</button>
        `;

        this.drawingToolbar = toolbar;
    }

    setTool(toolType) {
        this.activeTool = toolType;
        
        // Highlight active button
        const buttons = this.drawingToolbar.querySelectorAll('.tool-btn');
        buttons.forEach(btn => btn.classList.remove('active'));

        const activeId = toolType ? `btn-${toolType}` : 'btn-select-tool';
        const activeBtn = document.getElementById(activeId);
        if (activeBtn) activeBtn.classList.add('active');
    }

    clearDrawings() {
        const main = this.charts.get('main');
        if (main) {
            main.drawings = [];
            main.update();
        }
    }

    setupDrawingInteraction(chart) {
        const canvas = chart.canvas;
        let startPoint = null;

        canvas.addEventListener('mousedown', (e) => {
            if (!this.activeTool) return;

            const rect = canvas.getBoundingClientRect();
            const pixelX = e.clientX - rect.left;
            const pixelY = e.clientY - rect.top;

            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;

            // Get closest value from x axis
            const valueX = xAxis.getValueForPixel(pixelX);
            const valueY = yAxis.getValueForPixel(pixelY);
            
            // Map index to label string
            const labelX = chart.data.labels[valueX] || valueX;

            startPoint = { x: labelX, y: valueY };

            if (this.activeTool === 'horizontalLine') {
                chart.drawings.push({
                    type: 'horizontalLine',
                    y: valueY,
                    color: '#ff9800'
                });
                startPoint = null;
                this.setTool(null);
                chart.update();
            } else if (this.activeTool === 'text') {
                const textStr = prompt('Enter annotation label:');
                if (textStr) {
                    chart.drawings.push({
                        type: 'text',
                        x: labelX,
                        y: valueY,
                        text: textStr,
                        color: '#ffffff'
                    });
                }
                startPoint = null;
                this.setTool(null);
                chart.update();
            } else {
                chart.isDrawing = true;
                chart.tempDrawing = {
                    type: this.activeTool,
                    points: [startPoint, startPoint]
                };
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!chart.isDrawing || !startPoint) return;

            const rect = canvas.getBoundingClientRect();
            const pixelX = e.clientX - rect.left;
            const pixelY = e.clientY - rect.top;

            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;

            const valueX = xAxis.getValueForPixel(pixelX);
            const valueY = yAxis.getValueForPixel(pixelY);
            const labelX = chart.data.labels[valueX] || valueX;

            chart.tempDrawing.points[1] = { x: labelX, y: valueY };
            chart.update('none');
        });

        canvas.addEventListener('mouseup', (e) => {
            if (!chart.isDrawing || !startPoint) return;

            const rect = canvas.getBoundingClientRect();
            const pixelX = e.clientX - rect.left;
            const pixelY = e.clientY - rect.top;

            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;

            const valueX = xAxis.getValueForPixel(pixelX);
            const valueY = yAxis.getValueForPixel(pixelY);
            const labelX = chart.data.labels[valueX] || valueX;

            chart.drawings.push({
                type: this.activeTool,
                points: [startPoint, { x: labelX, y: valueY }],
                color: this.activeTool === 'fibonacci' ? '#26a69a' : '#2962ff'
            });

            chart.isDrawing = false;
            chart.tempDrawing = null;
            startPoint = null;
            this.setTool(null); // Return to pointer mode
            chart.update();
        });
    }

    addTemplateManager() {
        return {
            'Day Trader': {
                timeframe: '1M',
                indicators: ['EMA_20', 'Volume', 'RSI'],
            },
            'Swing Trader': {
                timeframe: '1M',
                indicators: ['EMA_50', 'Bollinger Bands', 'MACD'],
            },
            'Long Term': {
                timeframe: '1M',
                indicators: ['EMA_50', 'Volume'],
            }
        };
    }

    applyTemplate(templateName) {
        const templates = this.addTemplateManager();
        const config = templates[templateName];
        if (config) {
            console.log(`Applying template layout: ${templateName}`);
            this.addProfessionalIndicators(this.charts.get('main'), config.indicators);
            
            // Toggle active buttons inside the timeframe UI or template selector UI
            const templateEl = document.getElementById('selected-template-name');
            if (templateEl) templateEl.textContent = templateName;
        }
    }
}
