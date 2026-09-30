require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const workRoutes = require("./routes/workRoutes");
const scheduleRoutes = require("./routes/scheduleRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const assetRoutes = require("./routes/assetRoutes");
const poultryRoutes = require("./routes/poultryRoutes");
const goatRoutes = require("./routes/goatRoutes");
const animalRoutes = require("./routes/animalRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const fieldPatchRoutes = require("./routes/fieldPatchRoutes");
const saleRoutes = require("./routes/saleRoutes");
const startScheduledJobs = require("./utils/scheduledJobs");

connectDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({ status: "Farmhouse Management API running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/work", workRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/assets", assetRoutes);
app.use("/api/poultry", poultryRoutes);
app.use("/api/goat", goatRoutes);
app.use("/api/animals", animalRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/field-patches", fieldPatchRoutes);
app.use("/api/financials", saleRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server error", error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduledJobs();
});