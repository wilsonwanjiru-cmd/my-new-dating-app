const nodemailer = require("nodemailer");
const User = require("../models/user");
require('dotenv').config();

// Configuration - Ensure these match your Render dashboard
const config = {
  baseUrl: process.env.NODE_ENV === 'production' 
    ? 'https://ruda-backend.onrender.com' 
    : 'http://localhost:5000',
  email: {
    service: process.env.SMTP_SERVICE || 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    },
    from: `Ruda Dating App <${process.env.SMTP_FROM || process.env.SMTP_USER}>`
  },
  tokenExpiry: 24 * 60 * 60 * 1000 // 24 hours
};

// Create reusable transporter object with better error handling
let transporter;
try {
  transporter = nodemailer.createTransport({
    service: config.email.service,
    auth: config.email.auth,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
  });

  // Verify connection configuration
  transporter.verify(function(error) {
    if (error) {
      console.error('Email transporter verification failed:', error);
    } else {
      console.log('Email transporter is ready to send messages');
    }
  });
} catch (transportError) {
  console.error('Failed to create email transporter:', transportError);
}

// Email Templates
const templates = {
  verification: (link, expiryDate) => ({
    subject: "Verify Your Ruda Dating App Account",
    text: `Please verify your email by clicking: ${link}\nLink expires: ${expiryDate}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="color: #2c3e50;">Welcome to Ruda Dating App!</h2>
        </div>
        
        <p style="font-size: 16px;">Hello,</p>
        <p style="font-size: 16px;">Please verify your email address to activate your account:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}"
            style="display: inline-block; padding: 12px 24px; 
                   background-color: #3498db; color: white; 
                   text-decoration: none; border-radius: 4px; 
                   font-size: 16px; font-weight: bold;">
            Verify Email
          </a>
        </div>
        
        <p style="font-size: 14px; color: #7f8c8d;">
          <strong>Expires:</strong> ${expiryDate}<br>
          <strong>Not you?</strong> Please ignore this email.
        </p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
          <p style="font-size: 12px; color: #95a5a6;">
            Having trouble? Copy this link to your browser:<br>
            <code style="word-break: break-all; font-size: 11px;">${link}</code>
          </p>
        </div>
      </div>
    `
  })
};

// Email Service with improved error handling
exports.sendVerificationEmail = async (email, verificationToken) => {
  if (!transporter) {
    console.warn('Email transporter not initialized - skipping email sending');
    return; // Don't throw error to allow registration to complete
  }

  try {
    const verificationLink = `${config.baseUrl}/api/email/verify/${verificationToken}`;
    const expiryDate = new Date(Date.now() + config.tokenExpiry).toLocaleString();

    const mailOptions = {
      from: config.email.from,
      to: email,
      ...templates.verification(verificationLink, expiryDate)
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Verification sent to ${email}`);

    // Schedule token cleanup
    setTimeout(async () => {
      try {
        await User.findOneAndUpdate(
          { email, verificationToken, verified: false },
          { $unset: { verificationToken: "" } }
        );
      } catch (cleanupError) {
        console.error('Failed to cleanup verification token:', cleanupError);
      }
    }, config.tokenExpiry);

  } catch (error) {
    console.error(`[Email Error] Failed to send to ${email}:`, error);
    // Don't throw error to allow registration to complete
    // Just log the error and continue
  }
};

// Verification Endpoint with improved responses
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: "Verification token is required" 
      });
    }

    const user = await User.findOneAndUpdate(
      { verificationToken: token, verified: false },
      { 
        $set: { verified: true, verifiedAt: new Date() },
        $unset: { verificationToken: "" }
      },
      { new: true }
    );

    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid, expired, or already used verification link",
        action: "Please request a new verification link if needed"
      });
    }

    return res.status(200).json({ 
      success: true,
      message: "Email verified successfully",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        verified: user.verified
      }
    });

  } catch (error) {
    console.error("[Verification Error]", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error during verification",
      ...(process.env.NODE_ENV === 'development' && { 
        error: error.message,
        stack: error.stack 
      })
    });
  }
};