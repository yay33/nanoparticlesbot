const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const userHandler = require('./handlers/userHandler');
const predictionHandler = require('./handlers/predictionHandler');
const experimentHandler = require('./handlers/experimentHandler');
const adminHandler = require('./handlers/adminHandler');
const dataHandler = require('./handlers/dataHandler');
const helpHandler = require('./handlers/helpHandler');
const { isUserWhitelisted, isUserAdmin } = require('./middlewares/authMiddleware');

// Create a bot instance
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Start the bot
async function startBot() {
  try {
    logger.info('Setting up bot command handlers...');

    // Register bot commands with Telegram
    await bot.setMyCommands([
      { command: 'start', description: 'Начать работу с ботом' },
      { command: 'predict', description: 'Сделать прогноз параметров наночастиц' },
      { command: 'add_result', description: 'Добавить фактические результаты эксперимента' },
      { command: 'history', description: 'Просмотреть историю экспериментов' },
      { command: 'plot', description: 'Построить график зависимости' },
      { command: 'export_csv', description: 'Экспортировать данные в CSV' },
      { command: 'help', description: 'Показать справку по командам' },
      { command: 'feedback', description: 'Отправить обратную связь разработчикам' }
    ]);

    // Basic commands
    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      logger.info(`/start command received from ${chatId}`);
      await userHandler.handleStart(bot, msg);
    });

    bot.onText(/\/help(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const command = match[1].trim();
      logger.info(`/help command received from ${chatId} for command: ${command || 'all'}`);
      await helpHandler.handleHelp(bot, msg, command);
    });

    bot.onText(/\/feedback (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const feedbackText = match[1];
      logger.info(`/feedback command received from ${chatId}`);
      await userHandler.handleFeedback(bot, msg, feedbackText);
    });

    // Prediction commands
    bot.onText(/\/predict/, async (msg) => {
      const chatId = msg.chat.id;
      logger.info(`/predict command received from ${chatId}`);
      
      if (await isUserWhitelisted(chatId)) {
        await predictionHandler.startPrediction(bot, msg);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не в списке разрешенных пользователей.');
      }
    });

    // Experiment commands
    bot.onText(/\/add_result (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const experimentId = match[1];
      logger.info(`/add_result command received from ${chatId} for experiment: ${experimentId}`);
      
      if (await isUserWhitelisted(chatId)) {
        await experimentHandler.startAddResult(bot, msg, experimentId);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не в списке разрешенных пользователей.');
      }
    });

    bot.onText(/\/history(?:\s+(\d+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const limit = match[1] ? parseInt(match[1]) : null;
      logger.info(`/history command received from ${chatId} with limit: ${limit || 'all'}`);
      
      if (await isUserWhitelisted(chatId)) {
        await experimentHandler.showHistory(bot, msg, limit);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не в списке разрешенных пользователей.');
      }
    });

    // Data visualization commands
    bot.onText(/\/plot(?:\s+(\w+))?(?:\s+([a-f0-9-]+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const parameter = match[1];
      const referenceExperimentId = match[2];
      logger.info(`/plot command received from ${chatId} for parameter: ${parameter || 'all'}, reference: ${referenceExperimentId || 'none'}`);
      
      if (await isUserWhitelisted(chatId)) {
        await dataHandler.generatePlot(bot, msg, parameter, referenceExperimentId);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не в списке разрешенных пользователей.');
      }
    });

    bot.onText(/\/plot_correlation/, async (msg) => {
      const chatId = msg.chat.id;
      logger.info(`/plot_correlation command received from ${chatId}`);
      
      if (await isUserWhitelisted(chatId)) {
        await dataHandler.generateCorrelationPlot(bot, msg);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не в списке разрешенных пользователей.');
      }
    });

    bot.onText(/\/export_csv/, async (msg) => {
      const chatId = msg.chat.id;
      logger.info(`/export_csv command received from ${chatId}`);
      
      if (await isUserWhitelisted(chatId)) {
        await dataHandler.exportToCsv(bot, msg);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не в списке разрешенных пользователей.');
      }
    });

    // Admin commands
    bot.onText(/\/admin\s+user\s+add\s+(\d+)\s+(.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const targetTelegramId = match[1];
      const name = match[2];
      logger.info(`/admin user add command received from ${chatId} for user: ${targetTelegramId}`);
      
      if (await isUserAdmin(chatId)) {
        await adminHandler.addUserToWhitelist(bot, msg, targetTelegramId, name);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не являетесь администратором.');
      }
    });

    bot.onText(/\/admin\s+user\s+remove\s+(\d+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const targetTelegramId = match[1];
      logger.info(`/admin user remove command received from ${chatId} for user: ${targetTelegramId}`);
      
      if (await isUserAdmin(chatId)) {
        await adminHandler.removeUserFromWhitelist(bot, msg, targetTelegramId);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не являетесь администратором.');
      }
    });

    bot.onText(/\/admin\s+user\s+list/, async (msg) => {
      const chatId = msg.chat.id;
      logger.info(`/admin user list command received from ${chatId}`);
      
      if (await isUserAdmin(chatId)) {
        await adminHandler.listWhitelistedUsers(bot, msg);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не являетесь администратором.');
      }
    });

    bot.onText(/\/admin\s+model\s+list/, async (msg) => {
      const chatId = msg.chat.id;
      logger.info(`/admin model list command received from ${chatId}`);
      
      if (await isUserAdmin(chatId)) {
        await adminHandler.listModels(bot, msg);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не являетесь администратором.');
      }
    });

    bot.onText(/\/admin\s+model\s+reload\s+(\S+)\s+(\S+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const sizeModelPath = match[1];
      const pdiModelPath = match[2];
      logger.info(`/admin model reload command received from ${chatId}`);
      
      if (await isUserAdmin(chatId)) {
        await adminHandler.reloadModels(bot, msg, sizeModelPath, pdiModelPath);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не являетесь администратором.');
      }
    });

    bot.onText(/\/admin\s+backup\s+create/, async (msg) => {
      const chatId = msg.chat.id;
      logger.info(`/admin backup create command received from ${chatId}`);
      
      if (await isUserAdmin(chatId)) {
        await adminHandler.createBackup(bot, msg);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не являетесь администратором.');
      }
    });

    bot.onText(/\/admin\s+backup\s+list/, async (msg) => {
      const chatId = msg.chat.id;
      logger.info(`/admin backup list command received from ${chatId}`);
      
      if (await isUserAdmin(chatId)) {
        await adminHandler.listBackups(bot, msg);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не являетесь администратором.');
      }
    });

    bot.onText(/\/admin\s+backup\s+restore\s+([a-f0-9-]+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const backupId = match[1];
      logger.info(`/admin backup restore command received from ${chatId} for backup: ${backupId}`);
      
      if (await isUserAdmin(chatId)) {
        await adminHandler.restoreBackup(bot, msg, backupId);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не являетесь администратором.');
      }
    });

    bot.onText(/\/admin\s+logs\s+(\w+)(?:\s+(\d+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const level = match[1];
      const limit = match[2] ? parseInt(match[2]) : 10;
      logger.info(`/admin logs command received from ${chatId} for level: ${level}, limit: ${limit}`);
      
      if (await isUserAdmin(chatId)) {
        await adminHandler.showLogs(bot, msg, level, limit);
      } else {
        bot.sendMessage(chatId, '⛔ Доступ запрещен. Вы не являетесь администратором.');
      }
    });

    // Handle other messages
    bot.on('message', async (msg) => {
      // This handler will only be called for messages that don't match any of the above
      if (msg.text && !msg.text.startsWith('/')) {
        // Check if this is a response to a prediction request
        await predictionHandler.handlePredictionResponse(bot, msg);
        // Check if this is a response to an add_result request
        await experimentHandler.handleAddResultResponse(bot, msg);
      }
    });

    logger.info('Bot is up and running!');
  } catch (error) {
    logger.error(`Error starting bot: ${error.message}`);
    throw error;
  }
}

module.exports = {
  startBot,
  bot
};