// src/controllers/dashboardController.js
import { Op } from "sequelize";
import User from "../models/User.js";
import SymptomLog from "../models/SymptomLog.js";
import PredictiveLog from "../models/PredictiveLog.js";
import DigitalTwinScenario from "../models/digitalTwin.js";


export const getUserDashboard = async (req, res) => {
  try {
    const paramId = req.params.id;
    const userId = paramId === "me" && req.user ? req.user.id : paramId;

    if (!userId) {
      return res.status(400).json({ success: false, message: "user id required" });
    }
    const user = await User.findByPk(userId, {
      attributes: [
        "id",
        "email",
        "full_name",
        "age",
        "gender",
        "menopause_phase",
        "partner_id",
        "partner_email",
        "partner_consent",
        "diet_preferences",
        "mood_baseline",
        "exercise_preferences",
        "phone",
      ],
    });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    //
    // ----------------------
    // FETCH LOGS (last 14 days)
    // ----------------------
    //
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const logs = await SymptomLog.findAll({
      where: { user_id: userId, log_date: { [Op.gte]: since } },
      order: [["log_date", "ASC"]],
    });

    const moodSeries = logs
      .filter((l) => l.mood !== null)
      .map((l) => ({ date: l.log_date, mood: Number(l.mood) }));

    const sleepSeries = logs
      .filter((l) => l.sleep_hours !== null)
      .map((l) => ({ date: l.log_date, sleep_hours: Number(l.sleep_hours) }));

    const recentNotes = logs
      .filter((l) => l.notes)
      .map((l) => ({ date: l.log_date, note: l.notes }))
      .slice(-3)
      .reverse();

    //
    // ----------------------
    // PREDICTIVE LOGS
    // ----------------------
    //
    const latestPredict = await PredictiveLog.findOne({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
    });

    //
    // ----------------------
    // DIGITAL TWIN SCENARIOS
    // ----------------------
    //
    const scenarios = await DigitalTwinScenario.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
      limit: 10,
    });

    //
    // ----------------------
    // STATS
    // ----------------------
    //
    const avgMood =
      moodSeries.length > 0
        ? (moodSeries.reduce((s, p) => s + p.mood, 0) / moodSeries.length).toFixed(2)
        : null;

    const avgSleep =
      sleepSeries.length > 0
        ? (sleepSeries.reduce((s, p) => s + p.sleep_hours, 0) / sleepSeries.length).toFixed(1)
        : null;

    //
    // ----------------------
    // WEEKLY SNAPSHOT (THE NEW 4 ITEMS)
    // ----------------------
    //

    // 1️⃣ Mood Trend (% change between last and first log)
    let moodTrend = "0%";
    if (moodSeries.length >= 2) {
      const first = moodSeries[0].mood;
      const last = moodSeries[moodSeries.length - 1].mood;
      const diff = ((last - first) / (first === 0 ? 1 : first)) * 100;
      moodTrend = `${diff.toFixed(0)}%`;
    }

    // 2️⃣ Hot Flash Risk (from predictive logs)
    let hotFlashRisk = "Low";
    if (latestPredict?.predicted_symptoms?.hot_flashes) {
      const risk = latestPredict.predicted_symptoms.hot_flashes;
      if (risk > 1.3) hotFlashRisk = "High";
      else if (risk > 0.7) hotFlashRisk = "Medium";
      else hotFlashRisk = "Low";
    }

    // 3️⃣ Sleep Score
    // Convert avgSleep to a 0–100 scoring
    let sleepScore = 0;
    if (avgSleep) {
      const hours = parseFloat(avgSleep);
      sleepScore = Math.min(100, Math.max(0, (hours / 8) * 100)).toFixed(0);
    }

    // 4️⃣ Partner Read Status
    const partnerReadStatus = user.partner_consent === true ? "Shared" : "Not Shared";

    const weeklySnapshot = {
      moodTrend,
      hotFlashRisk,
      sleepScore: Number(sleepScore),
      partnerReadStatus,
    };

    //
    // ----------------------
    // FINAL RESPONSE
    // ----------------------
    //

    return res.json({
      success: true,
      data: {
        user: user.toJSON(),
        stats: {
          avgMood,
          avgSleep,
          logsCount: logs.length,
        },
        moodSeries,
        sleepSeries,
        recentNotes,
        predictiveSnapshot: latestPredict ? latestPredict.predicted_symptoms : null,
        predictiveMeta: latestPredict
          ? {
              model_version: latestPredict.model_version,
              confidence: latestPredict.confidence,
              created_at: latestPredict.created_at,
            }
          : null,
        digitalTwinScenarios: scenarios.map((s) => ({
          id: s.id,
          scenario: s.scenario,
          simulated_outcomes: s.simulated_outcomes,
          created_at: s.created_at,
        })),
        //
        // ⭐ ADDED:
        //
        weeklySnapshot,
      },
    });
  } catch (err) {
    console.error("getUserDashboard error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getUserInsights = async (req, res) => {
  try {
    const userId = req.params.id === "me" && req.user ? req.user.id : req.params.id;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID required" });
    }
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const logs = await SymptomLog.findAll({
      where: { user_id: userId, log_date: { [Op.gte]: since } },
      order: [["log_date", "ASC"]],
    });

    let correlationInsight = null;

    if (logs.length >= 2) {
      const first = logs[0];
      const last = logs[logs.length - 1];

      if (first.sleep_hours > last.sleep_hours) {
        const drop = first.sleep_hours - last.sleep_hours;
        correlationInsight = `Reduced sleep by ${drop.toFixed(
          1
        )} hrs appears linked with lower mood.`;
      }


      if (last.symptoms?.includes("Fatigue")) {
        correlationInsight = `Recurring fatigue detected — energy level trending lower after active days.`;
      }
    }


    const latestPredict = await PredictiveLog.findOne({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
    });

    let predictiveInsight = null;

    if (latestPredict?.predicted_symptoms) {
      const p = latestPredict.predicted_symptoms;

      if (p.hot_flashes > 1.2) {
        predictiveInsight = `Hot flash risk increasing — consider adding cooling breaths or shorter evening workouts.`;
      } else if (p.fatigue_probability > 1.0) {
        predictiveInsight = `Fatigue likelihood high — energy dips expected in the next few days.`;
      } else {
        predictiveInsight = `Overall symptom risk stable — good balance maintained this week.`;
      }
    }

    return res.json({
      success: true,
      insights: {
        correlationInsight,
        predictiveInsight,
      },
    });
  } catch (err) {
    console.error("Insights error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
