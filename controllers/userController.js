const User = require("../models/User");

// @route   GET /api/users
// @access  Private (admin only)
// Optional query: ?role=worker  or  ?isActive=true
const getAllUsers = async (req, res) => {
  try {
    const filter = {};

    if (req.query.includeAdmin !== "true" && !req.query.role) {
      filter.role = { $ne: "admin" };
    }

    if (req.query.role) filter.role = req.query.role;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";

    const users = await User.find(filter).select("-pin").sort({ name: 1 });
    res.status(200).json({ count: users.length, users });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
};


const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user", error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { name, mobile, email, role, salary, address, dateOfJoining } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(403).json({ message: "Admin account cannot be edited via this endpoint" });
    }

    if (role) {
      if (role === "admin") {
        return res.status(403).json({ message: "Cannot promote a user to admin via this endpoint" });
      }
      if (!User.ROLES.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Allowed: ${User.ROLES.join(", ")}` });
      }
      user.role = role;
    }

    // Uniqueness check if email/mobile is being changed
    if (email && email !== user.email) {
      const emailTaken = await User.findOne({ email, _id: { $ne: user._id } });
      if (emailTaken) return res.status(409).json({ message: "Email already in use" });
      user.email = email;
    }
    if (mobile && mobile !== user.mobile) {
      const mobileTaken = await User.findOne({ mobile, _id: { $ne: user._id } });
      if (mobileTaken) return res.status(409).json({ message: "Mobile already in use" });
      user.mobile = mobile;
    }

    if (name) user.name = name;
    if (salary !== undefined) user.salary = salary;
    if (address) user.address = address;
    if (dateOfJoining) user.dateOfJoining = dateOfJoining;
    if (req.body.pin) user.pin = req.body.pin;

    await user.save();
    res.status(200).json({ message: "User updated", user });
  } catch (error) {
    res.status(500).json({ message: "Failed to update user", error: error.message });
  }
};

const deactivateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") {
      return res.status(403).json({ message: "Admin account cannot be deactivated" });
    }

    user.isActive = false;
    await user.save();
    res.status(200).json({ message: `${user.name} deactivated`, user });
  } catch (error) {
    res.status(500).json({ message: "Failed to deactivate user", error: error.message });
  }
};

// @route   PUT /api/users/:id/activate
// @access  Private (admin only)
const activateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isActive = true;
    await user.save();
    res.status(200).json({ message: `${user.name} activated`, user });
  } catch (error) {
    res.status(500).json({ message: "Failed to activate user", error: error.message });
  }
};

module.exports = { getAllUsers, getUserById, updateUser, deactivateUser, activateUser };