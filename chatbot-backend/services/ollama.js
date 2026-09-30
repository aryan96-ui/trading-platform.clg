const axios = require('axios');

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3:latest';

// Financial assistant system prompt
const SYSTEM_PROMPT = `You are a professional AI Financial Trading Assistant integrated into a trading platform. Your role is to help users with:

- Market analysis and trading insights
- Technical indicator explanations (RSI, MACD, Bollinger Bands, etc.)
- Trading strategies and risk management
- Portfolio optimization and diversification
- Chart pattern recognition
- Financial news interpretation
- Cryptocurrency and stock market trends

Guidelines:
- Be concise and professional
- Use clear, jargon-free language when possible
- Always remind users that you provide information, not financial advice
- Encourage users to do their own research (DYOR)
- Never guarantee returns or make specific buy/sell recommendations
- Focus on education and analysis

Keep responses under 200 words unless the user asks for detailed explanations.`;

class OllamaService {
    constructor() {
        this.conversations = new Map(); // Store conversation history
        this.maxConversationLength = parseInt(process.env.MAX_CONVERSATION_LENGTH) || 10;
    }

    /**
     * Get or create conversation history
     */
    getConversation(conversationId) {
        if (!this.conversations.has(conversationId)) {
            this.conversations.set(conversationId, []);
        }
        return this.conversations.get(conversationId);
    }

    /**
     * Add message to conversation and trim if needed
     */
    addMessage(conversationId, role, content) {
        const conversation = this.getConversation(conversationId);
        conversation.push({ role, content });

        // Keep only last N messages to manage token limits
        if (conversation.length > this.maxConversationLength) {
            conversation.splice(0, conversation.length - this.maxConversationLength);
        }
    }

    /**
     * Build messages array for Ollama API
     */
    buildMessages(conversationId, userMessage) {
        const conversation = this.getConversation(conversationId);

        // Start with system prompt
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT }
        ];

        // Add conversation history
        messages.push(...conversation);

        // Add current user message
        messages.push({ role: 'user', content: userMessage });

        return messages;
    }

    /**
     * Send chat request to Ollama
     */
    async chat(userMessage, conversationId = 'default') {
        try {
            const messages = this.buildMessages(conversationId, userMessage);

            console.log(`📨 Sending to Ollama (conversation: ${conversationId})`);

            const response = await axios.post(
                `${OLLAMA_API_URL}/api/chat`,
                {
                    model: OLLAMA_MODEL,
                    messages: messages,
                    stream: false,
                    options: {
                        temperature: 0.7,
                        top_p: 0.9,
                    }
                },
                {
                    timeout: 60000, // 60 second timeout
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            const aiReply = response.data.message.content;

            // Store the exchange in conversation history
            this.addMessage(conversationId, 'user', userMessage);
            this.addMessage(conversationId, 'assistant', aiReply);

            return {
                reply: aiReply,
                conversationId: conversationId,
                model: OLLAMA_MODEL
            };

        } catch (error) {
            console.error('Ollama API Error:', error.message);

            if (error.code === 'ECONNREFUSED') {
                throw new Error('Ollama server is not running. Please start it with: ollama serve');
            }

            throw new Error(`Failed to get response from AI: ${error.message}`);
        }
    }

    /**
     * Clear conversation history
     */
    clearConversation(conversationId) {
        this.conversations.delete(conversationId);
        console.log(`🗑️ Cleared conversation: ${conversationId}`);
    }

    /**
     * Get conversation count
     */
    getConversationCount() {
        return this.conversations.size;
    }
}

module.exports = new OllamaService();
