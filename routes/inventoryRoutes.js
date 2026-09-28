const express = require("express");
const router = express.Router();
const {
  getInventory,
  getInventoryItemById,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  adjustStock,
} = require("../controllers/inventoryController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

// Read inventory items — accessible by any logged-in staff
router.get("/", getInventory);
router.get("/:id", getInventoryItemById);

// Manage inventory — admin / manager_operations only
router.post("/", authorize("admin", "manager_operations"), addInventoryItem);
router.put("/:id", authorize("admin", "manager_operations"), updateInventoryItem);
router.delete("/:id", authorize("admin", "manager_operations"), deleteInventoryItem);
router.patch("/:id/adjust", authorize("admin", "manager_operations"), adjustStock);

module.exports = router;
