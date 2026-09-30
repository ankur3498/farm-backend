const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Expense title is required"],
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: [
        "Feed & Livestock",
        "Equipment & Machinery",
        "Fuel & Utilities",
        "Fertilizers & Seeds",
        "Labor & Wages",
        "Repairs & Maintenance",
        "Medical & Veterinary",
        "Miscellaneous",
      ],
    },
    amount: {
      type: Number,
      required: [true, "Expense amount is required"],
      min: [0, "Amount must be positive"],
    },
    date: {
      type: Date,
      default: Date.now,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    submittedByName: {
      type: String,
      default: "Staff Member",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "paid", "rejected"],
      default: "pending",
    },
    notes: {
      type: String,
      trim: true,
    },
    billUrl: {
      type: String,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedByName: {
      type: String,
    },
    approvedAt: {
      type: Date,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rejectionReason: {
      type: String,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    paidAt: {
      type: Date,
    },
    paymentMode: {
      type: String,
    },
    paymentRef: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);
