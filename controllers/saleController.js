const Sale = require("../models/Sale");
const Expense = require("../models/Expense");

// @desc    Record new farm sale
// @route   POST /api/financials/sales
// @access  Private (Admin / Manager)
exports.createSale = async (req, res) => {
  try {
    const { title, category, amount, date, buyer, status, paymentMethod, invoiceNo, notes } = req.body;

    const sale = await Sale.create({
      title,
      category,
      amount,
      date: date || Date.now(),
      buyer,
      status: status || "paid",
      paymentMethod: paymentMethod || "Bank Transfer",
      invoiceNo: invoiceNo || `INV-${Date.now().toString().slice(-4)}`,
      notes,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Sale recorded successfully",
      sale,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all sales
// @route   GET /api/financials/sales
// @access  Private (Admin / Manager)
exports.getSales = async (req, res) => {
  try {
    const { category, status, search } = req.query;

    const query = {};

    if (category && category !== "all") query.category = category;
    if (status && status !== "all") query.status = status;

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { buyer: { $regex: search, $options: "i" } },
        { invoiceNo: { $regex: search, $options: "i" } },
      ];
    }

    const sales = await Sale.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: sales.length,
      sales,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update sale record
// @route   PUT /api/financials/sales/:id
// @access  Private (Admin / Manager)
exports.updateSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({ message: "Sale record not found" });
    }

    const { title, category, amount, date, buyer, status, paymentMethod, invoiceNo, notes } = req.body;

    if (title) sale.title = title;
    if (category) sale.category = category;
    if (amount) sale.amount = amount;
    if (date) sale.date = date;
    if (buyer) sale.buyer = buyer;
    if (status) sale.status = status;
    if (paymentMethod) sale.paymentMethod = paymentMethod;
    if (invoiceNo) sale.invoiceNo = invoiceNo;
    if (notes) sale.notes = notes;

    await sale.save();

    res.json({
      success: true,
      message: "Sale updated successfully",
      sale,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete sale record
// @route   DELETE /api/financials/sales/:id
// @access  Private (Admin / Manager)
exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({ message: "Sale record not found" });
    }

    await sale.deleteOne();

    res.json({
      success: true,
      message: "Sale record deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get financial summary analytics
// @route   GET /api/financials/summary
// @access  Private (Admin / Manager)
exports.getFinancialSummary = async (req, res) => {
  try {
    const sales = await Sale.find({});
    const expenses = await Expense.find({});

    const totalRevenue = sales
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + (s.amount || 0), 0);

    const pendingReceivables = sales
      .filter((s) => s.status === "pending")
      .reduce((sum, s) => sum + (s.amount || 0), 0);

    const totalPaidExpenses = expenses
      .filter((e) => e.status === "paid" || e.status === "approved")
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const netProfit = totalRevenue - totalPaidExpenses;

    res.json({
      success: true,
      summary: {
        totalRevenue,
        totalPaidExpenses,
        netProfit,
        pendingReceivables,
        totalSalesCount: sales.length,
        totalExpensesCount: expenses.length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
