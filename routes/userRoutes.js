const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  updateUser,
  deactivateUser,
  activateUser,
} = require("../controllers/userController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect); // every route below requires login

// View — open to all logged in users so staff pickers in Field Patches, Work, Expenses work seamlessly
router.get("/", getAllUsers);
router.get("/:id", getUserById);

// Edit/deactivate/activate — admin only
router.put("/:id", authorize("admin"), updateUser);
router.put("/:id/deactivate", authorize("admin"), deactivateUser);
router.put("/:id/activate", authorize("admin"), activateUser);

module.exports = router;