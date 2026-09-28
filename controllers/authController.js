const bcrypt = require("bcryptjs");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const generateOtp = require("../utils/generateOtp");
const sendEmail = require("../utils/sendEmail");
const sendSmsOtp = require("../utils/sendSmsOtp");

const OTP_EXPIRY_MINUTES = 5;

// @route   POST /api/auth/request-otp
// @access  Public
// body: { email }
const requestOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: "This account has been deactivated" });
    }

    const otp = generateOtp();
    const salt = await bcrypt.genSalt(10);
    user.otpHash = await bcrypt.hash(otp, salt);
    user.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await user.save();

    await sendEmail({
      to: user.email,
      subject: "Your Farmhouse Management Login OTP",
      text: `Your OTP is ${otp}. It is valid for ${OTP_EXPIRY_MINUTES} minutes.`,
    });

    // Mobile OTP not live yet — stub call kept ready for when a provider is wired in
    await sendSmsOtp({ mobile: user.mobile, otp });

    res.status(200).json({ message: `OTP sent to ${user.email}` });
  } catch (error) {
    res.status(500).json({ message: "Failed to send OTP", error: error.message });
  }
};

// @route   POST /api/auth/verify-otp
// @access  Public
// body: { email, otp }
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email }).select("+otpHash +otpExpiry");
    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    const isValid = await user.matchOtp(otp);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid or expired OTP" });
    }

    // Clear OTP after successful use
    user.otpHash = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: "OTP verification failed", error: error.message });
  }
};

// @route   POST /api/auth/create-user
// @access  Private (admin only)
const createUser = async (req, res) => {
  try {
    const { name, mobile, email, role, salary, address, dateOfJoining } = req.body;

    const missing = [];
    if (!name) missing.push("name");
    if (!mobile) missing.push("mobile");
    if (!email) missing.push("email");
    if (!role) missing.push("role");
    if (salary === undefined || salary === null) missing.push("salary");
    if (!address) missing.push("address");
    if (!dateOfJoining) missing.push("dateOfJoining");

    if (missing.length > 0) {
      return res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
    }

    if (role === "admin") {
      return res.status(403).json({ message: "Admin accounts cannot be created via this endpoint" });
    }

    if (!User.ROLES.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Allowed: ${User.ROLES.join(", ")}` });
    }

    const existing = await User.findOne({ $or: [{ email }, { mobile }] });
    if (existing) {
      return res.status(409).json({ message: "User with this email or mobile already exists" });
    }

    const user = await User.create({
      name,
      mobile,
      email,
      role,
      salary,
      address,
      dateOfJoining,
      pin: req.body.pin || "1234",
      createdBy: req.user._id,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      salary: user.salary,
      address: user.address,
      dateOfJoining: user.dateOfJoining,
      createdBy: user.createdBy,
    });
  } catch (error) {
    res.status(500).json({ message: "User creation failed", error: error.message });
  }
};

// @route   POST /api/auth/login-pin
// @access  Public
// body: { mobile, pin }
const loginWithPin = async (req, res) => {
  try {
    const { mobile, pin } = req.body;
    if (!mobile || !pin) {
      return res.status(400).json({ message: "Mobile number and PIN are required" });
    }

    const user = await User.findOne({ mobile }).select("+pin");
    if (!user) {
      return res.status(404).json({ message: "No account found with this mobile number" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "This account has been deactivated" });
    }

    const isValid = await user.matchPin(pin);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid PIN" });
    }

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: "PIN login failed", error: error.message });
  }
};

// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  res.status(200).json(req.user);
};

module.exports = { requestOtp, verifyOtp, loginWithPin, createUser, getMe };