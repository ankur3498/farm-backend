const cron = require("node-cron");
const { generateSchedule } = require("../controllers/scheduleController");
const { generateAssetInspections } = require("../controllers/assetController");

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
        console.log(`[Scheduled Job] Schedule tasks generated:`, scheduleResult);
        console.log(`[Scheduled Job] Asset inspection tasks generated:`, assetResult);
      } catch (error) {
        console.error("[Scheduled Job] Failed to auto-generate daily tasks:", error.message);
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  console.log("Scheduled job registered: daily schedule + asset inspection generation at 12:05 AM IST");
};

module.exports = startScheduledJobs;