/**
 * ProTrader — components/palette
 *
 * The command palette: view jumps, screen shortcuts ("screen RSI<30"), symbol
 * analysis ("analyze TCS") and symbol opening ("open NIFTY"). Every command
 * targets a real view key — switchView falls back to the dashboard otherwise.
 */
const COMMANDS = [
    { cmd: 'dashboard', label: 'Show dashboard', icon: '📊', action: () => switchView('dashboard') },
    { cmd: 'chart', label: 'Open chart & order ticket', icon: '📈', action: () => switchView('chart') },
    { cmd: 'markets', label: 'Show markets', icon: '🌐', action: () => switchView('markets') },
    { cmd: 'portfolio', label: 'Show portfolio', icon: '💼', action: () => switchView('portfolio') },
    { cmd: 'signals', label: 'Show ranked signals', icon: '📡', action: () => switchView('signals') },
    { cmd: 'regime', label: 'Show market regime', icon: '🌦️', action: () => switchView('regime') },
    { cmd: 'behavior', label: 'Show my behavior profile', icon: '🧠', action: () => switchView('behavior') },
    { cmd: 'screen', label: 'Open Screener', icon: '🔍', action: () => switchView('screener') },
    { cmd: 'heatmap', label: 'Open Heatmap', icon: '🗺️', action: () => switchView('heatmap') },
    { cmd: 'risk', label: 'Show my risk', icon: '⚠️', action: () => switchView('risk') },
    { cmd: 'strategies', label: 'Open Strategy Lab', icon: '🔬', action: () => switchView('strategies') },
    { cmd: 'claims', label: 'Verify a market claim', icon: '🔎', action: () => switchView('claims') },
    { cmd: 'reviews', label: 'Show trade reviews', icon: '📋', action: () => switchView('reviews') },
    { cmd: 'journal', label: 'Show trading journal', icon: '📓', action: () => switchView('journal') },
    { cmd: 'analyze', label: 'Analyze with AI', icon: '🤖', action: () => switchView('ai') },
    { cmd: 'orders', label: 'Open the orders dock', icon: '🧾', action: () => dockTab('openOrders') },
    { cmd: 'pnl', label: 'Open the P&L dock', icon: '💰', action: () => dockTab('pnl') },
    { cmd: 'analytics', label: 'Open portfolio analytics dock', icon: '📐', action: () => dockTab('analytics') },
    { cmd: 'sidebar', label: 'Toggle the left rail', icon: '☰', action: () => toggleSidebar() },
    { cmd: 'panels', label: 'Toggle the intelligence panel', icon: '🧠', action: () => toggleRightPane() }
];

function openPalette(initial) {
    $('paletteOverlay').classList.add('open');
    const inp = $('paletteInput');
    inp.value = initial || '';
    inp.focus();
    runPalette(inp.value);
}

function closePalette() {
    $('paletteOverlay').classList.remove('open');
}

async function runPalette(query) {
    const q = query.trim();
    const results = $('paletteResults');
    if (!q) {
        results.innerHTML = COMMANDS.map((c, i) => `
            <div class="palette-item ${i === 0 ? 'selected' : ''}" data-i="${i}" onclick="runCommand(${i})">
                <span class="icon">${c.icon}</span><span class="label">${c.label}</span>
                <span class="sub">command</span>
            </div>`).join('');
        return;
    }

    const cmdMatch = COMMANDS.filter(c => c.cmd.includes(q.toLowerCase()));
    let html = cmdMatch.map((c, i) => `
        <div class="palette-item ${i === 0 ? 'selected' : ''}" data-cmd="${c.cmd}" onclick="runCommandByCmd('${c.cmd}')">
            <span class="icon">${c.icon}</span><span class="label">${c.label}</span><span class="sub">command</span>
        </div>`).join('');

    // "screen RSI<30" / "RSI<30"
    const screenQuery = q.replace(/^screen\s+/i, '');
    const screenMatch = screenQuery.match(/^([A-Za-z]+)\s*([<>]=?)\s*(\d+)/);
    if (screenMatch) {
        const [, field, op, val] = screenMatch;
        html += `<div class="palette-item" onclick="runPaletteScreen('${field}','${op}',${val})">
            <span class="icon">📊</span><span class="label">Screen: ${field} ${op} ${val}</span><span class="sub">screen</span></div>`;
    }

    // "analyze <symbol>" / "open <symbol>"
    const symMatch = q.match(/^(?:analyze|open|chart)\s+(\S+)/i);
    if (symMatch) {
        const sym = symMatch[1].toUpperCase();
        html += `<div class="palette-item" onclick="selectSymbolFromPalette('${sym}')">
            <span class="icon">🤖</span><span class="label">Open ${sym} — chart, ticket and AI analysis</span><span class="sub">symbol</span></div>`;
    }

    if (q.length >= 2) {
        const r = await api('/api/v2/search?q=' + encodeURIComponent(q) + '&limit=6');
        if (r.success) {
            html += r.data.map(i => `
                <div class="palette-item" onclick="selectSymbolFromPalette('${i.symbol}')">
                    <span class="icon">📈</span><span class="label">${i.symbol}</span>
                    <span class="sub">${i.exchange || ''} · ${i.assetType || ''}</span>
                </div>`).join('');
        }
    }

    results.innerHTML = html || '<div class="palette-empty">No matches — try "analyze RELIANCE", "open NIFTY" or "screen RSI&lt;30"</div>';
}

function paletteKey(e) {
    if (e.key === 'Escape') return closePalette();
    if (e.key !== 'Enter') return;

    const results = $('paletteResults');
    const sel = results.querySelector('.palette-item.selected') || results.querySelector('.palette-item');
    if (sel) { sel.click(); return; }

    const q = $('paletteInput').value.trim();
    const m = q.match(/^(?:analyze|open|chart)\s+(\S+)/i);
    if (m) { closePalette(); selectSymbol(m[1].toUpperCase()); }
}

function runCommand(i) { closePalette(); COMMANDS[i].action(); }
function runCommandByCmd(cmd) {
    closePalette();
    COMMANDS.find(c => c.cmd === cmd)?.action();
}

async function runPaletteScreen(field, op, val) {
    closePalette();
    state.filters = [{ field, operator: op, value: val }];
    state.pendingScreen = true;
    switchView('screener');
}

function selectSymbolFromPalette(symbol) { closePalette(); selectSymbol(symbol); }
