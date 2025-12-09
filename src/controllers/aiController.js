import PredictiveLog from "../models/PredictiveLog.js";
import DigitalTwinScenario from "../models/digitalTwin.js";

export const getMyPredictions = async (req, res) => {
  try {
    const userId = req.user.id;


    const predictions = await PredictiveLog.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
      limit: 5
    });

    const scenarios = await DigitalTwinScenario.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
      limit: 5
    });

    return res.json({
      success: true,
      predictions,
      scenarios,
    });

  } catch (error) {
    console.error("❌ Error fetching predictions:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
