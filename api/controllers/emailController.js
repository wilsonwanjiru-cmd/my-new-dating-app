const nodemailer = require("nodemailer");
const crypto = require("crypto");
const User = require("../models/user");
require("dotenv").config();

// Production Email Configuration
const config = {
  baseUrl: process.env.BACKEND_URL || "http://localhost:5000",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:8081", // Single URL for both web and mobile
  from: process.env.SMTP_FROM || `Ruda Dating <${process.env.SMTP_USER}>`,
  token: {
    expiry: 24 * 60 * 60 * 1000, // 24 hours
    length: 32
  }
};

// SMTP Configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.zoho.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: process.env.NODE_ENV === 'production'
  },
  logger: true,
  debug: process.env.NODE_ENV !== 'production'
});

/**
 * Device detection (kept for analytics)
 */
const detectDevicePlatform = (userAgent) => {
  if (!userAgent) return 'web';
  const isMobile = /Mobile|Android|iPhone|iPad|iPod|Windows Phone/i.test(userAgent);
  return isMobile ? 'mobile' : 'web';
};

/**
 * Send verification email
 */
const sendVerificationEmail = async (email, verificationToken) => {
  try {
    const user = await User.findOne({ email })
      .select("name email verified verificationToken verificationSentAt")
      .lean();

    if (!user) throw new Error("User not found");
    if (user.verified) throw new Error("Email already verified");

    // Check if verification was recently sent
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
      subject: "Verify Your Ruda Dating Account",
      text: `Welcome ${user.name},\n\nPlease verify your email by clicking: ${verificationLink}\n\nThis link expires: ${expiryDate}`,
      html: `<!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #4f46e5; 
            color: white; 
            text-decoration: none; 
            border-radius: 4px; 
            margin: 15px 0;
          }
          .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <p>Hi ${user.name},</p>
        <p>Please click the button below to verify your email:</p>
        <div style="text-align: center;">
          <a href="${verificationLink}" class="button">Verify Email</a>
        </div>
        <p>This link expires on ${expiryDate}.</p>
        <div class="footer">
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      </body>
      </html>`,
      headers: {
        'X-Priority': '1',
        'X-Mailer': 'Ruda Dating App'
      }
    };

    const info = await transporter.sendMail(mailOptions);
    
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
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
};

/**
 * Verify user's email using token with unified redirect
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

    // Update user verification status
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        $set: { 
          verified: true,
          verifiedAt: new Date(),
          verificationSentAt: null
        },
        $unset: { verificationToken: "" }
      },
      { new: true }
    );

    // Unified redirect with device info
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Mobile|Android|iPhone/i.test(userAgent);

    return res.redirect(
      `${config.frontendUrl}/email-verified?success=true&email=${encodeURIComponent(updatedUser.email)}&device=${isMobile ? 'mobile' : 'web'}`
    );

  } catch (error) {
    console.error("Email verification error:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Fallback redirect
    return res.redirect(
      `${config.frontendUrl}/email-verified?success=false&error=verification_failed`
    );
  }
};

/**
 * Resend verification email with rate limiting
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

    const user = await User.findOne({ email: decodeURIComponent(email) })
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

    // Check resend cooldown (60 seconds)
    if (user.verificationSentAt && 
        (Date.now() - new Date(user.verificationSentAt).getTime() < 60000)) {
      return res.status(429).json({
        success: false,
        code: "RATE_LIMITED",
        message: "Please wait before requesting another verification email",
        retryAfter: 60,
        timestamp: new Date().toISOString()
      });
    }

    const result = await sendVerificationEmail(user.email, user.verificationToken);

    return res.status(200).json({
      success: true,
      code: "RESENT_SUCCESS",
      message: "Verification email resent",
      messageId: result.messageId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Resend verification error:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: error.message || "Failed to resend verification email",
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  transporter,
  sendVerificationEmail,
  verifyEmail,
  resendVerificationEmail,
  // For testing
  _test: {
    detectDevicePlatform
  }
};