const nodemailer = require("nodemailer");
const crypto = require("crypto");
const User = require("../models/user");
require("dotenv").config();

// Configuration with environment variables
const config = {
  // Base URLs
  baseUrl: process.env.BACKEND_URL || "http://localhost:5000",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:8081",
  verificationPath: process.env.VERIFICATION_PATH || "/verified",

  // Email configuration
  email: {
    service: process.env.SMTP_SERVICE || "", // leave blank if using custom host
    host: process.env.SMTP_HOST || "smtp.zoho.com",
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== "false", // Default true
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    from: process.env.SMTP_FROM || `Ruda Dating <${process.env.SMTP_USER}>`,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  },

  // Token settings
  tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
  tokenLength: 32,
};

let transporter;

/**
 * Initialize email transporter with proper configuration
 */
const initializeTransporter = async () => {
  try {
    const transportConfig = {
      service: config.email.service || undefined,
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: config.email.auth,
      tls: config.email.tls,
    };

    // Clean undefined values
    Object.keys(transportConfig).forEach(
      (key) => transportConfig[key] === undefined && delete transportConfig[key]
    );

    transporter = nodemailer.createTransport(transportConfig);

    if (process.env.NODE_ENV === "production") {
      await transporter.verify();
      console.log("✅ Production SMTP Connection Verified");
    } else {
      console.log("ℹ️ SMTP Transporter initialized (dev mode)");
    }

    return transporter;
  } catch (error) {
    console.error("❌ Transporter Initialization Failed:", error);
    throw error;
  }
};

// Initialize transporter on startup
initializeTransporter().catch((err) => {
  console.error("Failed to initialize email transporter:", err);
});

/**
 * Generate a secure verification token
 */
const generateVerificationToken = () => {
  return crypto.randomBytes(config.tokenLength).toString("hex");
};

/**
 * Email templates with proper HTML and text versions
 */
const templates = {
  verification: (link, expiryDate, user) => ({
    subject: "Verify Your Ruda Dating Account",
    text: `Welcome to Ruda Dating, ${user.name}!\n\nPlease verify your email by clicking: ${link}\n\nThis link expires: ${expiryDate}\n\nIf you didn't request this, please ignore this email.`,
    html: `<!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; }
          .header { text-align: center; margin-bottom: 25px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 4px; font-weight: 500; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeaea; font-size: 12px; color: #777; text-align: center; }
          .code { word-break: break-all; font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="color: #4f46e5;">Ruda Dating</h2>
          <p>Hi ${user.name},</p>
        </div>
        
        <p>Thank you for signing up! Please verify your email address to activate your account:</p>
        
        <div style="text-align: center; margin: 25px 0;">
          <a href="${link}" class="button">Verify Email Address</a>
        </div>
        
        <p>This verification link will expire on ${expiryDate}.</p>
        
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <div class="code">${link}</div>
        
        <div class="footer">
          <p>If you didn't create an account with Ruda Dating, please ignore this email.</p>
          <p>© ${new Date().getFullYear()} Ruda Dating. All rights reserved.</p>
        </div>
      </body>
      </html>`,
  }),
};

/**
 * Send verification email to user
 */
exports.sendVerificationEmail = async (email, verificationToken) => {
  if (!transporter) {
    try {
      await initializeTransporter();
      if (!transporter) throw new Error("Transporter initialization failed");
    } catch (error) {
      console.error("Email service unavailable:", error);
      throw new Error("Email service temporarily unavailable");
    }
  }

  try {
    const user = await User.findOne({ email }).select("name email verified");
    if (!user) {
      throw new Error("User not found");
    }

    if (user.verified) {
      throw new Error("Email already verified");
    }

    // Generate verification link that points to frontend
   // With this production-ready version:
    const verificationLink = `${process.env.FRONTEND_URL}/verified?token=${verificationToken}&email=${encodeURIComponent(email)}`;
    const expiryDate = new Date(Date.now() + config.tokenExpiry).toLocaleString();

    const mailOptions = {
      from: config.email.from,
      to: email,
      ...templates.verification(verificationLink, expiryDate, user),
      headers: {
        "X-Priority": "1",
        "X-Mailer": "Ruda Dating",
      },
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Verification email sent to ${email}`, info.messageId);

    return {
      success: true,
      messageId: info.messageId,
      verificationLink,
      expiry: expiryDate,
    };
  } catch (error) {
    console.error(`❌ Failed to send verification email to ${email}:`, error);
    throw error;
  }
};

/**
 * Verify user's email using token
 */
exports.verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing verification token or email",
      });
    }

    const user = await User.findOne({
      email,
      verificationToken: token,
      verified: false,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification link",
        action: "resend",
        email,
      });
    }

    // Verify the user
    user.verified = true;
    user.verificationToken = undefined;
    await user.save();

    // In production, redirect to frontend with success message
    if (process.env.NODE_ENV === "production") {
      return res.redirect(
        `${config.frontendUrl}/login?verified=true&email=${encodeURIComponent(email)}`
      );
    }

    // In development, return JSON response
    return res.json({
      success: true,
      message: "Email verified successfully",
      email,
    });
  } catch (error) {
    console.error("Email verification failed:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during verification",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Resend verification email
 */
exports.resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

    const user = await User.findOne({ email }).select("name email verified verificationToken");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.verified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    // Generate new token if none exists or it's expired
    if (!user.verificationToken) {
      user.verificationToken = generateVerificationToken();
      await user.save();
    }

    // Send verification email
    await this.sendVerificationEmail(email, user.verificationToken);

    return res.json({
      success: true,
      message: "Verification email resent successfully",
    });
  } catch (error) {
    console.error("Failed to resend verification email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to resend verification email",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Export token generator for testing
exports.generateVerificationToken = generateVerificationToken;