process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import dotenv from "dotenv";
dotenv.config();

import cron from "node-cron";
import { runWeeklyDigestForAllUsers } from "./src/jobs/digestJob.js";

import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    console.log("🔄 Connecting to database...");
    await connectDB();
    console.log("✅ Database connection established.");
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

    cron.schedule("0 8 * * 1", async () => {
      console.log("⏳ Running weekly digest job...");
      const result = await runWeeklyDigestForAllUsers();
      console.log("✅ Weekly digest completed:", result.length);
    });

    console.log("🕒 CRON job scheduled for every Monday at 08:00");

  } catch (e) {
    console.error("❌ Failed to start server:", e.message);
    process.exit(1);
  }
};

startServer();
