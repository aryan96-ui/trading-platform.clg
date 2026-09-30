/**
 * Structural regression guard for the single-application architecture.
 *
 * The defect this file exists to prevent: auth, trading, portfolio and payment
 * were once implemented twice — inline in `server.js` and again in
 * `server-v2.js` — so the platform had two entries, two ports, two user stores,
 * two trade stores, two indicator engines and two backtesters. A user who
 * registered on one port did not exist on the other, and the terminal hardcoded
 * a demo email that ignored the login that had just succeeded.
 *
 * Two kinds of assertion:
 *   1. Source-level — the shapes that allowed the split cannot come back.
 *   2. Runtime — the identity half and the trading half are one application:
 *      register, log in, trade, then read the portfolio, and every screen agrees
 *      about the same account.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PORT = 4318;
const SKIP_DIRS = new Set(['node_modules', '.git', '.freebuff', 'docs', 'mine']);
const SKIP_FILES = new Set(['test-single-app.js']);

let passed = 0, failed = 0;
const failures = [];

function assert(cond, name) {
    if (cond) { passed++; }
    else { failed++; failures.push(name); console.log('  FAIL:', name); }
}

/** Every non-vendor .js file in the repo, relative to the root. */
function jsFiles(dir = ROOT, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name) || rel.startsWith('.')) continue;
            jsFiles(abs, acc);
        } else if (entry.name.endsWith('.js') && !SKIP_FILES.has(entry.name)) {
            acc.push(rel);
        }
    }
    return acc;
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const countMatches = (text, re) => (text.match(re) || []).length;
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const files = jsFiles();
const sourceOf = (rel) => read(rel);

// ========================================
// 1. SOURCE-LEVEL STRUCTURE
// ========================================
console.log('Structure:\n');

// --- one entry point ---
assert(!exists('server-v2.js'), 'server-v2.js is gone (one entry point)');
assert(exists('server.js'), 'server.js exists');

const serverSrc = sourceOf('server.js');
assert(countMatches(serverSrc, /express\(\)/g) === 1, 'server.js creates exactly one express app');
assert(countMatches(serverSrc, /\.listen\(/g) === 1, 'server.js opens exactly one listener');

const otherListeners = files
    .filter(f => f !== 'server.js' && !/^test-/.test(path.basename(f)))
    .filter(f => /(app|server)\.listen\(/.test(sourceOf(f)));
assert(otherListeners.length === 0, `no second listener outside server.js (found: ${otherListeners.join(', ') || 'none'})`);

// --- one identity owner ---
assert(exists('src/accounts/account-service.js'), 'account service exists');
const userModelDefiners = files.filter(f => /mongoose\.model\(\s*['"]User['"]/.test(sourceOf(f)));
assert(
    userModelDefiners.length === 1 && userModelDefiners[0] === 'src/accounts/account-service.js',
    `only the account service defines the User model (found: ${userModelDefiners.join(', ') || 'none'})`
);

// --- the duplicate stores cannot return ---
const rogueStores = files.filter(f => /(users|inMemoryUsers|tradeHistory)\s*=\s*new Map\(/.test(sourceOf(f)));
assert(rogueStores.length === 0, `no second user/trade store (found: ${rogueStores.join(', ') || 'none'})`);

const ownersWithMaps = ['src/accounts/account-service.js', 'src/trading/paper-trading.js'];
for (const owner of ownersWithMaps) {
    assert(exists(owner), `${owner} present as a state owner`);
}

// --- no invented market data in the serving layer ---
// Engines may use randomness for identifiers, and the DEMO provider is an
// intentionally random labelled feed, so the rule is scoped to the layer where
// responses are actually assembled: the entry point and the route modules.
const servingLayer = files.filter(f => f === 'server.js' || f.startsWith('src/api/'));
assert(servingLayer.length > 0, 'the serving layer is discoverable');
const randomUsers = servingLayer.filter(f => /Math\.random\(/.test(sourceOf(f)));
assert(randomUsers.length === 0, `no Math.random() in the serving layer (found: ${randomUsers.join(', ') || 'none'})`);

// --- the fabricated legacy endpoints are gone, not shadowed ---
for (const route of ['/api/backtest', '/api/indicators', '/api/ai/predict']) {
    const declared = files.some(f => sourceOf(f).includes(`'${route}'`));
    assert(!declared, `${route} no longer declared (superseded by /api/v2)`);
}

// --- the removed dead weight stays removed ---
for (const dead of ['css/premium-panel.css', 'css/style-pro.css', 'css/style.css', 'models/Payment.js', 'models/User.js']) {
    assert(!exists(dead), `${dead} is gone`);
}
assert(exists('src/models/Payment.js'), 'Payment model lives in src/models');
assert(exists('css/tokens.css'), 'shared token sheet exists');

// --- one palette across surfaces ---
for (const shell of ['terminal.html', 'index.html', 'login.html']) {
    assert(read(shell).includes('css/tokens.css'), `${shell} links the shared tokens`);
}

// --- the client has one identity owner ---
assert(exists('js/core/session.js'), 'client session owner exists');
const stateSrc = read('js/core/state.js');
assert(!stateSrc.includes("'demo@college.com'"), 'core/state.js no longer hardcodes a demo email');
assert(/email:\s*activeEmail\(\)/.test(stateSrc), 'core/state.js takes its identity from the session');
assert(read('terminal.html').includes('js/core/session.js'), 'terminal loads the session owner');
assert(read('login.html').includes('js/core/session.js'), 'login page loads the session owner');

// ========================================
// 2. RUNTIME: THE TWO HALVES ARE ONE APP
// ========================================
function req(method, apiPath, body, headers = {}) {
    return new Promise((resolve) => {
        const data = body ? JSON.stringify(body) : null;
        const r = http.request({
            host: '127.0.0.1', port: PORT, path: apiPath, method,
            headers: {
                ...headers,
                ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
            }
        }, (res) => {
            let out = '';
            res.on('data', c => out += c);
            res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(out) }); } catch (e) { resolve({ status: res.statusCode, json: null }); } });
        });
        r.on('error', () => resolve({ status: 0, json: null }));
        if (data) r.write(data);
        r.end();
    });
}

async function waitUp() {
    for (let i = 0; i < 60; i++) {
        const r = await req('GET', '/api/market/signals');
        if (r.status === 200) return true;
        await new Promise(res => setTimeout(res, 250));
    }
    return false;
}

(async () => {
    const child = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(PORT), MONGODB_URI: '' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', () => {});
    child.stderr.on('data', d => {
        const line = d.toString().trim();
        if (line) console.log('[server]', line.slice(0, 200));
    });

    try {
        if (!(await waitUp())) {
            console.log('\nServer did not start — aborting runtime assertions');
            child.kill();
            process.exit(1);
        }

        console.log('Runtime (identity ⇄ trading join):\n');

        // A fresh account, so nothing can be satisfied by demo state.
        const email = `single-app-${Date.now()}@test.local`;
        const password = 'test-password';

        let r = await req('POST', '/api/register', { email, password });
        assert(r.status === 200 && r.json.success, 'POST /api/register creates an account');
        const registeredBalance = r.json.user && r.json.user.balance;

        r = await req('POST', '/api/login', { email, password });
        assert(r.status === 200 && r.json.success, 'POST /api/login accepts the new account');
        const loginBalance = r.json.user.balance;
        assert(loginBalance === registeredBalance, 'the balance the terminal renders comes from the trading book');
        assert(registeredBalance === 100000, 'a new paper account starts at the configured balance');

        // The identity half must report the same number to the trading API.
        r = await req('GET', `/api/v2/account/${encodeURIComponent(email)}`);
        assert(r.status === 200 && r.json.success, 'GET /api/v2/account/:email works for a v1-registered account');
        assert(r.json.data.balance === loginBalance, 'identity and trading agree on balance before any trade');

        r = await req('GET', '/api/me', null, { 'x-user-email': email });
        assert(r.status === 200 && r.json.user.balance === loginBalance, 'GET /api/me reports the same account');

        // Trade through the legacy shape, then read it back through every surface.
        r = await req('POST', '/api/trade', { email, symbol: 'TCS', type: 'buy', quantity: 2 });
        assert(r.status === 200 && r.json.success, 'POST /api/trade (legacy shape) places an order');
        const afterTrade = r.json.newBalance;
        assert(typeof afterTrade === 'number' && afterTrade < loginBalance, 'the legacy trade debits the same balance');

        r = await req('POST', '/api/login', { email, password });
        assert(r.json.user.balance === afterTrade, 'logging in again sees the trade (the join holds)');

        r = await req('GET', `/api/v2/account/${encodeURIComponent(email)}`);
        assert(r.json.data.balance === afterTrade, 'the v2 account agrees with the v1 trade');
        assert(r.json.data.positions.length === 1, 'the position is visible to the v2 account');

        r = await req('GET', `/api/portfolio/${encodeURIComponent(email)}`);
        assert(r.status === 200 && r.json.balance === afterTrade, 'the legacy portfolio adapter agrees too');

        // Market data must be sourced, or explicitly unavailable — never faked.
        r = await req('GET', '/api/market-data');
        assert(r.status === 200, 'GET /api/market-data responds');
        const stocks = r.json.stocks || {};
        const fabricated = Object.entries(stocks).filter(([, q]) => q && q.price === 0 && q.change === 0);
        assert(fabricated.length === 0, `no quote is fabricated as {price:0,change:0} (${fabricated.map(([s]) => s).join(',') || 'none'})`);
        const rel = stocks.RELIANCE;
        assert(!!rel && (rel.price === null || (isFinite(rel.price) && rel.price > 0)), 'RELIANCE is priced or explicitly unavailable');

        // Route ordering: the literal intelligence path must win over the
        // legacy /portfolio/:email wildcard.
        r = await req('GET', '/api/portfolio/risk');
        assert(r.status === 200 && r.json.data !== undefined, 'GET /api/portfolio/risk reaches the risk engine');
        assert(r.json.portfolio === undefined, '/api/portfolio/risk is not swallowed by the legacy wildcard');

        // Retired endpoints really are gone.
        for (const dead of ['/api/backtest', '/api/indicators', '/api/ai/predict']) {
            r = await req(dead === '/api/backtest' ? 'POST' : 'GET', dead, dead === '/api/backtest' ? {} : null);
            assert(r.status === 404, `${dead} returns 404 (superseded by /api/v2)`);
        }

        // The premium gate reads the single account service.
        r = await req('GET', '/api/portfolio/export');
        assert(r.status === 401, 'premium export requires an identity (401 without header)');
        r = await req('GET', '/api/portfolio/export', null, { 'x-user-email': email });
        assert(r.status === 403, 'premium export refuses a non-premium account (403)');

        // Instrument master is still serving the screeners.
        r = await req('GET', '/api/stocks');
        assert(Array.isArray(r.json) && r.json.length > 0, 'GET /api/stocks returns the instrument list');
    } catch (e) {
        failed++;
        failures.push(`unexpected error: ${e.message}`);
        console.log('  FAIL: unexpected error:', e.message);
    }

    child.kill();
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) {
        console.log('Failures:\n' + failures.map(f => '  - ' + f).join('\n'));
        process.exit(1);
    }
})();
