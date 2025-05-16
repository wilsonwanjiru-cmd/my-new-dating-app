const nodemailer = require("nodemailer");
const User = require("../models/user");
require("dotenv").config();

const config = {
  baseUrl:
    process.env.NODE_ENV === "production"
      ? process.env.PRODUCTION_URL || "https://api.rudadatingsite.singles/"
      : process.env.LOCAL_URL ||
        `http://${process.env.LOCAL_IP || "localhost"}:${
          process.env.PORT || 5000
        }`,

  email: {
    service: process.env.SMTP_SERVICE || "", // leave blank if using custom host
    host: process.env.SMTP_HOST || "smtp.zoho.com",
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === "true" || true, // Zoho requires secure SSL
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD, // ✅ WilsonWanjiru@2021
    },
    from:
      process.env.SMTP_FROM || `Ruda Dating App <${process.env.SMTP_USER}>`,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  },
  tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
  frontendUrl: process.env.FRONTEND_URL || "https://your-frontend-app.com",
};

let transporter;

const initializeTransporter = async () => {
  try {
    const transportConfig = {
      service: config.email.service || undefined, // optional
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: config.email.auth,
      tls: config.email.tls,
    };

    // remove any undefined fields
    Object.keys(transportConfig).forEach(
      (key) => transportConfig[key] === undefined && delete transportConfig[key]
    );

    transporter = nodemailer.createTransport(transportConfig);

    if (process.env.NODE_ENV === "production") {
      await transporter.verify();
      console.log("✅ SMTP Connection Verified");
    } else {
      console.log("ℹ️ SMTP Transporter initialized (dev mode)");
    }

    return transporter;
  } catch (error) {
    console.error("❌ Transporter Initialization Failed:", error);
    throw error;
  }
};

initializeTransporter().catch((err) => {
  console.error("Failed to initialize email transporter:", err);
});

const templates = {
  verification: (link, expiryDate, user) => ({
    subject: "Complete Your Ruda Dating App Registration",
    text: `Welcome to Ruda Dating App, ${user.name}!\n\nPlease verify your email by clicking: ${link}\n\nThis link expires: ${expiryDate}\n\nIf you didn't request this, please ignore this email.`,
    html: `<!DOCTYPE html>
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; }
        .header { text-align: center; margin-bottom: 25px; }
        .button { display: block; width: 80%; max-width: 250px; margin: 25px auto; padding: 12px; background-color: #4285F4; color: white; text-align: center; text-decoration: none; border-radius: 4px; font-size: 16px; font-weight: 500; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeaea; font-size: 12px; color: #777; text-align: center; }
        .code { word-break: break-all; font-family: monospace; background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px; font-size: 11px; }
        .expiry { color: #666; font-size: 14px; margin-top: 20px; }
      </style></head><body>
        <div class="header">
          <h2>Welcome to Ruda Dating App</h2>
          <p>Hi ${user.name}, let's get you verified!</p>
        </div>
        <p>Please verify your email address to activate your account:</p>
        <a href="${link}" class="button">Verify Email Now</a>
        <div class="expiry"><strong>Link expires:</strong> ${expiryDate}</div>
        <div class="footer">
          <p>Having trouble? Copy this link to your browser:</p>
          <div class="code">${link}</div>
          <p>If you didn't request this, please ignore this email or contact support.</p>
          <p>© ${new Date().getFullYear()} Ruda Dating App. All rights reserved.</p>
        </div>
      </body></html>`,
  }),
};

exports.sendVerificationEmail = async (email, verificationToken) => {
  if (!transporter) {
    console.warn("Email transporter not initialized - attempting to reconnect");
    try {
      await initializeTransporter();
      if (!transporter) throw new Error("Transporter initialization failed");
    } catch (reconnectError) {
      console.error("Reconnection failed:", reconnectError);
      return {
        success: false,
        error: "Email service unavailable",
        code: "SERVICE_UNAVAILABLE",
      };
    }
  }

  try {
    const user = await User.findOne({ email }).select(
      "name email verificationToken verified"
    );
    if (!user) {
      return {
        success: false,
        error: "User not found",
        code: "USER_NOT_FOUND",
      };
    }

    const verificationLink = `${config.baseUrl}/api/email/verify/${verificationToken}`;
    const expiryDate = new Date(Date.now() + config.tokenExpiry).toLocaleString();

    const mailOptions = {
      from: config.email.from,
      to: email,
      ...templates.verification(verificationLink, expiryDate, user),
      headers: {
        "X-Priority": "1",
        "X-Mailer": "Ruda Dating App",
        "X-Auto-Response-Suppress": "All",
      },
      dsn: {
        id: verificationToken,
        return: "headers",
        notify: ["failure", "delay"],
        recipient: config.email.from,
      },
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Email sent to ${email}`, info.messageId);

    // cleanup expired token later
    setTimeout(async () => {
      try {
        await User.findOneAndUpdate(
          { email, verificationToken, verified: false },
          { $unset: { verificationToken: "" } },
          { new: true }
        );
      } catch (cleanupError) {
        console.error("Token cleanup failed:", cleanupError);
      }
    }, config.tokenExpiry);

    return {
      success: true,
      messageId: info.messageId,
      verificationLink,
    };
  } catch (error) {
    console.error(`❌ Email sending failed to ${email}:`, error);

    let errorCode = "EMAIL_SEND_FAILED";
    if (error.code === "EAUTH") {
      errorCode = "AUTHENTICATION_FAILED";
    } else if (error.code === "ECONNECTION") {
      errorCode = "CONNECTION_FAILED";
    } else if (error.responseCode === 535) {
      errorCode = "AUTHENTICATION_FAILED";
    }

    return {
      success: false,
      error: "Failed to send verification email",
      code: errorCode,
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    };
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    if (req.method === "HEAD") return res.status(200).end();

    const user = await User.findOne({
      verificationToken: token,
      verified: false,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired verification link",
      });
    }

    user.verified = true;
    user.verificationToken = undefined;
    await user.save();

    const redirectUrl = `${config.frontendUrl}/verified?email=${user.email}`;
    return res.redirect(302, redirectUrl);
  } catch (error) {
    console.error("Email verification failed:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during verification",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
