const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs');

/**
 * Generate a chart image
 * @param {Array|Object} xData - X-axis data or correlation data object
 * @param {Array|null} yData - Y-axis data (array of arrays for multiple lines)
 * @param {Object} options - Chart options
 * @param {string} outputPath - Path to save the chart image
 * @returns {Promise<string>} - Path to the saved chart
 */
async function generateChart(xData, yData, options, outputPath) {
  try {
    // Create chart canvas
    const width = 800;
    const height = 600;
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });
    
    // Prepare configuration based on chart type
    let configuration;
    
    if (options.isCorrelation) {
      // Correlation heatmap
      configuration = generateCorrelationConfig(xData, options.labels, options);
    } else {
      // Line chart
      configuration = generateLineConfig(xData, yData, options);
    }
    
    // Render chart
    const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
    
    // Save chart to file
    fs.writeFileSync(outputPath, buffer);
    
    return outputPath;
  } catch (error) {
    throw new Error(`Failed to generate chart: ${error.message}`);
  }
}

/**
 * Generate configuration for a line chart
 * @param {Array} xData - X-axis data
 * @param {Array} yData - Y-axis data (array of arrays for multiple lines)
 * @param {Object} options - Chart options
 * @returns {Object} - Chart.js configuration
 */
function generateLineConfig(xData, yData, options) {
  // Default colors
  const colors = [
    'rgb(54, 162, 235)',
    'rgb(255, 99, 132)'
  ];
  
  // Prepare datasets
  const datasets = yData.map((data, index) => {
    return {
      label: options.legendLabels ? options.legendLabels[index] : `Dataset ${index + 1}`,
      data,
      backgroundColor: colors[index % colors.length],
      borderColor: colors[index % colors.length],
      borderWidth: 2,
      pointRadius: options.referenceIndex >= 0 ? 
        data.map((_, i) => i === options.referenceIndex ? 8 : 4) : 4,
      pointBackgroundColor: options.referenceIndex >= 0 ? 
        data.map((_, i) => i === options.referenceIndex ? 'rgb(255, 159, 64)' : colors[index % colors.length]) : 
        colors[index % colors.length]
    };
  });
  
  return {
    type: 'line',
    data: {
      labels: xData,
      datasets
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: options.title || 'Chart',
          font: {
            size: 18
          }
        },
        legend: {
          position: 'top',
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: options.xAxisLabel || 'X Axis',
            font: {
              size: 14
            }
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: options.yAxisLabel || 'Y Axis',
            font: {
              size: 14
            }
          }
        }
      }
    }
  };
}

/**
 * Generate configuration for a correlation heatmap
 * @param {Object} data - Correlation data
 * @param {Array} labels - Labels for the correlation matrix
 * @param {Object} options - Chart options
 * @returns {Object} - Chart.js configuration
 */
function generateCorrelationConfig(data, labels, options) {
  // Calculate correlation matrix
  const correlationMatrix = calculateCorrelationMatrix(data);
  
  // Prepare data for heatmap
  const datasets = [];
  
  for (let i = 0; i < correlationMatrix.length; i++) {
    const rowData = [];
    
    for (let j = 0; j < correlationMatrix[i].length; j++) {
      rowData.push({
        x: j,
        y: i,
        v: correlationMatrix[i][j]
      });
    }
    
    datasets.push(...rowData);
  }
  
  return {
    type: 'matrix',
    data: {
      datasets: [{
        label: 'Correlation Matrix',
        data: datasets,
        backgroundColor(context) {
          const value = context.dataset.data[context.dataIndex].v;
          const alpha = Math.abs(value);
          
          return value < 0
            ? `rgba(0, 0, 255, ${alpha})`
            : `rgba(255, 0, 0, ${alpha})`;
        },
        borderColor: 'white',
        borderWidth: 1,
        width: ({ chart }) => (chart.chartArea || {}).width / correlationMatrix.length - 1,
        height: ({ chart }) => (chart.chartArea || {}).height / correlationMatrix.length - 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: options.title || 'Correlation Matrix',
          font: {
            size: 18
          }
        },
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title() {
              return '';
            },
            label(context) {
              const v = context.dataset.data[context.dataIndex];
              return [
                `${labels[v.y]} vs ${labels[v.x]}`,
                `Correlation: ${v.v.toFixed(2)}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          type: 'category',
          labels,
          offset: true,
          ticks: {
            display: true
          },
          grid: {
            display: false
          }
        },
        y: {
          type: 'category',
          labels,
          offset: true,
          ticks: {
            display: true
          },
          grid: {
            display: false
          }
        }
      }
    }
  };
}

/**
 * Calculate correlation matrix from data
 * @param {Object} data - Data object with parameter arrays
 * @returns {Array} - Correlation matrix
 */
function calculateCorrelationMatrix(data) {
  // Extract parameter names and arrays
  const params = Object.keys(data);
  const n = params.length;
  
  // Initialize correlation matrix
  const correlationMatrix = Array(n).fill().map(() => Array(n).fill(0));
  
  // Calculate correlations
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        // Diagonal (self-correlation)
        correlationMatrix[i][j] = 1;
      } else {
        // Calculate Pearson correlation coefficient
        const x = data[params[i]];
        const y = data[params[j]];
        
        correlationMatrix[i][j] = calculatePearsonCorrelation(x, y);
      }
    }
  }
  
  return correlationMatrix;
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 * @param {Array} x - First array
 * @param {Array} y - Second array
 * @returns {number} - Correlation coefficient
 */
function calculatePearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  
  // Handle empty arrays
  if (n === 0) return 0;
  
  // Calculate means
  let sumX = 0;
  let sumY = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  
  const meanX = sumX / n;
  const meanY = sumY / n;
  
  // Calculate correlation
  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;
  
  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    
    numerator += diffX * diffY;
    denominatorX += diffX * diffX;
    denominatorY += diffY * diffY;
  }
  
  const denominator = Math.sqrt(denominatorX * denominatorY);
  
  // Handle division by zero
  if (denominator === 0) return 0;
  
  return numerator / denominator;
}

module.exports = {
  generateChart
};