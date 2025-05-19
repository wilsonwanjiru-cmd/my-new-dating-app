require('dotenv').config();
const nodemailer = require('nodemailer');

console.log("💣 Running Nuclear Test with:", {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  password: process.env.SMTP_PASSWORD ? "******" : "NULL"
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: { 
    minVersion: 'TLSv1.3', // Force TLS 1.3
    ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
    rejectUnauthorized: false
  },
  connectionTimeout: 30000,
  logger: true,
  debug: true
});

// Nuclear test function
const nuclearTest = async () => {
  try {
    console.log("🔐 Attempting SMTP handshake...");
    await transporter.verify();
    
    console.log("✉️ Attempting to send test email...");
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: "your-personal@gmail.com", // CHANGE TO YOUR EMAIL
      subject: "URGENT: Zoho SMTP Test",
      text: `This is a critical test email sent at ${new Date()}`
    });

    console.log("✅ Nuclear test passed!");
    console.log("Message ID:", info.messageId);
    process.exit(0);
  } catch (err) {
    console.error("❌ CATASTROPHIC FAILURE - Final steps:");
    console.log("1. REGENERATE App Password (current one may be corrupted)");
    console.log("2. Contact Zoho support with this error code: AUTH-535-IP-" + 
      require('child_process').execSync('curl -s ifconfig.me').toString().trim());
    console.error("Full error:", err);
    process.exit(1);
  }
};

nuclearTest();