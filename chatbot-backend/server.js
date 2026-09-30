// ------------------------------------------------------------
// Express proxy to Ollama (llama3)
// ------------------------------------------------------------
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*', // Allow all origins in development
    credentials: true,
}));

app.use(express.json());

// Configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434';
const OLLAMA_URL = `${OLLAMA_BASE_URL}/api/chat`;
const MODEL = process.env.OLLAMA_MODEL || 'llama3:latest';
const MAX_TURNS = parseInt(process.env.MAX_CONVERSATION_LENGTH) || 10;
const PORT = process.env.PORT || 3001;

// In‑memory per‑session history (replace with Redis/DB for prod)
const sessions = new Map();

function getHistory(sid) {
    if (!sessions.has(sid)) {
        // Insert system prompt on first use
        sessions.set(sid, [{ role: 'system', content: SYSTEM_PROMPT }]);
    }
    return sessions.get(sid);
}

function trim(history) {
    if (history.length > 2 * MAX_TURNS) {
        const sys = history.filter(m => m.role === 'system');
        const last = history.slice(-2 * MAX_TURNS);
        history.splice(0, history.length, ...sys, ...last);
    }
}

const SYSTEM_PROMPT = `
You are **ProTraderBot**, a professional financial trading assistant for the ProTrader platform.

Your capabilities include:
- Market analysis and insights
- Trading strategies and risk management
- Portfolio optimization advice
- Technical indicator explanations (RSI, MACD, Bollinger Bands, etc.)
- Financial news interpretation
- Chart pattern recognition

Guidelines:
- Be concise and professional; keep replies under 150 tokens when possible
- Provide informative responses, NOT personalized investment advice
- Always remind users that you provide information for educational purposes, not financial advice
- If a question is out of scope or you're unsure, reply: "I'm sorry, I can't help with that."
- Use clear, plain English
- Focus on helping users understand trading concepts and platform features

Remember: You are an educational assistant, not a financial advisor.
`.trim();

// ------------------------------------------------------------
// Health check endpoint
// ------------------------------------------------------------
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        model: MODEL,
        sessions: sessions.size
    });
});

// ------------------------------------------------------------
// POST /api/chat  – non‑streaming JSON response
// ------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
    const { message, session_id } = req.body;
    if (!message) {
        return res.status(422).json({ error: '`message` field required' });
    }

    const sid = session_id || uuidv4();
    const history = getHistory(sid);
    history.push({ role: 'user', content: message });
    trim(history);

    try {
        const response = await axios.post(OLLAMA_URL, {
            model: MODEL,
            messages: history,
            stream: false
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000 // 60 second timeout
        });

        const data = response.data;
        const answer = data.message?.content?.trim() || '';

        // Store assistant reply
        history.push({ role: 'assistant', content: answer });
        trim(history);

        res.json({
            session_id: sid,
            reply: answer,
            conversationId: sid // For compatibility
        });
    } catch (err) {
        console.error('Ollama error:', err.message);
        if (err.response) {
            console.error('Response status:', err.response.status);
            console.error('Response data:', err.response.data);
        }
        res.status(502).json({
            error: 'Failed to communicate with Ollama',
            message: err.message
        });
    }
});

// ------------------------------------------------------------
// POST /api/chat/stream  – Server‑Sent Events
// ------------------------------------------------------------
app.post('/api/chat/stream', async (req, res) => {
    const { message, session_id } = req.body;
    if (!message) {
        return res.status(422).json({ error: '`message` field required' });
    }

    const sid = session_id || uuidv4();
    const history = getHistory(sid);
    history.push({ role: 'user', content: message });
    trim(history);

    // Set up SSE headers
    res.set({
        'Cache-Control': 'no-cache',
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
    });
    res.flushHeaders();

    try {
        // Stream from Ollama
        const ollamaResp = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                messages: history,
                stream: true
            })
        });

        if (!ollamaResp.ok) {
            throw new Error(`Ollama API error: ${ollamaResp.status}`);
        }

        const reader = ollamaResp.body.getReader();
        const decoder = new TextDecoder();

        // Accumulate full answer for later storage
        let fullAnswer = '';

        async function readChunk() {
            try {
                const { done, value } = await reader.read();

                if (done) {
                    // Store final answer
                    history.push({ role: 'assistant', content: fullAnswer });
                    trim(history);
                    res.write(`data: ${JSON.stringify({ done: true, session_id: sid })}\n\n`);
                    res.end();
                    return;
                }

                const chunk = decoder.decode(value);

                // Ollama streams JSON lines each ending with "\n"
                chunk.split('\n').forEach(line => {
                    if (!line.trim()) return;
                    try {
                        const obj = JSON.parse(line);
                        const txt = obj.message?.content ?? '';
                        if (txt) {
                            fullAnswer += txt;
                            // SSE format: "data: <json>\n\n"
                            res.write(`data: ${JSON.stringify({ text: txt })}\n\n`);
                        }
                    } catch (e) {
                        // Ignore malformed JSON lines
                        console.warn('Failed to parse chunk:', e.message);
                    }
                });

                readChunk(); // Continue reading
            } catch (err) {
                console.error('Stream error:', err);
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                res.end();
            }
        }

        readChunk();
    } catch (err) {
        console.error('Streaming error:', err);
        res.status(502).json({
            error: 'Failed to stream from Ollama',
            message: err.message
        });
    }
});

// ------------------------------------------------------------
// DELETE /api/chat/:session_id - Clear conversation
// ------------------------------------------------------------
app.delete('/api/chat/:session_id', (req, res) => {
    const { session_id } = req.params;

    if (sessions.has(session_id)) {
        sessions.delete(session_id);
        res.json({ status: 'cleared', session_id });
    } else {
        res.json({ status: 'not_found', session_id });
    }
});

// ------------------------------------------------------------
// Error handling middleware
// ------------------------------------------------------------
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// ------------------------------------------------------------
// Start server
// ------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`🤖 ProTrader Chatbot Backend running on port ${PORT}`);
    console.log(`📡 Ollama API: ${OLLAMA_URL}`);
    console.log(`🧠 Model: ${MODEL}`);
    console.log(`💾 Max conversation turns: ${MAX_TURNS}`);
});
