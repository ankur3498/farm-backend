const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const ROLES = [
  "admin",
  "manager_operations",
  "field_manager",
  "worker",
  "temporary_worker",
  "audit_manager",
];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    mobile: {
      type: String,
      required: [true, "Mobile number is required"],
      unique: true,
      trim: true,
      match: [/^[0-9]{10}$/, "Mobile number must be 10 digits"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Enter a valid email"],
    },
    password: {
      type: String,
      required: false, // kept for future fallback, not used in OTP login
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ROLES,
      required: [true, "Role is required"],
      default: "worker",
    },
    salary: {
      type: Number,
      required: [true, "Salary is required"],
      min: 0,
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },
    dateOfJoining: {
      type: Date,
      required: [true, "Date of joining is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // PIN login fields (e.g. 4-digit PIN set during staff creation)
    pin: {
      type: String,
      select: false,
    },
    // OTP login fields
    otpHash: {
      type: String,
      select: false,
    },
    otpExpiry: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (this.isModified("password") && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  if (this.isModified("pin") && this.pin) {
    const salt = await bcrypt.genSalt(10);
    this.pin = await bcrypt.hash(this.pin, salt);
  }
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.matchPin = async function (enteredPin) {
  if (!this.pin) return false;
  return bcrypt.compare(enteredPin, this.pin);
};

userSchema.methods.matchOtp = async function (enteredOtp) {
  if (!this.otpHash || !this.otpExpiry) return false;
  if (this.otpExpiry < new Date()) return false; // expired
  return bcrypt.compare(enteredOtp, this.otpHash);
};

userSchema.statics.ROLES = ROLES;

module.exports = mongoose.model("User", userSchema);