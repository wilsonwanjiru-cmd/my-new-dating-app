require('dotenv').config();
const nodemailer = require('nodemailer');

console.log("🔍 Testing Zoho SMTP with:", {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  password: process.env.SMTP_PASSWORD ? "******" : "NOT_SET"
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: { 
    minVersion: 'TLSv1.2',
    rejectUnauthorized: false 
  },
  logger: true,
  debug: true
});

transporter.verify((err) => {
  if (err) {
    console.error("❌ Hard failure - Possible causes:");
    console.log("- Wrong App Password (must be 16 chars from Zoho Security)");
    console.log("- SMTP disabled in Zoho Mail settings");
    console.log("- IP blocked by Zoho");
    console.log("- Domain not verified in Zoho");
    console.error("Full error:", err);
    process.exit(1);
  } else {
    console.log("✅ SMTP Success! Configuration is correct.");
    process.exit(0);
  }
});
