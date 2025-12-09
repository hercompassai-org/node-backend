import express from "express";
import { renderEngagement } from "../controllers/engagementController.js";

const router = express.Router();

router.get("/", renderEngagement);

export default router;