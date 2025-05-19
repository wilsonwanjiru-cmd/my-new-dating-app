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

// Enhanced SMTP Configuration with Zoho optimizations
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.zoho.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true, // Force SSL for Zoho
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    minVersion: 'TLSv1.2',
    ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
    rejectUnauthorized: process.env.NODE_ENV === 'production' // Only strict in production
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 50,
  connectionTimeout: 60000, // Increased timeout
  socketTimeout: 60000,
  greetingTimeout: 30000,
  logger: true, // Enable detailed logging
  debug: process.env.NODE_ENV !== 'production', // Debug in non-production
  // Zoho-specific optimizations
  secureConnection: true,
  requireTLS: true,
  tls: {
    servername: process.env.SMTP_HOST || 'smtp.zoho.com'
  }
});

// Enhanced connection verification with detailed diagnostics
const verifyConnection = async (attempt = 1, maxAttempts = 3) => {
  const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30000); // Max 30s delay
  
  try {
    await transporter.verify();
    console.log('✅ SMTP Connection Verified');
    
    // Enhanced event listeners
    transporter.on('idle', () => {
      console.log('🔄 SMTP Connection Pool Available');
    });
    
    transporter.on('error', (err) => {
      console.error('‼️ SMTP Detailed Error:', {
        error: err.message,
        code: err.code,
        command: err.command,
        response: err.response,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });
      
      if (process.env.NODE_ENV === 'production') {
        // Example integration with monitoring service
        console.error('ALERT: Critical SMTP failure detected');
      }
    });
    
    return true;
  } catch (error) {
    console.error(`❌ SMTP Verification Attempt ${attempt}/${maxAttempts} Failed:`, {
      error: error.message,
      code: error.code,
      response: error.response,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    if (attempt < maxAttempts) {
      console.log(`⌛ Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return verifyConnection(attempt + 1, maxAttempts);
    }

    console.error('💥 All SMTP connection attempts failed');
    if (process.env.NODE_ENV === 'production') {
      console.error('ALERT: SMTP service unavailable');
    }
    return false;
  }
};

// Initialize connection with enhanced monitoring
(async () => {
  try {
    const connectionVerified = await verifyConnection();
    
    if (!connectionVerified) {
      console.warn('⚠️ Email service unavailable - some features may be limited');
      if (process.env.NODE_ENV === 'production') {
        console.error('ALERT: Proceeding without email service');
      }
    }
  } catch (err) {
    console.error('❌ SMTP Initialization Error:', {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
  }
})();

// Enhanced email sending with circuit breaker pattern
const sendEmailWithRetry = async (mailOptions, attempt = 1) => {
  const maxAttempts = 3;
  const delay = Math.min(3000 * attempt, 10000); // Max 10s delay
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Email sent to ${mailOptions.to}`, {
      messageId: info.messageId,
      subject: mailOptions.subject,
      accepted: info.accepted,
      rejected: info.rejected,
      timestamp: new Date().toISOString()
    });
    return info;
  } catch (error) {
    console.error(`📧 Email Attempt ${attempt}/${maxAttempts} Failed:`, {
      to: mailOptions.to,
      error: error.message,
      code: error.code,
      response: error.response,
      command: error.command,
      stack: error.stack,
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
      finalAttempt: true,
      timestamp: new Date().toISOString()
    };
  }
};

// Enhanced Email Templates with dynamic styling
const templates = {
  verification: (link, expiryDate, user) => ({
    subject: "Verify Your Ruda Dating Account",
    text: `Welcome ${user.name},\n\nPlease verify your email by clicking: ${link}\n\nThis link expires: ${expiryDate}\n\nIf you didn't request this, please ignore this email.`,
    html: `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; }
        .header { color: #4f46e5; text-align: center; margin-bottom: 25px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 4px; font-weight: 500; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeaea; font-size: 12px; color: #777; text-align: center; }
        .container { background-color: #f9fafb; padding: 30px; border-radius: 8px; }
        .expiry-notice { color: #dc2626; font-weight: 500; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Ruda Dating</h2>
          <p>Hi ${user.name},</p>
        </div>
        <p>Thank you for signing up! Please verify your email address:</p>
        <div style="text-align: center;">
          <a href="${link}" class="button">Verify Email</a>
        </div>
        <p class="expiry-notice">This verification link expires on ${expiryDate}.</p>
        <div class="footer">
          <p>If you didn't request this, please ignore this email.</p>
          <p>© ${new Date().getFullYear()} Ruda Dating. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>`
  })
};

/**
 * Enhanced send verification email with better error handling
 */
const sendVerificationEmail = async (email, verificationToken) => {
  try {
    const user = await User.findOne({ email })
      .select("name email verified verificationToken verificationSentAt")
      .lean();

    if (!user) throw new Error("User not found");
    if (user.verified) throw new Error("Email already verified");

    // Check if recent verification was sent
    if (user.verificationSentAt && 
        (Date.now() - new Date(user.verificationSentAt).getTime()) < 60000) {
      throw new Error("Verification email recently sent");
    }

    const token = verificationToken || crypto.randomBytes(config.token.length).toString("hex");
    const verificationLink = `${config.baseUrl}/api/email/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
    const expiryDate = new Date(Date.now() + config.token.expiry).toLocaleString();

    await User.updateOne(
      { _id: user._id },
      { 
        $set: { 
          verificationToken: token,
          verificationSentAt: new Date() 
        } 
      }
    );

    const mailOptions = {
      from: config.from,
      to: email,
      ...templates.verification(verificationLink, expiryDate, user),
      headers: {
        "X-Priority": "1",
        "X-Mailer": "Ruda Dating",
        "X-Auto-Response-Suppress": "All",
        "Precedence": "bulk"
      },
      priority: 'high',
      dkim: process.env.DKIM_PRIVATE_KEY ? {
        domainName: process.env.DOMAIN,
        keySelector: "email",
        privateKey: process.env.DKIM_PRIVATE_KEY
      } : undefined
    };

    const info = await sendEmailWithRetry(mailOptions);
    
    return {
      success: true,
      messageId: info.messageId,
      verificationLink,
      expiry: expiryDate,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Verification email failed:", {
      email,
      error: error.message,
      code: error.code,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    throw {
      ...error,
      isVerificationEmailError: true,
      userEmail: email,
      operation: 'sendVerificationEmail',
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Enhanced email verification with security checks
 */
const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;
    
    if (!token || !email) {
      return res.status(400).json({
        success: false,
        code: "MISSING_PARAMETERS",
        message: "Token and email are required",
        timestamp: new Date().toISOString()
      });
    }

    const decodedEmail = decodeURIComponent(email);
    const user = await User.findOne({
      email: decodedEmail,
      verificationToken: token,
      verified: false
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        code: "INVALID_TOKEN",
        message: "Invalid or expired verification link",
        timestamp: new Date().toISOString()
      });
    }

    // Check token expiry
    const tokenAge = Date.now() - new Date(user.verificationSentAt).getTime();
    if (tokenAge > config.token.expiry) {
      return res.status(400).json({
        success: false,
        code: "EXPIRED_TOKEN",
        message: "Verification link has expired",
        timestamp: new Date().toISOString()
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        $set: { 
          verified: true, 
          verifiedAt: new Date(),
          verificationSentAt: null 
        },
        $unset: { verificationToken: 1 }
      },
      { new: true }
    );

    return res.redirect(
      `${config.frontendUrl}/verified?success=true&email=${encodeURIComponent(updatedUser.email)}`
    );
  } catch (error) {
    console.error("Email verification error:", {
      error: error.message,
      code: error.code,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: "An error occurred during verification",
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Enhanced resend verification with rate limiting protection
 */
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        code: "MISSING_EMAIL",
        message: "Email is required",
        timestamp: new Date().toISOString()
      });
    }

    const decodedEmail = decodeURIComponent(email);
    const user = await User.findOne({ email: decodedEmail })
      .select("_id name email verified verificationToken verifiedAt verificationSentAt")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found",
        timestamp: new Date().toISOString()
      });
    }

    if (user.verified) {
      return res.status(400).json({
        success: false,
        code: "ALREADY_VERIFIED",
        message: "Email already verified",
        verifiedAt: user.verifiedAt,
        timestamp: new Date().toISOString()
      });
    }

    // Check if verification was recently sent
    if (user.verificationSentAt && 
        (Date.now() - new Date(user.verificationSentAt).getTime()) < 60000) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMITED",
        message: "Verification email recently sent. Please wait before requesting another.",
        nextRequest: new Date(new Date(user.verificationSentAt).getTime() + 60000),
        timestamp: new Date().toISOString()
      });
    }

    const result = await sendVerificationEmail(user.email, user.verificationToken);

    return res.status(200).json({
      success: true,
      message: "Verification email resent",
      messageId: result.messageId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Resend verification error:", {
      error: error.message,
      code: error.code,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    const statusCode = error.isVerificationEmailError ? 502 : 500;
    return res.status(statusCode).json({
      success: false,
      code: error.code || "SERVER_ERROR",
      message: error.message || "Failed to resend verification email",
      timestamp: new Date().toISOString()
    });
  }
};

// Utility function
const generateVerificationToken = () => crypto.randomBytes(config.token.length).toString("hex");

// Enhanced health check
const checkEmailService = async () => {
  try {
    const isVerified = await transporter.verify();
    return { 
      status: isVerified ? 'ready' : 'unstable',
      timestamp: new Date().toISOString(),
      details: {
        host: transporter.options.host,
        port: transporter.options.port,
        secure: transporter.options.secure
      }
    };
  } catch (error) {
    return { 
      status: 'unavailable', 
      error: error.message,
      code: error.code,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
  }
};

module.exports = {
  transporter,
  sendVerificationEmail,
  verifyEmail,
  resendVerificationEmail,
  generateVerificationToken,
  checkEmailService,
  // For testing/monitoring
  _test: {
    templates,
    config
  }
};