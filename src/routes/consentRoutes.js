// src/routes/consentRoutes.js
import express from "express";
import { getMyPartnerShares, updateSharedFields, triggerDigestPreview } from "../controllers/userConsentController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/my", authMiddleware, getMyPartnerShares);
router.put("/update-shared-fields", authMiddleware, updateSharedFields);
router.post("/trigger-digest-preview", authMiddleware, triggerDigestPreview);

export default router;
