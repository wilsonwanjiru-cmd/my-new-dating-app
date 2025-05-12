const nodemailer = require("nodemailer");
const User = require("../models/user");
require('dotenv').config();

// Configuration with enhanced environment handling
const config = {
  baseUrl: process.env.NODE_ENV === 'production' 
    ? process.env.PRODUCTION_URL || 'https://ruda-backend.onrender.com'
    : process.env.LOCAL_URL || `http://${process.env.LOCAL_IP || 'localhost'}:${process.env.PORT || 5000}`,
  
  email: {
    service: process.env.SMTP_SERVICE || 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    },
    from: process.env.SMTP_FROM || `Ruda Dating App <${process.env.SMTP_USER}>`,
    // Additional SMTP options for production
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true'
  },
  tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
  frontendUrl: process.env.FRONTEND_URL || 'https://your-frontend-app.com'
};

// Enhanced transporter setup with fallback options
let transporter;
const initializeTransporter = () => {
  try {
    const transportConfig = {
      host: process.env.SMTP_HOST,
      port: config.email.port,
      secure: config.email.secure,
      auth: config.email.auth,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    };

    // Clean up undefined values
    Object.keys(transportConfig).forEach(key => 
      transportConfig[key] === undefined && delete transportConfig[key]
    );

    transporter = nodemailer.createTransport(transportConfig);

    // Verify connection in production only
    if (process.env.NODE_ENV === 'production') {
      transporter.verify((error) => {
        if (error) {
          console.error('SMTP Connection Error:', error);
        } else {
          console.log('SMTP Connection Verified');
        }
      });
    }
  } catch (error) {
    console.error('Transporter Initialization Failed:', error);
  }
};

initializeTransporter();

// Enhanced email templates with mobile optimization
const templates = {
  verification: (link, expiryDate, user) => ({
    subject: "Complete Your Ruda Dating App Registration",
    text: `Welcome to Ruda Dating App!\n\nPlease verify your email by clicking: ${link}\n\nThis link expires: ${expiryDate}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; }
          .header { text-align: center; margin-bottom: 30px; }
          .button { display: block; width: 80%; max-width: 250px; margin: 25px auto; padding: 15px; 
                    background-color: #3498db; color: white; text-align: center; text-decoration: none; 
                    border-radius: 5px; font-size: 16px; font-weight: bold; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ecf0f1; font-size: 12px; color: #95a5a6; }
          .code { word-break: break-all; font-family: monospace; background: #f5f5f5; padding: 10px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="color: #2c3e50;">Welcome to Ruda Dating App, ${user.name}!</h2>
        </div>
        
        <p>Hello,</p>
        <p>Please verify your email address to activate your account:</p>
        
        <a href="${link}" class="button">Verify Email Now</a>
        
        <p style="color: #7f8c8d;">
          <strong>Expires:</strong> ${expiryDate}<br>
          <strong>Not you?</strong> Please ignore this email.
        </p>
        
        <div class="footer">
          <p>Having trouble? Copy this link to your browser:</p>
          <div class="code">${link}</div>
          <p>If you didn't request this, please contact support.</p>
        </div>
      </body>
      </html>
    `
  })
};

// Enhanced email service with comprehensive error handling
exports.sendVerificationEmail = async (email, verificationToken) => {
  if (!transporter) {
    console.warn('Email transporter not initialized - attempting to reconnect');
    initializeTransporter();
    if (!transporter) {
      console.error('Email sending aborted - no transporter available');
      return { success: false, error: 'Email service unavailable' };
    }
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`User not found for email: ${email}`);
      return { success: false, error: 'User not found' };
    }

    const verificationLink = `${config.baseUrl}/api/email/verify/${verificationToken}`;
    const expiryDate = new Date(Date.now() + config.tokenExpiry).toLocaleString();

    const mailOptions = {
      from: config.email.from,
      to: email,
      ...templates.verification(verificationLink, expiryDate, user),
      // Add headers for better email delivery
      headers: {
        'X-Priority': '1',
        'X-Mailer': 'Ruda Dating App'
      }
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${email}`, info.messageId);

    // Schedule token cleanup
    setTimeout(async () => {
      try {
        const result = await User.findOneAndUpdate(
          { email, verificationToken, verified: false },
          { $unset: { verificationToken: "" } },
          { new: true }
        );
        if (result) {
          console.log(`Cleaned up expired token for ${email}`);
        }
      } catch (cleanupError) {
        console.error('Token cleanup failed:', cleanupError);
      }
    }, config.tokenExpiry);

    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error(`Email sending failed to ${email}:`, error);
    
    // Special handling for common SMTP errors
    if (error.code === 'EAUTH') {
      console.error('Authentication failed - check SMTP credentials');
    } else if (error.code === 'ECONNECTION') {
      console.error('Connection to SMTP server failed');
    }
    
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
};

// Enhanced verification endpoint with redirect support
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    // Handle HEAD requests (for email clients checking links)
    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    if (!token) {
      return res.status(400).json({ 
        success: false, 
        code: 'MISSING_TOKEN',
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
      const errorResponse = {
        success: false,
        code: 'INVALID_TOKEN',
        message: "This verification link is invalid or expired",
        action: "request_new_link"
      };
      
      // Redirect to frontend with error if Accept header prefers HTML
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

    // Redirect to frontend success page if Accept header prefers HTML
    if (req.accepts('html')) {
      return res.redirect(`${config.frontendUrl}/verify-success?${new URLSearchParams(successResponse)}`);
    }

    return res.status(200).json(successResponse);

  } catch (error) {
    console.error("Verification Error:", error);
    
    const errorResponse = {
      success: false,
      code: 'SERVER_ERROR',
      message: "Internal server error during verification",
      ...(process.env.NODE_ENV === 'development' && { 
        error: error.message,
        stack: error.stack 
      })
    };
    
    if (req.accepts('html')) {
      return res.redirect(`${config.frontendUrl}/verify-error?${new URLSearchParams(errorResponse)}`);
    }
    
    return res.status(500).json(errorResponse);
  }
};

// Additional helper function for frontend verification checks
exports.checkVerificationStatus = async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    return res.status(200).json({
      success: true,
      verified: user.verified,
      canResend: !user.verified
    });

  } catch (error) {
    console.error("Verification check error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Failed to check verification status" 
    });
  }
};