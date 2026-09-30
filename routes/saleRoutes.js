const express = require("express");
const router = express.Router();
const {
  createSale,
  getSales,
  updateSale,
  deleteSale,
  getFinancialSummary,
} = require("../controllers/saleController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);
router.use(authorize("admin", "manager_operations"));

router.route("/sales").post(createSale).get(getSales);

router.get("/summary", getFinancialSummary);

router.route("/sales/:id").put(updateSale).delete(deleteSale);

module.exports = router;
