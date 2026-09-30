const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Sale title is required"],
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Sale category is required"],
      enum: [
        "Poultry & Eggs",
        "Goat & Livestock",
        "Crop Produce",
        "Dairy & Milk",
        "Organic Fertilizer & Manure",
        "Equipment Rental",
        "Services & Other",
      ],
    },
    amount: {
      type: Number,
      required: [true, "Sale amount is required"],
      min: [0, "Amount must be positive"],
    },
    date: {
      type: Date,
      default: Date.now,
    },
    buyer: {
      type: String,
      required: [true, "Buyer/Customer name is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["paid", "pending", "partial"],
      default: "paid",
    },
    paymentMethod: {
      type: String,
      default: "Bank Transfer",
    },
    invoiceNo: {
      type: String,
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
