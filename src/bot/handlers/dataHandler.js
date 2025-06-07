const logger = require('../../utils/logger');
const Experiment = require('../../database/models/Experiment');
const { generateChart } = require('../../utils/chartUtils');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const { formatParametersForCsv } = require('../../utils/displayUtils');

/**
 * Generate a plot based on parameter
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 * @param {string} parameter - Parameter to plot
 * @param {string} referenceExperimentId - ID of reference experiment to highlight
 */
async function generatePlot(bot, msg, parameter, referenceExperimentId) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  try {
    // Check if a parameter was specified
    if (!parameter) {
      // Show list of available parameters
      await bot.sendMessage(
        chatId,
        '📊 *Построение графика*\n\n' +
        'Пожалуйста, укажите параметр для построения графика:\n\n' +
        '• `/plot eu` - Концентрация Eu\n' +
        '• `/plot phen` - Концентрация Фенантролина\n' +
        '• `/plot lig` - Концентрация Лиганда\n' +
        '• `/plot ligtype` - Вид лиганда\n' +
        '• `/plot ph` - pH BSA\n' +
        '• `/plot vol` - Объем добавления\n' +
        '• `/plot time` - Время добавления\n' +
        '• `/plot rate` - Скорость добавления\n\n' +
        'Опционально можно указать ID опорного эксперимента для выделения на графике:\n' +
        '`/plot параметр ID_эксперимента`\n\n' +
        'Для построения тепловой карты корреляций используйте:\n' +
        '`/plot_correlation`',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    // Get parameter field
    const parameterMap = {
      'eu': 'euConcentration',
      'phen': 'phenanthrolineConcentration',
      'lig': 'ligandConcentration',
      'ligtype': 'ligandType',
      'ph': 'phBsa',
      'vol': 'additionVolume',
      'time': 'additionTime',
      'rate': 'additionRate'
    };
    
    const parameterField = parameterMap[parameter.toLowerCase()];
    
    if (!parameterField) {
      await bot.sendMessage(
        chatId,
        '❌ Неизвестный параметр. Допустимые параметры: eu, phen, lig, ligtype, ph, vol, time, rate'
      );
      return;
    }
    
    // Get experiments for the user
    const experiments = await Experiment.findAll({
      where: { userId },
      order: [['createdAt', 'ASC']]
    });
    
    if (experiments.length === 0) {
      await bot.sendMessage(
        chatId,
        '📝 У вас пока нет истории экспериментов. Используйте команду /predict для создания прогноза.'
      );
      return;
    }
    
    // Prepare data for plotting
    const plotData = {
      x: [],
      ySize: [],
      yPdi: [],
      referenceIndex: -1
    };
    
    experiments.forEach((exp, index) => {
      const value = exp.parameters[parameterField];
      if (value !== undefined) {
        plotData.x.push(value);
        plotData.ySize.push(exp.actualSize || exp.predictedSize);
        plotData.yPdi.push(exp.actualPdI || exp.predictedPdI);
        
        // Check if this is the reference experiment
        if (referenceExperimentId && exp.experimentId === referenceExperimentId) {
          plotData.referenceIndex = index;
        }
      }
    });
    
    // Create "temp" directory if it doesn't exist
    const tempDir = path.join(__dirname, '../../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generate chart
    const chartOptions = {
      title: `Зависимость от параметра: ${getParameterDisplayName(parameter)}`,
      xAxisLabel: getParameterDisplayName(parameter),
      yAxisLabel: 'Размер (нм) / PdI',
      legendLabels: ['Размер частиц (нм)', 'PdI x 100'],
      referenceIndex: plotData.referenceIndex
    };
    
    // Scale PdI values for better visibility
    const scaledPdi = plotData.yPdi.map(val => val * 100);
    
    const chartPath = await generateChart(
      plotData.x,
      [plotData.ySize, scaledPdi],
      chartOptions,
      path.join(tempDir, `plot_${userId}_${Date.now()}.png`)
    );
    
    // Send the chart
    await bot.sendPhoto(
      chatId,
      fs.createReadStream(chartPath),
      {
        caption: `📊 График зависимости от параметра: ${getParameterDisplayName(parameter)}` +
                (referenceExperimentId ? `\nВыделенный эксперимент: ${referenceExperimentId}` : '') +
                '\n\nЗначения PdI умножены на 100 для лучшей визуализации'
      }
    );
    
    // Clean up the temporary file
    fs.unlinkSync(chartPath);
    
    logger.info(`Generated plot for user ${userId}, parameter ${parameter}`);
  } catch (error) {
    logger.error(`Error generating plot: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при построении графика. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * Generate a correlation plot
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 */
async function generateCorrelationPlot(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  try {
    // Get experiments for the user
    const experiments = await Experiment.findAll({
      where: { userId }
    });
    
    if (experiments.length < 5) {
      await bot.sendMessage(
        chatId,
        '⚠️ Для построения корреляционной карты необходимо минимум 5 экспериментов. У вас: ' +
        experiments.length + '.\n\nИспользуйте команду /predict для создания прогнозов.'
      );
      return;
    }
    
    // Prepare data for correlation plot
    const data = {
      euConcentration: [],
      phenanthrolineConcentration: [],
      ligandConcentration: [],
      ligandType: [],
      phBsa: [],
      additionVolume: [],
      additionTime: [],
      additionRate: [],
      size: [],
      pdi: []
    };
    
    experiments.forEach(exp => {
      data.euConcentration.push(exp.parameters.euConcentration);
      data.phenanthrolineConcentration.push(exp.parameters.phenanthrolineConcentration);
      data.ligandConcentration.push(exp.parameters.ligandConcentration);
      data.ligandType.push(exp.parameters.ligandType);
      data.phBsa.push(exp.parameters.phBsa);
      data.additionVolume.push(exp.parameters.additionVolume);
      data.additionTime.push(exp.parameters.additionTime);
      data.additionRate.push(exp.parameters.additionRate);
      data.size.push(exp.actualSize || exp.predictedSize);
      data.pdi.push(exp.actualPdI || exp.predictedPdI);
    });
    
    // Create "temp" directory if it doesn't exist
    const tempDir = path.join(__dirname, '../../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generate correlation heatmap
    const labels = [
      'Конц. Eu', 'Конц. Фен', 'Конц. Лиг', 'Вид лиганда', 'pH BSA',
      'Объем доб.', 'Время доб.', 'Скорость доб.', 'Размер', 'PdI'
    ];
    
    const chartOptions = {
      title: 'Тепловая карта корреляции параметров',
      isCorrelation: true,
      labels
    };
    
    const chartPath = await generateChart(
      data,
      null,
      chartOptions,
      path.join(tempDir, `correlation_${userId}_${Date.now()}.png`)
    );
    
    // Send the chart
    await bot.sendPhoto(
      chatId,
      fs.createReadStream(chartPath),
      {
        caption: '🔥 Тепловая карта корреляции параметров\n\n' +
                'Цвет ячейки показывает силу связи между параметрами:\n' +
                '- Тёмно-красный: сильная положительная корреляция (+1)\n' +
                '- Тёмно-синий: сильная отрицательная корреляция (-1)\n' +
                '- Белый: нет корреляции (0)'
      }
    );
    
    // Clean up the temporary file
    fs.unlinkSync(chartPath);
    
    logger.info(`Generated correlation plot for user ${userId}`);
  } catch (error) {
    logger.error(`Error generating correlation plot: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при построении карты корреляции. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * Export user experiments to CSV
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 */
async function exportToCsv(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  try {
    // Get experiments for the user
    const experiments = await Experiment.findAll({
      where: { userId },
      order: [['createdAt', 'ASC']]
    });
    
    if (experiments.length === 0) {
      await bot.sendMessage(
        chatId,
        '📝 У вас пока нет истории экспериментов. Используйте команду /predict для создания прогноза.'
      );
      return;
    }
    
    // Create "temp" directory if it doesn't exist
    const tempDir = path.join(__dirname, '../../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Create CSV file
    const csvFilePath = path.join(tempDir, `experiments_${userId}_${Date.now()}.csv`);
    
    // Define CSV header
    const csvWriter = createObjectCsvWriter({
      path: csvFilePath,
      header: [
        { id: 'id', title: 'ID эксперимента' },
        { id: 'date', title: 'Дата' },
        { id: 'euConcentration', title: 'Конц. Eu (мМ/л)' },
        { id: 'phenanthrolineConcentration', title: 'Конц. Фенантролина (мМ/л)' },
        { id: 'ligandConcentration', title: 'Конц. Лиганда (мМ/л)' },
        { id: 'ligandType', title: 'Вид лиганда' },
        { id: 'phBsa', title: 'pH BSA' },
        { id: 'additionVolume', title: 'Объем доб. (мл)' },
        { id: 'additionTime', title: 'Время доб. (мин)' },
        { id: 'additionRate', title: 'Скорость доб. (мл/мин)' },
        { id: 'predictedSize', title: 'Прогноз размера (нм)' },
        { id: 'predictedPdI', title: 'Прогноз PdI' },
        { id: 'actualSize', title: 'Факт. размер (нм)' },
        { id: 'actualPdI', title: 'Факт. PdI' },
        { id: 'sizeDiff', title: 'Разница размера (%)' },
        { id: 'pdiDiff', title: 'Разница PdI (%)' }
      ]
    });
    
    // Prepare data for CSV
    const records = experiments.map(exp => {
      const sizeDiff = exp.actualSize ? ((exp.actualSize - exp.predictedSize) / exp.predictedSize * 100).toFixed(1) : '';
      const pdiDiff = exp.actualPdI ? ((exp.actualPdI - exp.predictedPdI) / exp.predictedPdI * 100).toFixed(1) : '';
      
      return {
        id: exp.experimentId,
        date: new Date(exp.createdAt).toLocaleDateString('ru-RU'),
        ...formatParametersForCsv(exp.parameters),
        predictedSize: exp.predictedSize.toFixed(1),
        predictedPdI: exp.predictedPdI.toFixed(3),
        actualSize: exp.actualSize ? exp.actualSize.toFixed(1) : '',
        actualPdI: exp.actualPdI ? exp.actualPdI.toFixed(3) : '',
        sizeDiff,
        pdiDiff
      };
    });
    
    // Write to CSV
    await csvWriter.writeRecords(records);
    
    // Send the file
    await bot.sendDocument(
      chatId,
      fs.createReadStream(csvFilePath),
      {
        caption: `📊 Экспорт данных (${experiments.length} экспериментов)`,
        filename: `nanoparticle_experiments_${new Date().toISOString().slice(0, 10)}.csv`
      }
    );
    
    // Clean up the temporary file
    fs.unlinkSync(csvFilePath);
    
    logger.info(`Exported CSV for user ${userId}, ${experiments.length} experiments`);
  } catch (error) {
    logger.error(`Error exporting to CSV: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при экспорте данных. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * Get a human-readable display name for a parameter
 * @param {string} parameter - Parameter code
 * @returns {string} - Display name
 */
function getParameterDisplayName(parameter) {
  const displayNames = {
    'eu': 'Концентрация Eu (мМ/л)',
    'phen': 'Концентрация Фенантролина (мМ/л)',
    'lig': 'Концентрация Лиганда (мМ/л)',
    'ligtype': 'Вид лиганда',
    'ph': 'pH BSA',
    'vol': 'Объем добавления (мл)',
    'time': 'Время добавления (мин)',
    'rate': 'Скорость добавления (мл/мин)'
  };
  
  return displayNames[parameter.toLowerCase()] || parameter;
}

module.exports = {
  generatePlot,
  generateCorrelationPlot,
  exportToCsv
};