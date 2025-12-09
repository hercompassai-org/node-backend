import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { getMyPredictions } from "../controllers/aiController.js";

const router = express.Router();

router.get("/predictions", authMiddleware, getMyPredictions);

export default router;
