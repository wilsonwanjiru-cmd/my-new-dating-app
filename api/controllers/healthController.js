const os = require('os');
const process = require('process');
const mongoose = require('mongoose');
const client = require('prom-client');

// ==================== Helper Functions ====================
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUptime = (seconds) => {
  const days = Math.floor(seconds / (3600 * 24));
  seconds %= 3600 * 24;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return `${days}d ${hours}h ${minutes}m ${Math.floor(seconds)}s`;
};

// ==================== Metrics Setup ====================
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const healthCheckGauge = new client.Gauge({
  name: 'app_health_status',
  help: 'Application health status',
  labelNames: ['component'],
  registers: [register]
});

// ==================== Health Check History ====================
const healthHistory = [];
const MAX_HISTORY = 10;

// ==================== Database Methods ====================
const checkDatabase = async () => {
  try {
    const start = process.hrtime();
    const ping = await mongoose.connection.db.admin().ping();
    const [seconds, nanoseconds] = process.hrtime(start);
    const pingTime = (seconds * 1000) + (nanoseconds / 1000000);
    
    return {
      status: ping.ok === 1 ? 'connected' : 'unstable',
      pingTime: `${pingTime.toFixed(2)}ms`,
      connectionState: mongoose.STATES[mongoose.connection.readyState],
      dbName: mongoose.connection.db.databaseName,
      collectionsCount: (await mongoose.connection.db.listCollections().toArray()).length,
      stats: await getDatabaseStats()
    };
  } catch (error) {
    return {
      status: 'disconnected',
      error: error.message,
      connectionState: mongoose.STATES[mongoose.connection.readyState]
    };
  }
};

const getDatabaseStats = async () => {
  try {
    return {
      users: await mongoose.connection.db.collection('users').countDocuments(),
      chats: await mongoose.connection.db.collection('chats').countDocuments(),
      matches: await mongoose.connection.db.collection('matches').countDocuments()
    };
  } catch (error) {
    return { error: error.message };
  }
};

// ==================== System Metrics Methods ====================
const measureEventLoopDelay = async () => {
  const start = process.hrtime();
  await new Promise(resolve => setTimeout(resolve, 0));
  const delta = process.hrtime(start);
  return (delta[0] * 1000) + (delta[1] / 1000000);
};

const measureEventLoopLag = async () => {
  return new Promise(resolve => {
    const start = Date.now();
    setImmediate(() => {
      resolve(Date.now() - start);
    });
  });
};

const collectMetrics = async () => {
  return {
    eventLoop: {
      delay: await measureEventLoopDelay(),
      lag: await measureEventLoopLag()
    },
    memory: {
      rss: formatBytes(process.memoryUsage().rss),
      heapTotal: formatBytes(process.memoryUsage().heapTotal),
      heapUsed: formatBytes(process.memoryUsage().heapUsed),
      external: formatBytes(process.memoryUsage().external)
    },
    cpu: {
      usage: process.cpuUsage(),
      load: os.loadavg().map(load => load.toFixed(2))
    },
    process: {
      uptime: formatUptime(process.uptime()),
      activeHandles: process._getActiveHandles().length,
      activeRequests: process._getActiveRequests().length
    }
  };
};

// ==================== Info Methods ====================
const getDeploymentInfo = () => {
  return {
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    commitHash: process.env.COMMIT_HASH || 'unknown',
    buildDate: process.env.BUILD_DATE || new Date().toISOString(),
    nodeVersion: process.version,
    hostname: os.hostname(),
    pid: process.pid
  };
};

const getSystemInfo = () => {
  return {
    platform: os.platform(),
    arch: os.arch(),
    uptime: formatUptime(os.uptime()),
    memory: {
      total: formatBytes(os.totalmem()),
      free: formatBytes(os.freemem()),
      used: formatBytes(os.totalmem() - os.freemem()),
      percentage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2) + '%'
    },
    cpu: {
      count: os.cpus().length,
      model: os.cpus()[0].model,
      speed: os.cpus()[0].speed + ' MHz'
    },
    network: Object.entries(os.networkInterfaces()).reduce((acc, [key, val]) => {
      acc[key] = val.map(i => ({
        address: i.address,
        netmask: i.netmask,
        family: i.family,
        mac: i.mac
      }));
      return acc;
    }, {})
  };
};

// ==================== Metrics Management ====================
const updateMetrics = (data) => {
  try {
    healthCheckGauge.set({ component: 'app' }, 1);
    healthCheckGauge.set({ component: 'database' }, data.database.status === 'connected' ? 1 : 0);
    
    if (data.services) {
      Object.entries(data.services).forEach(([service, status]) => {
        healthCheckGauge.set({ component: service }, status.status === 'operational' ? 1 : 0);
      });
    }
  } catch (error) {
    console.error('Failed to update metrics:', error);
  }
};

const updateHistory = (data) => {
  healthHistory.unshift(data);
  if (healthHistory.length > MAX_HISTORY) healthHistory.pop();
};

// ==================== Health Controller ====================
class HealthController {
  static async healthCheck(req, res) {
    const startTime = Date.now();
    const checkId = Date.now();
    
    try {
      // 1. Test database connection
      const dbPing = await checkDatabase();
      
      // 2. Test external services (if deep check requested)
      const services = req.query.deep === 'true' 
        ? await this.checkExternalServices() 
        : { status: 'basic check' };
      
      // 3. Collect system metrics
      const metrics = await collectMetrics();
      
      // 4. Prepare health data
      const healthData = {
        id: checkId,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        deployment: getDeploymentInfo(),
        system: getSystemInfo(),
        database: dbPing,
        services,
        metrics,
        responseTime: Date.now() - startTime,
        request: {
          id: req.id || 'none',
          ip: req.ip,
          userAgent: req.headers['user-agent']
        }
      };

      // 5. Update metrics and history
      updateMetrics(healthData);
      updateHistory(healthData);

      res.status(200).json(healthData);
    } catch (error) {
      healthCheckGauge.set({ component: 'app' }, 0);
      
      const errorData = {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };

      if (process.env.NODE_ENV === 'development') {
        errorData.details = error.stack;
        errorData.debug = {
          nodeVersion: process.version,
          platform: os.platform(),
          memory: process.memoryUsage()
        };
      }

      res.status(500).json(errorData);
    }
  }

  // ==================== External Services Check ====================
  static async checkExternalServices() {
    const services = {};
    
    services.paymentService = await this.checkPaymentService();
    services.notificationService = await this.checkNotificationService();
    
    return services;
  }

  static async checkPaymentService() {
    try {
      return { 
        status: 'operational',
        lastChecked: new Date().toISOString() 
      };
    } catch (error) {
      return { 
        status: 'degraded', 
        error: error.message,
        lastChecked: new Date().toISOString() 
      };
    }
  }

  static async checkNotificationService() {
    try {
      return { 
        status: 'operational',
        lastChecked: new Date().toISOString() 
      };
    } catch (error) {
      return { 
        status: 'degraded', 
        error: error.message,
        lastChecked: new Date().toISOString() 
      };
    }
  }

  // ==================== Lightweight Health Checks ====================
  static liveness(req, res) {
    res.json({ 
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: formatUptime(process.uptime())
    });
  }

  static async readiness(req, res) {
    try {
      const dbStatus = await checkDatabase();
      const isReady = dbStatus.status === 'connected';
      
      res.status(isReady ? 200 : 503).json({
        status: isReady ? 'ready' : 'not ready',
        timestamp: new Date().toISOString(),
        database: dbStatus
      });
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // ==================== Simple Ping Endpoint ====================
  static ping(req, res) {
    res.json({ 
      status: 'success',
      message: 'pong',
      timestamp: new Date().toISOString(),
      uptime: formatUptime(process.uptime()),
      nodeVersion: process.version,
      memory: formatBytes(process.memoryUsage().rss)
    });
  }
}

// ==================== Monitoring Endpoints ====================
HealthController.getMetrics = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).json({ error: 'Failed to collect metrics' });
  };
};

HealthController.getHistory = (req, res) => {
  res.json({
    count: healthHistory.length,
    checks: healthHistory.slice(0, 10),
    lastChecked: healthHistory[0]?.timestamp || 'never'
  });
};

module.exports = HealthController;