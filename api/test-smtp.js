#!/usr/bin/env node
require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

// Enhanced configuration
const config = {
  testEmail: process.env.TEST_EMAIL || process.env.SMTP_USER,
  timeout: 30000,
  retries: 3,
  retryDelay: 5000
};

// Diagnostic logging
console.log('🔍 SMTP Connection Tester');
console.log('-------------------------');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Testing Timeout:', config.timeout + 'ms');
console.log('Max Retries:', config.retries);
console.log('\n📌 SMTP Configuration:');
console.log('Host:', process.env.SMTP_HOST || 'smtp.zoho.com');
console.log('Port:', process.env.SMTP_PORT || 465);
console.log('Secure:', process.env.SMTP_SECURE !== "false");
console.log('Username:', process.env.SMTP_USER);
console.log('Password:', process.env.SMTP_PASSWORD ? '********' : 'MISSING');
console.log('From:', process.env.SMTP_FROM || `Test <${process.env.SMTP_USER}>`);
console.log('Test Email:', config.testEmail);

if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
  console.error('\n❌ ERROR: Missing required SMTP credentials in .env file');
  process.exit(1);
}

// Enhanced transporter configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.zoho.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE !== "false", // Default true
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    minVersion: 'TLSv1.2',
    ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
    rejectUnauthorized: false // For testing only
  },
  connectionTimeout: config.timeout,
  greetingTimeout: config.timeout,
  socketTimeout: config.timeout,
  logger: true,
  debug: true
});

// Enhanced test email content
const testMessage = {
  from: process.env.SMTP_FROM || `Test <${process.env.SMTP_USER}>`,
  to: config.testEmail,
  subject: 'SMTP Connection Test',
  text: `This is a test email sent at ${new Date().toISOString()}\n\nTest ID: ${crypto.randomBytes(8).toString('hex')}`,
  html: `<html>
    <body>
      <h2>SMTP Connection Test</h2>
      <p>This is a test email sent at ${new Date().toISOString()}</p>
      <p><strong>Test ID:</strong> ${crypto.randomBytes(8).toString('hex')}</p>
      <hr>
      <p>If you received this, your SMTP configuration is working correctly.</p>
    </body>
  </html>`,
  headers: {
    'X-Test-ID': crypto.randomBytes(8).toString('hex'),
    'X-Test-Date': new Date().toISOString()
  }
};

// Enhanced connection tester with retries
async function testConnection(attempt = 1) {
  try {
    console.log(`\n🔄 Attempt ${attempt}/${config.retries}: Testing SMTP connection...`);
    
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP Connection Verified');
    
    // Send test email
    console.log('\n✉️ Sending test email...');
    const info = await transporter.sendMail(testMessage);
    
    console.log('\n🎉 Success! Test email sent:');
    console.log('- Message ID:', info.messageId);
    console.log('- Accepted:', info.accepted);
    console.log('- Rejected:', info.rejected);
    console.log('\n💡 Check your inbox for the test email');
    
    return true;
  } catch (error) {
    console.error(`\n❌ Attempt ${attempt} Failed:`);
    console.error('- Error:', error.message);
    console.error('- Code:', error.code);
    if (error.response) console.error('- SMTP Response:', error.response);
    if (error.command) console.error('- Last Command:', error.command);
    
    if (attempt < config.retries) {
      const delay = attempt * config.retryDelay;
      console.log(`\n⌛ Retrying in ${delay/1000} seconds...`);
      await sleep(delay);
      return testConnection(attempt + 1);
    }
    
    console.error('\n💥 All connection attempts failed');
    console.error('Check your:');
    console.error('1. SMTP credentials');
    console.error('2. Network connection');
    console.error('3. Firewall settings');
    console.error('4. Zoho account settings (if using Zoho)');
    
    return false;
  }
}

// Run tests
(async () => {
  console.log('\n🚀 Starting SMTP tests...');
  const success = await testConnection();
  
  if (!success) {
    console.error('\n❌ SMTP Configuration Failed');
    console.log('\n💡 Troubleshooting Tips:');
    console.log('1. Verify your SMTP credentials in .env');
    console.log('2. Check Zoho Mail settings (if applicable)');
    console.log('3. Test network connectivity to SMTP host');
    console.log('4. Try with "rejectUnauthorized: false" in tls config');
    console.log('5. Check for IP restrictions on your SMTP provider');
    
    process.exit(1);
  }
  
  console.log('\n✅ All tests completed successfully');
  process.exit(0);
})();

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
  console.error('\n⚠️ Unhandled Rejection:', err.message);
  process.exit(1);
});