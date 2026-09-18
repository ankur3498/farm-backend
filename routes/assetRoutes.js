const express = require("express");
const router = express.Router();
const {
  getAssets,
  addAsset,
  updateAsset,
  deleteAsset,
  getAssetHistory,
} = require("../controllers/assetController");
const { protect, authorize } = require("../middleware/auth");
const { uploadSinglePhoto } = require("../middleware/upload");

router.use(protect);

// View — any logged-in staff (so a worker can see what they're responsible for)
router.get("/", getAssets);

// Manage — admin/manager only
router.post("/", authorize("admin", "manager_operations"), uploadSinglePhoto, addAsset);
router.put("/:id", authorize("admin", "manager_operations"), uploadSinglePhoto, updateAsset);
router.delete("/:id", authorize("admin", "manager_operations"), deleteAsset);
router.get("/:id/history", authorize("admin", "manager_operations"), getAssetHistory);

module.exports = router;