/**
 * ProTrader — watchlist/watchlist
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== SEARCH ====================
let searchDebounce;
function handleSearchKey(e) {
    if (e.key === 'Enter') { openPalette($('searchInput').value); return; }
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
        const q = $('searchInput').value.trim();
        if (q.length < 2) return;
        const r = await api('/api/v2/search?q=' + encodeURIComponent(q));
        if (r.success && r.data.length) {
            state.instruments = r.data;
            selectSymbol(r.data[0]);
            renderWatchlist();
        }
    }, 300);
}

// ==================== WATCHLIST ====================
async function loadWatchlist() {
    const r = await api('/api/v2/instruments?assetType=' + state.assetType + '&limit=30');
    if (r.success) {
        state.instruments = r.data;
        renderWatchlist();
    }
}

function renderWatchlist() {
    const el = $('watchlist');
    el.innerHTML = state.instruments.slice(0, 20).map(i => `
        <div class="watchlist-item" onclick="selectSymbol('${i.symbol}')">
            <span class="sym">${i.symbol}</span>
            <span class="name">${i.companyName || ''}</span>
            <span class="px" id="px_${i.symbol}">—</span>
            <span class="chg" id="chg_${i.symbol}">—</span>
        </div>`).join('');
    refreshQuotes();
}

function setAssetType(t) {
    state.assetType = t;
    document.querySelectorAll('.asset-btn').forEach(b => b.classList.toggle('active', b.dataset.type === t));
    loadWatchlist();
}

async function refreshQuotes() {
    const symbols = state.instruments.slice(0, 20).map(i => i.symbol);
    if (!symbols.length) return;
    const r = await api('/api/v2/quotes?symbols=' + symbols.join(','));
    if (r.success) {
        r.data.forEach(q => {
            const px = $('px_' + q.symbol);
            const chg = $('chg_' + q.symbol);
            if (px) { px.textContent = fmt(q.price); px.className = 'px ' + cls(q.change); }
            if (chg) { chg.textContent = sign(q.changePercent) + '%'; chg.className = 'chg ' + cls(q.changePercent); }
        });
        renderTicker(r.data);
        if (state.selectedSymbol) {
            const sq = r.data.find(q => q.symbol === state.selectedSymbol);
            if (sq) state.quotes[state.selectedSymbol] = sq;
        }
    }
}

// ==================== TICKER ====================
function renderTicker(quotes) {
    const items = quotes.slice(0, 15).map(q => `
        <div class="ticker-item">
            <span style="color:var(--text-secondary);font-weight:600">${q.symbol}</span>
            <span class="${cls(q.change)}">${fmt(q.price)}</span>
            <span class="${cls(q.changePercent)}">${sign(q.changePercent)}%</span>
        </div>`).join('');
    $('ticker').innerHTML = items + items; // duplicate for seamless loop
}
