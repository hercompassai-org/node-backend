import { QueryTypes } from "sequelize";
import sequelize from "../config/db.js";
import Videos from "../models/Video.js";

// GET Videos Page
export const adminVideos = async (req, res) => {
  const admin = req.session.admin;
  if (!admin) return res.redirect("/login");

  try {
    const videos = await sequelize.query(
      `SELECT * FROM videos ORDER BY created_at DESC`,
      { type: QueryTypes.SELECT }
    );

    res.render("admin/videos", {
      title: "Support Videos",
      admin,
      videos,
    });
  } catch (err) {
    console.error("Video Dashboard Error:", err);
    res.render("admin/videos", { title: "Support Videos", videos: [],admin });
  }
};

// POST: Upload Video
export const uploadVideo = async (req, res) => {
  try {
    const { title, category, videoUrl } = req.body;

    let videoFile = null;
    if (req.file) {
      videoFile = "/uploads/videos/" + req.file.filename;
    }
    if (!videoUrl && !videoFile) {
      return res.json({
        success: false,
        message: "Please provide video file or URL"
      });
    }

    const video = await Videos.create({
      title,
      category,
      video_url: videoUrl || null,
      video_file: videoFile || null
    });

    return res.json({ success: true, video });

  } catch (err) {
    console.error("Video Upload Error:", err);
    return res.json({ success: false });
  }
};

// DELETE Video
export const deleteVideo = async (req, res) => {
  try {
    const id = req.params.id;

    await sequelize.query(
      `DELETE FROM videos WHERE id = :id`,
      {
        type: QueryTypes.DELETE,
        replacements: { id },
      }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Video Delete Error:", err);
    return res.json({ success: false });
  }
};

export const getAllVideos = async (req, res) => {
  try {
    const videos = await sequelize.query(
      `SELECT id, title, category, video_url, video_file, created_at 
       FROM videos 
       ORDER BY created_at DESC`,
      { type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      videos,
    });
  } catch (err) {
    console.error("Get Videos API Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch videos",
    });
  }
};
