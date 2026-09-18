/**
 * ProTrader — core/ui
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== TOAST NOTIFICATIONS ====================
function showToast(msg, type = 'info', duration = 4000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-msg">${msg}</span>
        <span class="toast-close" onclick="this.parentElement.style.animation='slideOut .3s ease forwards';setTimeout(()=>this.parentElement.remove(),300)">✕</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideOut .3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

// ==================== KEYBOARD SHORTCUTS ====================
const SHORTCUTS = [
    { keys: ['Ctrl', 'K'], desc: 'Open command palette' },
    { keys: ['Ctrl', '/'], desc: 'Show keyboard shortcuts' },
    { keys: ['1-9'], desc: 'Switch to tab (1=Overview, 2=Chart...)' },
    { keys: ['Esc'], desc: 'Close palette / modal' },
    { keys: ['R'], desc: 'Refresh current view' },
    { keys: ['S'], desc: 'Focus search' },
];

function openShortcuts() {
    let overlay = document.querySelector('.modal-overlay.shortcuts');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay shortcuts';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>⌨️ Keyboard Shortcuts</h3>
                    <span class="modal-close" onclick="closeShortcuts()">✕</span>
                </div>
                <div class="modal-body">
                    ${SHORTCUTS.map(s => `
                        <div class="shortcut-row">
                            <span style="font-size:12px">${s.desc}</span>
                            <div class="shortcut-keys">${s.keys.map(k => `<span class="shortcut-key">${k}</span>`).join('+')}</div>
                        </div>`).join('')}
                </div>
            </div>`;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeShortcuts(); });
        document.body.appendChild(overlay);
    }
    overlay.classList.add('open');
}
function closeShortcuts() {
    const overlay = document.querySelector('.modal-overlay.shortcuts');
    if (overlay) overlay.classList.remove('open');
}

// ==================== THEME TOGGLE ====================
let isDark = true;
function toggleTheme() {
    isDark = !isDark;
    const root = document.documentElement;
    if (!isDark) {
        root.style.setProperty('--bg-base', '#f0f2f5');
        root.style.setProperty('--bg-surface', '#ffffff');
        root.style.setProperty('--bg-elevated', '#f8f9fa');
        root.style.setProperty('--bg-hover', '#e9ecef');
        root.style.setProperty('--text-primary', '#1a1a2e');
        root.style.setProperty('--text-secondary', '#6c757d');
        root.style.setProperty('--text-muted', '#adb5bd');
        root.style.setProperty('--border', '#dee2e6');
        root.style.setProperty('--border-accent', '#ced4da');
    } else {
        root.style.setProperty('--bg-base', '#06080f');
        root.style.setProperty('--bg-surface', '#0c1220');
        root.style.setProperty('--bg-elevated', '#131b2e');
        root.style.setProperty('--bg-hover', '#1a2540');
        root.style.setProperty('--text-primary', '#e4e9f0');
        root.style.setProperty('--text-secondary', '#7d8a9e');
        root.style.setProperty('--text-muted', '#4a5568');
        root.style.setProperty('--border', '#1a2332');
        root.style.setProperty('--border-accent', '#253350');
    }
    showToast(isDark ? 'Dark theme activated' : 'Light theme activated', 'info', 2000);
}

// ==================== STATUS BAR ====================
function renderStatusBar() {
    let bar = document.querySelector('.status-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'status-bar';
        document.body.appendChild(bar);
    }
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false });
    const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const view = state.view || 'dashboard';
    const instruments = state.instruments?.length || 0;
    bar.innerHTML = `
        <div class="item"><span class="dot" style="background:var(--green)"></span> Connected</div>
        <div class="sep"></div>
        <div class="item">View: <b style="color:var(--text-primary)">${view.toUpperCase()}</b></div>
        <div class="sep"></div>
        <div class="item">Instruments: <b style="color:var(--text-primary)">${instruments}</b></div>
        <div class="sep"></div>
        <div class="item">${date} ${time}</div>
        <div style="margin-left:auto;display:flex;gap:12px;align-items:center">
            <span class="item" style="cursor:pointer" onclick="openShortcuts()" title="Keyboard shortcuts">⌨️ Shortcuts</span>
            <span class="item" style="cursor:pointer" onclick="toggleTheme()" title="Toggle theme">${isDark ? '🌙' : '☀️'} Theme</span>
        </div>`;
}

// ==================== PANEL / DOCK RESIZING ====================

/**
 * Drag handle for the sidebar (horizontal) and the dock (vertical).
 * Sizes are written to CSS custom properties so a single source of truth
 * owns the layout geometry.
 */
function initResizers() {
    const sidebar = $('sidebar');
    const sidebarHandle = $('sidebarResizer');
    if (sidebar && sidebarHandle) {
        dragHandle(sidebarHandle, (dx) => {
            const next = Math.min(420, Math.max(180, sidebar.offsetWidth + dx));
            document.documentElement.style.setProperty('--sidebar-w', next + 'px');
            sidebar.style.width = next + 'px';
        });
    }

    const dock = $('dock');
    const dockHandle = $('dockResizer');
    if (dock && dockHandle) {
        dragHandle(dockHandle, (dx, dy) => {
            const next = Math.min(window.innerHeight * 0.6, Math.max(120, dock.offsetHeight - dy));
            dock.style.height = next + 'px';
            if (state.dock.collapsed) toggleDock();
        });
    }
}

function dragHandle(handle, onDrag) {
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handle.classList.add('active');
        let lastX = e.clientX, lastY = e.clientY;
        const move = (ev) => {
            onDrag(ev.clientX - lastX, ev.clientY - lastY);
            lastX = ev.clientX; lastY = ev.clientY;
        };
        const up = () => {
            handle.classList.remove('active');
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            if (typeof resizeCharts === 'function') resizeCharts();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    });
}

function toggleDock() {
    const dock = $('dock');
    state.dock.collapsed = !state.dock.collapsed;
    dock.classList.toggle('collapsed', state.dock.collapsed);
    const btn = $('dockToggle');
    if (btn) btn.textContent = state.dock.collapsed ? '▲' : '▼';
    if (typeof resizeCharts === 'function') resizeCharts();
}

/** Collapsible panel toggles (sidebar sections and dashboard widgets). */
document.addEventListener('click', (e) => {
    const head = e.target.closest('.widget-head, .side-head');
    if (!head) return;
    const panel = head.parentElement;
    panel.classList.toggle('closed');
    const key = head.dataset.widget;
    if (key) state.widgets[key] = !panel.classList.contains('closed');
});
