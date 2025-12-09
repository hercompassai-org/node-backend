import express from "express";
import { cpsTools } from "../controllers/cpsController.js";

const router = express.Router();

router.get("/", cpsTools);

export default router;
