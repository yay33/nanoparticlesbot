const User = require('../../database/models/User');
const Whitelist = require('../../database/models/Whitelist');
const logger = require('../../utils/logger');
const { isUserWhitelisted } = require('../middlewares/authMiddleware');

/**
 * Handle the /start command
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 */
async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  
  try {
    // Check if user is whitelisted
    const isWhitelisted = await isUserWhitelisted(telegramId);
    
    if (isWhitelisted) {
      // Find or create user in the database
      const [user, created] = await User.findOrCreate({
        where: { telegramId },
        defaults: {
          name: msg.from.first_name || msg.from.username || 'Пользователь',
          isAdmin: false
        }
      });

      // Send welcome message
      await bot.sendMessage(
        chatId,
        `👋 Здравствуйте, ${user.name}!\n\n` +
        `Добро пожаловать в NanoPredictBot - бот для прогнозирования характеристик флуоресцентных наночастиц.\n\n` +
        `Вы можете использовать следующие команды:\n` +
        `/predict - Сделать прогноз параметров наночастиц\n` +
        `/add_result - Добавить фактические результаты эксперимента\n` +
        `/history - Просмотреть историю экспериментов\n` +
        `/plot - Построить график зависимости\n` +
        `/export_csv - Экспортировать данные в CSV\n` +
        `/help - Получить справку по командам\n\n` +
        `Чтобы начать прогнозирование, отправьте команду /predict`
      );
      
      logger.info(`User ${telegramId} (${user.name}) started the bot. Created: ${created}`);
    } else {
      // User is not whitelisted
      await bot.sendMessage(
        chatId,
        `⛔ Доступ запрещен. Вы не в списке разрешенных пользователей.\n\n` +
        `Пожалуйста, обратитесь к администратору для получения доступа.`
      );
      
      logger.warn(`Unauthorized access attempt from user ${telegramId}`);
    }
  } catch (error) {
    logger.error(`Error handling /start command: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при запуске бота. Пожалуйста, попробуйте позже или обратитесь к администратору.'
    );
  }
}

/**
 * Handle the /feedback command
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 * @param {string} feedbackText - Feedback text from the user
 */
async function handleFeedback(bot, msg, feedbackText) {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();
  
  try {
    // Log the feedback
    logger.info(`Feedback from user ${telegramId}: ${feedbackText}`);
    
    // Get admin IDs from environment variable
    const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim());
    
    // Forward feedback to all admins
    for (const adminId of adminIds) {
      if (adminId) {
        await bot.sendMessage(
          adminId,
          `📬 Обратная связь от пользователя ${telegramId}:\n\n${feedbackText}`
        );
      }
    }
    
    // Confirm to the user
    await bot.sendMessage(
      chatId,
      '✅ Спасибо за ваш отзыв! Ваше сообщение отправлено администраторам.'
    );
  } catch (error) {
    logger.error(`Error handling feedback: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при отправке обратной связи. Пожалуйста, попробуйте позже.'
    );
  }
}

module.exports = {
  handleStart,
  handleFeedback
};