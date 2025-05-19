#!/usr/bin/env node
require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

// Enhanced configuration with Zoho defaults
const config = {
  testEmail: process.env.TEST_EMAIL || process.env.SMTP_USER,
  timeout: 60000, // Increased timeout for Zoho
  retries: 3,
  retryDelay: 5000,
  zohoHost: 'smtp.zoho.com',
  zohoPort: 465
};

// Enhanced diagnostic logging
console.log('🔍 Zoho SMTP Connection Tester');
console.log('--------------------------------');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Testing Timeout:', config.timeout + 'ms');
console.log('Max Retries:', config.retries);
console.log('\n📌 SMTP Configuration:');
console.log('Host:', process.env.SMTP_HOST || config.zohoHost);
console.log('Port:', process.env.SMTP_PORT || config.zohoPort);
console.log('Secure: true (forced for Zoho)');
console.log('Username:', process.env.SMTP_USER);
console.log('Password:', process.env.SMTP_PASSWORD ? '********' : 'MISSING');
console.log('From:', process.env.SMTP_FROM || `Ruda Dating <${process.env.SMTP_USER}>`);
console.log('Test Email:', config.testEmail);

if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
  console.error('\n❌ ERROR: Missing required SMTP credentials in .env file');
  process.exit(1);
}

// Zoho-optimized transporter configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || config.zohoHost,
  port: parseInt(process.env.SMTP_PORT) || config.zohoPort,
  secure: true, // MUST be true for Zoho
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    servername: 'smtp.zoho.com', // Critical for Zoho
    minVersion: 'TLSv1.2',
    ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
    rejectUnauthorized: false // Temporary for debugging
  },
  // Zoho-specific settings
  requireTLS: true,
  secureConnection: true,
  pool: false, // Disable pooling for testing
  // Timeout settings
  connectionTimeout: config.timeout,
  greetingTimeout: config.timeout,
  socketTimeout: config.timeout,
  // Debugging
  logger: true,
  debug: true,
  // Additional Zoho headers
  name: 'ruda-dating-app' // Identifies your app to Zoho
});

// Enhanced test email with Zoho-specific headers
const testMessage = {
  from: process.env.SMTP_FROM || `Ruda Dating <${process.env.SMTP_USER}>`,
  to: config.testEmail,
  subject: 'SMTP Connection Test - Ruda Dating',
  text: `This is a test email from Ruda Dating sent at ${new Date().toISOString()}\n\nTest ID: ${crypto.randomBytes(8).toString('hex')}`,
  html: `<html>
    <body style="font-family: Arial, sans-serif;">
      <h2 style="color: #4f46e5;">Ruda Dating SMTP Test</h2>
      <p>This is a test email sent at ${new Date().toISOString()}</p>
      <p><strong>Test ID:</strong> <code>${crypto.randomBytes(8).toString('hex')}</code></p>
      <hr>
      <p>If you received this, your Zoho SMTP configuration is working correctly.</p>
    </body>
  </html>`,
  headers: {
    'X-Mailer': 'Ruda Dating App',
    'X-Priority': '1',
    'X-Test-ID': crypto.randomBytes(8).toString('hex'),
    'X-Test-Date': new Date().toISOString(),
    'X-Zoho-Version': '1.0'
  },
  priority: 'high'
};

// Enhanced connection tester with Zoho-specific checks
async function testConnection(attempt = 1) {
  try {
    console.log(`\n🔄 Attempt ${attempt}/${config.retries}: Testing Zoho SMTP connection...`);
    
    // Verify connection
    console.log('🔐 Authenticating with Zoho SMTP...');
    await transporter.verify();
    console.log('✅ SMTP Authentication Successful');
    
    // Send test email
    console.log('\n✉️ Sending test email to', config.testEmail);
    const info = await transporter.sendMail(testMessage);
    
    console.log('\n🎉 Success! Test email details:');
    console.log('- Message ID:', info.messageId);
    console.log('- Accepted Recipients:', info.accepted.join(', '));
    console.log('- Rejected Recipients:', info.rejected.join(', ') || 'None');
    console.log('- Zoho Response:', info.response || '250 OK');
    
    console.log('\n💡 Check your inbox at', config.testEmail, 'for the test email');
    
    return true;
  } catch (error) {
    console.error(`\n❌ Attempt ${attempt} Failed:`);
    console.error('- Error Type:', error.name);
    console.error('- Error Code:', error.code || 'UNKNOWN');
    console.error('- Error Message:', error.message);
    
    // Enhanced Zoho-specific error diagnostics
    if (error.response) {
      console.error('- SMTP Response:', error.response);
      if (error.response.includes('550 5.7.1')) {
        console.error('⚠️ Zoho Security Alert: Your IP may be blocked');
      }
    }
    
    if (error.command) {
      console.error('- Last Command:', error.command);
      if (error.command === 'AUTH') {
        console.error('🔐 Authentication Failed: Verify username/password');
      }
    }

    if (attempt < config.retries) {
      const delay = attempt * config.retryDelay;
      console.log(`\n⌛ Retrying in ${delay/1000} seconds...`);
      await sleep(delay);
      return testConnection(attempt + 1);
    }
    
    console.error('\n💥 All connection attempts failed');
    console.error('\n🔧 Zoho-Specific Troubleshooting:');
    console.error('1. Log in to Zoho Mail Admin Console (https://admin.zoho.com)');
    console.error('2. Navigate to: Control Panel > Mail Administration > Mail Server Settings');
    console.error('3. Ensure:');
    console.error('   - SMTP service is enabled');
    console.error('   - "Require SSL" is checked');
    console.error('   - "Allow less secure apps" is ON (temporarily)');
    console.error('4. Check your domain MX records point to Zoho');
    
    process.exit(1);
  }
}

// Run tests with enhanced error handling
(async () => {
  try {
    console.log('\n🚀 Starting Zoho SMTP tests...');
    const success = await testConnection();
    
    if (success) {
      console.log('\n✅ All tests completed successfully');
      console.log('\nNext Steps:');
      console.log('1. Set rejectUnauthorized: true in production');
      console.log('2. Enable DKIM in Zoho Mail Admin Console');
      console.log('3. Configure SPF records for your domain');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n⚠️ Unhandled Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
})();

// Enhanced error handling
process.on('unhandledRejection', (err) => {
  console.error('\n🚨 Unhandled Rejection:', err.message);
  if (err.response) console.error('SMTP Response:', err.response);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n🔧 Process interrupted - cleaning up...');
  transporter.close();
  process.exit(0);
});