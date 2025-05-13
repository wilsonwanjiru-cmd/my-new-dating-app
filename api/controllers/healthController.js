const os = require('os');
const process = require('process');

// Extended health check information
exports.healthCheck = async (req, res) => {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      system: {
        platform: os.platform(),
        uptime: os.uptime(),
        loadavg: os.loadavg(),
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem()
        }
      },
      process: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        versions: process.versions
      },
      database: {
        status: 'connected' // You can add actual DB connection check here
      },
      dependencies: {
        // Add checks for critical external services if needed
      }
    };

    // Add optional deep checks if requested
    if (req.query.deep === 'true') {
      healthData.deepChecks = {
        // Add more intensive checks here
        externalServices: await checkExternalServices(),
        databaseConnection: await testDatabaseConnection()
      };
    }

    res.status(200).json(healthData);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      details: error.stack
    });
  }
};

// Example external service check (implement as needed)
async function checkExternalServices() {
  return {
    // Add checks for external APIs your service depends on
  };
}

// Example database connection test (implement for your DB)
async function testDatabaseConnection() {
  try {
    // Add actual database connection test
    return { status: 'connected' };
  } catch (error) {
    return { status: 'disconnected', error: error.message };
  }
}

// Add this if you want a simple ping endpoint
exports.ping = (req, res) => {
  res.status(200).json({ message: 'pong', timestamp: new Date().toISOString() });
};