const logger = require('../../utils/logger');
const Experiment = require('../../database/models/Experiment');
const { formatExperimentForDisplay } = require('../../utils/displayUtils');

// State storage for ongoing add result operations
const addResultState = new Map();

/**
 * Start the process of adding actual results to an experiment
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 * @param {string} experimentId - ID of the experiment to add results to
 */
async function startAddResult(bot, msg, experimentId) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  try {
    // Find the experiment
    const experiment = await Experiment.findOne({
      where: {
        experimentId,
        userId
      }
    });
    
    if (!experiment) {
      await bot.sendMessage(
        chatId,
        '❌ Эксперимент не найден или вы не имеете к нему доступа. Проверьте ID эксперимента.'
      );
      logger.warn(`User ${userId} attempted to add results to non-existent experiment ${experimentId}`);
      return;
    }
    
    // Check if results already exist
    if (experiment.actualSize !== null && experiment.actualPdI !== null) {
      await bot.sendMessage(
        chatId,
        '⚠️ Для этого эксперимента уже добавлены фактические результаты. Хотите перезаписать их?\n\n' +
        'Отправьте "Да" для подтверждения или любое другое сообщение для отмены.'
      );
      
      // Set state for confirmation
      addResultState.set(userId, {
        state: 'awaiting_overwrite_confirmation',
        experimentId
      });
      
      return;
    }
    
    // Display experiment details
    const experimentDisplay = formatExperimentForDisplay(experiment);
    
    await bot.sendMessage(
      chatId,
      `📊 *Добавление фактических результатов*\n\n` +
      `*Детали эксперимента:*\n${experimentDisplay}\n\n` +
      `Пожалуйста, введите фактический размер частиц (нм):\n` +
      `(число > 0, например: 125.4)`,
      { parse_mode: 'Markdown' }
    );
    
    // Set state for size input
    addResultState.set(userId, {
      state: 'awaiting_actual_size',
      experimentId
    });
    
    logger.info(`Started add result process for user ${userId}, experiment ${experimentId}`);
  } catch (error) {
    logger.error(`Error starting add result: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * Handle response during the add result process
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 */
async function handleAddResultResponse(bot, msg) {
  if (!msg.text) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const userState = addResultState.get(userId);
  
  // If the user is not in an add result state, do nothing
  if (!userState) return;
  
  try {
    // Check for cancel command
    if (msg.text.toLowerCase() === '/cancel') {
      addResultState.delete(userId);
      await bot.sendMessage(chatId, '🛑 Операция отменена.');
      logger.info(`Add result cancelled by user ${userId}`);
      return;
    }
    
    switch (userState.state) {
      case 'awaiting_overwrite_confirmation':
        if (msg.text.toLowerCase() === 'да') {
          // Continue with overwrite
          const experiment = await Experiment.findOne({
            where: {
              experimentId: userState.experimentId,
              userId
            }
          });
          
          const experimentDisplay = formatExperimentForDisplay(experiment);
          
          await bot.sendMessage(
            chatId,
            `📊 *Обновление фактических результатов*\n\n` +
            `*Детали эксперимента:*\n${experimentDisplay}\n\n` +
            `Пожалуйста, введите фактический размер частиц (нм):\n` +
            `(число > 0, например: 125.4)`,
            { parse_mode: 'Markdown' }
          );
          
          // Update state
          userState.state = 'awaiting_actual_size';
          addResultState.set(userId, userState);
        } else {
          // Cancel overwrite
          addResultState.delete(userId);
          await bot.sendMessage(chatId, '🛑 Операция отменена.');
          logger.info(`Add result overwrite cancelled by user ${userId}`);
        }
        break;
        
      case 'awaiting_actual_size':
        const sizeInput = msg.text.trim();
        const size = parseFloat(sizeInput);
        
        if (isNaN(size) || size <= 0) {
          await bot.sendMessage(
            chatId,
            '❌ Неверный формат. Пожалуйста, введите положительное число для размера частиц.'
          );
          return;
        }
        
        // Store size and ask for PdI
        userState.actualSize = size;
        userState.state = 'awaiting_actual_pdi';
        addResultState.set(userId, userState);
        
        await bot.sendMessage(
          chatId,
          `✅ Размер частиц: ${size} нм\n\n` +
          `Теперь введите фактический PdI:\n` +
          `(число >= 0, например: 0.123)`
        );
        break;
        
      case 'awaiting_actual_pdi':
        const pdiInput = msg.text.trim();
        const pdi = parseFloat(pdiInput);
        
        if (isNaN(pdi) || pdi < 0) {
          await bot.sendMessage(
            chatId,
            '❌ Неверный формат. Пожалуйста, введите неотрицательное число для PdI.'
          );
          return;
        }
        
        // Update experiment with actual results
        const experiment = await Experiment.findOne({
          where: {
            experimentId: userState.experimentId,
            userId
          }
        });
        
        // Calculate differences
        const sizeDiff = ((userState.actualSize - experiment.predictedSize) / experiment.predictedSize * 100).toFixed(1);
        const pdiDiff = ((pdi - experiment.predictedPdI) / experiment.predictedPdI * 100).toFixed(1);
        
        // Update experiment
        experiment.actualSize = userState.actualSize;
        experiment.actualPdI = pdi;
        await experiment.save();
        
        // Clear state
        addResultState.delete(userId);
        
        // Send confirmation
        await bot.sendMessage(
          chatId,
          `✅ *Фактические результаты сохранены!*\n\n` +
          `*ID эксперимента:* \`${experiment.experimentId}\`\n\n` +
          `*Прогноз:*\n` +
          `• Размер: ${experiment.predictedSize.toFixed(1)} нм\n` +
          `• PdI: ${experiment.predictedPdI.toFixed(3)}\n\n` +
          `*Факт:*\n` +
          `• Размер: ${userState.actualSize.toFixed(1)} нм (${sizeDiff}%)\n` +
          `• PdI: ${pdi.toFixed(3)} (${pdiDiff}%)\n\n` +
          `Для просмотра истории экспериментов используйте команду /history`,
          { parse_mode: 'Markdown' }
        );
        
        logger.info(`User ${userId} added results for experiment ${experiment.experimentId}`);
        break;
    }
  } catch (error) {
    logger.error(`Error handling add result response: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при обработке ввода. Пожалуйста, попробуйте позже.'
    );
    addResultState.delete(userId);
  }
}

/**
 * Show experiment history for a user
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 * @param {number|null} limit - Maximum number of experiments to show
 */
async function showHistory(bot, msg, limit) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  try {
    // Default limit to 10 if not specified
    const actualLimit = limit || 10;
    
    // Get experiments for the user
    const experiments = await Experiment.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: actualLimit
    });
    
    if (experiments.length === 0) {
      await bot.sendMessage(
        chatId,
        '📝 У вас пока нет истории экспериментов. Используйте команду /predict для создания прогноза.'
      );
      return;
    }
    
    // Format the history message
    let historyText = `📚 *История экспериментов* (последние ${actualLimit})\n\n`;
    
    for (const exp of experiments) {
      const date = new Date(exp.createdAt).toLocaleDateString('ru-RU');
      const params = exp.parameters;
      
      historyText += `*ID:* \`${exp.experimentId}\`\n`;
      historyText += `*Дата:* ${date}\n`;
      historyText += `*Параметры:* Eu=${params.euConcentration}, Фен=${params.phenanthrolineConcentration}, `;
      historyText += `Лиг=${params.ligandConcentration} тип ${params.ligandType}, pH=${params.phBsa}\n`;
      historyText += `*Прогноз:* Размер=${exp.predictedSize.toFixed(1)} нм, PdI=${exp.predictedPdI.toFixed(3)}\n`;
      
      if (exp.actualSize !== null && exp.actualPdI !== null) {
        const sizeDiff = ((exp.actualSize - exp.predictedSize) / exp.predictedSize * 100).toFixed(1);
        const pdiDiff = ((exp.actualPdI - exp.predictedPdI) / exp.predictedPdI * 100).toFixed(1);
        
        historyText += `*Факт:* Размер=${exp.actualSize.toFixed(1)} нм (Δ=${sizeDiff}%), `;
        historyText += `PdI=${exp.actualPdI.toFixed(3)} (Δ=${pdiDiff}%)\n`;
      } else {
        historyText += `*Факт:* Не указан\n`;
      }
      
      historyText += `\n`;
    }
    
    historyText += `Для добавления фактических результатов используйте:\n`;
    historyText += `/add_result ID_эксперимента\n\n`;
    historyText += `Для построения графиков используйте:\n`;
    historyText += `/plot параметр [ID_эксперимента_опорного]`;
    
    await bot.sendMessage(chatId, historyText, { parse_mode: 'Markdown' });
    logger.info(`Showed history for user ${userId}, ${experiments.length} experiments`);
  } catch (error) {
    logger.error(`Error showing history: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при получении истории экспериментов. Пожалуйста, попробуйте позже.'
    );
  }
}

module.exports = {
  startAddResult,
  handleAddResultResponse,
  showHistory
};