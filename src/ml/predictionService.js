const logger = require('../utils/logger');
const PredictionModel = require('../database/models/PredictionModel');
const path = require('path');
const fs = require('fs');
const { spawn } = require('node:child_process');

/**
 * Make a prediction using the ML models
 * @param {Object} parameters - Input parameters for prediction
 * @returns {Promise<Object>} - Prediction results
 */
/* async function makeModelPrediction(parameters) {
  try {
    logger.info(`Making prediction with parameters: ${JSON.stringify(parameters)}`);
    
    // In a real implementation, we would load the models and make predictions
    // For this demo, we'll simulate the prediction with a simple calculation
    
    // Simulated size prediction (in a real app, this would use TensorFlow.js or another ML library)
    const size = simulateSizePrediction(parameters);
    
    // Simulated PDI prediction
    const pdi = simulatePdiPrediction(parameters);
    
    // Simulated confidence scores
    const sizeConfidence = 0.85; // R² score for size model
    const pdiConfidence = 0.82; // R² score for PDI model
    
    return {
      size,
      pdi,
      sizeConfidence,
      pdiConfidence
    };
  } catch (error) {
    logger.error(`Error making prediction: ${error.message}`);
    throw new Error(`Failed to make prediction: ${error.message}`);
  }
}
 */

/* async function makeModelPrediction(parameters) {
  // parameters - массив строк вида ['1','1','3','2','11','500','30']
  try {
    const prediction = await new Promise((resolve, reject) => {
      const py = spawn('python3', [
        path.join(__dirname, 'predict.py'), 
        JSON.stringify(parameters)
      ]);
  
      let result = '';
      let errorOutput = '';
  
      py.stdout.on('data', (data) => result += data.toString());
      py.stderr.on('data', (data) => errorOutput += data.toString());
  
      py.on('close', (code) => {
        if (code !== 0) {
          logger.error(`Python error: ${errorOutput}`);
          return reject(new Error(`Python script failed: ${errorOutput}`));
        }
        
        try {
          const prediction = JSON.parse(result);
          resolve(prediction);
        } catch (e) {
          reject(new Error("Failed to parse prediction result"));
        }
      });
    });
    
    // Добавляем исходные параметры в логи
    logger.info(`Prediction for ${parameters}: ${JSON.stringify(prediction)}`);
    return prediction;
    
  } catch (error) {
    logger.error(`Prediction failed: ${error.message}`);
    throw new Error(`Model error: ${error.message}`);
  }
} */

  async function makeModelPrediction(parameters) {
    return new Promise((resolve, reject) => {
      /* const scriptPath = path.join(__dirname, '..', 'ml', 'predict.py'); */
      const scriptPath = 'F:\\Projects\\attempt1\\src\\ml\\predict.py';
      const py = spawn('python', [scriptPath, JSON.stringify(parameters)]);
      console.log(scriptPath);
      let output = '';
      let errorOutput = '';
      let timeoutHandle;
  
      // Таймаут 15 секунд на выполнение
      timeoutHandle = setTimeout(() => {
        py.kill('SIGKILL');
        logger.error(`Prediction timeout for parameters: ${parameters}`);
        reject(new Error('Prediction timeout'));
      }, 15000);
  
      py.stdout.on('data', (data) => {
        output += data.toString();
      });
  
      py.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
  
      py.on('close', (code) => {
        clearTimeout(timeoutHandle);
        
        if (code !== 0) {
          const errorMessage = `Python script exited with code ${code}. Error: ${errorOutput}`;
          logger.error(`Prediction failed: ${errorMessage}`);
          return reject(new Error(errorMessage));
        }
  
        try {
          const result = JSON.parse(output);
          
          if (result.error) {
            logger.error(`Model error: ${result.error}`);
            return reject(new Error(result.error));
          }
  
          logger.info(`Prediction success for [${parameters}]: ${JSON.stringify(result)}`);
          resolve(result);
        } catch (e) {
          logger.error(`Failed to parse prediction output: ${e.message}`);
          reject(new Error('Invalid prediction response'));
        }
      });
  
      py.on('error', (err) => {
        clearTimeout(timeoutHandle);
        logger.error(`Process error: ${err.message}`);
        reject(err);
      });
    });
  }

/**
 * Validate a model file
 * @param {string} filePath - Path to the model file
 * @returns {Promise<boolean>} - Whether the file is a valid model
 */
async function validateModelFile(filePath) {
  try {
    // In a real implementation, we would validate the model file
    // For this demo, we'll just check if the file exists and has the right extension
    
    if (!fs.existsSync(filePath)) {
      logger.error(`Model file not found: ${filePath}`);
      return false;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.keras' && ext !== '.h5') {
      logger.error(`Invalid model file extension: ${ext}`);
      return false;
    }
    
    // Additional validation would happen here in a real implementation
    
    return true;
  } catch (error) {
    logger.error(`Error validating model file: ${error.message}`);
    return false;
  }
}

/**
 * Simulate size prediction with a formula based on parameters
 * @param {Object} params - Input parameters
 * @returns {number} - Predicted size
 */
/* function simulateSizePrediction(params) {
  // This is a simplified simulation formula - not accurate for real predictions
  // In a real implementation, this would use the actual ML model
  
  const euEffect = params.euConcentration * 10;
  const phenEffect = params.phenanthrolineConcentration * 5;
  const ligandEffect = params.ligandConcentration * 2 * (params.ligandType + 1);
  const phEffect = (params.phBsa - 7) * 15;
  const volumeEffect = Math.log(params.additionVolume) * 5;
  const timeEffect = Math.sqrt(params.additionTime) * 2;
  const rateEffect = params.additionRate * 0.5;
  
  // Base size plus effects of parameters
  let size = 100 + euEffect + phenEffect - ligandEffect + phEffect - volumeEffect + timeEffect - rateEffect;
  
  // Add some randomness to simulate model uncertainty
  size += (Math.random() - 0.5) * 20;
  
  // Ensure size is reasonable
  return Math.max(20, Math.min(500, size));
} */

/**
 * Simulate PDI prediction with a formula based on parameters
 * @param {Object} params - Input parameters
 * @returns {number} - Predicted PDI
 */
/* function simulatePdiPrediction(params) {
  // This is a simplified simulation formula - not accurate for real predictions
  // In a real implementation, this would use the actual ML model
  
  const euEffect = params.euConcentration * 0.02;
  const phenEffect = params.phenanthrolineConcentration * 0.01;
  const ligandEffect = params.ligandConcentration * 0.005 * (params.ligandType + 1);
  const phEffect = (params.phBsa - 7) * 0.03;
  const volumeEffect = Math.log(params.additionVolume) * 0.01;
  const timeEffect = Math.sqrt(params.additionTime) * 0.004;
  const rateEffect = params.additionRate * 0.001;
  
  // Base PDI plus effects of parameters
  let pdi = 0.2 - euEffect + phenEffect - ligandEffect - phEffect + volumeEffect - timeEffect + rateEffect;
  
  // Add some randomness to simulate model uncertainty
  pdi += (Math.random() - 0.5) * 0.05;
  
  // Ensure PDI is in reasonable range (0 to 1)
  return Math.max(0.05, Math.min(0.5, pdi));
} */

module.exports = {
  makeModelPrediction,
  validateModelFile
};