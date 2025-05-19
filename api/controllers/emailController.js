const nodemailer = require("nodemailer");
const crypto = require("crypto");
const User = require("../models/user");
require("dotenv").config();

// Production Email Configuration
const config = {
  baseUrl: process.env.BACKEND_URL,
  frontendUrl: process.env.FRONTEND_URL,
  from: process.env.SMTP_FROM || `Ruda Dating <${process.env.SMTP_USER}>`,
  token: {
    expiry: 24 * 60 * 60 * 1000, // 24 hours
    length: 32
  }
};

// Connection pool configuration with enhanced Zoho settings
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.zoho.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    minVersion: 'TLSv1.2',
    ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
    rejectUnauthorized: process.env.NODE_ENV === 'production' // Strict in production
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 50,
  rateDelta: 10000,
  rateLimit: 5, // Zoho's recommended limit
  connectionTimeout: 30000,
  greetingTimeout: 15000,
  socketTimeout: 45000,
  logger: process.env.NODE_ENV === 'production',
  debug: false
});

// Connection verification with exponential backoff
const verifyConnection = async (attempt = 1, maxAttempts = 3) => {
  const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000); // Max 30s delay
  
  try {
    await transporter.verify();
    console.log('✅ SMTP Connection Verified');
    
    // Set up event listeners for connection monitoring
    transporter.on('idle', () => {
      console.log('🔄 SMTP Connection Pool Available');
    });
    
    transporter.on('error', (err) => {
      console.error('‼️ SMTP Connection Error:', {
        error: err.message,
        code: err.code,
        timestamp: new Date().toISOString()
      });
      
      // Implement your production alerting here
      if (process.env.NODE_ENV === 'production') {
        require('./monitoring').alertSMTPFailure(err);
      }
    });
    
    return true;
  } catch (error) {
    console.error(`❌ SMTP Verification Attempt ${attempt}/${maxAttempts} Failed:`, {
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });

    if (attempt < maxAttempts) {
      console.log(`⌛ Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return verifyConnection(attempt + 1, maxAttempts);
    }

    console.error('💥 All SMTP connection attempts failed');
    if (process.env.NODE_ENV === 'production') {
      require('./monitoring').alertCriticalSMTPFailure(error);
    }
    return false;
  }
};

// Initialize connection immediately
(async () => {
  try {
    const connectionVerified = await verifyConnection();
    
    if (!connectionVerified && process.env.NODE_ENV === 'production') {
      console.warn('⚠️ Proceeding without email service - some features may be limited');
    }
  } catch (err) {
    console.error('❌ SMTP Initialization Error:', err.message);
  }
})();

// Email sending with circuit breaker pattern
const sendEmailWithRetry = async (mailOptions, attempt = 1) => {
  const maxAttempts = 3;
  const delay = Math.min(3000 * attempt, 10000); // Max 10s delay
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Email sent to ${mailOptions.to}`, {
      messageId: info.messageId,
      subject: mailOptions.subject,
      timestamp: new Date().toISOString()
    });
    return info;
  } catch (error) {
    console.error(`📧 Email Attempt ${attempt}/${maxAttempts} Failed:`, {
      to: mailOptions.to,
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return sendEmailWithRetry(mailOptions, attempt + 1);
    }
    
    throw {
      ...error,
      isEmailError: true,
      recipient: mailOptions.to,
      finalAttempt: true
    };
  }
};

// Email Templates (Production Optimized)
const templates = {
  verification: (link, expiryDate, user) => ({
    subject: "Verify Your Ruda Dating Account",
    text: `Welcome ${user.name},\n\nPlease verify your email by clicking: ${link}\n\nThis link expires: ${expiryDate}`,
    html: `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 4px; font-weight: 500; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeaea; font-size: 12px; color: #777; text-align: center; }
      </style>
    </head>
    <body>
      <div style="text-align: center; margin-bottom: 25px;">
        <h2 style="color: #4f46e5;">Ruda Dating</h2>
        <p>Hi ${user.name},</p>
      </div>
      <p>Thank you for signing up! Please verify your email address:</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${link}" class="button">Verify Email</a>
      </div>
      <p>This verification link expires on ${expiryDate}.</p>
      <div class="footer">
        <p>If you didn't request this, please ignore this email.</p>
        <p>© ${new Date().getFullYear()} Ruda Dating. All rights reserved.</p>
      </div>
    </body>
    </html>`
  })
};

/**
 * Send verification email (Production-grade)
 */
const sendVerificationEmail = async (email, verificationToken) => {
  try {
    const user = await User.findOne({ email })
      .select("name email verified verificationToken")
      .lean();

    if (!user) throw new Error("User not found");
    if (user.verified) throw new Error("Email already verified");

    const token = verificationToken || crypto.randomBytes(config.token.length).toString("hex");
    const verificationLink = `${config.baseUrl}/api/email/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
    const expiryDate = new Date(Date.now() + config.token.expiry).toLocaleString();

    await User.updateOne(
      { _id: user._id },
      { $set: { verificationToken: token } }
    );

    const mailOptions = {
      from: config.from,
      to: email,
      ...templates.verification(verificationLink, expiryDate, user),
      headers: {
        "X-Priority": "1",
        "X-Mailer": "Ruda Dating",
        "X-Auto-Response-Suppress": "All"
      },
      priority: 'high'
    };

    const info = await sendEmailWithRetry(mailOptions);
    
    return {
      success: true,
      messageId: info.messageId,
      verificationLink,
      expiry: expiryDate
    };
  } catch (error) {
    console.error("Verification email failed:", {
      email,
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    
    throw {
      ...error,
      isVerificationEmailError: true,
      userEmail: email,
      operation: 'sendVerificationEmail'
    };
  }
};

/**
 * Verify user's email using token
 */
const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;
    
    if (!token || !email) {
      return res.status(400).json({
        success: false,
        code: "MISSING_PARAMETERS",
        message: "Token and email are required"
      });
    }

    const user = await User.findOneAndUpdate(
      {
        email: decodeURIComponent(email),
        verificationToken: token,
        verified: false
      },
      {
        $set: { verified: true, verifiedAt: new Date() },
        $unset: { verificationToken: 1 }
      },
      { new: true }
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        code: "INVALID_TOKEN",
        message: "Invalid or expired verification link"
      });
    }

    return res.redirect(
      `${config.frontendUrl}/verified?success=true&email=${encodeURIComponent(user.email)}`
    );
  } catch (error) {
    console.error("Email verification error:", {
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "An error occurred during verification"
    });
  }
};

/**
 * Resend verification email
 */
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        code: "MISSING_EMAIL",
        message: "Email is required"
      });
    }

    const user = await User.findOne({ email: decodeURIComponent(email) })
      .select("_id name email verified verificationToken verifiedAt")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found"
      });
    }

    if (user.verified) {
      return res.status(400).json({
        success: false,
        code: "ALREADY_VERIFIED",
        message: "Email already verified",
        verifiedAt: user.verifiedAt
      });
    }

    const result = await sendVerificationEmail(user.email, user.verificationToken);

    return res.status(200).json({
      success: true,
      message: "Verification email resent",
      messageId: result.messageId
    });
  } catch (error) {
    console.error("Resend verification error:", {
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "Failed to resend verification email"
    });
  }
};

// Utility function
const generateVerificationToken = () => crypto.randomBytes(config.token.length).toString("hex");

// Export the transporter for health checks
module.exports = {
  transporter,
  sendVerificationEmail,
  verifyEmail,
  resendVerificationEmail,
  generateVerificationToken,
  checkEmailService: async () => {
    try {
      await transporter.verify();
      return { status: 'ready', timestamp: new Date().toISOString() };
    } catch (error) {
      return { 
        status: 'unavailable', 
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      };
    }
  }
};