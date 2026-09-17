/**
 * ProTrader — components/palette
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== COMMAND PALETTE ====================
const COMMANDS = [
    { cmd: 'overview', label: 'Show market overview', icon: '🌐', action: () => switchView('overview') },
    { cmd: 'signals', label: 'Show ranked signals', icon: '📡', action: () => switchView('signals') },
    { cmd: 'regime', label: 'Show market regime', icon: '🌦️', action: () => switchView('regime') },
    { cmd: 'behavior', label: 'Show my behavior profile', icon: '🧠', action: () => switchView('behavior') },
    { cmd: 'screen', label: 'Open Screener', icon: '📊', action: () => switchView('screener') },
    { cmd: 'heatmap', label: 'Open Heatmap', icon: '🗺️', action: () => switchView('heatmap') },
    { cmd: 'risk', label: 'Show my risk', icon: '⚠️', action: () => switchView('risk') },
    { cmd: 'strategies', label: 'Open Strategy Lab', icon: '🔬', action: () => switchView('strategies') },
    { cmd: 'claims', label: 'Verify a market claim', icon: '🔎', action: () => switchView('claims') },
    { cmd: 'reviews', label: 'Show trade reviews', icon: '📋', action: () => switchView('reviews') },
    { cmd: 'journal', label: 'Show trading journal', icon: '📓', action: () => switchView('journal') },
    { cmd: 'analyze', label: 'Analyze with AI', icon: '🤖', action: () => switchView('ai') }
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
            <div class="palette-item ${i===0?'selected':''}" data-i="${i}" onclick="runCommand(${i})">
                <span class="icon">${c.icon}</span><span class="label">${c.label}</span>
                <span class="sub">command</span>
            </div>`).join('');
        return;
    }

    // Check commands first
    const cmdMatch = COMMANDS.filter(c => c.cmd.includes(q.toLowerCase()));
    let html = cmdMatch.map((c, i) => `
        <div class="palette-item ${i===0?'selected':''}" data-cmd="${c.cmd}" onclick="runCommandByCmd('${c.cmd}')">
            <span class="icon">${c.icon}</span><span class="label">${c.label}</span><span class="sub">command</span>
        </div>`).join('');

    // Check screen shortcuts like "RSI<30" or "screen RSI<30"
    const screenQuery = q.replace(/^screen\s+/i, '');
    const screenMatch = screenQuery.match(/^([A-Za-z]+)\s*([<>]=?)\s*(\d+)/);
    if (screenMatch) {
        const [, field, op, val] = screenMatch;
        html += `<div class="palette-item" onclick="runPaletteScreen('${field}','${op}',${val})">
            <span class="icon">📊</span><span class="label">Screen: ${field} ${op} ${val}</span><span class="sub">screen</span></div>`;
    }

    // "analyze <symbol>" — analyze a specific symbol
    const analyzeMatch = q.match(/^analyze\s+(\S+)/i);
    if (analyzeMatch) {
        const sym = analyzeMatch[1];
        html += `<div class="palette-item" onclick="selectSymbolFromPalette('${sym}')">
            <span class="icon">🤖</span><span class="label">Analyze ${sym} with AI</span><span class="sub">analyze</span></div>`;
    }

    // Search instruments
    if (q.length >= 2) {
        const r = await api('/api/v2/search?q=' + encodeURIComponent(q) + '&limit=6');
        if (r.success) {
            html += r.data.map(i => `
                <div class="palette-item" onclick="selectSymbolFromPalette('${i.symbol}')">
                    <span class="icon">📈</span><span class="label">${i.symbol}</span>
                    <span class="sub">${i.exchange} · ${i.assetType}</span>
                </div>`).join('');
        }
    }

    results.innerHTML = html || '<div class="palette-empty">No matches — try "analyze RELIANCE" or "screen RSI<30"</div>';
}

function paletteKey(e) {
    if (e.key === 'Escape') closePalette();
    if (e.key === 'Enter') {
        const sel = $('paletteResults').querySelector('.palette-item.selected, .palette-item');
        if (sel) {
            if (sel.onclick) { closePalette(); sel.click(); }
            else { const q = $('paletteInput').value; if (q.startsWith('analyze ')) { selectSymbol(q.replace('analyze ','').trim()); closePalette(); } }
        }
    }
}
function runCommand(i) { closePalette(); COMMANDS[i].action(); }
function runCommandByCmd(cmd) { closePalette(); COMMANDS.find(c => c.cmd === cmd).action(); }
async function runPaletteScreen(field, op, val) {
    closePalette();
    state.filters = [{ field, operator: op, value: val }];
    switchView('screener');
    setTimeout(() => runScreen(), 300);
}
function selectSymbolFromPalette(symbol) { closePalette(); selectSymbol(symbol); }
