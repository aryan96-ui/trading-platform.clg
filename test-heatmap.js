/**
 * Sector Heatmap verification
 *
 * The heatmap must be computed from gateway quotes — never invented — and must
 * degrade to explicit "unavailable" when a quote is missing or a provider fails.
 * Run: node test-heatmap.js
 */
const SectorHeatmap = require('./src/engine/sector-heatmap');

let passed = 0, failed = 0;
const failures = [];
function assert(cond, name) {
    if (cond) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; failures.push(name); console.log(`  ✗ ${name}`); }
}

function makeMaster(spec) {
    const instruments = new Map();
    for (const i of spec) instruments.set(`${i.symbol}:${i.exchange}`, i);
    return { instruments };
}

/** Quote shaped like the gateway's normalizer output. */
function quote(symbol, price, changePercent, opts = {}) {
    return {
        symbol,
        exchange: opts.exchange || 'NSE',
        price,
        change: opts.change !== undefined ? opts.change : price * changePercent / 100,
        changePercent,
        volume: opts.volume !== undefined ? opts.volume : 1000,
        previousClose: opts.previousClose !== undefined ? opts.previousClose : price - (price * changePercent / 100),
        timestamp: opts.timestamp || '2026-09-16T10:00:00.000Z',
        source: opts.source || 'demo',
        dataQuality: opts.dataQuality || 'DEMO'
    };
}

const SPEC = [
    { symbol: 'AAA', exchange: 'NSE', companyName: 'A Ltd', sector: 'IT', industry: 'Software', assetType: 'stock' },
    { symbol: 'BBB', exchange: 'NSE', companyName: 'B Ltd', sector: 'IT', industry: 'Software', assetType: 'stock' },
    { symbol: 'CCC', exchange: 'NSE', companyName: 'C Ltd', sector: 'Energy', industry: 'Oil', assetType: 'stock' },
    { symbol: 'BTC', exchange: 'DEMO', companyName: 'Bitcoin', sector: 'Crypto', industry: 'Crypto', assetType: 'crypto' }
];

const gatewayReturning = quotes => ({
    getQuotes: async () => quotes,
    calls: 0
});

(async () => {
    console.log('\n=== Real quotes drive every value ===');
    {
        const quotes = [
            quote('AAA', 100, 2.5, { change: 2.5, volume: 5000 }),
            quote('BBB', 200, -1.25, { change: -2.5, volume: 3000 }),
            quote('CCC', 50, 0, { change: 0, volume: 1000 })
        ];
        const hm = new SectorHeatmap(makeMaster(SPEC), gatewayReturning(quotes));
        const data = await hm.generate();

        const flat = data.sectors.flatMap(s => s.stocks);
        assert(flat.length === 3, 'Only stock instruments are included (crypto excluded)');

        const aaa = data.sectors.find(s => s.name === 'IT').stocks.find(s => s.symbol === 'AAA');
        assert(aaa.price === 100, 'Price comes from the quote');
        assert(aaa.changePercent === 2.5, 'changePercent comes from the quote');
        assert(aaa.change === 2.5, 'change (absolute) comes from the quote');
        assert(aaa.volume === 5000, 'Volume comes from the quote');
        assert(aaa.available === true && aaa.source === 'demo' && aaa.dataQuality === 'DEMO', 'Stock carries provenance');
        assert(aaa.marketCap === null, 'No market cap is invented');

        // change and changePercent are distinct fields, not the same number
        const ccc = data.sectors.find(s => s.name === 'Energy').stocks[0];
        assert(ccc.change === 0 && ccc.changePercent === 0, 'Zero change preserved (unrated vs unchanged are distinguishable)');

        const it = data.sectors.find(s => s.name === 'IT');
        // Mean of the rated constituents, stored at 2dp like every other percent in the app
        assert(it.changePercent === parseFloat(((2.5 + -1.25) / 2).toFixed(2)), 'Sector change = mean of its rated stocks ((2.5 + -1.25)/2 → 0.63)');
        assert(it.totalVolume === 8000, 'Sector volume = sum of constituent volumes');
        assert(it.availableCount === 2 && it.stockCount === 2, 'Sector counts');

        assert(data.stats.advancers === 1 && data.stats.decliners === 1 && data.stats.unchanged === 1, 'Breadth split');
        assert(data.stats.unavailable === 0, 'No unavailable when every quote arrives');
        assert(data.stats.totalStocks === 3, 'Total accounts for all instruments');
        assert(data.stats.topSector === 'IT' && data.stats.bottomSector === 'Energy', 'Top/bottom sector from real changes');
        assert(data.provenance.rated === 3 && data.provenance.unavailable === 0, 'Provenance counts');
        assert(data.provenance.sources.join() === 'demo' && data.provenance.qualities.join() === 'DEMO', 'Provenance sources/qualities');
        assert(data.provenance.asOf === '2026-09-16T10:00:00.000Z', 'Provenance timestamp');
    }

    console.log('\n=== Missing quotes become unavailable, never estimates ===');
    {
        const quotes = [quote('AAA', 100, 2.5)];
        const hm = new SectorHeatmap(makeMaster(SPEC), gatewayReturning(quotes));
        const data = await hm.generate();
        const flat = data.sectors.flatMap(s => s.stocks);
        const bbb = flat.find(s => s.symbol === 'BBB');

        assert(bbb.available === false, 'Unquoted instrument marked unavailable');
        assert(bbb.price === null && bbb.change === null && bbb.changePercent === null && bbb.volume === null,
            'Unquoted instrument carries nulls, not invented numbers');
        assert(bbb.dataQuality === 'UNAVAILABLE' && bbb.source === null, 'Unavailable carries no fake source');
        assert(bbb.size === 0, 'Unrated tile has zero weight');
        assert(data.stats.advancers === 1 && data.stats.unavailable === 2, 'Breadth counts unavailable separately');
        assert(data.stats.unchanged === 0, 'Missing data is not counted as unchanged');

        const it = data.sectors.find(s => s.name === 'IT');
        assert(it.changePercent === 2.5, 'Sector average ignores unavailable constituents');
        assert(it.availableCount === 1 && it.stockCount === 2, 'Sector reports rated vs total');
        assert(it.stocks[it.stocks.length - 1].available === false, 'Unrated stocks sort last');
        assert(data.sectors.every(s => s.changePercent === null || typeof s.changePercent === 'number'), 'Sector values numeric or null');
    }

    console.log('\n=== Provider failure / no gateway / empty universe ===');
    {
        const hm = new SectorHeatmap(makeMaster(SPEC), { getQuotes: async () => { throw new Error('provider down'); } });
        const data = await hm.generate();
        assert(data.sectors.length > 0, 'Provider failure still returns the sector tree');
        assert(data.sectors.flatMap(s => s.stocks).every(s => s.available === false), 'Provider failure marks everything unavailable');
        assert(data.stats.advancers === 0 && data.stats.unavailable === 3, 'Provider failure yields no invented breadth');
        assert(data.stats.topSector === '' && data.stats.bottomSector === '', 'No top/bottom sector without data');
        assert(data.provenance.qualities.length === 0 && data.provenance.asOf === null, 'No provenance claimed without data');

        const noGateway = new SectorHeatmap(makeMaster(SPEC), undefined);
        const d2 = await noGateway.generate();
        assert(d2.sectors.flatMap(s => s.stocks).every(s => s.available === false), 'Missing gateway degrades to unavailable, not random');

        const empty = new SectorHeatmap(makeMaster([]), gatewayReturning([]));
        const d3 = await empty.generate();
        assert(d3.sectors.length === 0 && d3.stats.totalStocks === 0, 'Empty universe returns empty tree');
        assert(d3.stats.advancers === 0 && d3.stats.topSector === '', 'Empty universe stats are zero');
    }

    console.log('\n=== Malformed quotes are rejected, not coerced ===');
    {
        const bad = [
            quote('AAA', 100, 2.5),
            { symbol: 'BBB', price: 200, volume: 10, dataQuality: 'DEMO' },           // no changePercent
            quote('CCC', 50, NaN, { change: NaN })                                     // NaN percent
        ];
        const hm = new SectorHeatmap(makeMaster(SPEC), gatewayReturning(bad));
        const data = await hm.generate();
        const flat = data.sectors.flatMap(s => s.stocks);
        assert(flat.find(s => s.symbol === 'BBB').available === false, 'Missing changePercent → unavailable');
        assert(flat.find(s => s.symbol === 'CCC').available === false, 'NaN changePercent → unavailable');
        assert(flat.find(s => s.symbol === 'AAA').available === true, 'Valid quote still rated');
        assert(data.stats.unavailable === 2, 'Malformed quotes counted as unavailable');
    }

    console.log('\n=== Determinism (same source in → same numbers out) ===');
    {
        const quotes = [quote('AAA', 100, 2.5), quote('BBB', 200, -1.25), quote('CCC', 50, 0)];
        const hm = new SectorHeatmap(makeMaster(SPEC), gatewayReturning(quotes));
        const a = await hm.generate();
        const b = await hm.generate();
        const fp = d => d.sectors.map(s => `${s.name}:${s.changePercent}:` +
            s.stocks.map(x => `${x.symbol}=${x.price}/${x.changePercent}/${x.volume}`).join(',')).join('|');
        assert(fp(a) === fp(b), 'Repeated generation returns identical numbers');
        assert(JSON.stringify(a.stats) === JSON.stringify(b.stats), 'Repeated generation returns identical breadth');
    }

    console.log('\n=== Drilldown + sector summary ===');
    {
        const quotes = [quote('AAA', 100, 2.5), quote('BBB', 200, -1.25), quote('CCC', 50, 0)];
        const hm = new SectorHeatmap(makeMaster(SPEC), gatewayReturning(quotes));
        const it = await hm.drilldown('IT');
        assert(it && it.name === 'IT' && it.stocks.length === 2, 'Drilldown returns the sector');
        assert(await hm.drilldown('Nope') === null, 'Unknown sector drills down to null');

        const perf = await hm.getSectorPerformance();
        assert(Array.isArray(perf) && perf.length === 2, 'Sector summary lists every sector');
        assert(perf.every(s => 'changePercent' in s && 'availableCount' in s), 'Sector summary exposes percent + availability');
    }

    console.log('\n========================================');
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log('========================================');
    if (failures.length) console.log('Failures:', failures.join('; '));
    process.exit(failed === 0 ? 0 : 1);
})();
