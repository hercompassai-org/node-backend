import express from "express";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getNormalUsersAndPartners,
  getAdminsAndOthers,
  loginUser,
  logoutUser,
  registerWithOnboarding,
  exportUsers,
  exportAnonymizedReport,
} from "../controllers/userController.js";
import { getUserMetrics } from "../controllers/metricsController.js";


const router = express.Router();

router.post("/register", registerWithOnboarding);

router.get("/", getAllUsers);
// GET single user by ID
router.get("/find/:id", getUserById);
router.get("/regulars", getNormalUsersAndPartners);
router.get("/admins", getAdminsAndOthers);
router.post("/login", loginUser);
router.get("/logout", logoutUser);
router.post("/add", createUser);
router.post("/update/:id", updateUser);
router.get("/delete/:id", deleteUser);
router.get("/metrics", getUserMetrics);
router.get("/export", exportUsers);
router.get("/:id/export/anonymized", exportAnonymizedReport);




export default router;
