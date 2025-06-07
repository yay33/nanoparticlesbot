const logger = require('../../utils/logger');
const Experiment = require('../../database/models/Experiment');
const { makeModelPrediction } = require('../../ml/predictionService');
const { convertParametersToObject, validateParameters } = require('../../utils/parameterUtils');

// State storage for ongoing predictions
const predictionState = new Map();

/**
 * Start the prediction process
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 */
async function startPrediction(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  try {
    // Reset any existing prediction state for this user
    predictionState.delete(userId);
    
    // Send instructions message
    await bot.sendMessage(
      chatId,
      '🧪 *Прогнозирование параметров наночастиц*\n\n' +
      'Введите параметры синтеза в одной строке через пробел в следующем порядке:\n\n' +
      '1. Концентрация Eu (мМ/л) [число > 0]\n' +
      '2. Концентрация Фенантролина (мМ/л) [число >= 0]\n' +
      '3. Концентрация Лиганда (мМ/л) [число >= 0]\n' +
      '4. Вид лиганда [0-3]:\n' +
      '   • 0 - нет\n' +
      '   • 1 - кислота\n' +
      '   • 2 - эфир\n' +
      '   • 3 - нафтил\n' +
      '5. pH BSA [целое число: 7-11]\n' +
      '6. Объем добавления (мл) [число > 0]\n' +
      '7. Время добавления (мин) [число > 0]\n' +
      '8. Скорость добавления (мл/мин) [число > 0, опционально]\n\n' +
      'Пример: `1 1 3 2 11 500 30`\n' +
      'Пример с указанием скорости: `2 2 6 1 9 340 34 10`\n\n' +
      'Или отправьте /cancel для отмены.',
      { parse_mode: 'Markdown' }
    );
    
    // Set prediction state for this user
    predictionState.set(userId, { state: 'awaiting_parameters' });
    
    logger.info(`Started prediction process for user ${userId}`);
  } catch (error) {
    logger.error(`Error starting prediction: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при запуске прогнозирования. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * Handle the response to a prediction request
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 */
async function handlePredictionResponse(bot, msg) {
  if (!msg.text) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const userState = predictionState.get(userId);
  
  // If the user is not in a prediction state, do nothing
  if (!userState || userState.state !== 'awaiting_parameters') return;
  
  try {
    // Check for cancel command
    if (msg.text.toLowerCase() === '/cancel') {
      predictionState.delete(userId);
      await bot.sendMessage(chatId, '🛑 Прогнозирование отменено.');
      logger.info(`Prediction cancelled by user ${userId}`);
      return;
    }
    
    // Parse parameters
    const parameterInput = msg.text.trim();
    const paramArray = parameterInput.split(/\s+/).map(param => param.trim());
    
    // Validate parameters
    const validationResult = validateParameters(paramArray);
    if (!validationResult.valid) {
      await bot.sendMessage(
        chatId,
        `❌ Ошибка в параметрах: ${validationResult.error}\n\nПожалуйста, проверьте ввод и попробуйте снова.`
      );
      logger.warn(`Invalid parameters from user ${userId}: ${parameterInput}`);
      return;
    }
    
    // Convert parameters to an object
    const parameters = convertParametersToObject(paramArray);
    
    // Send "processing" message
    const processingMsg = await bot.sendMessage(
      chatId,
      '⏳ Обрабатываю запрос и выполняю прогнозирование...'
    );
    
    // Make prediction
    const prediction = await makeModelPrediction(parameters);
    
    // Save experiment to database
    const experiment = await Experiment.create({
      parameters,
      predictedSize: prediction.size,
      predictedPdI: prediction.pdi,
      userId
    });
    
    // Format parameter display
    const parameterDisplay = formatParametersForDisplay(parameters);
    
    // Send prediction result
    await bot.editMessageText(
      `🔬 *Результаты прогнозирования*\n\n` +
      `*Параметры синтеза:*\n${parameterDisplay}\n\n` +
      `*Предсказанный размер частиц:* ${prediction.size.toFixed(1)} нм\n` +
      `*Предсказанный PdI:* ${prediction.pdi.toFixed(3)}\n` +
      `*Точность прогноза (R²):* ~${(prediction.sizeConfidence * 100).toFixed(0)}% / ${(prediction.pdiConfidence * 100).toFixed(0)}%\n\n` +
      `*Дата/время прогноза:* ${new Date().toLocaleString('ru-RU')}\n` +
      `*ID эксперимента:* \`${experiment.experimentId}\`\n\n` +
      `Чтобы добавить фактические результаты позже, используйте команду:\n` +
      `/add_result ${experiment.experimentId}`,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'Markdown'
      }
    );
    
    // Clear prediction state
    predictionState.delete(userId);
    
    logger.info(`Prediction completed for user ${userId}, experiment ID: ${experiment.experimentId}`);
  } catch (error) {
    logger.error(`Error handling prediction response: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при обработке параметров. Пожалуйста, проверьте ввод и попробуйте снова.'
    );
    predictionState.delete(userId);
  }
}

/**
 * Format parameters for display in messages
 * @param {Object} parameters - Parameter object
 * @returns {string} - Formatted parameter string
 */
function formatParametersForDisplay(parameters) {
  const ligandTypeMap = {
    0: 'нет',
    1: 'кислота',
    2: 'эфир',
    3: 'нафтил'
  };
  
  return [
    `• Конц. Eu: ${parameters.euConcentration} мМ/л`,
    `• Конц. Фенантролина: ${parameters.phenanthrolineConcentration} мМ/л`,
    `• Конц. Лиганда: ${parameters.ligandConcentration} мМ/л`,
    `• Вид лиганда: ${ligandTypeMap[parameters.ligandType]} (${parameters.ligandType})`,
    `• pH BSA: ${parameters.phBsa}`,
    `• Объем добавления: ${parameters.additionVolume} мл`,
    `• Время добавления: ${parameters.additionTime} мин`,
    `• Скорость добавления: ${parameters.additionRate} мл/мин`
  ].join('\n');
}

module.exports = {
  startPrediction,
  handlePredictionResponse
};