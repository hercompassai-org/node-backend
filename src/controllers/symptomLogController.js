import SymptomLog from "../models/SymptomLog.js";
import { runPredictionEngine } from "../services/aiPredictionService.js";

export const addSymptomLog = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      mood,
      sleep_hours,
      energy_level,
      symptoms,
      notes
    } = req.body;

    const newLog = await SymptomLog.create({
      user_id: userId,
      log_date: new Date(),
      mood,
      sleep_hours,
      energy_level,
      symptoms,
      notes,
    });
   await runPredictionEngine(userId);
    res.status(201).json({
      success: true,
      message: "Log saved + AI prediction updated",
      data: newLog,
    });

  } catch (error) {
    console.error("❌ Error saving log:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const getMySymptomLogs = async (req, res) => {
  try {
    const userId = req.user.id;

    const logs = await SymptomLog.findAll({
      where: { user_id: userId },
      order: [["log_date", "DESC"]],
    });

    res.json({
      success: true,
      data: logs,
    });

  } catch (error) {
    console.error("❌ Error fetching logs:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
