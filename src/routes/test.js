import express from "express";
import {newregister} from "../controllers/userController.js";
const router = express.Router();
router.post("/register", newregister);
export default router;
