const nodemailer = require("nodemailer");
const crypto = require("crypto");
const User = require("../models/user");
require("dotenv").config();

// Enhanced configuration with environment variables
const config = {
  baseUrl: process.env.BACKEND_URL || "http://localhost:5000",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  verificationPath: "/verify-email",

  email: {
    service: process.env.SMTP_SERVICE || "",
    host: process.env.SMTP_HOST || "smtp.zoho.com",
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== "false",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    from: process.env.SMTP_FROM || `Ruda Dating <${process.env.SMTP_USER}>`,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  },

  token: {
    expiry: 24 * 60 * 60 * 1000, // 24 hours
    length: 32,
  }
};

let transporter;

/**
 * Initialize email transporter with proper configuration
 */
const initializeTransporter = async () => {
  try {
    const transportConfig = {
      service: config.email.service,
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
    throw new Error("Failed to initialize email transporter");
  }
};

/**
 * Generate a secure verification token
 */
const generateVerificationToken = () => {
  return crypto.randomBytes(config.token.length).toString("hex");
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
      </html>`
  }),
};

/**
 * Send verification email to user
 */
const sendVerificationEmail = async (email, verificationToken) => {
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
    const user = await User.findOne({ email }).select("name email verified verificationToken");
    if (!user) {
      throw new Error("User not found");
    }

    if (user.verified) {
      throw new Error("Email already verified");
    }

    // Use provided token or generate new one
    const token = verificationToken || generateVerificationToken();
    // Updated verification link to use /api/email instead of /api/auth
    const verificationLink = `${config.baseUrl}/api/email/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
    const expiryDate = new Date(Date.now() + config.token.expiry).toLocaleString();

    // Update user's verification token if needed
    if (!user.verificationToken || user.verificationToken !== token) {
      user.verificationToken = token;
      await user.save();
    }

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
const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        message: "Verification token and email are required",
        code: "MISSING_PARAMETERS",
      });
    }

    const user = await User.findOne({
      email: decodeURIComponent(email),
      verificationToken: token,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification link",
        code: "INVALID_TOKEN",
        action: "resend",
        email: decodeURIComponent(email),
      });
    }

    if (user.verified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
        code: "ALREADY_VERIFIED",
      });
    }

    user.verified = true;
    user.verificationToken = undefined;
    user.verifiedAt = new Date();
    await user.save();

    const response = {
      success: true,
      message: "Email verified successfully",
      email: user.email,
      userId: user._id,
    };

    if (process.env.NODE_ENV === "production") {
      return res.redirect(
        `${config.frontendUrl}/verified?success=true&email=${encodeURIComponent(user.email)}`
      );
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Email verification failed:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during verification",
      code: "SERVER_ERROR",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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
        message: "Email address is required",
        code: "MISSING_EMAIL",
      });
    }

    const user = await User.findOne({ email: decodeURIComponent(email) })
      .select("name email verified verificationToken verifiedAt");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    if (user.verified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
        code: "ALREADY_VERIFIED",
        verifiedAt: user.verifiedAt,
      });
    }

    if (!user.verificationToken) {
      user.verificationToken = generateVerificationToken();
      await user.save();
    }

    await sendVerificationEmail(user.email, user.verificationToken);

    return res.status(200).json({
      success: true,
      message: "Verification email resent successfully",
      email: user.email,
    });
  } catch (error) {
    console.error("Failed to resend verification email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to resend verification email",
      code: "SERVER_ERROR",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  initializeTransporter,
  sendVerificationEmail,
  verifyEmail,
  resendVerificationEmail,
  generateVerificationToken
};