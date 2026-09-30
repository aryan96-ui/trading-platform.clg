const express = require('express');
const router = express.Router();
const ollamaService = require('../services/ollama');

/**
 * POST /api/chat
 * Send a message to the AI assistant
 */
router.post('/', async (req, res) => {
    try {
        const { message, conversationId } = req.body;

        // Validation
        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Message is required and must be a string'
            });
        }

        if (message.trim().length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Message cannot be empty'
            });
        }

        if (message.length > 2000) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Message is too long (max 2000 characters)'
            });
        }

        // Generate conversation ID if not provided
        const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Get AI response
        const result = await ollamaService.chat(message, convId);

        res.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process chat',
            message: error.message
        });
    }
});

/**
 * DELETE /api/chat/:conversationId
 * Clear a conversation
 */
router.delete('/:conversationId', (req, res) => {
    try {
        const { conversationId } = req.params;
        ollamaService.clearConversation(conversationId);

        res.json({
            success: true,
            message: 'Conversation cleared'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/chat/stats
 * Get chatbot statistics
 */
router.get('/stats', (req, res) => {
    res.json({
        activeConversations: ollamaService.getConversationCount(),
        model: process.env.OLLAMA_MODEL,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
