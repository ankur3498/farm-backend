// Run once: node utils/seedAdmin.js
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

const seedAdmin = async () => {
  await connectDB();

  const existingAdmin = await User.findOne({ role: "admin" });
  if (existingAdmin) {
    console.log("Admin already exists:", existingAdmin.email);
    process.exit(0);
  }

  const admin = await User.create({
    name: "Rahul Das",
    mobile: "7905788538",     // change before running
    email: "ankurcha10@gmail.com", // change before running — this is where OTP will be sent
    role: "admin",
    salary: 0,
    address: "Head Office",
    dateOfJoining: new Date(),
  });

  console.log("Admin created:", admin.email);
  mongoose.connection.close();
  process.exit(0);
};

seedAdmin();