const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const User = require("../models/user");
require('dotenv').config();

// OAuth2 Client Setup (if using Gmail OAuth)
const oAuth2Client = process.env.GMAIL_CLIENT_ID ? new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
) : null;

if (oAuth2Client && process.env.GMAIL_REFRESH_TOKEN) {
  oAuth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
  });
}

// Configuration with enhanced environment handling
const config = {
  baseUrl: process.env.NODE_ENV === 'production' 
    ? process.env.PRODUCTION_URL || 'https://ruda-backend.onrender.com'
    : process.env.LOCAL_URL || `http://${process.env.LOCAL_IP || 'localhost'}:${process.env.PORT || 5000}`,
  
  email: {
    service: process.env.SMTP_SERVICE || 'gmail',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      type: 'OAuth2',
      user: process.env.SMTP_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: process.env.GMAIL_ACCESS_TOKEN
    },
    from: process.env.SMTP_FROM || `Ruda Dating App <${process.env.SMTP_USER}>`,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
  },
  tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
  frontendUrl: process.env.FRONTEND_URL || 'https://your-frontend-app.com'
};

// Create reusable transporter object with advanced error handling
let transporter;
const initializeTransporter = async () => {
  try {
    const transportConfig = {
      service: config.email.service,
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: config.email.auth,
      tls: config.email.tls
    };

    // If using OAuth2 and we have a refresh token
    if (oAuth2Client && process.env.GMAIL_REFRESH_TOKEN) {
      try {
        const { token } = await oAuth2Client.getAccessToken();
        transportConfig.auth.accessToken = token;
      } catch (oauthError) {
        console.error('Failed to refresh OAuth2 token:', oauthError);
      }
    } else if (process.env.SMTP_PASSWORD) {
      // Fallback to basic auth if OAuth not configured
      transportConfig.auth = {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      };
    } else {
      throw new Error('No email authentication method configured');
    }

    // Clean up undefined values
    Object.keys(transportConfig).forEach(key => 
      transportConfig[key] === undefined && delete transportConfig[key]
    );

    transporter = nodemailer.createTransport(transportConfig);

    // Verify connection in production only
    if (process.env.NODE_ENV === 'production') {
      await transporter.verify();
      console.log('✅ SMTP Connection Verified');
    } else {
      console.log('ℹ️ SMTP Transporter initialized (not verified in development)');
    }

    return transporter;
  } catch (error) {
    console.error('❌ Transporter Initialization Failed:', error);
    throw error;
  }
};

// Initialize transporter immediately
initializeTransporter().catch(err => {
  console.error('Failed to initialize email transporter:', err);
});

// Enhanced email templates with mobile optimization
const templates = {
  verification: (link, expiryDate, user) => ({
    subject: "Complete Your Ruda Dating App Registration",
    text: `Welcome to Ruda Dating App, ${user.name}!\n\nPlease verify your email by clicking: ${link}\n\nThis link expires: ${expiryDate}\n\nIf you didn't request this, please ignore this email.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; 
                 max-width: 600px; margin: 0 auto; padding: 20px; color: #333; }
          .header { text-align: center; margin-bottom: 25px; }
          .logo { max-width: 150px; height: auto; }
          .button { display: block; width: 80%; max-width: 250px; margin: 25px auto; padding: 12px; 
                    background-color: #4285F4; color: white; text-align: center; text-decoration: none; 
                    border-radius: 4px; font-size: 16px; font-weight: 500; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeaea; 
                   font-size: 12px; color: #777; text-align: center; }
          .code { word-break: break-all; font-family: monospace; background: #f5f5f5; 
                 padding: 10px; margin: 10px 0; border-radius: 4px; font-size: 11px; }
          .expiry { color: #666; font-size: 14px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="color: #202124; margin-bottom: 5px;">Welcome to Ruda Dating App</h2>
          <p style="color: #5f6368;">Hi ${user.name}, let's get you verified!</p>
        </div>
        
        <p style="margin-bottom: 25px;">Please verify your email address to activate your account:</p>
        
        <a href="${link}" class="button" style="color: white;">Verify Email Now</a>
        
        <div class="expiry">
          <strong>Link expires:</strong> ${expiryDate}
        </div>
        
        <div class="footer">
          <p>Having trouble? Copy this link to your browser:</p>
          <div class="code">${link}</div>
          <p>If you didn't request this, please ignore this email or contact support.</p>
          <p style="margin-top: 15px;">© ${new Date().getFullYear()} Ruda Dating App. All rights reserved.</p>
        </div>
      </body>
      </html>
    `
  })
};

/**
 * Enhanced email service with comprehensive error handling
 * @param {string} email - Recipient email address
 * @param {string} verificationToken - Verification token
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
exports.sendVerificationEmail = async (email, verificationToken) => {
  if (!transporter) {
    console.warn('Email transporter not initialized - attempting to reconnect');
    try {
      await initializeTransporter();
      if (!transporter) throw new Error('Transporter initialization failed');
    } catch (reconnectError) {
      console.error('Reconnection failed:', reconnectError);
      return { 
        success: false, 
        error: 'Email service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      };
    }
  }

  try {
    const user = await User.findOne({ email }).select('name email verificationToken verified');
    if (!user) {
      console.error(`User not found for email: ${email}`);
      return { 
        success: false, 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      };
    }

    const verificationLink = `${config.baseUrl}/api/email/verify/${verificationToken}`;
    const expiryDate = new Date(Date.now() + config.tokenExpiry).toLocaleString();

    const mailOptions = {
      from: config.email.from,
      to: email,
      ...templates.verification(verificationLink, expiryDate, user),
      headers: {
        'X-Priority': '1',
        'X-Mailer': 'Ruda Dating App',
        'X-Auto-Response-Suppress': 'All'
      },
      // Important for Gmail to avoid being marked as spam
      dsn: {
        id: verificationToken,
        return: 'headers',
        notify: ['failure', 'delay'],
        recipient: config.email.from
      }
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Email sent to ${email}`, info.messageId);

    // Schedule token cleanup
    setTimeout(async () => {
      try {
        const result = await User.findOneAndUpdate(
          { email, verificationToken, verified: false },
          { $unset: { verificationToken: "" } },
          { new: true }
        );
        if (result) {
          console.log(`♻️ Cleaned up expired token for ${email}`);
        }
      } catch (cleanupError) {
        console.error('Token cleanup failed:', cleanupError);
      }
    }, config.tokenExpiry);

    return { 
      success: true, 
      messageId: info.messageId,
      verificationLink // For testing purposes
    };

  } catch (error) {
    console.error(`❌ Email sending failed to ${email}:`, error);
    
    // Special handling for common SMTP errors
    let errorCode = 'EMAIL_SEND_FAILED';
    if (error.code === 'EAUTH') {
      errorCode = 'AUTHENTICATION_FAILED';
      console.error('Authentication failed - check SMTP credentials');
    } else if (error.code === 'ECONNECTION') {
      errorCode = 'CONNECTION_FAILED';
      console.error('Connection to SMTP server failed');
    } else if (error.responseCode === 535) {
      errorCode = 'AUTHENTICATION_FAILED';
      console.error('Gmail authentication failed - check credentials or app permissions');
    }
    
    return { 
      success: false, 
      error: 'Failed to send verification email',
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
};

/**
 * Enhanced verification endpoint with redirect support
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    // Handle HEAD requests (for email clients checking links)
    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    if (!token) {
      const errorResponse = {
        success: false, 
        code: 'MISSING_TOKEN',
        message: "Verification token is required",
        action: "resend"
      };
      
      if (req.accepts('html')) {
        return res.redirect(`${config.frontendUrl}/verify-error?${new URLSearchParams(errorResponse)}`);
      }
      return res.status(400).json(errorResponse);
    }

    const user = await User.findOneAndUpdate(
      { verificationToken: token, verified: false },
      { 
        $set: { verified: true, verifiedAt: new Date() },
        $unset: { verificationToken: "" }
      },
      { new: true }
    ).select('_id email name verified');

    if (!user) {
      const errorResponse = {
        success: false,
        code: 'INVALID_TOKEN',
        message: "This verification link is invalid or expired",
        action: "resend"
      };
      
      if (req.accepts('html')) {
        return res.redirect(`${config.frontendUrl}/verify-error?${new URLSearchParams(errorResponse)}`);
      }
      return res.status(400).json(errorResponse);
    }

    const successResponse = {
      success: true,
      message: "Email verified successfully",
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    };

    if (req.accepts('html')) {
      return res.redirect(`${config.frontendUrl}/verify-success?${new URLSearchParams(successResponse)}`);
    }

    return res.status(200).json(successResponse);

  } catch (error) {
    console.error("❌ Verification Error:", error);
    
    const errorResponse = {
      success: false,
      code: 'SERVER_ERROR',
      message: "Internal server error during verification",
      ...(process.env.NODE_ENV === 'development' && { 
        error: error.message
      })
    };
    
    if (req.accepts('html')) {
      return res.redirect(`${config.frontendUrl}/verify-error?${new URLSearchParams(errorResponse)}`);
    }
    
    return res.status(500).json(errorResponse);
  }
};

/**
 * Check verification status for a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.checkVerificationStatus = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(400).json({ 
        success: false,
        code: 'MISSING_EMAIL',
        message: "Email parameter is required" 
      });
    }

    const user = await User.findOne({ email }).select('email verified verificationToken');
    if (!user) {
      return res.status(404).json({ 
        success: false,
        code: 'USER_NOT_FOUND',
        message: "User not found" 
      });
    }

    return res.status(200).json({
      success: true,
      verified: user.verified,
      canResend: !user.verified && !!user.verificationToken
    });

  } catch (error) {
    console.error("Verification check error:", error);
    return res.status(500).json({ 
      success: false,
      code: 'SERVER_ERROR',
      message: "Failed to check verification status" 
    });
  }
};

/**
 * Health check for email service
 */
exports.checkEmailHealth = async () => {
  if (!transporter) {
    try {
      await initializeTransporter();
    } catch (err) {
      return { healthy: false, error: 'Transporter initialization failed' };
    }
  }

  try {
    await transporter.verify();
    return { healthy: true };
  } catch (error) {
    return { 
      healthy: false, 
      error: error.message,
      code: error.code 
    };
  }
};