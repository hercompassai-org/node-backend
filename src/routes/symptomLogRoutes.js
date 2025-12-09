import express from "express";
import { addSymptomLog, getMySymptomLogs } from "../controllers/symptomLogController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/add", authMiddleware, addSymptomLog);
router.get("/my", authMiddleware, getMySymptomLogs);

export default router;
