const cron = require("node-cron");
const { generateSchedule } = require("../controllers/scheduleController");
const { generateAssetInspections } = require("../controllers/assetController");
const { generatePoultryTasksForUserToday } = require("../controllers/poultryController");
const { generateFieldPatchTasksForUserToday } = require("../controllers/fieldPatchController");
const User = require("../models/User");

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

// Runs automatically every day at 12:05 AM India time — generates every
// schedule-based task AND every due weekly asset-inspection task for the
// new day, with no admin or worker needing to click anything. The lazy
// per-user generation in workController.getMyTasks stays as a backup.
const startScheduledJobs = () => {
  cron.schedule(
    "5 0 * * *",
    async () => {
      try {
        const today = startOfDay(new Date());
        const scheduleResult = await generateSchedule(today);
        const assetResult = await generateAssetInspections(today);
        
        const activeUsers = await User.find({ isActive: true }).select("_id");
        for (const u of activeUsers) {
          try {
            await generatePoultryTasksForUserToday(u._id, today);
            await generateFieldPatchTasksForUserToday(u._id, today);
          } catch (e) {}
        }
        
        console.log(`[Scheduled Job] Schedule tasks generated:`, scheduleResult);
        console.log(`[Scheduled Job] Asset inspection tasks generated:`, assetResult);
        console.log(`[Scheduled Job] Poultry & Field Patch tasks generated for ${activeUsers.length} users`);
      } catch (error) {
        console.error("[Scheduled Job] Failed to auto-generate daily tasks:", error.message);
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  console.log("Scheduled job registered: daily schedule + asset inspection + poultry tasks generation at 12:05 AM IST");
};

module.exports = startScheduledJobs;