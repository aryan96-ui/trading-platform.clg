/**
 * js/riskGate.js — Pre-Trade AI Risk Gate Frontend Controller
 *
 * Manages the full state machine:
 *   IDLE → ANALYZING → REPORT_READY → ACKNOWLEDGED → EXECUTING
 *
 * Key responsibilities:
 *  - Intercept the trade panel form submission
 *  - Open the Risk Gate modal with trade context
 *  - Call POST /api/analyze-thesis and render results
 *  - Animate the Convergence Matrix (3 Truths)
 *  - Typewriter-reveal the AI Risk Report
 *  - Gate the Execute button behind acknowledgment
 *  - Submit the riskGateToken with the final trade POST
 *  - Handle revenge-trading cooloff timer
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────
    const state = {
        phase: 'IDLE',          // IDLE | ANALYZING | REPORT_READY | ACKNOWLEDGED | EXECUTING | BLOCKED
        riskGateToken: null,
        tradePayload: null,     // { symbol, type, quantity, entryPrice, userEmail }
        cooloffTimer: null,
        typewriterTimer: null,
        expiresAt: null
    };

    // ─────────────────────────────────────────────────────────────────────────
    // DOM refs (populated on init)
    // ─────────────────────────────────────────────────────────────────────────
    let el = {};

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────
    window.RiskGate = {
        init,
        open,
        close: closeModal
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Initialise
    // ─────────────────────────────────────────────────────────────────────────
    function init() {
        buildModalHTML();
        cacheElements();
        bindEvents();
        console.log('🛡️ Risk Gate initialised');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Build Modal HTML (injected once into <body>)
    // ─────────────────────────────────────────────────────────────────────────
    function buildModalHTML() {
        if (document.getElementById('risk-gate-overlay')) return; // already built

        const html = `
<div id="risk-gate-overlay" role="dialog" aria-modal="true" aria-labelledby="rg-title">
  <div id="risk-gate-modal">

    <!-- Header -->
    <div class="rg-header">
      <div class="rg-header-left">
        <span class="rg-badge"><i class="fas fa-shield-alt"></i> RISK GATE</span>
        <div>
          <div class="rg-title" id="rg-title">Pre-Trade Intelligence Analysis</div>
          <div class="rg-subtitle" id="rg-subtitle">Loading trade context...</div>
        </div>
      </div>
      <button class="rg-close-btn" id="rg-close-btn" title="Close (trade stays unarmed)">×</button>
    </div>

    <!-- Step progress -->
    <div class="rg-steps">
      <div class="rg-step active" id="rg-step-1">
        <div class="rg-step-num" id="rg-step-num-1">1</div>
        <span class="rg-step-label">Trade Thesis</span>
      </div>
      <div class="rg-step-connector"></div>
      <div class="rg-step" id="rg-step-2">
        <div class="rg-step-num" id="rg-step-num-2">2</div>
        <span class="rg-step-label">3-Truth Analysis</span>
      </div>
      <div class="rg-step-connector"></div>
      <div class="rg-step" id="rg-step-3">
        <div class="rg-step-num" id="rg-step-num-3">3</div>
        <span class="rg-step-label">AI Risk Report</span>
      </div>
    </div>

    <!-- Body -->
    <div class="rg-body">

      <!-- Step 1: Thesis Input -->
      <div class="rg-panel">
        <div class="rg-panel-header">
          <span class="rg-panel-title"><i class="fas fa-pen-to-square"></i> Your Trade Thesis</span>
          <span style="font-size:10px;color:#4b5563;">Min 10 characters required</span>
        </div>
        <div class="rg-panel-body">
          <textarea id="rg-thesis-input"
            placeholder="Explain why you want to enter this trade. What is your edge? What market condition supports this setup? (e.g. RELIANCE broke above the 200 EMA on strong volume, RSI is recovering from oversold...)"
          ></textarea>
        </div>
      </div>

      <!-- Analyze CTA -->
      <button id="rg-analyze-btn">
        <span class="rg-spinner" id="rg-spinner"></span>
        <i class="fas fa-brain" id="rg-analyze-icon"></i>
        <span id="rg-analyze-label">Run Full AI Risk Analysis</span>
      </button>

      <!-- Revenge Trading Cooloff (blocked state) -->
      <div class="rg-cooloff-panel" id="rg-cooloff-panel">
        <div class="rg-cooloff-title">⚠️ Revenge Trading Pattern Detected</div>
        <div class="rg-cooloff-desc" id="rg-cooloff-desc"></div>
        <div class="rg-cooloff-timer" id="rg-cooloff-timer">30:00</div>
        <div style="font-size:11px;color:#6b7280;margin-top:8px;">Trading resumes automatically when the timer expires</div>
      </div>

      <!-- Step 2: Convergence Matrix -->
      <div class="rg-convergence" id="rg-convergence">
        <div class="rg-truth-card" id="rg-quant-card">
          <div class="rg-truth-header">
            <span class="rg-truth-name">📐 Quant Truth</span>
            <div class="rg-light YELLOW" id="rg-quant-light"></div>
          </div>
          <div class="rg-truth-icon">📈</div>
          <div class="rg-truth-label" id="rg-quant-label">Z-Score analysis...</div>
        </div>
        <div class="rg-truth-card" id="rg-tech-card">
          <div class="rg-truth-header">
            <span class="rg-truth-name">📊 Technical Truth</span>
            <div class="rg-light YELLOW" id="rg-tech-light"></div>
          </div>
          <div class="rg-truth-icon">🕯️</div>
          <div class="rg-truth-label" id="rg-tech-label">Trend + RSI analysis...</div>
        </div>
        <div class="rg-truth-card" id="rg-behavior-card">
          <div class="rg-truth-header">
            <span class="rg-truth-name">🧠 Behavioral Truth</span>
            <div class="rg-light YELLOW" id="rg-behavior-light"></div>
          </div>
          <div class="rg-truth-icon">🔍</div>
          <div class="rg-truth-label" id="rg-behavior-label">Checking 24h journal...</div>
        </div>
      </div>

      <!-- All-Green Banner -->
      <div class="rg-all-green-banner" id="rg-all-green-banner">
        <i class="fas fa-circle-check" style="color:#10b981;font-size:16px;"></i>
        <span><strong>High Probability Setup:</strong> All 3 Truths are aligned. Maximum conviction trade configuration.</span>
      </div>

      <!-- Step 3: AI Report -->
      <div class="rg-report-panel" id="rg-report-panel">

        <!-- Confidence Score Row -->
        <div class="rg-score-row">
          <div class="rg-score-ring-wrap">
            <svg class="rg-score-svg" viewBox="0 0 64 64">
              <circle class="rg-score-bg" cx="32" cy="32" r="26"/>
              <circle class="rg-score-fill" id="rg-score-fill" cx="32" cy="32" r="26"/>
            </svg>
            <div class="rg-score-num" id="rg-score-num">—</div>
          </div>
          <div class="rg-score-info">
            <div class="rg-score-label">AI Confidence Score</div>
            <div class="rg-score-verdict" id="rg-score-verdict">Analyzing...</div>
            <div class="rg-score-source" id="rg-score-source"></div>
          </div>
        </div>

        <!-- Key Metrics -->
        <div class="rg-metrics-row" id="rg-metrics-row">
          <div class="rg-metric-chip">
            <div class="rg-metric-chip-label">Suggested Stop</div>
            <div class="rg-metric-chip-value danger" id="rg-met-stop">—</div>
          </div>
          <div class="rg-metric-chip">
            <div class="rg-metric-chip-label">Take Profit</div>
            <div class="rg-metric-chip-value success" id="rg-met-tp">—</div>
          </div>
          <div class="rg-metric-chip">
            <div class="rg-metric-chip-label">ATR</div>
            <div class="rg-metric-chip-value warn" id="rg-met-atr">—</div>
          </div>
          <div class="rg-metric-chip">
            <div class="rg-metric-chip-label">Max Size</div>
            <div class="rg-metric-chip-value" id="rg-met-size">—</div>
          </div>
          <div class="rg-metric-chip">
            <div class="rg-metric-chip-label">1-Day VaR</div>
            <div class="rg-metric-chip-value danger" id="rg-met-var">—</div>
          </div>
          <div class="rg-metric-chip">
            <div class="rg-metric-chip-label">Trend</div>
            <div class="rg-metric-chip-value" id="rg-met-trend">—</div>
          </div>
        </div>

        <!-- AI Report Text -->
        <div class="rg-panel">
          <div class="rg-panel-header">
            <span class="rg-panel-title"><i class="fas fa-robot"></i> Hedge Fund Risk Manager Assessment</span>
            <span id="rg-model-badge" style="font-size:9px;color:#4b5563;font-family:'JetBrains Mono',monospace;"></span>
          </div>
          <div class="rg-report-text-wrap">
            <div id="rg-report-text"></div>
          </div>
        </div>

      </div><!-- /.rg-report-panel -->
    </div><!-- /.rg-body -->

    <!-- Footer: Acknowledge + Execute -->
    <div class="rg-footer" id="rg-footer">
      <label class="rg-acknowledge-row" for="rg-acknowledge-chk">
        <input type="checkbox" id="rg-acknowledge-chk">
        <span class="rg-acknowledge-text">
          I have read and understood the AI Risk Manager's assessment above.
          <strong>I acknowledge the risks and accept full responsibility for this trade.</strong>
        </span>
      </label>
      <button id="rg-execute-btn" class="locked" disabled>
        <i class="fas fa-lock" id="rg-execute-icon"></i>
        <span id="rg-execute-label">Execute Trade — LOCKED</span>
      </button>
    </div>

  </div><!-- /#risk-gate-modal -->
</div><!-- /#risk-gate-overlay -->`;

        document.body.insertAdjacentHTML('beforeend', html);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Cache DOM elements
    // ─────────────────────────────────────────────────────────────────────────
    function cacheElements() {
        const ids = [
            'risk-gate-overlay', 'rg-subtitle', 'rg-close-btn',
            'rg-step-1', 'rg-step-2', 'rg-step-3',
            'rg-step-num-1', 'rg-step-num-2', 'rg-step-num-3',
            'rg-thesis-input', 'rg-analyze-btn', 'rg-analyze-icon', 'rg-analyze-label',
            'rg-spinner', 'rg-cooloff-panel', 'rg-cooloff-desc', 'rg-cooloff-timer',
            'rg-convergence', 'rg-all-green-banner',
            'rg-quant-light', 'rg-quant-label',
            'rg-tech-light', 'rg-tech-label',
            'rg-behavior-light', 'rg-behavior-label',
            'rg-report-panel', 'rg-score-fill', 'rg-score-num', 'rg-score-verdict', 'rg-score-source',
            'rg-met-stop', 'rg-met-tp', 'rg-met-atr', 'rg-met-size', 'rg-met-var', 'rg-met-trend',
            'rg-model-badge', 'rg-report-text',
            'rg-footer', 'rg-acknowledge-chk', 'rg-execute-btn', 'rg-execute-icon', 'rg-execute-label'
        ];
        ids.forEach(id => { el[id] = document.getElementById(id); });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Event Bindings
    // ─────────────────────────────────────────────────────────────────────────
    function bindEvents() {
        // Close
        el['rg-close-btn'].addEventListener('click', closeModal);
        el['risk-gate-overlay'].addEventListener('click', e => {
            if (e.target === el['risk-gate-overlay']) closeModal();
        });
        // ESC
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && el['risk-gate-overlay'].classList.contains('active')) closeModal();
        });

        // Analyze
        el['rg-analyze-btn'].addEventListener('click', runAnalysis);

        // Acknowledge checkbox
        el['rg-acknowledge-chk'].addEventListener('change', onAcknowledgeChange);

        // Execute
        el['rg-execute-btn'].addEventListener('click', executeArmedTrade);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Open the modal
    // ─────────────────────────────────────────────────────────────────────────
    function open(tradePayload) {
        state.tradePayload = tradePayload;
        state.phase = 'IDLE';
        state.riskGateToken = null;
        resetUI();

        const { symbol, type, quantity, entryPrice } = tradePayload;
        el['rg-subtitle'].textContent = `${symbol}  ·  ${type.toUpperCase()}  ·  ${quantity} units${entryPrice ? '  @  ₹' + Number(entryPrice).toFixed(2) : ''}`;

        el['risk-gate-overlay'].classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => el['rg-thesis-input'].focus(), 300);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Close / Reset
    // ─────────────────────────────────────────────────────────────────────────
    function closeModal() {
        el['risk-gate-overlay'].classList.remove('active');
        document.body.style.overflow = '';
        clearCooloffTimer();
        clearTypewriter();
    }

    function resetUI() {
        // Steps
        setStep(1);

        // Thesis
        el['rg-thesis-input'].value = '';
        el['rg-thesis-input'].disabled = false;

        // Analyze button
        setAnalyzeBtn('idle');

        // Hide result sections
        el['rg-convergence'].classList.remove('visible');
        el['rg-all-green-banner'].classList.remove('visible');
        el['rg-report-panel'].classList.remove('visible');
        el['rg-footer'].classList.remove('visible');
        el['rg-cooloff-panel'].classList.remove('visible');

        // Lights to yellow
        ['rg-quant-light', 'rg-tech-light', 'rg-behavior-light'].forEach(id => {
            el[id].className = 'rg-light YELLOW';
        });
        el['rg-quant-label'].textContent = 'Z-Score analysis...';
        el['rg-tech-label'].textContent = 'Trend + RSI analysis...';
        el['rg-behavior-label'].textContent = 'Checking 24h journal...';

        // Report
        el['rg-report-text'].textContent = '';
        el['rg-score-num'].textContent = '—';
        el['rg-score-fill'].style.strokeDashoffset = '163';
        el['rg-score-fill'].style.stroke = '#6366f1';
        el['rg-score-verdict'].textContent = 'Analyzing...';

        // Execute
        el['rg-execute-btn'].className = 'locked';
        el['rg-execute-btn'].disabled = true;
        el['rg-execute-icon'].className = 'fas fa-lock';
        el['rg-execute-label'].textContent = 'Execute Trade — LOCKED';
        el['rg-acknowledge-chk'].checked = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step management
    // ─────────────────────────────────────────────────────────────────────────
    function setStep(active) {
        [1, 2, 3].forEach(n => {
            const stepEl = el[`rg-step-${n}`];
            const numEl  = el[`rg-step-num-${n}`];
            stepEl.className = 'rg-step' + (n === active ? ' active' : n < active ? ' done' : '');
            numEl.textContent = n < active ? '✓' : n;
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Analyze button states
    // ─────────────────────────────────────────────────────────────────────────
    function setAnalyzeBtn(mode) {
        const spin  = el['rg-spinner'];
        const icon  = el['rg-analyze-icon'];
        const label = el['rg-analyze-label'];
        const btn   = el['rg-analyze-btn'];

        if (mode === 'loading') {
            spin.classList.add('active');
            icon.style.display = 'none';
            label.textContent = 'AI Risk Manager is reviewing…';
            btn.disabled = true;
        } else if (mode === 'done') {
            spin.classList.remove('active');
            icon.style.display = '';
            icon.className = 'fas fa-check';
            label.textContent = 'Analysis Complete';
            btn.disabled = true;
        } else { // idle
            spin.classList.remove('active');
            icon.style.display = '';
            icon.className = 'fas fa-brain';
            label.textContent = 'Run Full AI Risk Analysis';
            btn.disabled = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Run Analysis (calls /api/analyze-thesis)
    // ─────────────────────────────────────────────────────────────────────────
    async function runAnalysis() {
        const thesis = (el['rg-thesis-input'].value || '').trim();
        if (thesis.length < 10) {
            shakePulse(el['rg-thesis-input']);
            showToast('Please describe your trade thesis (min 10 characters)', 'warn');
            return;
        }

        setAnalyzeBtn('loading');
        state.phase = 'ANALYZING';
        el['rg-thesis-input'].disabled = true;

        const { symbol, type: direction, quantity, entryPrice } = state.tradePayload;
        const userBalance = window.tradingApp?.userBalance || 100000;
        const userEmail   = state.tradePayload.userEmail || localStorage.getItem('userEmail') || '';

        try {
            const authHeader = getAuthHeader();
            const resp = await fetch('/api/analyze-thesis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeader },
                body: JSON.stringify({ symbol, thesis, direction, quantity, entryPrice, userBalance, email: userEmail })
            });
            const data = await resp.json();

            if (!data.success) {
                showToast(data.message || 'Analysis failed. Please try again.', 'error');
                setAnalyzeBtn('idle');
                el['rg-thesis-input'].disabled = false;
                return;
            }

            // ── Revenge trading block ──────────────────────────────────────
            if (data.blocked) {
                state.phase = 'BLOCKED';
                setAnalyzeBtn('done');
                el['rg-cooloff-panel'].classList.add('visible');
                el['rg-cooloff-desc'].textContent = data.behavioralCheck?.details || 'Revenge trading pattern detected.';
                startCooloffTimer(data.cooloffMinutes || 30);
                return;
            }

            // ── Store token ────────────────────────────────────────────────
            state.riskGateToken = data.riskGateToken;
            state.expiresAt     = data.expiresAt;
            state.phase         = 'REPORT_READY';

            // ── Step 2: Convergence Matrix ─────────────────────────────────
            setStep(2);
            renderConvergenceMatrix(data.convergenceMatrix);

            // ── Step 3: AI Report ──────────────────────────────────────────
            await delay(600);
            setStep(3);
            setAnalyzeBtn('done');
            renderReport(data);

        } catch (err) {
            console.error('Risk Gate fetch error:', err);
            showToast('Network error. Check server is running.', 'error');
            setAnalyzeBtn('idle');
            el['rg-thesis-input'].disabled = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render Convergence Matrix
    // ─────────────────────────────────────────────────────────────────────────
    function renderConvergenceMatrix(matrix) {
        if (!matrix) return;

        el['rg-convergence'].classList.add('visible');

        const setTruth = (lightId, labelId, status, label) => {
            const lightEl = el[lightId];
            const labelEl = el[labelId];
            lightEl.className = `rg-light ${status}`;
            labelEl.textContent = label;
        };

        setTimeout(() => setTruth('rg-quant-light', 'rg-quant-label',
            matrix.quantTruth.status, matrix.quantTruth.label), 100);
        setTimeout(() => setTruth('rg-tech-light', 'rg-tech-label',
            matrix.techTruth.status, matrix.techTruth.label), 350);
        setTimeout(() => setTruth('rg-behavior-light', 'rg-behavior-label',
            matrix.behaviorTruth.status, matrix.behaviorTruth.label), 600);

        if (matrix.allGreen) {
            setTimeout(() => el['rg-all-green-banner'].classList.add('visible'), 800);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render AI Report
    // ─────────────────────────────────────────────────────────────────────────
    function renderReport(data) {
        el['rg-report-panel'].classList.add('visible');

        const score = data.confidenceScore || 0;

        // Score ring animation
        setTimeout(() => {
            const circumference = 163;
            const offset = circumference - (score / 100) * circumference;
            el['rg-score-fill'].style.strokeDashoffset = offset;

            // Color by score
            if (score >= 65)      el['rg-score-fill'].style.stroke = '#10b981';
            else if (score >= 40) el['rg-score-fill'].style.stroke = '#f59e0b';
            else                  el['rg-score-fill'].style.stroke = '#ef4444';

            // Score number count-up
            animateNumber(el['rg-score-num'], 0, score, 900, n => n + '/100');
        }, 200);

        // Verdict label
        let verdict, verdictColor;
        if (score >= 75)      { verdict = '🟢 HIGH CONVICTION'; verdictColor = '#34d399'; }
        else if (score >= 55) { verdict = '🟡 MODERATE RISK'; verdictColor = '#fbbf24'; }
        else if (score >= 35) { verdict = '🟠 ELEVATED RISK'; verdictColor = '#fb923c'; }
        else                  { verdict = '🔴 HIGH RISK — AVOID'; verdictColor = '#f87171'; }
        el['rg-score-verdict'].textContent = verdict;
        el['rg-score-verdict'].style.color = verdictColor;

        // Source badge
        el['rg-score-source'].textContent = `Source: ${data.source || 'rule-engine'}`;

        // Key metrics
        const qc = data.quantContext || {};
        const sz = qc.sizing || {};
        const va = qc.varResult || {};
        const setCv = (id, val, cls) => {
            if (el[id]) {
                el[id].textContent = val;
                if (cls) el[id].className = `rg-metric-chip-value ${cls}`;
            }
        };
        setCv('rg-met-stop', sz.stopLoss ? '₹' + sz.stopLoss : '—', 'danger');
        setCv('rg-met-tp',   sz.takeProfit ? '₹' + sz.takeProfit : '—', 'success');
        setCv('rg-met-atr',  qc.atr ? '₹' + qc.atr : '—', 'warn');
        setCv('rg-met-size', sz.quantity ? sz.quantity + ' units' : '—', '');
        setCv('rg-met-var',  va.varAmount ? '₹' + va.varAmount : '—', 'danger');
        const trend = qc.trendTruth || 'NEUTRAL';
        setCv('rg-met-trend', trend,
            trend === 'BULLISH' ? 'success' : trend === 'BEARISH' ? 'danger' : 'warn');

        // Model badge
        el['rg-model-badge'].textContent = data.source || '';

        // Typewriter AI report
        setTimeout(() => {
            typewriterReveal(el['rg-report-text'], data.report || 'No report generated.', 8);
        }, 500);

        // Show footer after a moment
        setTimeout(() => {
            el['rg-footer'].classList.add('visible');
        }, 900);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Typewriter text reveal
    // ─────────────────────────────────────────────────────────────────────────
    function typewriterReveal(targetEl, text, speed = 10) {
        clearTypewriter();
        let i = 0;
        const cursor = '<span class="rg-cursor"></span>';
        targetEl.innerHTML = cursor;

        function tick() {
            if (i < text.length) {
                targetEl.innerHTML = escapeHTML(text.slice(0, ++i)) + cursor;
                // Auto-scroll
                const wrap = targetEl.closest('.rg-report-text-wrap');
                if (wrap) wrap.scrollTop = wrap.scrollHeight;
                state.typewriterTimer = setTimeout(tick, speed);
            } else {
                // Remove cursor when done
                targetEl.innerHTML = escapeHTML(text);
            }
        }
        tick();
    }

    function clearTypewriter() {
        if (state.typewriterTimer) clearTimeout(state.typewriterTimer);
        state.typewriterTimer = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Acknowledge checkbox
    // ─────────────────────────────────────────────────────────────────────────
    function onAcknowledgeChange() {
        if (el['rg-acknowledge-chk'].checked && state.riskGateToken) {
            armExecuteButton();
        } else {
            lockExecuteButton();
        }
    }

    function armExecuteButton() {
        state.phase = 'ACKNOWLEDGED';
        el['rg-execute-btn'].className = 'armed';
        el['rg-execute-btn'].disabled = false;
        el['rg-execute-icon'].className = 'fas fa-bolt';
        const { symbol, type, quantity } = state.tradePayload;
        el['rg-execute-label'].textContent = `Execute ${type.toUpperCase()} — ${symbol} × ${quantity} — ARMED`;
    }

    function lockExecuteButton() {
        state.phase = 'REPORT_READY';
        el['rg-execute-btn'].className = 'locked';
        el['rg-execute-btn'].disabled = true;
        el['rg-execute-icon'].className = 'fas fa-lock';
        el['rg-execute-label'].textContent = 'Execute Trade — LOCKED';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execute the armed trade
    // ─────────────────────────────────────────────────────────────────────────
    async function executeArmedTrade() {
        if (state.phase !== 'ACKNOWLEDGED' || !state.riskGateToken) return;

        state.phase = 'EXECUTING';
        el['rg-execute-btn'].disabled = true;
        el['rg-execute-btn'].className = 'locked';
        el['rg-execute-label'].textContent = 'Executing Order…';
        el['rg-execute-icon'].className = 'fas fa-circle-notch fa-spin';

        const { symbol, type, quantity, userEmail, assetType } = state.tradePayload;

        try {
            const authHeader = getAuthHeader();
            const resp = await fetch('/api/trade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeader },
                body: JSON.stringify({
                    symbol,
                    type,
                    quantity,
                    assetType: assetType || 'stocks',
                    orderType: 'MARKET',
                    email: userEmail || localStorage.getItem('userEmail'),
                    riskGateToken: state.riskGateToken
                })
            });

            const data = await resp.json();

            if (data.success) {
                closeModal();
                showToast(`✅ ${type.toUpperCase()} order for ${quantity}× ${symbol} executed at ₹${data.price?.toFixed(2) || '—'}`, 'success');

                // Trigger platform trade handler if available
                if (window.tradingApp?.onTradeSuccess) {
                    window.tradingApp.onTradeSuccess(data);
                } else if (window.tradingApp?.updatePortfolio) {
                    window.tradingApp.updatePortfolio();
                }
            } else {
                showToast(data.message || 'Trade failed. Please try again.', 'error');
                // Re-lock and allow re-run
                lockExecuteButton();
                el['rg-acknowledge-chk'].checked = false;
                state.riskGateToken = null;
                state.phase = 'IDLE';
                setAnalyzeBtn('idle');
                el['rg-thesis-input'].disabled = false;
            }
        } catch (err) {
            console.error('Trade execution error:', err);
            showToast('Network error during trade execution.', 'error');
            lockExecuteButton();
            el['rg-acknowledge-chk'].checked = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Cooloff Timer
    // ─────────────────────────────────────────────────────────────────────────
    function startCooloffTimer(minutes) {
        let remaining = minutes * 60;

        function tick() {
            const m = Math.floor(remaining / 60).toString().padStart(2, '0');
            const s = (remaining % 60).toString().padStart(2, '0');
            el['rg-cooloff-timer'].textContent = `${m}:${s}`;

            if (remaining <= 0) {
                el['rg-cooloff-timer'].textContent = '00:00';
                el['rg-cooloff-panel'].classList.remove('visible');
                setAnalyzeBtn('idle');
                el['rg-thesis-input'].disabled = false;
                state.phase = 'IDLE';
                return;
            }
            remaining--;
            state.cooloffTimer = setTimeout(tick, 1000);
        }
        tick();
    }

    function clearCooloffTimer() {
        if (state.cooloffTimer) clearTimeout(state.cooloffTimer);
        state.cooloffTimer = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────
    function getAuthHeader() {
        const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
        const email = localStorage.getItem('userEmail') || '';
        return token
            ? { 'Authorization': `Bearer ${token}`, 'x-user-email': email }
            : { 'x-user-email': email };
    }

    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    }

    function delay(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    function animateNumber(el, from, to, duration, formatter = n => n) {
        const start = performance.now();
        function frame(now) {
            const t = Math.min((now - start) / duration, 1);
            const val = Math.round(from + (to - from) * easeOut(t));
            el.textContent = formatter(val);
            if (t < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    function shakePulse(element) {
        element.style.animation = 'none';
        element.style.borderColor = '#ef4444';
        setTimeout(() => { element.style.borderColor = ''; }, 1000);
    }

    function showToast(message, type = 'info') {
        // Re-use existing platform toast if available
        if (window.tradingApp?.showNotification) {
            window.tradingApp.showNotification(message, type);
            return;
        }
        // Fallback simple toast
        let toast = document.getElementById('rg-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'rg-toast';
            toast.style.cssText = `
                position:fixed; bottom:24px; right:24px; z-index:99999;
                padding:12px 20px; border-radius:10px; font-size:13px; font-weight:600;
                max-width:360px; box-shadow:0 8px 32px rgba(0,0,0,0.5);
                transition: all 0.3s; transform: translateY(0);
                font-family: 'Inter', sans-serif;
            `;
            document.body.appendChild(toast);
        }
        const colors = {
            success: 'rgba(16,185,129,0.9)', error: 'rgba(239,68,68,0.9)',
            warn: 'rgba(245,158,11,0.9)', info: 'rgba(99,102,241,0.9)'
        };
        toast.style.background = colors[type] || colors.info;
        toast.style.color = '#fff';
        toast.textContent = message;
        toast.style.display = 'block';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Auto-init when DOM is ready
    // ─────────────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
