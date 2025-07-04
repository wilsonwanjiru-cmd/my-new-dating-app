const os = require('os');
const process = require('process');
const mongoose = require('mongoose');
const client = require('prom-client');

// ==================== Helper Functions ====================
const formatBytes = (bytes) => {
  try {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  } catch (error) {
    return 'N/A';
  }
};

const formatUptime = (seconds) => {
  try {
    const days = Math.floor(seconds / (3600 * 24));
    seconds %= 3600 * 24;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return `${days}d ${hours}h ${minutes}m ${Math.floor(seconds)}s`;
  } catch (error) {
    return 'N/A';
  }
};

// ==================== Safe Database Methods ====================
const checkDatabase = async () => {
  const defaultResponse = {
    status: 'unknown',
    connectionState: mongoose.STATES[mongoose.connection?.readyState] || 'disconnected'
  };

  try {
    if (!mongoose.connection || !mongoose.connection.db) {
      return { ...defaultResponse, error: 'Database not initialized' };
    }

    const start = process.hrtime();
    const ping = await mongoose.connection.db.admin().ping();
    const [seconds, nanoseconds] = process.hrtime(start);
    const pingTime = (seconds * 1000) + (nanoseconds / 1000000);
    
    return {
      ...defaultResponse,
      status: ping.ok === 1 ? 'connected' : 'unstable',
      pingTime: `${pingTime.toFixed(2)}ms`,
      dbName: mongoose.connection.db.databaseName || 'unknown'
    };
  } catch (error) {
    return {
      ...defaultResponse,
      status: 'disconnected',
      error: error.message
    };
  }
};

// ==================== Safe System Metrics ====================
const getSafeMemoryUsage = () => {
  try {
    const usage = process.memoryUsage();
    return {
      rss: formatBytes(usage.rss),
      heapTotal: formatBytes(usage.heapTotal),
      heapUsed: formatBytes(usage.heapUsed),
      external: formatBytes(usage.external)
    };
  } catch (error) {
    return { error: 'Failed to get memory usage' };
  }
};

const getSafeCpuInfo = () => {
  try {
    return {
      count: os.cpus().length,
      model: os.cpus()[0]?.model || 'unknown',
      speed: os.cpus()[0]?.speed ? `${os.cpus()[0].speed} MHz` : 'unknown'
    };
  } catch (error) {
    return { error: 'Failed to get CPU info' };
  }
};

// ==================== Core Health Checks ====================
class HealthController {
  /**
   * Basic liveness check - should never fail
   */
  static liveness(req, res) {
    try {
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        processId: process.pid,
        uptime: formatUptime(process.uptime())
      });
    } catch (error) {
      // If even this fails, something is seriously wrong
      res.status(200).json({
        status: 'alive',
        message: 'Basic process running',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Readiness check - verifies critical dependencies
   */
  static async readiness(req, res) {
    try {
      const dbStatus = await checkDatabase();
      const isReady = dbStatus.status === 'connected';
      
      const response = {
        status: isReady ? 'ready' : 'degraded',
        timestamp: new Date().toISOString(),
        database: dbStatus,
        services: {
          // Add other critical services here
        }
      };

      res.status(isReady ? 200 : 503).json(response);
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        error: 'Service unavailable',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Comprehensive health check
   */
  static async healthCheck(req, res) {
    try {
      const dbStatus = await checkDatabase();
      
      const healthData = {
        status: dbStatus.status === 'connected' ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        system: {
          uptime: formatUptime(os.uptime()),
          load: os.loadavg().map(load => load.toFixed(2)),
          memory: {
            total: formatBytes(os.totalmem()),
            free: formatBytes(os.freemem())
          }
        },
        process: {
          uptime: formatUptime(process.uptime()),
          memory: getSafeMemoryUsage(),
          cpu: getSafeCpuInfo()
        },
        database: dbStatus,
        dependencies: {
          // Add other dependency checks here
        }
      };

      res.status(200).json(healthData);
    } catch (error) {
      res.status(200).json({  // Still return 200 but with degraded status
        status: 'degraded',
        error: 'Health check incomplete',
        timestamp: new Date().toISOString(),
        basicChecks: {
          processRunning: true,
          memory: getSafeMemoryUsage()
        }
      });
    }
  }

  /**
   * Simple ping endpoint
   */
  static ping(req, res) {
    res.status(200).json({
      status: 'success',
      message: 'pong',
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = HealthController;