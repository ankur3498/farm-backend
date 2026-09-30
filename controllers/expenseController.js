const Expense = require("../models/Expense");

// @desc    Create new expense
// @route   POST /api/expenses
// @access  Private
exports.createExpense = async (req, res) => {
  try {
    const { title, category, amount, date, notes, billUrl } = req.body;

    const expense = await Expense.create({
      title,
      category,
      amount,
      date: date || Date.now(),
      submittedBy: req.user._id,
      submittedByName: req.user.name || "Staff Member",
      notes,
      billUrl,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Expense submitted successfully",
      expense,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
exports.getExpenses = async (req, res) => {
  try {
    const { status, category, search } = req.query;

    const query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    if (category && category !== "all") {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { submittedByName: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
      ];
    }

    const expenses = await Expense.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: expenses.length,
      expenses,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve expense
// @route   PUT /api/expenses/:id/approve
// @access  Private (Admin / Manager)
exports.approveExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    expense.status = "approved";
    expense.approvedBy = req.user._id;
    expense.approvedByName = req.user.name || "Admin";
    expense.approvedAt = Date.now();

    await expense.save();

    res.json({
      success: true,
      message: "Expense approved successfully",
      expense,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reject expense
// @route   PUT /api/expenses/:id/reject
// @access  Private (Admin / Manager)
exports.rejectExpense = async (req, res) => {
  try {
    const { reason } = req.body;
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    expense.status = "rejected";
    expense.rejectedBy = req.user._id;
    expense.rejectionReason = reason || "Does not meet approval criteria";

    await expense.save();

    res.json({
      success: true,
      message: "Expense rejected",
      expense,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark expense as paid
// @route   PUT /api/expenses/:id/pay
// @access  Private (Admin / Manager)
exports.markPaid = async (req, res) => {
  try {
    const { paymentMode, paymentRef, paymentNotes } = req.body;
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    expense.status = "paid";
    expense.paidBy = req.user._id;
    expense.paidAt = Date.now();
    expense.paymentMode = paymentMode || "UPI / Online";
    expense.paymentRef = paymentRef || "N/A";
    if (paymentNotes) expense.notes = (expense.notes ? `${expense.notes} | ` : "") + paymentNotes;

    await expense.save();

    res.json({
      success: true,
      message: "Expense marked as paid",
      expense,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private (Admin / Manager)
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    await expense.deleteOne();

    res.json({
      success: true,
      message: "Expense deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
