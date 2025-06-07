/**
 * Format experiment parameters for display in messages
 * @param {Object} experiment - Experiment object from database
 * @returns {string} - Formatted experiment string
 */
function formatExperimentForDisplay(experiment) {
  const params = experiment.parameters;
  const ligandTypeMap = {
    0: 'нет',
    1: 'кислота',
    2: 'эфир',
    3: 'нафтил'
  };
  
  return [
    `• Конц. Eu: ${params.euConcentration} мМ/л`,
    `• Конц. Фенантролина: ${params.phenanthrolineConcentration} мМ/л`,
    `• Конц. Лиганда: ${params.ligandConcentration} мМ/л`,
    `• Вид лиганда: ${ligandTypeMap[params.ligandType]} (${params.ligandType})`,
    `• pH BSA: ${params.phBsa}`,
    `• Объем добавления: ${params.additionVolume} мл`,
    `• Время добавления: ${params.additionTime} мин`,
    `• Скорость добавления: ${params.additionRate.toFixed(2)} мл/мин`,
    `• Предсказанный размер: ${experiment.predictedSize.toFixed(1)} нм`,
    `• Предсказанный PdI: ${experiment.predictedPdI.toFixed(3)}`
  ].join('\n');
}

/**
 * Format parameters for CSV export
 * @param {Object} params - Parameter object
 * @returns {Object} - Formatted parameters for CSV
 */
function formatParametersForCsv(params) {
  return {
    euConcentration: params.euConcentration,
    phenanthrolineConcentration: params.phenanthrolineConcentration,
    ligandConcentration: params.ligandConcentration,
    ligandType: params.ligandType,
    phBsa: params.phBsa,
    additionVolume: params.additionVolume,
    additionTime: params.additionTime,
    additionRate: params.additionRate.toFixed(2)
  };
}

module.exports = {
  formatExperimentForDisplay,
  formatParametersForCsv
};