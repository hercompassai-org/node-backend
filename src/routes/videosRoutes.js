import express from "express";
import {
  adminVideos,
  uploadVideo,
  deleteVideo,
  getAllVideos,
} from "../controllers/videosController.js";

import videoUpload from "../middleware/videoUpload.js";

const router = express.Router();

router.get("/", adminVideos);
router.post("/", videoUpload.single("video"), uploadVideo);
router.delete("/:id", deleteVideo);
router.get("/list", getAllVideos);

export default router;
