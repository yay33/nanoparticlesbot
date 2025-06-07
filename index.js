// Main entry point for the NanoPredictBot
require('dotenv').config();
const logger = require('./src/utils/logger');
const { initializeDatabase } = require('./src/database/db');
const { startBot } = require('./src/bot');

// Async function to initialize everything
async function initialize() {
  try {
    logger.info('Starting NanoPredictBot...');
    
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized successfully');
    
    // Start the Telegram bot
    await startBot();
    logger.info('Bot started successfully');
    
    logger.info('NanoPredictBot is now running!');
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  process.exit(1);
});

// Start the application
initialize();