const nodemailer = require("nodemailer");
const User = require("../models/user");

// Send Verification Email
exports.sendVerificationEmail = async (email, verificationToken) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "wilsonmuita41@gmail.com", // Your Gmail address
      pass: "qfnlbtbsplqwtell", // Your Gmail app password
    },
  });

  const mailOptions = {
    from: "wilsonmuita41@gmail.com",
    to: email,
    subject: "Email Verification",
    text: `Click this link to verify your email: http://localhost:5000/api/email/verify/${verificationToken}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Verification email sent to:", email);
  } catch (error) {
    console.error("Email error:", error);
  }
};

// Verify Email
exports.verifyEmail = async (req, res) => {
  try {
    const token = req.params.token;

    // Find the user with the matching verification token
    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(404).json({ message: "Invalid token" });
    }

    // Mark the user as verified and clear the verification token
    user.verified = true;
    user.verificationToken = undefined;
    await user.save();

    res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ message: "Verification failed" });
  }
};