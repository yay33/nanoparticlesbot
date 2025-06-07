const logger = require('../../utils/logger');
const User = require('../../database/models/User');
const Whitelist = require('../../database/models/Whitelist');
const PredictionModel = require('../../database/models/PredictionModel');
const BackupLog = require('../../database/models/BackupLog');
const { createDatabaseBackup, restoreDatabaseFromBackup } = require('../../utils/backupUtils');
const { validateModelFile } = require('../../ml/predictionService');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Add a user to the whitelist
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 * @param {string} targetTelegramId - Telegram ID to add to whitelist
 * @param {string} name - Name of the user
 */
async function addUserToWhitelist(bot, msg, targetTelegramId, name) {
  const chatId = msg.chat.id;
  const adminId = msg.from.id.toString();
  
  try {
    // Check if user already exists
    const [user, userCreated] = await User.findOrCreate({
      where: { telegramId: targetTelegramId },
      defaults: {
        name,
        isAdmin: false
      }
    });
    
    // Check if already whitelisted
    const [whitelist, whitelistCreated] = await Whitelist.findOrCreate({
      where: { telegramId: targetTelegramId },
      defaults: {
        addedBy: adminId
      }
    });
    
    if (!whitelistCreated) {
      await bot.sendMessage(
        chatId,
        `⚠️ Пользователь с ID ${targetTelegramId} уже находится в белом списке.`
      );
      return;
    }
    
    // If the user was just created, update their name
    if (!userCreated) {
      user.name = name;
      await user.save();
    }
    
    await bot.sendMessage(
      chatId,
      `✅ Пользователь ${name} (ID: ${targetTelegramId}) успешно добавлен в белый список.`
    );
    
    logger.info(`Admin ${adminId} added user ${targetTelegramId} to whitelist`);
  } catch (error) {
    logger.error(`Error adding user to whitelist: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при добавлении пользователя в белый список. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * Remove a user from the whitelist
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 * @param {string} targetTelegramId - Telegram ID to remove from whitelist
 */
async function removeUserFromWhitelist(bot, msg, targetTelegramId) {
  const chatId = msg.chat.id;
  const adminId = msg.from.id.toString();
  
  try {
    // Check if user is in whitelist
    const whitelist = await Whitelist.findOne({
      where: { telegramId: targetTelegramId }
    });
    
    if (!whitelist) {
      await bot.sendMessage(
        chatId,
        `⚠️ Пользователь с ID ${targetTelegramId} не найден в белом списке.`
      );
      return;
    }
    
    // Remove from whitelist
    await whitelist.destroy();
    
    await bot.sendMessage(
      chatId,
      `✅ Пользователь с ID ${targetTelegramId} успешно удален из белого списка.`
    );
    
    logger.info(`Admin ${adminId} removed user ${targetTelegramId} from whitelist`);
  } catch (error) {
    logger.error(`Error removing user from whitelist: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при удалении пользователя из белого списка. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * List all users in the whitelist
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 */
async function listWhitelistedUsers(bot, msg) {
  const chatId = msg.chat.id;
  
  try {
    // Get all whitelist entries with user info
    const whitelistEntries = await Whitelist.findAll({
      include: [
        {
          model: User,
          attributes: ['telegramId', 'name', 'isAdmin']
        }
      ]
    });
    
    if (whitelistEntries.length === 0) {
      await bot.sendMessage(
        chatId,
        '📝 Белый список пользователей пуст.'
      );
      return;
    }
    
    // Format the whitelist message
    let whitelistText = `👥 *Список разрешенных пользователей* (${whitelistEntries.length})\n\n`;
    
    for (const entry of whitelistEntries) {
      const user = entry.User;
      const addedDate = new Date(entry.addedAt).toLocaleDateString('ru-RU');
      
      whitelistText += `*ID:* ${user.telegramId}\n`;
      whitelistText += `*Имя:* ${user.name || 'Не указано'}\n`;
      whitelistText += `*Администратор:* ${user.isAdmin ? 'Да' : 'Нет'}\n`;
      whitelistText += `*Добавлен:* ${addedDate}\n\n`;
    }
    
    await bot.sendMessage(chatId, whitelistText, { parse_mode: 'Markdown' });
    logger.info(`Admin ${msg.from.id} listed whitelisted users`);
  } catch (error) {
    logger.error(`Error listing whitelisted users: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при получении списка пользователей. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * List all prediction models
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 */
async function listModels(bot, msg) {
  const chatId = msg.chat.id;
  
  try {
    // Get all models
    const models = await PredictionModel.findAll({
      order: [
        ['name', 'ASC'],
        ['isActive', 'DESC'],
        ['trainedDate', 'DESC']
      ]
    });
    
    if (models.length === 0) {
      await bot.sendMessage(
        chatId,
        '📝 Список моделей пуст. Используйте команду `/admin model reload` для загрузки моделей.'
      );
      return;
    }
    
    // Format the models message
    let modelsText = `🧠 *Список моделей прогнозирования* (${models.length})\n\n`;
    
    for (const model of models) {
      const trainedDate = new Date(model.trainedDate).toLocaleDateString('ru-RU');
      const metrics = model.metrics ? JSON.stringify(model.metrics) : 'Не указаны';
      
      modelsText += `*Название:* ${model.name}\n`;
      modelsText += `*Версия:* ${model.version}\n`;
      modelsText += `*Дата обучения:* ${trainedDate}\n`;
      modelsText += `*Метрики:* ${metrics}\n`;
      modelsText += `*Путь:* ${model.filePath}\n`;
      modelsText += `*Активна:* ${model.isActive ? '✅' : '❌'}\n\n`;
    }
    
    await bot.sendMessage(chatId, modelsText, { parse_mode: 'Markdown' });
    logger.info(`Admin ${msg.from.id} listed prediction models`);
  } catch (error) {
    logger.error(`Error listing models: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при получении списка моделей. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * Reload prediction models
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 * @param {string} sizeModelPath - Path to the size model file
 * @param {string} pdiModelPath - Path to the PDI model file
 */
async function reloadModels(bot, msg, sizeModelPath, pdiModelPath) {
  const chatId = msg.chat.id;
  const adminId = msg.from.id.toString();
  
  try {
    // Check if files exist
    if (!fs.existsSync(sizeModelPath) || !fs.existsSync(pdiModelPath)) {
      await bot.sendMessage(
        chatId,
        '❌ Один или оба файла моделей не найдены. Проверьте пути и попробуйте снова.'
      );
      return;
    }
    
    // Validate models
    const sizeModelValid = await validateModelFile(sizeModelPath);
    const pdiModelValid = await validateModelFile(pdiModelPath);
    
    if (!sizeModelValid || !pdiModelValid) {
      await bot.sendMessage(
        chatId,
        '❌ Один или оба файла моделей недействительны. Проверьте файлы и попробуйте снова.'
      );
      return;
    }
    
    // Deactivate all existing models
    await PredictionModel.update(
      { isActive: false },
      { where: {} }
    );
    
    // Create directory for models if it doesn't exist
    const modelsDir = path.join(__dirname, '../../../models');
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }
    
    // Copy and register size model
    const sizeModelDestPath = path.join(modelsDir, `size_model_${Date.now()}.keras`);
    fs.copyFileSync(sizeModelPath, sizeModelDestPath);
    
    await PredictionModel.create({
      name: 'size_model',
      version: `${new Date().toISOString().slice(0, 10)}`,
      trainedDate: new Date(),
      metrics: { r2: 0.85 }, // Default metrics, should be updated with actual values
      filePath: sizeModelDestPath,
      isActive: true
    });
    
    // Copy and register PDI model
    const pdiModelDestPath = path.join(modelsDir, `pdi_model_${Date.now()}.keras`);
    fs.copyFileSync(pdiModelPath, pdiModelDestPath);
    
    await PredictionModel.create({
      name: 'pdi_model',
      version: `${new Date().toISOString().slice(0, 10)}`,
      trainedDate: new Date(),
      metrics: { r2: 0.82 }, // Default metrics, should be updated with actual values
      filePath: pdiModelDestPath,
      isActive: true
    });
    
    // Update environment variables
    process.env.SIZE_MODEL_PATH = sizeModelDestPath;
    process.env.PDI_MODEL_PATH = pdiModelDestPath;
    
    await bot.sendMessage(
      chatId,
      '✅ Модели успешно загружены и активированы. Прогнозы теперь будут использовать новые модели.'
    );
    
    logger.info(`Admin ${adminId} reloaded prediction models: size_model=${sizeModelDestPath}, pdi_model=${pdiModelDestPath}`);
  } catch (error) {
    logger.error(`Error reloading models: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при загрузке моделей. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * Create a database backup
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 */
async function createBackup(bot, msg) {
  const chatId = msg.chat.id;
  const adminId = msg.from.id.toString();
  
  try {
    // Send processing message
    const processingMsg = await bot.sendMessage(
      chatId,
      '⏳ Создание резервной копии базы данных...'
    );
    
    // Create backup directory if it doesn't exist
    const backupDir = path.join(__dirname, '../../../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Generate backup filename
    const backupId = uuidv4();
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupFilename = `backup_${timestamp}_${backupId}.sql`;
    const backupPath = path.join(backupDir, backupFilename);
    
    // Create backup
    await createDatabaseBackup(backupPath);
    
    // Get file size
    const stats = fs.statSync(backupPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    // Create backup log entry
    await BackupLog.create({
      logId: backupId,
      backupDate: new Date(),
      adminId,
      fileName: backupFilename,
      size: fileSizeMB
    });
    
    // Update message
    await bot.editMessageText(
      `✅ Резервная копия успешно создана!\n\n` +
      `*ID копии:* \`${backupId}\`\n` +
      `*Дата/время:* ${new Date().toLocaleString('ru-RU')}\n` +
      `*Имя файла:* ${backupFilename}\n` +
      `*Размер:* ${fileSizeMB.toFixed(2)} МБ\n\n` +
      `Для просмотра всех резервных копий используйте команду:\n` +
      `/admin backup list`,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'Markdown'
      }
    );
    
    logger.info(`Admin ${adminId} created backup: ${backupFilename}, size: ${fileSizeMB.toFixed(2)} MB`);
  } catch (error) {
    logger.error(`Error creating backup: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при создании резервной копии. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * List all database backups
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 */
async function listBackups(bot, msg) {
  const chatId = msg.chat.id;
  
  try {
    // Get all backup logs
    const backups = await BackupLog.findAll({
      order: [['backupDate', 'DESC']],
      include: [
        {
          model: User,
          attributes: ['name']
        }
      ]
    });
    
    if (backups.length === 0) {
      await bot.sendMessage(
        chatId,
        '📝 Список резервных копий пуст. Используйте команду `/admin backup create` для создания новой копии.'
      );
      return;
    }
    
    // Format the backups message
    let backupsText = `💾 *Список резервных копий* (${backups.length})\n\n`;
    
    for (const backup of backups) {
      const backupDate = new Date(backup.backupDate).toLocaleString('ru-RU');
      const adminName = backup.User ? backup.User.name : 'Неизвестно';
      
      backupsText += `*ID:* \`${backup.logId}\`\n`;
      backupsText += `*Дата:* ${backupDate}\n`;
      backupsText += `*Администратор:* ${adminName}\n`;
      backupsText += `*Имя файла:* ${backup.fileName}\n`;
      backupsText += `*Размер:* ${backup.size ? backup.size.toFixed(2) + ' МБ' : 'Неизвестно'}\n`;
      backupsText += `*Статус:* ${backup.status === 'completed' ? '✅ Завершено' : '❌ Ошибка'}\n\n`;
    }
    
    backupsText += `Для восстановления из резервной копии используйте команду:\n`;
    backupsText += `/admin backup restore ID_копии`;
    
    await bot.sendMessage(chatId, backupsText, { parse_mode: 'Markdown' });
    logger.info(`Admin ${msg.from.id} listed backups`);
  } catch (error) {
    logger.error(`Error listing backups: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при получении списка резервных копий. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * Restore database from backup
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 * @param {string} backupId - ID of the backup to restore from
 */
async function restoreBackup(bot, msg, backupId) {
  const chatId = msg.chat.id;
  const adminId = msg.from.id.toString();
  
  try {
    // Find the backup
    const backup = await BackupLog.findOne({
      where: { logId: backupId }
    });
    
    if (!backup) {
      await bot.sendMessage(
        chatId,
        '❌ Резервная копия не найдена. Проверьте ID копии и попробуйте снова.'
      );
      return;
    }
    
    // Confirm restoration
    await bot.sendMessage(
      chatId,
      `⚠️ *ВНИМАНИЕ! Восстановление из резервной копии*\n\n` +
      `Вы собираетесь восстановить базу данных из копии:\n` +
      `*ID:* ${backup.logId}\n` +
      `*Дата:* ${new Date(backup.backupDate).toLocaleString('ru-RU')}\n` +
      `*Имя файла:* ${backup.fileName}\n\n` +
      `⚠️ Это действие перезапишет ВСЕ текущие данные!\n` +
      `⚠️ Бот будет недоступен во время восстановления.\n\n` +
      `Для подтверждения восстановления, отправьте:\n` +
      `\`/admin backup confirm ${backupId}\``,
      { parse_mode: 'Markdown' }
    );
    
    logger.info(`Admin ${adminId} requested confirmation for backup restore: ${backupId}`);
  } catch (error) {
    logger.error(`Error preparing backup restore: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при подготовке к восстановлению. Пожалуйста, попробуйте позже.'
    );
  }
}

/**
 * Show application logs
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object from Telegram
 * @param {string} level - Log level to filter by
 * @param {number} limit - Maximum number of log entries to show
 */
async function showLogs(bot, msg, level, limit) {
  const chatId = msg.chat.id;
  
  try {
    // Validate log level
    const validLevels = ['error', 'warning', 'warn', 'info', 'debug'];
    if (!validLevels.includes(level.toLowerCase())) {
      await bot.sendMessage(
        chatId,
        `❌ Неверный уровень логирования. Допустимые уровни: ${validLevels.join(', ')}`
      );
      return;
    }
    
    // Map 'warning' to 'warn' for grep
    const grepLevel = level.toLowerCase() === 'warning' ? 'warn' : level.toLowerCase();
    
    // Get log file path
    const logFile = grepLevel === 'error' ? 
      path.join(__dirname, '../../../logs/error.log') :
      path.join(__dirname, '../../../logs/combined.log');
    
    if (!fs.existsSync(logFile)) {
      await bot.sendMessage(
        chatId,
        '❌ Файл логов не найден. Возможно, приложение еще не создало файлы логов.'
      );
      return;
    }
    
    // Use grep to filter logs
    const { stdout } = await execPromise(`grep -i '${grepLevel}' ${logFile} | tail -n ${limit}`);
    
    if (!stdout.trim()) {
      await bot.sendMessage(
        chatId,
        `📝 В логах не найдено записей уровня "${level}".`
      );
      return;
    }
    
    // Format log entries
    const logs = stdout.split('\n').filter(line => line.trim());
    let logsText = `📋 *Последние ${logs.length} ${level} логов*\n\n`;
    
    logs.forEach((log, index) => {
      logsText += `*${index + 1}.* \`${log}\`\n\n`;
    });
    
    // Split message if it's too long
    if (logsText.length > 4000) {
      const chunks = [];
      for (let i = 0; i < logsText.length; i += 4000) {
        chunks.push(logsText.slice(i, i + 4000));
      }
      
      for (let i = 0; i < chunks.length; i++) {
        await bot.sendMessage(
          chatId,
          `${i === 0 ? '' : '(продолжение) '}${chunks[i]}`,
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      await bot.sendMessage(chatId, logsText, { parse_mode: 'Markdown' });
    }
    
    logger.info(`Admin ${msg.from.id} viewed ${level} logs, limit ${limit}`);
  } catch (error) {
    logger.error(`Error showing logs: ${error.message}`);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при получении логов. Пожалуйста, попробуйте позже.'
    );
  }
}

module.exports = {
  addUserToWhitelist,
  removeUserFromWhitelist,
  listWhitelistedUsers,
  listModels,
  reloadModels,
  createBackup,
  listBackups,
  restoreBackup,
  showLogs
};