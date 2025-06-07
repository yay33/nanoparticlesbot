const User = require('../../database/models/User');
const Whitelist = require('../../database/models/Whitelist');
const logger = require('../../utils/logger');

/**
 * Check if a user is whitelisted
 * @param {string} telegramId - Telegram ID of the user
 * @returns {Promise<boolean>} - Whether the user is whitelisted
 */
async function isUserWhitelisted(telegramId) {
  try {
    const whitelist = await Whitelist.findOne({
      where: { telegramId: telegramId.toString() }
    });
    
    return !!whitelist;
  } catch (error) {
    logger.error(`Error checking whitelist for user ${telegramId}: ${error.message}`);
    return false;
  }
}

/**
 * Check if a user is an admin
 * @param {string} telegramId - Telegram ID of the user
 * @returns {Promise<boolean>} - Whether the user is an admin
 */
async function isUserAdmin(telegramId) {
  try {
    // Check if the user is in the ADMIN_TELEGRAM_IDS environment variable
    const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim());
    if (adminIds.includes(telegramId.toString())) {
      return true;
    }

    // Check if the user is an admin in the database
    const user = await User.findOne({
      where: { 
        telegramId: telegramId.toString(),
        isAdmin: true
      }
    });
    
    return !!user;
  } catch (error) {
    logger.error(`Error checking admin status for user ${telegramId}: ${error.message}`);
    return false;
  }
}

module.exports = {
  isUserWhitelisted,
  isUserAdmin
};