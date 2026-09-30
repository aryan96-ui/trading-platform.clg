/**
 * ProTrader AI Chatbot Widget - Enhanced with Offline Ollama (Llama 3 & Qwen 2.5)
 * Grounded in Quantitative Finance & Technical Analysis
 */

class ChatbotWidget {
    constructor(config = {}) {
        this.apiUrl = config.apiUrl || '/api/chat';
        this.modelsApiUrl = config.modelsApiUrl || '/api/ai/models';
        this.sessionId = this.getSessionId();
        this.isOpen = false;
        this.isTyping = false;
        this.activeModel = 'llama3:latest';
        this.availableModels = ['llama3:latest', 'qwen2.5-coder:1.5b'];
        this.isOllamaOnline = true;

        this.init();
    }

    getSessionId() {
        let sessionId = localStorage.getItem('chatbot_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('chatbot_session_id', sessionId);
        }
        return sessionId;
    }

    async init() {
        this.createWidget();
        this.attachEventListeners();
        this.loadConversationHistory();
        await this.fetchAvailableModels();
    }

    getActiveSymbol() {
        if (window.tradingApp && window.tradingApp.currentSymbol) {
            return window.tradingApp.currentSymbol;
        }
        const symbolLabel = document.getElementById('current-symbol-label');
        if (symbolLabel && symbolLabel.innerText) {
            return symbolLabel.innerText.trim();
        }
        return 'RELIANCE';
    }

    getUserBalance() {
        try {
            const raw = localStorage.getItem('userBalance');
            if (raw) return parseFloat(raw) || 100000;
        } catch (e) {}
        return 100000;
    }

    async fetchAvailableModels() {
        try {
            const res = await fetch(this.modelsApiUrl);
            if (res.ok) {
                const data = await res.json();
                if (data.models && Array.isArray(data.models) && data.models.length > 0) {
                    this.availableModels = data.models;
                    this.activeModel = data.activeModel || this.activeModel;
                    this.isOllamaOnline = Boolean(data.isOllamaOnline);
                    this.updateModelSelectorUI();
                }
            }
        } catch (e) {
            console.log('AI model fetch note: using default models');
        }
    }

    createWidget() {
        // Remove existing widget if any
        const existing = document.getElementById('chatbotContainer');
        if (existing) existing.remove();

        const widgetHTML = `
            <div id="chatbotContainer">
                <!-- Floating Trigger Button -->
                <button class="chatbot-toggle" id="chatbotToggle" title="Open AI Trading Copilot">
                    <span class="chatbot-pulse-ring"></span>
                    <span class="chatbot-toggle-icon">🤖</span>
                    <span class="chatbot-toggle-badge">AI</span>
                </button>

                <!-- Floating Chatbot Window -->
                <div class="chatbot-window" id="chatbotWindow">
                    <!-- Header -->
                    <div class="chatbot-header">
                        <div class="chatbot-header-info">
                            <div class="chatbot-avatar">🤖</div>
                            <div class="chatbot-title">
                                <h3>ProTrader Copilot</h3>
                                <div class="chatbot-status-row">
                                    <span class="status-indicator ${this.isOllamaOnline ? 'online' : 'fallback'}"></span>
                                    <select id="chatbotModelSelect" class="chatbot-model-dropdown" title="Select AI Engine">
                                        <option value="llama3:latest">🦙 Llama 3 (8B Offline)</option>
                                        <option value="qwen2.5-coder:1.5b">⚡ Qwen 2.5 (Coder Offline)</option>
                                        <option value="rule-engine">📐 Rule Engine (Instant)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="chatbot-header-actions">
                            <button class="chatbot-action-btn" id="chatbotClearHistory" title="Clear Conversation">🗑️</button>
                            <button class="chatbot-close" id="chatbotClose" title="Close">×</button>
                        </div>
                    </div>

                    <!-- Quick Prompt Suggestions Bar -->
                    <div class="chatbot-chips-bar" id="chatbotChips">
                        <button class="chip-btn" data-prompt="Analyze the technical chart and momentum">📊 Chart Analysis</button>
                        <button class="chip-btn" data-prompt="Calculate safe Kelly position size and ATR stop loss">📐 Kelly & ATR</button>
                        <button class="chip-btn" data-prompt="What is the current market regime and bias?">⚡ Market Regime</button>
                        <button class="chip-btn" data-prompt="Check for volatility or volume anomaly">⚠️ Anomaly Scan</button>
                    </div>

                    <!-- Messages Container -->
                    <div class="chatbot-messages" id="chatbotMessages">
                        <div class="chat-message bot welcome-bubble">
                            <div class="message-content">
                                <h4>👋 ProTrader AI Copilot Active</h4>
                                <p>Powered by local <strong>Ollama (Llama 3 & Qwen 2.5)</strong> with zero cloud latency. Ask me about real-time chart patterns, Kelly position sizing, risk guardrails, or backtesting.</p>
                                <div class="welcome-meta">
                                    <span>🎯 Active Asset: <strong id="welcomeActiveSym">${this.getActiveSymbol()}</strong></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Typing Indicator -->
                    <div class="chatbot-typing" id="chatbotTyping" style="display: none;">
                        <div class="typing-bubble">
                            <span class="dot"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                        </div>
                        <span class="typing-text">Analyzing market data with ${this.activeModel}...</span>
                    </div>

                    <!-- Input Area -->
                    <div class="chatbot-input-area">
                        <input 
                            type="text" 
                            class="chatbot-input" 
                            id="chatbotInput" 
                            placeholder="Ask Copilot about ${this.getActiveSymbol()} (e.g. 'Should I trade here?')..."
                            autocomplete="off"
                        />
                        <button class="chatbot-send" id="chatbotSend" title="Send Message">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;

        const container = document.createElement('div');
        container.innerHTML = widgetHTML;
        document.body.appendChild(container.firstElementChild);
    }

    updateModelSelectorUI() {
        const select = document.getElementById('chatbotModelSelect');
        if (!select) return;

        select.innerHTML = '';
        this.availableModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.innerText = m.includes('llama3') ? `🦙 ${m} (Meta Llama 3)` :
                            m.includes('qwen') ? `⚡ ${m} (Qwen 2.5)` :
                            `🤖 ${m}`;
            if (m === this.activeModel) opt.selected = true;
            select.appendChild(opt);
        });

        // Add Rule Engine option
        const ruleOpt = document.createElement('option');
        ruleOpt.value = 'rule-engine';
        ruleOpt.innerText = '📐 Quantitative Rule Engine';
        select.appendChild(ruleOpt);
    }

    attachEventListeners() {
        const toggleBtn = document.getElementById('chatbotToggle');
        const closeBtn = document.getElementById('chatbotClose');
        const sendBtn = document.getElementById('chatbotSend');
        const input = document.getElementById('chatbotInput');
        const clearBtn = document.getElementById('chatbotClearHistory');
        const modelSelect = document.getElementById('chatbotModelSelect');
        const chipsContainer = document.getElementById('chatbotChips');

        if (toggleBtn) toggleBtn.addEventListener('click', () => this.toggleChat());
        if (closeBtn) closeBtn.addEventListener('click', () => this.toggleChat());
        if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                localStorage.removeItem('chatbot_history');
                const msgs = document.getElementById('chatbotMessages');
                if (msgs) {
                    msgs.innerHTML = `
                        <div class="chat-message bot welcome-bubble">
                            <div class="message-content">
                                <h4>✨ Chat Cleared</h4>
                                <p>Ask Copilot any trading question for <strong>${this.getActiveSymbol()}</strong>.</p>
                            </div>
                        </div>`;
                }
            });
        }

        if (modelSelect) {
            modelSelect.addEventListener('change', (e) => {
                this.activeModel = e.target.value;
                this.addMessage(`🔄 Switched active AI Model to **${this.activeModel}**`, 'bot', 'System');
            });
        }

        if (chipsContainer) {
            chipsContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.chip-btn');
                if (btn && btn.dataset.prompt) {
                    const sym = this.getActiveSymbol();
                    const prompt = `${btn.dataset.prompt} for ${sym}`;
                    this.sendMessage(prompt);
                }
            });
        }

        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        const win = document.getElementById('chatbotWindow');
        const toggle = document.getElementById('chatbotToggle');

        if (win) {
            if (this.isOpen) {
                win.classList.add('active');
                if (toggle) toggle.classList.add('active');
                const sym = this.getActiveSymbol();
                const input = document.getElementById('chatbotInput');
                if (input) {
                    input.placeholder = `Ask Copilot about ${sym}...`;
                    input.focus();
                }
                const symBadge = document.getElementById('welcomeActiveSym');
                if (symBadge) symBadge.innerText = sym;
            } else {
                win.classList.remove('active');
                if (toggle) toggle.classList.remove('active');
            }
        }
    }

    async sendMessage(customText = null) {
        const input = document.getElementById('chatbotInput');
        const message = (customText || input.value).trim();

        if (!message || this.isTyping) return;

        if (!customText && input) input.value = '';

        const sym = this.getActiveSymbol();
        this.addMessage(message, 'user');
        this.showTypingIndicator();

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    symbol: sym,
                    userBalance: this.getUserBalance(),
                    model: this.activeModel,
                    session_id: this.sessionId
                })
            });

            const data = await response.json();
            this.hideTypingIndicator();

            if (data && data.reply) {
                const badge = data.modelUsed ? `Model: ${data.modelUsed.replace('ollama:', '')}` : 'Copilot';
                this.addMessage(data.reply, 'bot', badge);
            } else if (data && data.answer) {
                this.addMessage(data.answer, 'bot', 'Copilot');
            } else {
                this.addMessage("I analyzed the market data for " + sym + ", but could not generate a response. Please try again.", 'bot');
            }

            this.saveConversationHistory();
        } catch (err) {
            this.hideTypingIndicator();
            this.addMessage(`⚠️ **Connection Error**: Unable to reach AI Copilot backend (${err.message}). ProTrader is running in offline fallback mode.`, 'bot');
        }
    }

    addMessage(text, sender, tag = null) {
        const messagesContainer = document.getElementById('chatbotMessages');
        if (!messagesContainer) return;

        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${sender}`;

        const formatted = this.formatMarkdown(text);

        messageEl.innerHTML = `
            <div class="message-content">
                ${tag ? `<div class="message-model-tag">${tag}</div>` : ''}
                ${formatted}
                <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        `;

        messagesContainer.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    formatMarkdown(text) {
        if (!text) return '';
        let html = text
            // Code blocks
            .replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // LaTeX math notation like $f^*$ or $\pm 2\sigma$
            .replace(/\$(.*?)\$/g, '<code class="math-code">$1</code>')
            // Bullet points
            .replace(/^[•\-\*]\s+(.*)$/gm, '<li>$1</li>')
            // Newlines to line breaks (outside of lists)
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');

        // Wrap list items
        if (html.includes('<li>')) {
            html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
        }

        return html;
    }

    showTypingIndicator() {
        this.isTyping = true;
        const typing = document.getElementById('chatbotTyping');
        if (typing) {
            const typingText = typing.querySelector('.typing-text');
            if (typingText) typingText.innerText = `Analyzing with ${this.activeModel}...`;
            typing.style.display = 'flex';
            const msgs = document.getElementById('chatbotMessages');
            if (msgs) msgs.scrollTop = msgs.scrollHeight;
        }
    }

    hideTypingIndicator() {
        this.isTyping = false;
        const typing = document.getElementById('chatbotTyping');
        if (typing) typing.style.display = 'none';
    }

    saveConversationHistory() {
        const messagesContainer = document.getElementById('chatbotMessages');
        if (messagesContainer) {
            localStorage.setItem('chatbot_history', messagesContainer.innerHTML);
        }
    }

    loadConversationHistory() {
        const saved = localStorage.getItem('chatbot_history');
        const messagesContainer = document.getElementById('chatbotMessages');
        if (saved && messagesContainer) {
            messagesContainer.innerHTML = saved;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
}

// Auto-initialize when document loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { window.proTraderChat = new ChatbotWidget(); });
} else {
    window.proTraderChat = new ChatbotWidget();
}
