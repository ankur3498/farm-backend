const express = require("express");
const router = express.Router();
const {
  createExpense,
  getExpenses,
  approveExpense,
  rejectExpense,
  markPaid,
  deleteExpense,
} = require("../controllers/expenseController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

// Anyone logged in can submit an expense and view expense history
router.route("/").post(createExpense).get(getExpenses);

// ONLY Admin can approve, reject, mark paid, or delete expenses
router.put("/:id/approve", authorize("admin"), approveExpense);
router.put("/:id/reject", authorize("admin"), rejectExpense);
router.put("/:id/pay", authorize("admin"), markPaid);
router.delete("/:id", authorize("admin"), deleteExpense);

module.exports = router;
