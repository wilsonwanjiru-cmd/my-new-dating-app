const nodemailer = require("nodemailer");
const crypto = require("crypto");
const User = require("../models/user");
require("dotenv").config();

// Configuration
const config = {
  baseUrl: process.env.BACKEND_URL || "http://localhost:5000",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  verificationPath: "/verify-email",

  email: {
    host: process.env.EMAIL_SERVICE, // e.g. smtp.zoho.com
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_SECURE === "true", // must be string comparison
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    from: process.env.EMAIL_FROM || `Ruda Dating <${process.env.EMAIL_USER}>`,
  },

  token: {
    expiry: 24 * 60 * 60 * 1000,
    length: 32,
  }
};

let transporter;

/**
 * Initialize email transporter with debug verification
 */
const initializeTransporter = async () => {
  try {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: config.email.auth,
    });

    transporter.verify((error, success) => {
      if (error) {
        console.error("❌ Email Transporter verification failed:", error);
      } else {
        console.log("✅ Email Transporter is ready to send messages");
      }
    });

    return transporter;
  } catch (error) {
    console.error("❌ Failed to initialize transporter:", error);
    throw new Error("Transporter initialization error");
  }
};

const generateVerificationToken = () => {
  return crypto.randomBytes(config.token.length).toString("hex");
};

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

const sendVerificationEmail = async (email, verificationToken) => {
  if (!transporter) {
    await initializeTransporter();
    if (!transporter) throw new Error("Email transporter failed to initialize");
  }

  try {
    const user = await User.findOne({ email }).select("name email verified verificationToken");
    if (!user) throw new Error("User not found");
    if (user.verified) throw new Error("Email already verified");

    const token = verificationToken || generateVerificationToken();
    const verificationLink = `${config.baseUrl}/api/email/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
    const expiryDate = new Date(Date.now() + config.token.expiry).toLocaleString();

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
    console.log(`✉️ Verification email sent to ${email} (ID: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
      verificationLink,
      expiry: expiryDate,
    };
  } catch (err) {
    console.error(`❌ Could not send verification email to ${email}:`, err);
    throw err;
  }
};

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
    });
  } catch (error) {
    console.error("Failed to resend verification email:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to resend verification email",
      code: "SERVER_ERROR",
    });
  }
};

module.exports = {
  sendVerificationEmail,
  verifyEmail,
  resendVerificationEmail,
};
