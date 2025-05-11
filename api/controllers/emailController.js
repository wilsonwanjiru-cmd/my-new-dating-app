const nodemailer = require("nodemailer");
const User = require("../models/user");

// Configure base URL based on environment
const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://ruda-backend.onrender.com'
  : 'http://localhost:5000';

// Send Verification Email
exports.sendVerificationEmail = async (email, verificationToken) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "wilsonmuita41@gmail.com", // Your Gmail address
      pass: "qfnlbtbsplqwtell", // Your Gmail app password
    },
  });

  // Create verification link
  const verificationLink = `${BASE_URL}/api/email/verify/${verificationToken}`;

  const mailOptions = {
    from: "wilsonmuita41@gmail.com",
    to: email,
    subject: "Email Verification",
    text: `Click this link to verify your email: ${verificationLink}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Email Verification</h2>
        <p>Hello,</p>
        <p>Please click the button below to verify your email address:</p>
        <a href="${verificationLink}" 
           style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; 
                  color: white; text-decoration: none; border-radius: 5px; margin: 15px 0;">
          Verify Email
        </a>
        <p>If you didn't create an account with us, please ignore this email.</p>
        <hr>
        <p style="font-size: 12px; color: #777;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          ${verificationLink}
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to: ${email}`);
    console.log(`Verification link: ${verificationLink}`); // For debugging
  } catch (error) {
    console.error("Email sending error:", error);
    throw error; // Rethrow to handle in the calling function
  }
};

// Verify Email
exports.verifyEmail = async (req, res) => {
  try {
    const token = req.params.token;

    // Find the user with the matching verification token
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(404).json({ message: "Invalid verification token" });
    }

    // Mark the user as verified and clear the verification token
    user.verified = true;
    user.verificationToken = undefined;
    await user.save();

    // Redirect to a success page or return JSON
    res.status(200).json({ 
      message: "Email verified successfully",
      user: {
        email: user.email,
        verified: user.verified
      }
    });
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).json({ 
      message: "Email verification failed",
      error: error.message 
    });
  }
};