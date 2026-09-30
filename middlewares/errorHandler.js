// middlewares/errorHandler.js - Centralized Error Handling Middleware

const errorHandler = (err, req, res, next) => {
    console.error(`[SERVER ERROR] ${req.method} ${req.url}:`, err.stack || err.message);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
