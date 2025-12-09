// src/routes/dashboardRoutes.js
import express from "express";
import { getUserDashboard,getUserInsights } from "../controllers/userDashboardController.js";
const router = express.Router();

router.get("/:id", getUserDashboard); 
router.get("/:id/insights", getUserInsights);

export default router;
