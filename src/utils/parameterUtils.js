/**
 * Validate parameters for prediction
 * @param {Array} paramArray - Array of parameter values
 * @returns {Object} - Validation result with valid flag and error message
 */
function validateParameters(paramArray) {
  // Check number of parameters
  if (paramArray.length < 7 || paramArray.length > 8) {
    return {
      valid: false,
      error: `Неверное количество параметров (${paramArray.length}). Ожидается 7 или 8 параметров.`
    };
  }
  
  // Parse parameters
  const euConcentration = parseFloat(paramArray[0]);
  const phenanthrolineConcentration = parseFloat(paramArray[1]);
  const ligandConcentration = parseFloat(paramArray[2]);
  const ligandType = parseInt(paramArray[3]);
  const phBsa = parseInt(paramArray[4]);
  const additionVolume = parseFloat(paramArray[5]);
  const additionTime = parseFloat(paramArray[6]);
  const additionRate = paramArray.length === 8 ? parseFloat(paramArray[7]) : (additionVolume / additionTime);
  
  // Validate each parameter
  if (isNaN(euConcentration) || euConcentration < 0) {
    return {
      valid: false,
      error: 'Концентрация Eu должна быть неотрицательным числом.'
    };
  }
  
  if (isNaN(phenanthrolineConcentration) || phenanthrolineConcentration < 0) {
    return {
      valid: false,
      error: 'Концентрация Фенантролина должна быть неотрицательным числом.'
    };
  }
  
  if (isNaN(ligandConcentration) || ligandConcentration < 0) {
    return {
      valid: false,
      error: 'Концентрация Лиганда должна быть неотрицательным числом.'
    };
  }
  
  if (isNaN(ligandType) || ligandType < 0 || ligandType > 3) {
    return {
      valid: false,
      error: 'Вид лиганда должен быть числом от 0 до 3.'
    };
  }
  
  if (isNaN(phBsa) || phBsa < 7 || phBsa > 11) {
    return {
      valid: false,
      error: 'pH BSA должен быть целым числом от 7 до 11.'
    };
  }
  
  if (isNaN(additionVolume) || additionVolume <= 0) {
    return {
      valid: false,
      error: 'Объем добавления должен быть положительным числом.'
    };
  }
  
  if (isNaN(additionTime) || additionTime <= 0) {
    return {
      valid: false,
      error: 'Время добавления должно быть положительным числом.'
    };
  }
  
  if (isNaN(additionRate) || additionRate <= 0) {
    return {
      valid: false,
      error: 'Скорость добавления должна быть положительным числом.'
    };
  }
  
  return { valid: true };
}

/**
 * Convert parameter array to an object
 * @param {Array} paramArray - Array of parameter values
 * @returns {Object} - Parameter object
 */
function convertParametersToObject(paramArray) {
  const euConcentration = parseFloat(paramArray[0]);
  const phenanthrolineConcentration = parseFloat(paramArray[1]);
  const ligandConcentration = parseFloat(paramArray[2]);
  const ligandType = parseInt(paramArray[3]);
  const phBsa = parseInt(paramArray[4]);
  const additionVolume = parseFloat(paramArray[5]);
  const additionTime = parseFloat(paramArray[6]);
  const additionRate = paramArray.length === 8 ? 
    parseFloat(paramArray[7]) : 
    (additionVolume / additionTime);
  
  return {
    euConcentration,
    phenanthrolineConcentration,
    ligandConcentration,
    ligandType,
    phBsa,
    additionVolume,
    additionTime,
    additionRate
  };
}

module.exports = {
  validateParameters,
  convertParametersToObject
};