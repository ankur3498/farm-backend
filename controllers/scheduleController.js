const ScheduleSession = require("../models/ScheduleSession");
const ScheduleTrack = require("../models/ScheduleTrack");
const ScheduleSlot = require("../models/ScheduleSlot");
const SessionLog = require("../models/SessionLog");
const WorkTask = require("../models/WorkTask");

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

// "14:05" -> "2:05 PM"
const to12Hour = (hhmm) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
};

const formatRange = (startTime, endTime) => `${to12Hour(startTime)}–${to12Hour(endTime)}`;

// ---------------- Sessions (fixed at 4, name/time editable) ----------------

// @route   GET /api/schedule/sessions
const getSessions = async (req, res) => {
  try {
    const sessions = await ScheduleSession.find().sort({ order: 1 });
    res.status(200).json({ sessions });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch sessions", error: error.message });
  }
};

// @route   PUT /api/schedule/sessions/:id
// body: { name, startTime, endTime }
const updateSession = async (req, res) => {
  try {
    const session = await ScheduleSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const { name, startTime, endTime } = req.body;
    if (name !== undefined) session.name = name;
    if (startTime !== undefined) session.startTime = startTime;
    if (endTime !== undefined) session.endTime = endTime;
    await session.save();

    res.status(200).json({ message: "Session updated", session });
  } catch (error) {
    res.status(500).json({ message: "Failed to update session", error: error.message });
  }
};

// ---------------- Tracks (columns — Worker 1, Manager, etc.) ----------------

// @route   GET /api/schedule/tracks
const getTracks = async (req, res) => {
  try {
    const tracks = await ScheduleTrack.find().populate("defaultAssignedTo", "name role").sort({ order: 1 });
    res.status(200).json({ tracks });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tracks", error: error.message });
  }
};

// @route   POST /api/schedule/tracks
// body: { name, defaultAssignedTo, order }
const createTrack = async (req, res) => {
  try {
    const { name, defaultAssignedTo, order } = req.body;
    if (!name) return res.status(400).json({ message: "Track name is required" });

    const count = await ScheduleTrack.countDocuments();
    const track = await ScheduleTrack.create({
      name,
      defaultAssignedTo: defaultAssignedTo || null,
      order: order ?? count,
    });
    res.status(201).json({ message: "Track added", track });
  } catch (error) {
    res.status(500).json({ message: "Failed to add track", error: error.message });
  }
};

// @route   PUT /api/schedule/tracks/:id
// body: { name, defaultAssignedTo, order }
const updateTrack = async (req, res) => {
  try {
    const track = await ScheduleTrack.findById(req.params.id);
    if (!track) return res.status(404).json({ message: "Track not found" });

    const { name, defaultAssignedTo, order } = req.body;
    if (name !== undefined) track.name = name;
    if (defaultAssignedTo !== undefined) track.defaultAssignedTo = defaultAssignedTo || null;
    if (order !== undefined) track.order = order;
    await track.save();

    res.status(200).json({ message: "Track updated", track });
  } catch (error) {
    res.status(500).json({ message: "Failed to update track", error: error.message });
  }
};

// @route   DELETE /api/schedule/tracks/:id
const deleteTrack = async (req, res) => {
  try {
    const track = await ScheduleTrack.findByIdAndDelete(req.params.id);
    if (!track) return res.status(404).json({ message: "Track not found" });

    // Pull this track out of every slot's entries so the grid doesn't keep
    // a dangling reference to a deleted column.
    await ScheduleSlot.updateMany({}, { $pull: { entries: { track: track._id } } });

    res.status(200).json({ message: "Track removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove track", error: error.message });
  }
};

// ---------------- Slots (time rows within a session) ----------------

// @route   GET /api/schedule/slots?sessionId=
const getSlots = async (req, res) => {
  try {
    const filter = {};
    if (req.query.sessionId) filter.session = req.query.sessionId;

    const slots = await ScheduleSlot.find(filter)
      .populate("entries.track", "name order")
      .sort({ order: 1 });
    res.status(200).json({ slots });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch slots", error: error.message });
  }
};

// @route   POST /api/schedule/slots
// body: { session, startTime, endTime, order, entries: [{ track, description }] }
const createSlot = async (req, res) => {
  try {
    const { session, startTime, endTime, order, entries } = req.body;
    if (!session || !startTime || !endTime) {
      return res.status(400).json({ message: "session, startTime and endTime are required" });
    }

    const count = await ScheduleSlot.countDocuments({ session });
    const slot = await ScheduleSlot.create({
      session,
      startTime,
      endTime,
      order: order ?? count,
      entries: entries || [],
    });
    const populated = await slot.populate("entries.track", "name order");

    res.status(201).json({ message: "Time slot added", slot: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to add time slot", error: error.message });
  }
};

// @route   PUT /api/schedule/slots/:id
// body: { startTime, endTime, order, entries: [{ track, description }] }
const updateSlot = async (req, res) => {
  try {
    const slot = await ScheduleSlot.findById(req.params.id);
    if (!slot) return res.status(404).json({ message: "Time slot not found" });

    const { startTime, endTime, order, entries } = req.body;
    if (startTime !== undefined) slot.startTime = startTime;
    if (endTime !== undefined) slot.endTime = endTime;
    if (order !== undefined) slot.order = order;
    if (entries !== undefined) slot.entries = entries;
    await slot.save();
    const populated = await slot.populate("entries.track", "name order");

    res.status(200).json({ message: "Time slot updated", slot: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update time slot", error: error.message });
  }
};

// @route   DELETE /api/schedule/slots/:id
const deleteSlot = async (req, res) => {
  try {
    const slot = await ScheduleSlot.findByIdAndDelete(req.params.id);
    if (!slot) return res.status(404).json({ message: "Time slot not found" });
    res.status(200).json({ message: "Time slot removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove time slot", error: error.message });
  }
};

// Core generator — used by the admin "Generate" button (any date, all tracks)
// and by the lazy auto-generation in workController (today only, one user's
// tracks) so a newly-assigned worker sees their session tasks the moment
// they open "My Tasks", without an admin having to click Generate first.
const generateSchedule = async (day, { onlyUserId, actorId } = {}) => {
  const sessions = await ScheduleSession.find().sort({ order: 1 });
  const slots = await ScheduleSlot.find().populate("entries.track").sort({ order: 1 });

  let created = 0;
  let skippedNoStaff = 0;
  let skippedExisting = 0;

  for (const session of sessions) {
    const sessionSlots = slots.filter((s) => String(s.session) === String(session._id));
    for (const slot of sessionSlots) {
      for (const entry of slot.entries) {
        if (!entry.description?.trim()) continue; // blank cell, nothing to assign
        const staff = entry.track?.defaultAssignedTo;
        if (!staff) {
          skippedNoStaff++;
          continue;
        }
        if (onlyUserId && String(staff) !== String(onlyUserId)) continue;

        const timeLabel = formatRange(slot.startTime, slot.endTime);
        const existing = await WorkTask.findOne({
          assignedTo: staff,
          category: entry.description,
          date: day,
          timeLabel,
        });
        if (existing) {
          skippedExisting++;
          continue;
        }

        try {
          await WorkTask.create({
            category: entry.description,
            assignedTo: staff,
            assignedBy: actorId || null,
            source: "schedule",
            date: day,
            session: session.name,
            timeLabel,
            track: entry.track.name,
          });
          created++;
        } catch (createErr) {
          if (createErr.code === 11000) {
            skippedExisting++;
          } else {
            throw createErr;
          }
        }
      }
    }
  }

  return { created, skippedNoStaff, skippedExisting };
};

// Called from workController.getMyTasks for "today" only — silent, no res.
const generateScheduleTasksForUserToday = async (userId, day) => {
  return generateSchedule(day, { onlyUserId: userId });
};

// @route   POST /api/schedule/generate
// @access  Private (admin, manager_operations)
// body: { date }
const generateTasksForDate = async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ message: "date is required" });

    const day = startOfDay(new Date(date));
    const { created, skippedNoStaff, skippedExisting } = await generateSchedule(day, { actorId: req.user._id });

    res.status(200).json({
      message: `${created} task${created !== 1 ? "s" : ""} generated${
        skippedNoStaff ? `, ${skippedNoStaff} skipped (no staff on that track)` : ""
      }${skippedExisting ? `, ${skippedExisting} already existed` : ""}`,
      created,
      skippedNoStaff,
      skippedExisting,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to generate tasks", error: error.message });
  }
};

// ---------------- Session Log (attendance-style start/end for a whole session) ----------------

// @route   GET /api/schedule/session-log?date=
// @access  Private (any logged-in staff) — returns this user's log for every session that day
const getMySessionLog = async (req, res) => {
  try {
    const dateParam = req.query.date ? new Date(req.query.date) : new Date();
    const day = startOfDay(dateParam);

    const [sessions, logs] = await Promise.all([
      ScheduleSession.find().sort({ order: 1 }),
      SessionLog.find({ assignedTo: req.user._id, date: day }),
    ]);

    const result = sessions.map((s) => {
      const log = logs.find((l) => String(l.session) === String(s._id));
      return {
        session: { _id: s._id, name: s.name, startTime: s.startTime, endTime: s.endTime },
        status: log?.status || "not_started",
        startedAt: log?.startedAt || null,
        completedAt: log?.completedAt || null,
      };
    });

    res.status(200).json({ date: day, logs: result });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch session log", error: error.message });
  }
};

// @route   POST /api/schedule/session-log/:sessionId/start
// @access  Private (any logged-in staff)
// body: { date }
const startSession = async (req, res) => {
  try {
    const { date } = req.body;
    const day = startOfDay(date ? new Date(date) : new Date());

    const existing = await SessionLog.findOne({ session: req.params.sessionId, assignedTo: req.user._id, date: day });
    if (existing) {
      return res.status(409).json({ message: `Session already ${existing.status === "completed" ? "completed" : "started"} for this day` });
    }

    const log = await SessionLog.create({
      session: req.params.sessionId,
      assignedTo: req.user._id,
      date: day,
      status: "in_progress",
      startedAt: new Date(),
    });

    res.status(201).json({ message: "Session started", log });
  } catch (error) {
    res.status(500).json({ message: "Failed to start session", error: error.message });
  }
};

// @route   POST /api/schedule/session-log/:sessionId/end
// @access  Private (any logged-in staff)
// body: { date }
const endSession = async (req, res) => {
  try {
    const { date } = req.body;
    const day = startOfDay(date ? new Date(date) : new Date());

    const log = await SessionLog.findOne({ session: req.params.sessionId, assignedTo: req.user._id, date: day });
    if (!log) return res.status(400).json({ message: "You haven't started this session yet" });
    if (log.status === "completed") return res.status(409).json({ message: "Session already completed" });

    log.status = "completed";
    log.completedAt = new Date();
    await log.save();

    res.status(200).json({ message: "Session completed", log });
  } catch (error) {
    res.status(500).json({ message: "Failed to end session", error: error.message });
  }
};

// @route   GET /api/schedule/session-log/all?date=
// @access  Private (admin, manager_operations) — every staff member's status for that day
const getAllSessionLogs = async (req, res) => {
  try {
    const dateParam = req.query.date ? new Date(req.query.date) : new Date();
    const day = startOfDay(dateParam);

    const [sessions, tracks, logs] = await Promise.all([
      ScheduleSession.find().sort({ order: 1 }),
      ScheduleTrack.find().populate("defaultAssignedTo", "name role"),
      SessionLog.find({ date: day }).populate("assignedTo", "name role"),
    ]);

    // One row per (assigned) staff member, columns = sessions
    const staffIds = [...new Map(
      tracks.filter((t) => t.defaultAssignedTo).map((t) => [String(t.defaultAssignedTo._id), t.defaultAssignedTo])
    ).values()];

    const rows = staffIds.map((staff) => ({
      staff,
      sessions: sessions.map((s) => {
        const log = logs.find((l) => String(l.assignedTo?._id) === String(staff._id) && String(l.session) === String(s._id));
        return {
          sessionId: s._id,
          sessionName: s.name,
          status: log?.status || "not_started",
          startedAt: log?.startedAt || null,
          completedAt: log?.completedAt || null,
        };
      }),
    }));

    res.status(200).json({ date: day, sessions, rows });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch session logs", error: error.message });
  }
};

module.exports = {
  getSessions,
  updateSession,
  getTracks,
  createTrack,
  updateTrack,
  deleteTrack,
  getSlots,
  createSlot,
  updateSlot,
  deleteSlot,
  generateTasksForDate,
  generateSchedule,
  generateScheduleTasksForUserToday,
  getMySessionLog,
  startSession,
  endSession,
  getAllSessionLogs,
};