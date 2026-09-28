const Animal = require("../models/Animal");
const User = require("../models/User");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

// Helper: Get default manager if assignedTo is not specified
const getDefaultManager = async (reqUser) => {
  if (reqUser && ["admin", "manager_operations"].includes(reqUser.role)) {
    return reqUser._id;
  }
  const mgr = await User.findOne({ role: "manager_operations", isActive: true });
  if (mgr) return mgr._id;
  const admin = await User.findOne({ role: "admin", isActive: true });
  return admin ? admin._id : reqUser._id;
};

const getAnimals = async (req, res) => {
  try {
    const filter = { status: req.query.status || "active" };

    if (req.query.species) filter.species = req.query.species.toLowerCase();
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    if (req.query.search) {
      filter.$or = [
        { tagId: new RegExp(req.query.search, "i") },
        { name: new RegExp(req.query.search, "i") },
        { breed: new RegExp(req.query.search, "i") },
      ];
    }

    const animals = await Animal.find(filter)
      .populate("assignedTo", "name role mobile")
      .populate("createdBy", "name")
      .sort({ updatedAt: -1 });

    res.status(200).json({ count: animals.length, animals });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch animals", error: error.message });
  }
};

const getAnimalById = async (req, res) => {
  try {
    const animal = await Animal.findById(req.params.id)
      .populate("assignedTo", "name role mobile")
      .populate("medicalLogs.recordedBy", "name role");

    if (!animal) return res.status(404).json({ message: "Animal not found" });
    res.status(200).json(animal);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch animal", error: error.message });
  }
};

const createAnimal = async (req, res) => {
  try {
    const { tagId, name, species, breed, gender, dateOfBirth, assignedTo } = req.body;

    if (!tagId || !species) {
      return res.status(400).json({ message: "tagId and species are required" });
    }

    const existing = await Animal.findOne({ tagId: tagId.trim().toUpperCase() });
    if (existing) {
      return res.status(409).json({ message: `Animal with Tag ID '${tagId.toUpperCase()}' already exists` });
    }

    let assignee = assignedTo;
    if (!assignee) {
      assignee = await getDefaultManager(req.user);
    }

    const animal = await Animal.create({
      tagId: tagId.trim().toUpperCase(),
      name: name || "",
      species: species.toLowerCase(),
      breed: breed || "",
      gender: gender || "female",
      dateOfBirth: dateOfBirth ? startOfDay(new Date(dateOfBirth)) : undefined,
      assignedTo: assignee,
      createdBy: req.user._id,
    });

    const populated = await Animal.findById(animal._id).populate("assignedTo", "name role mobile");
    res.status(201).json({ message: "Animal tagged and registered", animal: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to register animal", error: error.message });
  }
};

const updateAnimal = async (req, res) => {
  try {
    const animal = await Animal.findById(req.params.id);
    if (!animal) return res.status(404).json({ message: "Animal not found" });

    const { name, breed, gender, dateOfBirth, assignedTo, status, reproductiveStatus } = req.body;

    if (name !== undefined) animal.name = name;
    if (breed !== undefined) animal.breed = breed;
    if (gender !== undefined) animal.gender = gender;
    if (dateOfBirth !== undefined) animal.dateOfBirth = dateOfBirth ? startOfDay(new Date(dateOfBirth)) : null;
    if (assignedTo !== undefined) animal.assignedTo = assignedTo || (await getDefaultManager(req.user));
    if (status !== undefined) animal.status = status;
    if (reproductiveStatus !== undefined) animal.reproductiveStatus = reproductiveStatus;

    await animal.save();
    const updated = await Animal.findById(animal._id).populate("assignedTo", "name role mobile");
    res.status(200).json({ message: "Animal updated", animal: updated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update animal", error: error.message });
  }
};

// ♀️ Heat Cycle Logging
const logHeatCycle = async (req, res) => {
  try {
    const animal = await Animal.findById(req.params.id);
    if (!animal) return res.status(404).json({ message: "Animal not found" });

    const { lastHeatDate, notes } = req.body;
    if (!lastHeatDate) return res.status(400).json({ message: "lastHeatDate is required" });

    const heatDate = startOfDay(new Date(lastHeatDate));
    const intervalDays = Animal.HEAT_INTERVAL_DAYS[animal.species] || 21;
    const nextExpectedHeatDate = new Date(heatDate.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    animal.heatTracking = {
      lastHeatDate: heatDate,
      nextExpectedHeatDate,
      notes: notes || "",
    };
    animal.reproductiveStatus = "in_heat";

    await animal.save();
    res.status(200).json({ message: "Heat cycle logged", heatTracking: animal.heatTracking, animal });
  } catch (error) {
    res.status(500).json({ message: "Failed to log heat cycle", error: error.message });
  }
};

// 🤰 Pregnancy & Delivery Logging
const logPregnancy = async (req, res) => {
  try {
    const animal = await Animal.findById(req.params.id);
    if (!animal) return res.status(404).json({ message: "Animal not found" });

    const { inseminationDate, pregnancyStatus, notes } = req.body;
    if (!inseminationDate) return res.status(400).json({ message: "inseminationDate is required" });

    const insemDate = startOfDay(new Date(inseminationDate));
    const gestationDays = Animal.GESTATION_DAYS[animal.species] || 283;
    const expectedDeliveryDate = new Date(insemDate.getTime() + gestationDays * 24 * 60 * 60 * 1000);

    const statusStr = pregnancyStatus || "confirmed";

    animal.pregnancyTracking = {
      inseminationDate: insemDate,
      expectedDeliveryDate,
      pregnancyStatus: statusStr,
      notes: notes || "",
    };

    if (statusStr === "delivered") {
      animal.reproductiveStatus = "lactating";
    } else {
      animal.reproductiveStatus = "pregnant";
    }

    await animal.save();
    res.status(200).json({ message: "Pregnancy/Delivery logged", pregnancyTracking: animal.pregnancyTracking, animal });
  } catch (error) {
    res.status(500).json({ message: "Failed to log pregnancy", error: error.message });
  }
};

// 💊 Medical & Vaccination Log with Photo/Video Proof
const addMedicalLog = async (req, res) => {
  try {
    const animal = await Animal.findById(req.params.id);
    if (!animal) return res.status(404).json({ message: "Animal not found" });

    const { title, type, medicine, nextDueDate, notes } = req.body;
    if (!title) return res.status(400).json({ message: "title (e.g. Vaccination name) is required" });

    let proof = { photoUrl: "", videoUrl: "" };
    const photoFile = req.files?.photo?.[0];
    const videoFile = req.files?.video?.[0];

    if (photoFile || videoFile) {
      const uploads = [];
      if (photoFile) uploads.push(uploadBufferToCloudinary(photoFile.buffer, "farmhouse/animals/photos", "image"));
      else uploads.push(Promise.resolve(""));

      if (videoFile) uploads.push(uploadBufferToCloudinary(videoFile.buffer, "farmhouse/animals/videos", "video"));
      else uploads.push(Promise.resolve(""));

      const [pUrl, vUrl] = await Promise.all(uploads);
      proof = { photoUrl: pUrl, videoUrl: vUrl };
    }

    const logEntry = {
      date: new Date(),
      title,
      type: type || "vaccination",
      medicine: medicine || "",
      nextDueDate: nextDueDate ? startOfDay(new Date(nextDueDate)) : undefined,
      notes: notes || "",
      proof,
      recordedBy: req.user._id,
    };

    animal.medicalLogs.unshift(logEntry);
    await animal.save();

    res.status(201).json({ message: "Medical/Vaccination log added", animal });
  } catch (error) {
    res.status(500).json({ message: "Failed to add medical log", error: error.message });
  }
};

// 🔔 Upcoming Alerts for Medication, Heat, Delivery
const getAnimalAlerts = async (req, res) => {
  try {
    const now = new Date();
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const animals = await Animal.find({ status: "active" }).populate("assignedTo", "name mobile role");

    const alerts = [];

    for (const a of animals) {
      // 1. Next Heat Cycle Alert
      if (a.heatTracking?.nextExpectedHeatDate && a.heatTracking.nextExpectedHeatDate <= in14Days) {
        alerts.push({
          type: "heat",
          animal: { _id: a._id, tagId: a.tagId, name: a.name, species: a.species, assignedTo: a.assignedTo },
          date: a.heatTracking.nextExpectedHeatDate,
          title: `Expected Heat Cycle (${a.tagId})`,
          message: `${a.species.toUpperCase()} ${a.tagId} expected heat cycle around ${a.heatTracking.nextExpectedHeatDate.toDateString()}`,
        });
      }

      // 2. Pregnancy Delivery Alert
      if (a.pregnancyTracking?.expectedDeliveryDate && a.pregnancyTracking.pregnancyStatus !== "delivered" && a.pregnancyTracking.expectedDeliveryDate <= in14Days) {
        alerts.push({
          type: "delivery",
          animal: { _id: a._id, tagId: a.tagId, name: a.name, species: a.species, assignedTo: a.assignedTo },
          date: a.pregnancyTracking.expectedDeliveryDate,
          title: `Expected Delivery / Calving (${a.tagId})`,
          message: `${a.species.toUpperCase()} ${a.tagId} expected delivery around ${a.pregnancyTracking.expectedDeliveryDate.toDateString()}`,
        });
      }

      // 3. Medical Vaccination Due Alert
      for (const log of a.medicalLogs) {
        if (log.nextDueDate && log.nextDueDate <= in14Days) {
          alerts.push({
            type: "medication",
            animal: { _id: a._id, tagId: a.tagId, name: a.name, species: a.species, assignedTo: a.assignedTo },
            date: log.nextDueDate,
            title: `Vaccination/Treatment Due: ${log.title}`,
            message: `${log.title} (${log.medicine || "Vaccine"}) due for ${a.tagId} on ${log.nextDueDate.toDateString()}`,
          });
        }
      }
    }

    alerts.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.status(200).json({ count: alerts.length, alerts });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch animal alerts", error: error.message });
  }
};

module.exports = {
  getAnimals,
  getAnimalById,
  createAnimal,
  updateAnimal,
  logHeatCycle,
  logPregnancy,
  addMedicalLog,
  getAnimalAlerts,
};
