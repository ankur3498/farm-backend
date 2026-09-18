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

// View — admin AND manager_operations (needed for Team Attendance, Work Management staff pickers, etc.)
router.get("/", authorize("admin", "manager_operations"), getAllUsers);
router.get("/:id", authorize("admin", "manager_operations"), getUserById);

// Edit/deactivate/activate — admin only
router.put("/:id", authorize("admin"), updateUser);
router.put("/:id/deactivate", authorize("admin"), deactivateUser);
router.put("/:id/activate", authorize("admin"), activateUser);

module.exports = router;