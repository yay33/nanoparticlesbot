const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

// Create Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Initialize database and synchronize models
async function initializeDatabase() {
  try {
    // Test the connection
    await sequelize.authenticate();
    logger.info('Database connection has been established successfully.');

    // Import models
    const modelsDir = path.join(__dirname, 'models');
    
    // Ensure models directory exists
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
      logger.info('Created models directory');
    }

    // Import all model files
    fs.readdirSync(modelsDir)
      .filter(file => file.endsWith('.js'))
      .forEach(file => {
        require(path.join(modelsDir, file));
      });

    // Sync all models
    await sequelize.sync({ alter: true });
    logger.info('All models were synchronized successfully.');

    return sequelize;
  } catch (error) {
    logger.error(`Unable to connect to the database: ${error.message}`);
    throw error;
  }
}

module.exports = {
  sequelize,
  initializeDatabase
};