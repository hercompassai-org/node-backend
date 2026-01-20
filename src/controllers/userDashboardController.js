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
    const userId =
      req.params.id === "me" && req.user
        ? req.user.id
        : req.params.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID required",
      });
    }

    const latestPredict = await PredictiveLog.findOne({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
    });

    if (!latestPredict || !latestPredict.predicted_symptoms) {
      return res.json({
        success: true,
        insights: {
          correlationInsight: null,
          predictiveInsight: null,
          nutritionInsights: null,
          partnerSummary: null,
        },
      });
    }

    const ai = latestPredict.predicted_symptoms;

    const correlationInsight = ai.likely_symptoms?.length
      ? `Recurring patterns detected involving ${ai.likely_symptoms.join(
        ", "
      )}.`
      : null;
    const predictiveInsight = `
Risk level: ${ai.risk_level?.toUpperCase() || "UNKNOWN"}.

${ai.movement_tip || ""}
    `.trim();
    const nutritionInsights = ai.nutrition
      ? {
        radar: ai.nutrition.radar || [],
        summary: ai.nutrition.summary || "",
        shoppingList: ai.nutrition.shopping_list || [],
        suggestedRecipe: ai.nutrition.suggested_recipe || null,
      }
      : null;

  const movementInsights = ai.movement
    ? {
        tonight: ai.movement.tonight || null,
        routine: ai.movement.routine || null,
        coupleMode: ai.movement.couple_mode || null,
      }
    : null;

  const mensSupportInsights = ai.mens_support
    ? {
        recommendedModule: ai.mens_support.recommended_module || null,
        whyRecommended: ai.mens_support.why_recommended || "",
        digestNote: ai.mens_support.digest_note || "",
      }
    : null;
    return res.json({
      success: true,
      insights: {
        correlationInsight,
        predictiveInsight,
        nutritionInsights,
        movementInsights,
        mensSupportInsights,
        partnerSummary: ai.partner_summary || null,
      },
    });
  } catch (err) {
    console.error("Insights error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
