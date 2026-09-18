const Attendance = require("../models/Attendance");
const User = require("../models/User");
const reverseGeocode = require("../utils/geoCode");

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const FREE_LEAVES_PER_MONTH = 2;

const checkIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "Latitude and longitude are required" });
    }

    const today = startOfDay();
    let record = await Attendance.findOne({ user: req.user._id, date: today });

    if (record?.timeIn?.time) {
      return res.status(409).json({ message: "Already checked in today" });
    }

    const address = await reverseGeocode(latitude, longitude);
    const timeIn = { time: new Date(), latitude, longitude, address };

    if (record) {
      record.timeIn = timeIn;
      await record.save();
    } else {
      record = await Attendance.create({ user: req.user._id, date: today, timeIn });
    }

    res.status(200).json({ message: "Checked in", attendance: record });
  } catch (error) {
    res.status(500).json({ message: "Check-in failed", error: error.message });
  }
};

const checkOut = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "Latitude and longitude are required" });
    }

    const today = startOfDay();
    const record = await Attendance.findOne({ user: req.user._id, date: today });

    if (!record || !record.timeIn?.time) {
      return res.status(400).json({ message: "You must check in before checking out" });
    }
    if (record.timeOut?.time) {
      return res.status(409).json({ message: "Already checked out today" });
    }

    const address = await reverseGeocode(latitude, longitude);
    record.timeOut = { time: new Date(), latitude, longitude, address };
    await record.save();

    res.status(200).json({ message: "Checked out", attendance: record });
  } catch (error) {
    res.status(500).json({ message: "Check-out failed", error: error.message });
  }
};

const getMyAttendance = async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? Number(month) : now.getMonth() + 1;

    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 1);

    const records = await Attendance.find({
      user: req.user._id,
      date: { $gte: from, $lt: to },
    }).sort({ date: 1 });

    res.status(200).json({ count: records.length, records });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch attendance", error: error.message });
  }
};

const getAllAttendance = async (req, res) => {
  try {
    const { userId, month, year } = req.query;
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? Number(month) : now.getMonth() + 1;

    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 1);

    const filter = { date: { $gte: from, $lt: to } };
    if (userId) filter.user = userId;

    const records = await Attendance.find(filter)
      .populate("user", "name role email mobile")
      .sort({ date: -1 });

    res.status(200).json({ count: records.length, records });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch attendance", error: error.message });
  }
};

const adminUpdateAttendance = async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Attendance record not found" });

    const { timeIn, timeOut, status } = req.body;
    if (timeIn) record.timeIn = { ...record.timeIn?.toObject?.(), ...timeIn };
    if (timeOut) record.timeOut = { ...record.timeOut?.toObject?.(), ...timeOut };
    if (status) record.status = status;

    await record.save();
    res.status(200).json({ message: "Attendance updated", attendance: record });
  } catch (error) {
    res.status(500).json({ message: "Failed to update attendance", error: error.message });
  }
};


const adminMarkAttendance = async (req, res) => {
  try {
    const { userId, date, timeIn, timeOut, status } = req.body;
    if (!userId || !date) {
      return res.status(400).json({ message: "userId and date are required" });
    }

    const day = startOfDay(new Date(date));
    const update = {};
    if (timeIn?.time) update.timeIn = { time: new Date(timeIn.time) };
    if (timeOut?.time) update.timeOut = { time: new Date(timeOut.time) };
    if (status) update.status = status;

    const record = await Attendance.findOneAndUpdate(
      { user: userId, date: day },
      { $set: update, $setOnInsert: { user: userId, date: day } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ message: "Attendance marked", attendance: record });
  } catch (error) {
    res.status(500).json({ message: "Failed to mark attendance", error: error.message });
  }
};

const requestEdit = async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Attendance record not found" });

    if (String(record.user) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only request edits on your own attendance" });
    }

    const { proposedTimeIn, proposedTimeOut, reason } = req.body;
    if (!proposedTimeIn && !proposedTimeOut) {
      return res.status(400).json({ message: "Provide at least one of proposedTimeIn or proposedTimeOut" });
    }
    if (!reason) {
      return res.status(400).json({ message: "Reason is required for an edit request" });
    }

    record.editRequest = {
      requested: true,
      requestedBy: req.user._id,
      proposedTimeIn: proposedTimeIn || undefined,
      proposedTimeOut: proposedTimeOut || undefined,
      reason,
      status: "pending",
    };
    await record.save();

    res.status(200).json({ message: "Edit request submitted for approval", attendance: record });
  } catch (error) {
    res.status(500).json({ message: "Failed to submit edit request", error: error.message });
  }
};

const reviewEditRequest = async (req, res) => {
  try {
    const { action, note } = req.body;
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "action must be 'approve' or 'reject'" });
    }

    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Attendance record not found" });
    if (!record.editRequest?.requested || record.editRequest.status !== "pending") {
      return res.status(400).json({ message: "No pending edit request on this record" });
    }

    if (action === "approve") {
      if (record.editRequest.proposedTimeIn) {
        record.timeIn = { ...record.timeIn?.toObject?.(), time: record.editRequest.proposedTimeIn };
      }
      if (record.editRequest.proposedTimeOut) {
        record.timeOut = { ...record.timeOut?.toObject?.(), time: record.editRequest.proposedTimeOut };
      }
    }

    record.editRequest.status = action === "approve" ? "approved" : "rejected";
    record.editRequest.reviewedBy = req.user._id;
    record.editRequest.reviewedAt = new Date();
    record.editRequest.reviewNote = note || "";

    await record.save();
    res.status(200).json({ message: `Edit request ${action}d`, attendance: record });
  } catch (error) {
    res.status(500).json({ message: "Failed to review edit request", error: error.message });
  }
};

const applyLeave = async (req, res) => {
  try {
    const { date, reason } = req.body;
    if (!date || !reason) {
      return res.status(400).json({ message: "date and reason are required" });
    }

    const day = startOfDay(new Date(date));
    let record = await Attendance.findOne({ user: req.user._id, date: day });

    if (record?.timeIn?.time) {
      return res.status(409).json({ message: "You already have attendance marked for this date" });
    }
    if (record?.leaveRequest?.requested && record.leaveRequest.status === "pending") {
      return res.status(409).json({ message: "A leave request for this date is already pending" });
    }

    const leaveRequest = {
      requested: true,
      requestedBy: req.user._id,
      reason,
      status: "pending",
    };

    if (record) {
      record.leaveRequest = leaveRequest;
      await record.save();
    } else {
      record = await Attendance.create({ user: req.user._id, date: day, leaveRequest });
    }

    res.status(200).json({ message: "Leave request submitted for approval", attendance: record });
  } catch (error) {
    res.status(500).json({ message: "Failed to submit leave request", error: error.message });
  }
};

const reviewLeaveRequest = async (req, res) => {
  try {
    const { action, note } = req.body;
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "action must be 'approve' or 'reject'" });
    }

    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Attendance record not found" });
    if (!record.leaveRequest?.requested || record.leaveRequest.status !== "pending") {
      return res.status(400).json({ message: "No pending leave request on this record" });
    }

    if (action === "approve") {
      record.status = "leave";
    }

    record.leaveRequest.status = action === "approve" ? "approved" : "rejected";
    record.leaveRequest.reviewedBy = req.user._id;
    record.leaveRequest.reviewedAt = new Date();
    record.leaveRequest.reviewNote = note || "";

    await record.save();
    res.status(200).json({ message: `Leave request ${action}d`, attendance: record });
  } catch (error) {
    res.status(500).json({ message: "Failed to review leave request", error: error.message });
  }
};

const getSalarySummary = async (req, res) => {
  try {
    const { userId } = req.params;

    const isSelf = String(req.user._id) === String(userId);
    const isPrivileged = ["admin", "manager_operations"].includes(req.user.role);
    if (!isSelf && !isPrivileged) {
      return res.status(403).json({ message: "Not authorized to view this salary summary" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { month, year } = req.query;
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? Number(month) : now.getMonth() + 1;

    const daysInMonth = new Date(y, m, 0).getDate();
    const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
    const countedDays = isCurrentMonth ? now.getDate() : daysInMonth;

    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 1);
    const records = await Attendance.find({ user: userId, date: { $gte: from, $lt: to } });

    const presentDays = records.filter((r) => r.timeIn?.time).length;
    const leaveDays = records.filter((r) => r.status === "leave").length;
    const absentDays = Math.max(0, countedDays - presentDays - leaveDays);

    const perDayRate = user.salary / daysInMonth;
    const deductibleAbsences = Math.max(0, absentDays - FREE_LEAVES_PER_MONTH);
    const deduction = Math.round(deductibleAbsences * perDayRate * 100) / 100;
    const netSalary = Math.round((user.salary - deduction) * 100) / 100;

    res.status(200).json({
      user: { _id: user._id, name: user.name, role: user.role, monthlySalary: user.salary },
      period: { month: m, year: y, daysInMonth, countedDays },
      attendance: { presentDays, leaveDays, absentDays },
      freeLeavesPerMonth: FREE_LEAVES_PER_MONTH,
      deductibleAbsentDays: deductibleAbsences,
      perDayRate: Math.round(perDayRate * 100) / 100,
      deduction,
      netSalary,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to calculate salary", error: error.message });
  }
};

module.exports = {
  checkIn,
  checkOut,
  getMyAttendance,
  getAllAttendance,
  adminUpdateAttendance,
  adminMarkAttendance,
  requestEdit,
  reviewEditRequest,
  applyLeave,
  reviewLeaveRequest,
  getSalarySummary,
};