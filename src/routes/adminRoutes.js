
import express from "express";
import {
  getAllAdmins,
  getAdminById,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  loginAdmin,
  logoutAdmin,
} from "../controllers/adminController.js";

const router = express.Router();
router.post("/login", loginAdmin);
router.get("/logout", logoutAdmin);

router.get("/", getAllAdmins);
router.get("/:id", getAdminById);
router.post("/add", createAdmin);
router.put("/update/:id", updateAdmin);
router.delete("/delete/:id", deleteAdmin);




export default router;
