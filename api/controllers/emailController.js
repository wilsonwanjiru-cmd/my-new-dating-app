const nodemailer = require("nodemailer");
const User = require("../models/user");
require('dotenv').config(); // Ensure environment variables are loaded

// Configure base URL and email settings from environment
const BASE_URL = process.env.NODE_ENV === 'production'
  ? process.env.PRODUCTION_URL 
  : process.env.DEV_URL || 'http://localhost:5000';

// Enhanced email transporter configuration
const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production' // Strict SSL in production
  }
});

// Token expiration (24 hours)
const VERIFICATION_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Send Verification Email
exports.sendVerificationEmail = async (email, verificationToken) => {
  try {
    const verificationLink = `${BASE_URL}/api/email/verify/${verificationToken}`;
    const expiryDate = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY).toLocaleString();

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Email Verification - Ruda Dating App",
      text: `Please verify your email by clicking: ${verificationLink}\n\nThis link expires: ${expiryDate}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Ruda Dating App - Email Verification</h2>
          <p>Hello,</p>
          <p>Please verify your email address to activate your account:</p>
          <a href="${verificationLink}"
            style="display: inline-block; padding: 12px 24px; background-color: #3498db;
                  color: white; text-decoration: none; border-radius: 4px; margin: 15px 0;">
            Verify Email
          </a>
          <p style="color: #7f8c8d; font-size: 14px;">
            <strong>Expires:</strong> ${expiryDate}<br>
            <strong>Not you?</strong> Ignore this email.
          </p>
          <hr style="border: 0; border-top: 1px solid #ecf0f1;">
          <p style="font-size: 12px; color: #95a5a6;">
            Can't click the button? Copy this link to your browser:<br>
            <code style="word-break: break-all;">${verificationLink}</code>
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Verification sent to ${email} | Token: ${verificationToken}`);
    
    // Schedule token expiration (optional)
    setTimeout(async () => {
      const user = await User.findOne({ email, verificationToken });
      if (user && !user.verified) {
        user.verificationToken = undefined;
        await user.save();
        console.log(`[Cleanup] Expired token for ${email}`);
      }
    }, VERIFICATION_TOKEN_EXPIRY);

  } catch (error) {
    console.error(`[Email Error] Failed to send to ${email}:`, error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
};

// Verify Email with enhanced security
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ 
        success: false,
        message: "Verification token is required" 
      });
    }

    const user = await User.findOne({ 
      verificationToken: token,
      verified: false 
    });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "Invalid or expired verification link" 
      });
    }

    // Mark as verified and clear token
    user.verified = true;
    user.verificationToken = undefined;
    user.verifiedAt = new Date();
    await user.save();

    // Successful verification response
    res.status(200).json({ 
      success: true,
      message: "Email successfully verified",
      user: {
        email: user.email,
        name: user.name,
        verified: user.verified,
        verifiedAt: user.verifiedAt
      }
    });

  } catch (error) {
    console.error("[Verification Error]", error);
    res.status(500).json({ 
      success: false,
      message: "Internal server error during verification",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};