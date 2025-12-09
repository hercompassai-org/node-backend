import express from "express";
import { growthDashboard } from "../controllers/growthController.js";

const router = express.Router();

router.get("/", growthDashboard);


export default router;
