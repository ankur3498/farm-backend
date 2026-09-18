const express = require("express");
const router = express.Router();
const { requestOtp, verifyOtp, createUser, getMe } = require("../controllers/authController");
const { protect, authorize } = require("../middleware/auth");

router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp);
router.get("/me", protect, getMe);
router.post("/create-user", protect, authorize("admin"), createUser);

module.exports = router;