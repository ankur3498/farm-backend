const PoultryBatch = require("../models/PoultryBatch");
const PoultryRecord = require("../models/PoultryRecord");
const InTransitChick = require("../models/InTransitChick");
const PoultryHatchery = require("../models/PoultryHatchery");
const PoultryBrooder = require("../models/PoultryBrooder");
const BrooderDailyRecord = require("../models/BrooderDailyRecord");
const PoultryVaccination = require("../models/PoultryVaccination");
const User = require("../models/User");
const WorkTask = require("../models/WorkTask");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};
const daysBetween = (a, b) => Math.floor((b - a) / (1000 * 60 * 60 * 24));

const getDefaultManager = async (reqUser) => {
  if (reqUser && ["admin", "manager_operations"].includes(reqUser.role)) {
    return reqUser._id;
  }
  const mgr = await User.findOne({ role: "manager_operations", isActive: true });
  if (mgr) return mgr._id;
  const admin = await User.findOne({ role: "admin", isActive: true });
  return admin ? admin._id : reqUser._id;
};

// Calculate survival badge from rate percentage:
// >= 98.0%: green ("Excellent Transit")
// 95.0% - 97.9%: amber ("Moderate Transit")
// < 95.0%: red ("High Mortality Alert")
const getSurvivalBadge = (ratePct) => {
  if (ratePct >= 98.0) {
    return { color: "green", label: "Excellent Transit", bg: "bg-green-100 text-green-800 border-green-300" };
  }
  if (ratePct >= 95.0) {
    return { color: "amber", label: "Moderate Transit", bg: "bg-amber-100 text-amber-800 border-amber-300" };
  }
  return { color: "red", label: "High Mortality Alert", bg: "bg-red-100 text-red-800 border-red-300" };
};

// Standard Recommended Poultry Vaccination Schedule Template
const STANDARD_VACCINE_TEMPLATE = [
  { targetAgeDays: 1, vaccineName: "Marek's Disease (HVT/SB1)", diseaseTarget: "Marek's Disease", route: "subq" },
  { targetAgeDays: 1, vaccineName: "ND + IB Mass (Spray)", diseaseTarget: "Newcastle & Bronchitis", route: "spray" },
  { targetAgeDays: 7, vaccineName: "Ranikhet ND B1 Strain", diseaseTarget: "Newcastle Disease", route: "eye_drop" },
  { targetAgeDays: 14, vaccineName: "IBD Gumboro (Intermediate)", diseaseTarget: "Infectious Bursal Disease", route: "drinking_water" },
  { targetAgeDays: 21, vaccineName: "IBD Gumboro Booster", diseaseTarget: "Infectious Bursal Disease", route: "drinking_water" },
  { targetAgeDays: 28, vaccineName: "Ranikhet ND LaSota", diseaseTarget: "Newcastle Disease", route: "drinking_water" },
  { targetAgeDays: 42, vaccineName: "Fowl Pox Vaccine", diseaseTarget: "Fowl Pox", route: "wing_web" },
  { targetAgeDays: 56, vaccineName: "Infectious Coryza (Inactivated)", diseaseTarget: "Coryza", route: "subq" },
  { targetAgeDays: 112, vaccineName: "EDS + ND + IB Killed Triple Combo", diseaseTarget: "Egg Drop Syndrome & ND/IB", route: "im" },
];

// ---------------- Batches ----------------

const getBatches = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.type) {
      filter.poultryType = req.query.type;
    }

    const batches = await PoultryBatch.find(filter)
      .populate("assignedTo", "name role mobile")
      .populate("inTransitRef")
      .sort({ createdAt: -1 });

    const withSummary = await Promise.all(
      batches.map(async (b) => {
        const latest = await PoultryRecord.findOne({ batch: b._id }).sort({ date: -1 });
        const totals = await PoultryRecord.aggregate([
          { $match: { batch: b._id } },
          {
            $group: {
              _id: null,
              totalMortality: { $sum: "$mortality" },
              totalCulls: { $sum: "$culls" },
              totalFeedKg: { $sum: "$feedKg" },
              totalEggs: { $sum: { $ifNull: ["$eggCount", 0] } },
              avgProdPercent: { $avg: "$eggProductionPercent" },
            },
          },
        ]);
        const agg = totals[0] || { totalMortality: 0, totalCulls: 0, totalFeedKg: 0, totalEggs: 0, avgProdPercent: null };

        return {
          ...b.toObject(),
          currentStock: latest ? latest.closingStock : b.chicksReceived,
          ageDay: latest ? latest.ageDay : daysBetween(startOfDay(b.dateOfHatch), startOfDay(new Date())),
          lastRecordDate: latest ? latest.date : null,
          totalMortality: agg.totalMortality,
          totalCulls: agg.totalCulls,
          totalFeedKg: Math.round(agg.totalFeedKg * 10) / 10,
          totalEggs: agg.totalEggs,
          avgProductionPercent: agg.avgProdPercent ? Math.round(agg.avgProdPercent * 10) / 10 : null,
        };
      })
    );

    res.status(200).json({ batches: withSummary });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch batches", error: error.message });
  }
};

const addBatch = async (req, res) => {
  try {
    const { name, breed, poultryType, dateOfHatch, chicksReceived, targetWeightGms, houseNo, inTransitRef, assignedTo, autoGenVaccines } = req.body;
    if (!name || !dateOfHatch || chicksReceived === undefined) {
      return res.status(400).json({ message: "name, dateOfHatch and chicksReceived are required" });
    }

    let assignee = assignedTo;
    if (!assignee) {
      assignee = await getDefaultManager(req.user);
    }

    const hatchDate = startOfDay(new Date(dateOfHatch));

    const batch = await PoultryBatch.create({
      name,
      breed: breed || "",
      poultryType: poultryType || "layer",
      dateOfHatch: hatchDate,
      chicksReceived: Number(chicksReceived),
      targetWeightGms: Number(targetWeightGms) || 0,
      houseNo: houseNo || "",
      inTransitRef: inTransitRef || null,
      assignedTo: assignee,
      createdBy: req.user._id,
    });

    if (autoGenVaccines !== false) {
      const vDocs = STANDARD_VACCINE_TEMPLATE.map((tmpl) => {
        const schedDate = new Date(hatchDate.getTime() + (tmpl.targetAgeDays - 1) * 24 * 60 * 60 * 1000);
        return {
          flockBatch: batch._id,
          flockName: batch.name,
          vaccineName: tmpl.vaccineName,
          diseaseTarget: tmpl.diseaseTarget,
          targetAgeDays: tmpl.targetAgeDays,
          scheduledDate: schedDate,
          route: tmpl.route,
          dosesCount: batch.chicksReceived,
          status: "scheduled",
          createdBy: req.user._id,
        };
      });
      await PoultryVaccination.insertMany(vDocs);
    }

    const populated = await PoultryBatch.findById(batch._id)
      .populate("assignedTo", "name role mobile")
      .populate("inTransitRef");

    try {
      await generatePoultryTasksForUserToday(assignee);
    } catch (e) {
      console.error("Task generation on addBatch failed:", e.message);
    }

    res.status(201).json({ message: "Batch created with vaccination schedule", batch: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to create batch", error: error.message });
  }
};

const updateBatch = async (req, res) => {
  try {
    const batch = await PoultryBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: "Batch not found" });

    const { name, breed, poultryType, isActive, assignedTo, targetWeightGms, houseNo } = req.body;
    if (name !== undefined) batch.name = name;
    if (breed !== undefined) batch.breed = breed;
    if (poultryType !== undefined) batch.poultryType = poultryType;
    if (targetWeightGms !== undefined) batch.targetWeightGms = Number(targetWeightGms);
    if (houseNo !== undefined) batch.houseNo = houseNo;
    if (isActive !== undefined) batch.isActive = isActive;
    if (assignedTo !== undefined) batch.assignedTo = assignedTo || (await getDefaultManager(req.user));
    await batch.save();

    const populated = await PoultryBatch.findById(batch._id)
      .populate("assignedTo", "name role mobile")
      .populate("inTransitRef");

    try {
      await generatePoultryTasksForUserToday(populated.assignedTo?._id || batch.assignedTo);
    } catch (e) {
      console.error("Task generation on updateBatch failed:", e.message);
    }

    res.status(200).json({ message: "Batch updated", batch: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update batch", error: error.message });
  }
};

const deleteBatch = async (req, res) => {
  try {
    const batch = await PoultryBatch.findByIdAndDelete(req.params.id);
    if (!batch) return res.status(404).json({ message: "Batch not found" });
    await PoultryRecord.deleteMany({ batch: batch._id });
    await PoultryVaccination.deleteMany({ flockBatch: batch._id });
    res.status(200).json({ message: "Batch and its records removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove batch", error: error.message });
  }
};

// ---------------- Records ----------------

const getRecords = async (req, res) => {
  try {
    const records = await PoultryRecord.find({ batch: req.params.id })
      .populate("recordedBy", "name role")
      .sort({ date: -1 });
    res.status(200).json({ records });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch records", error: error.message });
  }
};

const addRecord = async (req, res) => {
  try {
    const batch = await PoultryBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: "Batch not found" });

    const { date, mortality, culls, feedKg, eggCount, bodyWeightGms, remarks } = req.body;
    if (!date) return res.status(400).json({ message: "date is required" });

    const day = startOfDay(new Date(date));
    const existing = await PoultryRecord.findOne({ batch: batch._id, date: day });
    if (existing) {
      return res.status(409).json({ message: "A record for this batch on this date already exists — edit it instead" });
    }

    let openStock = req.body.openStock;
    if (openStock === undefined) {
      const previous = await PoultryRecord.findOne({ batch: batch._id, date: { $lt: day } }).sort({ date: -1 });
      openStock = previous ? previous.closingStock : batch.chicksReceived;
    } else {
      openStock = Number(openStock);
    }

    const mort = Number(mortality) || 0;
    const cull = Number(culls) || 0;
    const closingStock = Math.max(0, openStock - mort - cull);
    const feed = Number(feedKg) || 0;
    const feedPerBirdGms = closingStock > 0 ? Math.round(((feed * 1000) / closingStock) * 10) / 10 : 0;

    let eggProductionPercent = null;
    const eggs = eggCount !== undefined && eggCount !== null && eggCount !== "" ? Number(eggCount) : null;
    if (eggs !== null && closingStock > 0) {
      eggProductionPercent = Math.round((eggs / closingStock) * 1000) / 10;
    }

    const ageDay = daysBetween(startOfDay(batch.dateOfHatch), day) + 1;

    let proof = { photoUrl: "", videoUrl: "" };
    const photoFile = req.files?.photo?.[0];
    const videoFile = req.files?.video?.[0];

    if (photoFile || videoFile) {
      const uploads = [];
      if (photoFile) uploads.push(uploadBufferToCloudinary(photoFile.buffer, "farmhouse/poultry/photos", "image"));
      else uploads.push(Promise.resolve(""));

      if (videoFile) uploads.push(uploadBufferToCloudinary(videoFile.buffer, "farmhouse/poultry/videos", "video"));
      else uploads.push(Promise.resolve(""));

      const [pUrl, vUrl] = await Promise.all(uploads);
      proof = { photoUrl: pUrl, videoUrl: vUrl };
    }

    const record = await PoultryRecord.create({
      batch: batch._id,
      date: day,
      ageDay,
      openStock,
      mortality: mort,
      culls: cull,
      closingStock,
      feedKg: feed,
      feedPerBirdGms,
      eggCount: eggs,
      eggProductionPercent,
      bodyWeightGms: bodyWeightGms !== undefined && bodyWeightGms !== "" ? Number(bodyWeightGms) : null,
      remarks: remarks || "",
      proof,
      recordedBy: req.user._id,
    });

    res.status(201).json({ message: "Record added", record });
  } catch (error) {
    res.status(500).json({ message: "Failed to add record", error: error.message });
  }
};

const updateRecord = async (req, res) => {
  try {
    const record = await PoultryRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Record not found" });

    const { openStock, mortality, culls, feedKg, eggCount, bodyWeightGms, remarks } = req.body;

    if (openStock !== undefined) record.openStock = Number(openStock);
    if (mortality !== undefined) record.mortality = Number(mortality);
    if (culls !== undefined) record.culls = Number(culls);
    if (feedKg !== undefined) record.feedKg = Number(feedKg);
    if (bodyWeightGms !== undefined) record.bodyWeightGms = bodyWeightGms === "" ? null : Number(bodyWeightGms);
    if (remarks !== undefined) record.remarks = remarks;

    record.closingStock = Math.max(0, record.openStock - record.mortality - record.culls);
    record.feedPerBirdGms = record.closingStock > 0 ? Math.round(((record.feedKg * 1000) / record.closingStock) * 10) / 10 : 0;

    if (eggCount !== undefined) {
      record.eggCount = eggCount === "" ? null : Number(eggCount);
      record.eggProductionPercent =
        record.eggCount !== null && record.closingStock > 0
          ? Math.round((record.eggCount / record.closingStock) * 1000) / 10
          : null;
    }

    const photoFile = req.files?.photo?.[0];
    const videoFile = req.files?.video?.[0];

    if (photoFile || videoFile) {
      if (!record.proof) record.proof = { photoUrl: "", videoUrl: "" };
      if (photoFile) {
        record.proof.photoUrl = await uploadBufferToCloudinary(photoFile.buffer, "farmhouse/poultry/photos", "image");
      }
      if (videoFile) {
        record.proof.videoUrl = await uploadBufferToCloudinary(videoFile.buffer, "farmhouse/poultry/videos", "video");
      }
    }

    await record.save();
    res.status(200).json({ message: "Record updated", record });
  } catch (error) {
    res.status(500).json({ message: "Failed to update record", error: error.message });
  }
};

const deleteRecord = async (req, res) => {
  try {
    const record = await PoultryRecord.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: "Record not found" });
    res.status(200).json({ message: "Record removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove record", error: error.message });
  }
};

// ---------------- In Transit Chicks ----------------

const getInTransitChicks = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const list = await InTransitChick.find(filter).sort({ createdAt: -1 });

    const enriched = list.map((item) => {
      const loaded = item.chicksLoaded || 1;
      const mort = item.transitMortality || 0;
      const liveChicks = Math.max(0, loaded - mort);
      const survivalRate = Math.round((liveChicks / loaded) * 1000) / 10;
      const badge = getSurvivalBadge(survivalRate);

      return {
        ...item.toObject(),
        liveChicks,
        survivalRate,
        survivalBadge: badge,
      };
    });

    res.status(200).json({ shipments: enriched });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch in-transit shipments", error: error.message });
  }
};

const addInTransitChick = async (req, res) => {
  try {
    const { batchNo, startDate, distanceKm, transitHours, chicksLoaded, transitMortality, sourceSupplier, vehicleDetails } = req.body;
    if (!batchNo || !startDate || chicksLoaded === undefined || chicksLoaded === null || chicksLoaded === "") {
      return res.status(400).json({ message: "batchNo, startDate, and chicksLoaded are required" });
    }

    const shipment = await InTransitChick.create({
      batchNo: String(batchNo).trim(),
      startDate: new Date(startDate),
      distanceKm: Number(distanceKm) || 0,
      transitHours: Number(transitHours) || 0,
      chicksLoaded: Number(chicksLoaded),
      transitMortality: Number(transitMortality) || 0,
      sourceSupplier: sourceSupplier || "",
      vehicleDetails: vehicleDetails || "",
      createdBy: req.user?._id,
    });

    const loaded = shipment.chicksLoaded || 1;
    const mort = shipment.transitMortality || 0;
    const liveChicks = Math.max(0, loaded - mort);
    const survivalRate = Math.round((liveChicks / loaded) * 1000) / 10;
    const badge = getSurvivalBadge(survivalRate);

    res.status(201).json({
      message: "In-Transit chick shipment recorded",
      shipment: { ...shipment.toObject(), liveChicks, survivalRate, survivalBadge: badge },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to create in-transit shipment", error: error.message });
  }
};

const updateInTransitChick = async (req, res) => {
  try {
    const shipment = await InTransitChick.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: "Shipment not found" });

    const {
      batchNo,
      startDate,
      distanceKm,
      transitHours,
      chicksLoaded,
      transitMortality,
      sourceSupplier,
      vehicleDetails,
      status,
      destinationType,
      assignedPen,
      receivedNotes,
      dateReceived,
    } = req.body;

    if (batchNo) shipment.batchNo = String(batchNo).trim();
    if (startDate) shipment.startDate = new Date(startDate);
    if (distanceKm !== undefined && distanceKm !== "") shipment.distanceKm = Number(distanceKm);
    if (transitHours !== undefined && transitHours !== "") shipment.transitHours = Number(transitHours);
    if (chicksLoaded !== undefined && chicksLoaded !== "") shipment.chicksLoaded = Number(chicksLoaded);
    if (transitMortality !== undefined && transitMortality !== "") shipment.transitMortality = Number(transitMortality);
    if (sourceSupplier !== undefined) shipment.sourceSupplier = String(sourceSupplier).trim();
    if (vehicleDetails !== undefined) shipment.vehicleDetails = String(vehicleDetails).trim();
    if (status) shipment.status = status;
    if (destinationType) shipment.destinationType = destinationType;
    if (assignedPen !== undefined) shipment.assignedPen = assignedPen;
    if (receivedNotes !== undefined) shipment.receivedNotes = receivedNotes;
    if (dateReceived) shipment.dateReceived = new Date(dateReceived);

    await shipment.save();

    const loaded = shipment.chicksLoaded || 1;
    const mort = shipment.transitMortality || 0;
    const liveChicks = Math.max(0, loaded - mort);
    const survivalRate = Math.round((liveChicks / loaded) * 1000) / 10;
    const badge = getSurvivalBadge(survivalRate);

    res.status(200).json({
      message: "In-Transit chick shipment updated",
      shipment: { ...shipment.toObject(), liveChicks, survivalRate, survivalBadge: badge },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update in-transit shipment", error: error.message });
  }
};

const receiveInTransitChick = async (req, res) => {
  try {
    const shipment = await InTransitChick.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: "Shipment not found" });

    const { destinationType, assignedPen, receivedNotes, dateReceived, createFlockBatch, transitMortality, chicksLoaded, sourceSupplier, vehicleDetails } = req.body;

    shipment.status = "received";
    shipment.dateReceived = dateReceived ? new Date(dateReceived) : new Date();
    if (destinationType) shipment.destinationType = destinationType;
    if (assignedPen !== undefined) shipment.assignedPen = assignedPen;
    if (receivedNotes !== undefined) shipment.receivedNotes = receivedNotes;
    if (transitMortality !== undefined && transitMortality !== "") shipment.transitMortality = Number(transitMortality);
    if (chicksLoaded !== undefined && chicksLoaded !== "") shipment.chicksLoaded = Number(chicksLoaded);
    if (sourceSupplier !== undefined) shipment.sourceSupplier = String(sourceSupplier).trim();
    if (vehicleDetails !== undefined) shipment.vehicleDetails = String(vehicleDetails).trim();

    await shipment.save();

    let autoCreatedBatch = null;
    if (createFlockBatch && destinationType && destinationType !== "unassigned") {
      const liveChicks = Math.max(0, shipment.chicksLoaded - shipment.transitMortality);
      const defaultAssignee = await getDefaultManager(req.user);
      
      if (destinationType === "brooder") {
        autoCreatedBatch = await PoultryBrooder.create({
          brooderBatchNo: `BR-${shipment.batchNo}`,
          brooderHouseNo: assignedPen || "Brooder Shed 1",
          placementDate: shipment.startDate,
          chicksPlaced: liveChicks,
          receivedRef: shipment._id,
          assignedTo: defaultAssignee,
          createdBy: req.user._id,
        });
      } else {
        autoCreatedBatch = await PoultryBatch.create({
          name: `Flock ${shipment.batchNo} (${destinationType.toUpperCase()})`,
          breed: shipment.sourceSupplier || "Day-Old Chicks",
          poultryType: destinationType,
          dateOfHatch: shipment.startDate,
          chicksReceived: liveChicks,
          houseNo: assignedPen || "",
          inTransitRef: shipment._id,
          assignedTo: defaultAssignee,
          createdBy: req.user._id,
        });

        const hatchDate = startOfDay(new Date(shipment.startDate));
        const vDocs = STANDARD_VACCINE_TEMPLATE.map((tmpl) => {
          const schedDate = new Date(hatchDate.getTime() + (tmpl.targetAgeDays - 1) * 24 * 60 * 60 * 1000);
          return {
            flockBatch: autoCreatedBatch._id,
            flockName: autoCreatedBatch.name,
            vaccineName: tmpl.vaccineName,
            diseaseTarget: tmpl.diseaseTarget,
            targetAgeDays: tmpl.targetAgeDays,
            scheduledDate: schedDate,
            route: tmpl.route,
            dosesCount: liveChicks,
            status: "scheduled",
            createdBy: req.user._id,
          };
        });
        await PoultryVaccination.insertMany(vDocs);
      }
    }

    const loaded = shipment.chicksLoaded || 1;
    const mort = shipment.transitMortality || 0;
    const liveChicks = Math.max(0, loaded - mort);
    const survivalRate = Math.round((liveChicks / loaded) * 1000) / 10;
    const badge = getSurvivalBadge(survivalRate);

    res.status(200).json({
      message: "Chicks received successfully and saved to Received Chicks log",
      shipment: { ...shipment.toObject(), liveChicks, survivalRate, survivalBadge: badge },
      autoCreatedBatch,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to mark shipment as received", error: error.message });
  }
};

const deleteInTransitChick = async (req, res) => {
  try {
    const shipment = await InTransitChick.findByIdAndDelete(req.params.id);
    if (!shipment) return res.status(404).json({ message: "Shipment not found" });
    res.status(200).json({ message: "Shipment record deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete shipment", error: error.message });
  }
};

// ---------------- Hatchery & Breeder ----------------

const getHatcheryLogs = async (req, res) => {
  try {
    const logs = await PoultryHatchery.find().sort({ createdAt: -1 });
    const enriched = logs.map((log) => {
      const set = log.eggsSet || 1;
      const gradeA = log.hatchedGradeA || 0;
      const gradeB = log.hatchedGradeB || 0;
      const totalHatched = gradeA + gradeB;
      const hatchabilityPercent = Math.round((totalHatched / set) * 1000) / 10;
      const totalBookedQuantity = (log.advanceBookings || []).reduce((acc, b) => acc + (b.quantity || 0), 0);

      return {
        ...log.toObject(),
        totalHatched,
        hatchabilityPercent,
        totalBookedQuantity,
      };
    });
    res.status(200).json({ hatcheryLogs: enriched });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch hatchery logs", error: error.message });
  }
};

const addHatcheryLog = async (req, res) => {
  try {
    const { hatcheryBatchNo, incubatorNo, breedName, settingDate, expectedHatchDate, eggsSet, fertileEggs, advanceBookings, notes } = req.body;
    if (!hatcheryBatchNo || !incubatorNo || !settingDate || eggsSet === undefined) {
      return res.status(400).json({ message: "hatcheryBatchNo, incubatorNo, settingDate, and eggsSet are required" });
    }

    const setDate = new Date(settingDate);
    const defaultHatchDate = new Date(setDate.getTime() + 21 * 24 * 60 * 60 * 1000);

    const log = await PoultryHatchery.create({
      hatcheryBatchNo: hatcheryBatchNo.trim(),
      incubatorNo: incubatorNo.trim(),
      breedName: breedName || "",
      settingDate: setDate,
      expectedHatchDate: expectedHatchDate ? new Date(expectedHatchDate) : defaultHatchDate,
      eggsSet: Number(eggsSet),
      fertileEggs: Number(fertileEggs) || 0,
      advanceBookings: Array.isArray(advanceBookings) ? advanceBookings : [],
      notes: notes || "",
      createdBy: req.user?._id,
    });

    res.status(201).json({ message: "Incubator setting logged with breed and bookings", hatcheryLog: log });
  } catch (error) {
    res.status(500).json({ message: "Failed to add hatchery log", error: error.message });
  }
};

const addHatcheryBooking = async (req, res) => {
  try {
    const log = await PoultryHatchery.findById(req.params.id);
    if (!log) return res.status(404).json({ message: "Hatchery batch not found" });

    const { partyName, quantity, advanceAmount, contactMobile } = req.body;
    if (!partyName || !quantity) {
      return res.status(400).json({ message: "partyName and quantity are required" });
    }

    log.advanceBookings.push({
      partyName: partyName.trim(),
      quantity: Number(quantity),
      advanceAmount: Number(advanceAmount) || 0,
      contactMobile: contactMobile || "",
      bookingDate: new Date(),
      status: log.status === "hatched" ? "delivered" : "booked",
    });

    await log.save();
    res.status(201).json({ message: "Advance booking added", hatcheryLog: log });
  } catch (error) {
    res.status(500).json({ message: "Failed to add advance booking", error: error.message });
  }
};

const updateHatcheryLog = async (req, res) => {
  try {
    const log = await PoultryHatchery.findById(req.params.id);
    if (!log) return res.status(404).json({ message: "Hatchery log not found" });

    const { actualHatchDate, fertileEggs, hatchedGradeA, hatchedGradeB, culls, status, notes, breedName } = req.body;

    if (breedName !== undefined) log.breedName = breedName;
    if (fertileEggs !== undefined) log.fertileEggs = Number(fertileEggs);
    if (hatchedGradeA !== undefined) log.hatchedGradeA = Number(hatchedGradeA);
    if (hatchedGradeB !== undefined) log.hatchedGradeB = Number(hatchedGradeB);
    if (culls !== undefined) log.culls = Number(culls);
    if (notes !== undefined) log.notes = notes;

    const isNewlyHatching = (status === "hatched" || hatchedGradeA !== undefined) && log.status !== "hatched";
    if (status) log.status = status;
    if (actualHatchDate) log.actualHatchDate = new Date(actualHatchDate);

    // When chicks hatch:
    // 1. Auto-mark advance bookings as DELIVERED!
    // 2. Auto-start Day 1 Vaccination (Marek's Disease SubQ & ND+IB Spray)!
    let triggeredVaccines = [];
    if (isNewlyHatching) {
      log.status = "hatched";
      if (!log.actualHatchDate) log.actualHatchDate = new Date();

      // Mark bookings as delivered
      if (log.advanceBookings && log.advanceBookings.length > 0) {
        log.advanceBookings.forEach((b) => {
          if (b.status === "booked") b.status = "delivered";
        });
      }

      // Auto-trigger Day 1 Vaccinations
      const totalHatched = Number(log.hatchedGradeA || 0) + Number(log.hatchedGradeB || 0);
      const hatchDay = startOfDay(log.actualHatchDate);

      const v1 = await PoultryVaccination.create({
        flockName: `Hatch ${log.hatcheryBatchNo} (${log.breedName || "Day 1 Chicks"})`,
        vaccineName: "Marek's Disease (HVT/SB1)",
        diseaseTarget: "Marek's Disease",
        targetAgeDays: 1,
        scheduledDate: hatchDay,
        actualDate: hatchDay,
        route: "subq",
        dosesCount: totalHatched,
        status: "completed",
        notes: "1st Day SubQ Vaccination automatically started upon batch hatching.",
        administeredBy: req.user?._id,
        createdBy: req.user?._id,
      });

      const v2 = await PoultryVaccination.create({
        flockName: `Hatch ${log.hatcheryBatchNo} (${log.breedName || "Day 1 Chicks"})`,
        vaccineName: "ND + IB Mass (Day 1 Spray)",
        diseaseTarget: "Newcastle & Bronchitis",
        targetAgeDays: 1,
        scheduledDate: hatchDay,
        actualDate: hatchDay,
        route: "spray",
        dosesCount: totalHatched,
        status: "completed",
        notes: "1st Day Spray Vaccination automatically started upon batch hatching.",
        administeredBy: req.user?._id,
        createdBy: req.user?._id,
      });

      triggeredVaccines = [v1, v2];
    }

    await log.save();
    res.status(200).json({
      message: isNewlyHatching
        ? "Chicks hatched! Advance bookings delivered and 1st Day Vaccinations (Marek's & ND+IB) automatically started."
        : "Hatchery log updated",
      hatcheryLog: log,
      triggeredVaccines,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update hatchery log", error: error.message });
  }
};

const deleteHatcheryLog = async (req, res) => {
  try {
    const log = await PoultryHatchery.findByIdAndDelete(req.params.id);
    if (!log) return res.status(404).json({ message: "Hatchery log not found" });
    res.status(200).json({ message: "Hatchery log removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove hatchery log", error: error.message });
  }
};

// ---------------- Brooder Management ----------------

const getBrooderBatches = async (req, res) => {
  try {
    const brooders = await PoultryBrooder.find()
      .populate("assignedTo", "name role mobile")
      .populate("receivedRef")
      .sort({ createdAt: -1 });

    const enriched = await Promise.all(
      brooders.map(async (b) => {
        const records = await BrooderDailyRecord.find({ brooderBatch: b._id }).sort({ date: -1 });
        const latest = records[0] || null;

        const totals = await BrooderDailyRecord.aggregate([
          { $match: { brooderBatch: b._id } },
          {
            $group: {
              _id: null,
              totalMortality: { $sum: "$mortality" },
              totalCulls: { $sum: "$culls" },
              totalFeedKg: { $sum: "$feedKg" },
              totalWaterLiters: { $sum: "$waterLiters" },
            },
          },
        ]);
        const agg = totals[0] || { totalMortality: 0, totalCulls: 0, totalFeedKg: 0, totalWaterLiters: 0 };

        const currentStock = Math.max(0, b.chicksPlaced - agg.totalMortality - agg.totalCulls);
        const ageDay = daysBetween(startOfDay(b.placementDate), startOfDay(new Date())) + 1;
        const broodingSurvivalPct = b.chicksPlaced > 0 ? Math.round((currentStock / b.chicksPlaced) * 1000) / 10 : 100;

        return {
          ...b.toObject(),
          currentStock,
          ageDay,
          totalMortality: agg.totalMortality,
          totalCulls: agg.totalCulls,
          totalFeedKg: Math.round(agg.totalFeedKg * 10) / 10,
          totalWaterLiters: Math.round(agg.totalWaterLiters * 10) / 10,
          broodingSurvivalPct,
          latestRecord: latest,
        };
      })
    );

    res.status(200).json({ brooders: enriched });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch brooder batches", error: error.message });
  }
};

const addBrooderBatch = async (req, res) => {
  try {
    const { brooderBatchNo, brooderHouseNo, placementDate, chicksPlaced, heatSource, targetTempC, starterFeedType, receivedRef, assignedTo } = req.body;
    if (!brooderBatchNo || !brooderHouseNo || !placementDate || chicksPlaced === undefined) {
      return res.status(400).json({ message: "brooderBatchNo, brooderHouseNo, placementDate and chicksPlaced are required" });
    }

    const assignee = assignedTo || (await getDefaultManager(req.user));

    const brooder = await PoultryBrooder.create({
      brooderBatchNo: brooderBatchNo.trim(),
      brooderHouseNo: brooderHouseNo.trim(),
      placementDate: startOfDay(new Date(placementDate)),
      chicksPlaced: Number(chicksPlaced),
      heatSource: heatSource || "Infrared Lamp",
      targetTempC: Number(targetTempC) || 33,
      starterFeedType: starterFeedType || "Pre-Starter Crumb",
      receivedRef: receivedRef || null,
      assignedTo: assignee,
      createdBy: req.user?._id,
    });

    const populated = await PoultryBrooder.findById(brooder._id)
      .populate("assignedTo", "name role mobile")
      .populate("receivedRef");

    res.status(201).json({ message: "Brooder batch set up", brooder: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to set up brooder batch", error: error.message });
  }
};

const updateBrooderBatch = async (req, res) => {
  try {
    const brooder = await PoultryBrooder.findById(req.params.id);
    if (!brooder) return res.status(404).json({ message: "Brooder batch not found" });

    const { brooderBatchNo, brooderHouseNo, heatSource, targetTempC, starterFeedType, status, transferredToType, transferredDate } = req.body;

    if (brooderBatchNo) brooder.brooderBatchNo = brooderBatchNo;
    if (brooderHouseNo) brooder.brooderHouseNo = brooderHouseNo;
    if (heatSource) brooder.heatSource = heatSource;
    if (targetTempC !== undefined) brooder.targetTempC = Number(targetTempC);
    if (starterFeedType) brooder.starterFeedType = starterFeedType;
    if (status) brooder.status = status;
    if (transferredToType !== undefined) brooder.transferredToType = transferredToType;
    if (transferredDate) brooder.transferredDate = new Date(transferredDate);

    await brooder.save();

    if (status === "transferred" && transferredToType && ["layer", "broiler", "breeder"].includes(transferredToType)) {
      const records = await BrooderDailyRecord.find({ brooderBatch: brooder._id });
      const totalLost = records.reduce((acc, r) => acc + (r.mortality || 0) + (r.culls || 0), 0);
      const liveChicks = Math.max(0, brooder.chicksPlaced - totalLost);
      const defaultAssignee = await getDefaultManager(req.user);

      const newBatch = await PoultryBatch.create({
        name: `Flock ${brooder.brooderBatchNo} (${transferredToType.toUpperCase()})`,
        breed: brooder.starterFeedType || "Brooded Chicks",
        poultryType: transferredToType,
        dateOfHatch: brooder.placementDate,
        chicksReceived: liveChicks,
        houseNo: brooder.brooderHouseNo,
        assignedTo: defaultAssignee,
        createdBy: req.user._id,
      });

      const hatchDate = startOfDay(new Date(brooder.placementDate));
      const vDocs = STANDARD_VACCINE_TEMPLATE.map((tmpl) => {
        const schedDate = new Date(hatchDate.getTime() + (tmpl.targetAgeDays - 1) * 24 * 60 * 60 * 1000);
        return {
          flockBatch: newBatch._id,
          flockName: newBatch.name,
          vaccineName: tmpl.vaccineName,
          diseaseTarget: tmpl.diseaseTarget,
          targetAgeDays: tmpl.targetAgeDays,
          scheduledDate: schedDate,
          route: tmpl.route,
          dosesCount: liveChicks,
          status: "scheduled",
          createdBy: req.user._id,
        };
      });
      await PoultryVaccination.insertMany(vDocs);
    }

    const populated = await PoultryBrooder.findById(brooder._id)
      .populate("assignedTo", "name role mobile")
      .populate("receivedRef");

    res.status(200).json({ message: "Brooder batch updated", brooder: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update brooder batch", error: error.message });
  }
};

const deleteBrooderBatch = async (req, res) => {
  try {
    const brooder = await PoultryBrooder.findByIdAndDelete(req.params.id);
    if (!brooder) return res.status(404).json({ message: "Brooder batch not found" });
    await BrooderDailyRecord.deleteMany({ brooderBatch: brooder._id });
    res.status(200).json({ message: "Brooder batch and records removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove brooder batch", error: error.message });
  }
};

const getBrooderRecords = async (req, res) => {
  try {
    const records = await BrooderDailyRecord.find({ brooderBatch: req.params.id })
      .populate("recordedBy", "name role")
      .sort({ date: -1 });
    res.status(200).json({ records });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch brooder records", error: error.message });
  }
};

const addBrooderRecord = async (req, res) => {
  try {
    const brooder = await PoultryBrooder.findById(req.params.id);
    if (!brooder) return res.status(404).json({ message: "Brooder batch not found" });

    const { date, tempMorningC, tempEveningC, humidityPct, mortality, culls, feedKg, waterLiters, sampleAvgWeightGms, checklist, remarks } = req.body;
    if (!date) return res.status(400).json({ message: "date is required" });

    const day = startOfDay(new Date(date));
    const ageDay = daysBetween(startOfDay(brooder.placementDate), day) + 1;

    const record = await BrooderDailyRecord.create({
      brooderBatch: brooder._id,
      date: day,
      ageDay,
      tempMorningC: tempMorningC !== undefined && tempMorningC !== "" ? Number(tempMorningC) : null,
      tempEveningC: tempEveningC !== undefined && tempEveningC !== "" ? Number(tempEveningC) : null,
      humidityPct: humidityPct !== undefined && humidityPct !== "" ? Number(humidityPct) : null,
      mortality: Number(mortality) || 0,
      culls: Number(culls) || 0,
      feedKg: Number(feedKg) || 0,
      waterLiters: Number(waterLiters) || 0,
      sampleAvgWeightGms: sampleAvgWeightGms !== undefined && sampleAvgWeightGms !== "" ? Number(sampleAvgWeightGms) : null,
      checklist: Array.isArray(checklist) ? checklist : typeof checklist === "string" ? checklist.split(",") : [],
      remarks: remarks || "",
      recordedBy: req.user?._id,
    });

    res.status(201).json({ message: "Brooder daily record added", record });
  } catch (error) {
    res.status(500).json({ message: "Failed to add brooder record", error: error.message });
  }
};

const updateBrooderRecord = async (req, res) => {
  try {
    const record = await BrooderDailyRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Brooder record not found" });

    const { tempMorningC, tempEveningC, humidityPct, mortality, culls, feedKg, waterLiters, sampleAvgWeightGms, checklist, remarks } = req.body;

    if (tempMorningC !== undefined) record.tempMorningC = tempMorningC === "" ? null : Number(tempMorningC);
    if (tempEveningC !== undefined) record.tempEveningC = tempEveningC === "" ? null : Number(tempEveningC);
    if (humidityPct !== undefined) record.humidityPct = humidityPct === "" ? null : Number(humidityPct);
    if (mortality !== undefined) record.mortality = Number(mortality);
    if (culls !== undefined) record.culls = Number(culls);
    if (feedKg !== undefined) record.feedKg = Number(feedKg);
    if (waterLiters !== undefined) record.waterLiters = Number(waterLiters);
    if (sampleAvgWeightGms !== undefined) record.sampleAvgWeightGms = sampleAvgWeightGms === "" ? null : Number(sampleAvgWeightGms);
    if (checklist !== undefined) record.checklist = Array.isArray(checklist) ? checklist : typeof checklist === "string" ? checklist.split(",") : [];
    if (remarks !== undefined) record.remarks = remarks;

    await record.save();
    res.status(200).json({ message: "Brooder record updated", record });
  } catch (error) {
    res.status(500).json({ message: "Failed to update brooder record", error: error.message });
  }
};

const deleteBrooderRecord = async (req, res) => {
  try {
    const record = await BrooderDailyRecord.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: "Brooder record not found" });
    res.status(200).json({ message: "Brooder record removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove brooder record", error: error.message });
  }
};

// ---------------- Vaccination Schedule ----------------

const getVaccinations = async (req, res) => {
  try {
    const { flockBatch, status } = req.query;
    const filter = {};
    if (flockBatch) filter.flockBatch = flockBatch;
    if (status) filter.status = status;

    const vaccinations = await PoultryVaccination.find(filter)
      .populate("flockBatch", "name poultryType houseNo")
      .populate("administeredBy", "name role")
      .sort({ scheduledDate: 1 });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const enriched = await Promise.all(
      vaccinations.map(async (v) => {
        const sched = new Date(v.scheduledDate);
        sched.setHours(0, 0, 0, 0);
        const daysDiff = daysBetween(sched, now);

        if (v.status === "scheduled" && daysDiff > 3) {
          v.status = "missed";
          await v.save();
        }

        return {
          ...v.toObject(),
          isOverdue: v.status === "scheduled" && daysDiff > 0,
        };
      })
    );

    res.status(200).json({ vaccinations: enriched });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch vaccination schedules", error: error.message });
  }
};

const addVaccination = async (req, res) => {
  try {
    const { flockBatch, flockName, vaccineName, diseaseTarget, targetAgeDays, scheduledDate, route, vaccineBrand, batchLotNo, dosesCount, cost, notes } = req.body;
    if (!flockName || !vaccineName || !scheduledDate || !targetAgeDays) {
      return res.status(400).json({ message: "flockName, vaccineName, targetAgeDays and scheduledDate are required" });
    }

    const vac = await PoultryVaccination.create({
      flockBatch: flockBatch || null,
      flockName: flockName.trim(),
      vaccineName: vaccineName.trim(),
      diseaseTarget: diseaseTarget || "",
      targetAgeDays: Number(targetAgeDays),
      scheduledDate: new Date(scheduledDate),
      route: route || "drinking_water",
      vaccineBrand: vaccineBrand || "",
      batchLotNo: batchLotNo || "",
      dosesCount: Number(dosesCount) || 0,
      cost: Number(cost) || 0,
      status: "scheduled",
      createdBy: req.user?._id,
    });

    res.status(201).json({ message: "Vaccination scheduled", vaccination: vac });
  } catch (error) {
    res.status(500).json({ message: "Failed to add vaccination schedule", error: error.message });
  }
};

const autoGenerateVaccinationSchedule = async (req, res) => {
  try {
    const { flockBatchId } = req.body;
    const batch = await PoultryBatch.findById(flockBatchId);
    if (!batch) return res.status(404).json({ message: "Flock batch not found" });

    const hatchDate = startOfDay(new Date(batch.dateOfHatch));
    const vDocs = STANDARD_VACCINE_TEMPLATE.map((tmpl) => {
      const schedDate = new Date(hatchDate.getTime() + (tmpl.targetAgeDays - 1) * 24 * 60 * 60 * 1000);
      return {
        flockBatch: batch._id,
        flockName: batch.name,
        vaccineName: tmpl.vaccineName,
        diseaseTarget: tmpl.diseaseTarget,
        targetAgeDays: tmpl.targetAgeDays,
        scheduledDate: schedDate,
        route: tmpl.route,
        dosesCount: batch.chicksReceived,
        status: "scheduled",
        createdBy: req.user._id,
      };
    });

    await PoultryVaccination.insertMany(vDocs);
    res.status(201).json({ message: `Standard vaccination schedule (9 vaccines) generated for ${batch.name}` });
  } catch (error) {
    res.status(500).json({ message: "Failed to auto-generate vaccination schedule", error: error.message });
  }
};

const updateVaccination = async (req, res) => {
  try {
    const vac = await PoultryVaccination.findById(req.params.id);
    if (!vac) return res.status(404).json({ message: "Vaccination entry not found" });

    const { status, actualDate, vaccineBrand, batchLotNo, dosesCount, cost, notes, route } = req.body;

    if (status) vac.status = status;
    if (actualDate) vac.actualDate = new Date(actualDate);
    if (vaccineBrand !== undefined) vac.vaccineBrand = vaccineBrand;
    if (batchLotNo !== undefined) vac.batchLotNo = batchLotNo;
    if (dosesCount !== undefined) vac.dosesCount = Number(dosesCount);
    if (cost !== undefined) vac.cost = Number(cost);
    if (notes !== undefined) vac.notes = notes;
    if (route) vac.route = route;

    if (status === "completed" && !vac.actualDate) {
      vac.actualDate = new Date();
    }
    vac.administeredBy = req.user?._id;

    const photoFile = req.files?.photo?.[0];
    if (photoFile) {
      vac.proofPhotoUrl = await uploadBufferToCloudinary(photoFile.buffer, "farmhouse/poultry/vaccines", "image");
    }

    await vac.save();
    const populated = await PoultryVaccination.findById(vac._id)
      .populate("flockBatch", "name poultryType houseNo")
      .populate("administeredBy", "name role");

    res.status(200).json({ message: "Vaccination record updated", vaccination: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update vaccination record", error: error.message });
  }
};

const deleteVaccination = async (req, res) => {
  try {
    const vac = await PoultryVaccination.findByIdAndDelete(req.params.id);
    if (!vac) return res.status(404).json({ message: "Vaccination record not found" });
    res.status(200).json({ message: "Vaccination record deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete vaccination record", error: error.message });
  }
};

// ---------------- Task & Alert Integration ----------------

const generatePoultryTasksForUserToday = async (userId, day = startOfDay(new Date())) => {
  try {
    const today = startOfDay(day);

    // 1. Find all active Poultry Batches assigned to this user
    const batches = await PoultryBatch.find({ assignedTo: userId, isActive: true });
    for (const b of batches) {
      try {
        await WorkTask.findOneAndUpdate(
          { assignedTo: userId, category: "Poultry Care", date: today, timeLabel: `batch_${b._id}` },
          {
            $setOnInsert: {
              category: "Poultry Care",
              assignedTo: userId,
              assignedBy: null,
              source: "auto",
              date: today,
              session: b.name,
              timeLabel: `batch_${b._id}`,
              track: b.houseNo || "Pen / House",
              notes: `Daily logging for flock ${b.name} (${b.poultryType.toUpperCase()}) - Chicks: ${b.chicksReceived}, House: ${b.houseNo || "Unassigned"}`,
            },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        if (err.code !== 11000) console.error("Poultry batch task creation error:", err.message);
      }
    }

    // 2. Find all active Poultry Brooders assigned to this user
    const brooders = await PoultryBrooder.find({ assignedTo: userId, status: "active" });
    for (const br of brooders) {
      try {
        await WorkTask.findOneAndUpdate(
          { assignedTo: userId, category: "Brooder Care", date: today, timeLabel: `brooder_${br._id}` },
          {
            $setOnInsert: {
              category: "Brooder Care",
              assignedTo: userId,
              assignedBy: null,
              source: "auto",
              date: today,
              session: `Brooder ${br.brooderBatchNo}`,
              timeLabel: `brooder_${br._id}`,
              track: br.brooderHouseNo || "Brooder Shed",
              notes: `Daily temperature & water monitoring for Brooder ${br.brooderBatchNo} - Placed: ${br.chicksPlaced} chicks`,
            },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        if (err.code !== 11000) console.error("Poultry brooder task creation error:", err.message);
      }
    }

    // 3. Find scheduled vaccinations due today or overdue
    const assignedBatchIds = batches.map((b) => b._id);
    const assignedBrooderIds = brooders.map((br) => br._id);

    const vaccinations = await PoultryVaccination.find({
      status: "scheduled",
      scheduledDate: { $lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) },
      $or: [
        { flockBatch: { $in: assignedBatchIds } },
        { brooderBatch: { $in: assignedBrooderIds } },
        { createdBy: userId },
      ],
    });

    for (const v of vaccinations) {
      try {
        await WorkTask.findOneAndUpdate(
          { assignedTo: userId, category: "Poultry Vaccination", date: today, timeLabel: `vac_${v._id}` },
          {
            $setOnInsert: {
              category: "Poultry Vaccination",
              assignedTo: userId,
              assignedBy: null,
              source: "auto",
              date: today,
              session: `${v.vaccineName} (${v.flockName})`,
              timeLabel: `vac_${v._id}`,
              track: v.route || "Vaccination Route",
              notes: `VACCINATION ALERT: Administer ${v.vaccineName} (${v.diseaseTarget || "Vaccine"}) for ${v.flockName} (Day ${v.targetAgeDays}, Route: ${v.route || "water"})`,
            },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        if (err.code !== 11000) console.error("Poultry vaccination task creation error:", err.message);
      }
    }
  } catch (error) {
    console.error("generatePoultryTasksForUserToday error:", error.message);
  }
};

const getPoultryAlerts = async (req, res) => {
  try {
    const now = new Date();
    const today = startOfDay(now);
    const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 1. Vaccination Alerts (due today, overdue, or within next 7 days)
    const vaccinations = await PoultryVaccination.find({
      status: "scheduled",
      scheduledDate: { $lte: in7Days },
    })
      .populate({
        path: "flockBatch",
        populate: { path: "assignedTo", select: "name role mobile" },
      })
      .populate("administeredBy", "name role")
      .sort({ scheduledDate: 1 });

    const vaccinationAlerts = vaccinations.map((v) => {
      const sched = startOfDay(new Date(v.scheduledDate));
      const daysDiff = daysBetween(sched, today);
      const isOverdue = daysDiff > 0;

      return {
        _id: v._id,
        type: "vaccination",
        vaccineName: v.vaccineName,
        flockName: v.flockName,
        diseaseTarget: v.diseaseTarget,
        targetAgeDays: v.targetAgeDays,
        scheduledDate: v.scheduledDate,
        route: v.route,
        dosesCount: v.dosesCount,
        status: v.status,
        isOverdue,
        title: `Vaccination Due: ${v.vaccineName}`,
        message: `${v.vaccineName} (${v.diseaseTarget || "Vaccine"}) due for ${v.flockName} on ${v.scheduledDate.toDateString()}`,
        assignedTo: v.flockBatch?.assignedTo || null,
      };
    });

    // 2. Brooder Transition Alerts (Brooders active >= 21 days)
    const activeBrooders = await PoultryBrooder.find({ status: "active" }).populate("assignedTo", "name role mobile");
    const brooderAlerts = [];
    for (const br of activeBrooders) {
      const ageDay = daysBetween(startOfDay(br.placementDate), today) + 1;
      if (ageDay >= 21) {
        brooderAlerts.push({
          _id: br._id,
          type: "brooder_transition",
          brooderBatchNo: br.brooderBatchNo,
          brooderHouseNo: br.brooderHouseNo,
          placementDate: br.placementDate,
          ageDay,
          chicksPlaced: br.chicksPlaced,
          title: `Brooder Transition Ready (${br.brooderBatchNo})`,
          message: `Brooder ${br.brooderBatchNo} is ${ageDay} days old and ready for transfer to Layer/Broiler house.`,
          assignedTo: br.assignedTo || null,
        });
      }
    }

    // 3. High Mortality Alerts from recent records
    const recentRecords = await PoultryRecord.find({
      date: { $gte: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000) },
      mortality: { $gt: 0 },
    }).populate("batch", "name assignedTo");

    const mortalityAlerts = [];
    for (const rec of recentRecords) {
      const open = rec.openStock || 1;
      const mortPct = (rec.mortality / open) * 100;
      if (mortPct >= 1.5) {
        mortalityAlerts.push({
          _id: rec._id,
          type: "high_mortality",
          flockName: rec.batch?.name || "Flock Batch",
          date: rec.date,
          mortality: rec.mortality,
          mortalityPercent: Math.round(mortPct * 10) / 10,
          title: `High Mortality Alert: ${rec.batch?.name}`,
          message: `Flock ${rec.batch?.name} reported ${rec.mortality} deaths (${Math.round(mortPct * 10) / 10}%) on ${rec.date.toDateString()}`,
          assignedTo: rec.batch?.assignedTo || null,
        });
      }
    }

    // 4. Assigned Flocks / Brooders for the requesting user
    const userBatches = await PoultryBatch.find({ assignedTo: req.user._id, isActive: true });
    const userBrooders = await PoultryBrooder.find({ assignedTo: req.user._id, status: "active" });

    res.status(200).json({
      count: vaccinationAlerts.length + brooderAlerts.length + mortalityAlerts.length,
      vaccinationAlerts,
      brooderAlerts,
      mortalityAlerts,
      myAssignedCount: userBatches.length + userBrooders.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch poultry alerts", error: error.message });
  }
};

module.exports = {
  getBatches,
  addBatch,
  updateBatch,
  deleteBatch,
  getRecords,
  addRecord,
  updateRecord,
  deleteRecord,
  getInTransitChicks,
  addInTransitChick,
  updateInTransitChick,
  receiveInTransitChick,
  deleteInTransitChick,
  getHatcheryLogs,
  addHatcheryLog,
  addHatcheryBooking,
  updateHatcheryLog,
  deleteHatcheryLog,
  getBrooderBatches,
  addBrooderBatch,
  updateBrooderBatch,
  deleteBrooderBatch,
  getBrooderRecords,
  addBrooderRecord,
  updateBrooderRecord,
  deleteBrooderRecord,
  getVaccinations,
  addVaccination,
  autoGenerateVaccinationSchedule,
  updateVaccination,
  deleteVaccination,
  generatePoultryTasksForUserToday,
  getPoultryAlerts,
};