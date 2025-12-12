// src/services/aiPredictionService.js
import axios from "axios";
import PredictiveLog from "../models/PredictiveLog.js";
import DigitalTwinScenario from "../models/digitalTwin.js";
import SymptomLog from "../models/SymptomLog.js";
import User from "../models/User.js";

/**
 * small helper: trend/slope
 */
const calculateTrend = (arr) => {
  if (!arr || arr.length < 2) return 0;
  return (arr[arr.length - 1] - arr[0]) / arr.length;
};

/**
 * Call OpenAI Chat Completions (axios)
 */
const callOpenAI = async (messages) => {
  const API_KEY = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1";

  if (!API_KEY) throw new Error("OPENAI_API_KEY not set in environment");

  const url = "https://api.openai.com/v1/chat/completions";
  const payload = {
    model,
    messages,
    n: 1,
  };

  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };

  const resp = await axios.post(url, payload, { headers, timeout: 20000 });
  return resp.data;
};

/**
 * runPredictionEngine(userId)
 * - collects user + logs
 * - builds feature vector
 * - calls OpenAI to generate predicted_symptoms, insights, scenarios
 * - persists predicted_symptoms and scenarios
 * Returns { savedPredict, aiResult }
 */
export const runPredictionEngine = async (userId) => {
  // load user & logs
  const user = await User.findByPk(userId);
  if (!user) throw new Error("User not found");

  const logs = await SymptomLog.findAll({
    where: { user_id: userId },
    order: [["log_date", "ASC"]],
  });

  if (!logs.length) {
    // no logs to base predictions on
    return null;
  }

  // numeric arrays
  const moods = logs.map((l) => Number(l.mood || 0));
  const sleep = logs.map((l) => Number(l.sleep_hours || 0));
  const energy = logs.map((l) => Number(l.energy_level || 0));

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const featureVector = {
    age: user.age ?? null,
    gender: user.gender ?? null,
    menopause_phase: user.menopause_phase ?? null,
    avg_mood: Number(avg(moods).toFixed(2)),
    avg_sleep: Number(avg(sleep).toFixed(2)),
    avg_energy: Number(avg(energy).toFixed(2)),
    mood_trend: Number(calculateTrend(moods).toFixed(4)),
    sleep_trend: Number(calculateTrend(sleep).toFixed(4)),
    energy_trend: Number(calculateTrend(energy).toFixed(4)),
    logs_count: logs.length,
    last_logs: logs.slice(-6).map((l) => ({
      date: l.log_date,
      mood: l.mood,
      sleep_hours: l.sleep_hours,
      energy_level: l.energy_level,
      symptoms: l.symptoms,
      notes: l.notes,
    })),
  };

  // Build messages for OpenAI
  const system = {
    role: "system",
    content:
      "You are a conservative clinical assistant. You read structured tracking data and return JSON only with predicted symptoms (hot_flashes, mood_drop_risk, fatigue_probability), a confidence (0-1), human-friendly short insights, partner-friendly one-liner, recommendations (array), and digital twin scenarios (array). Keep numeric risks in clinically sensible ranges and keep outputs JSON-serializable.",
  };

  const userPrompt = {
    role: "user",
    content: `INPUT:
USER_META: ${JSON.stringify({
      id: user.id,
      age: user.age,
      gender: user.gender,
      menopause_phase: user.menopause_phase,
      diet_preferences: user.diet_preferences,
      partner_consent: user.partner_consent,
    })}

FEATURE_VECTOR: ${JSON.stringify(featureVector)}

TASK:
Return ONLY valid JSON (no commentary) with keys:
- predicted_symptoms: { hot_flashes: number, mood_drop_risk: number, fatigue_probability: number }
- confidence: number between 0 and 1
- insights: { short: string, partner_friendly: string }
- recommendation: array of short strings (3-5)
- scenarios: array of { scenario: string, simulated_outcomes: { metric: number, ... } } (small numeric deltas, e.g. mood_up: 0.2)

Be conservative and realistic. Keep numbers small and explainable. Output only JSON.`,
  };

  // call OpenAI and parse JSON robustly
  let aiJson = null;
  try {
    const aiResp = await callOpenAI([system, userPrompt], 900, 0.0);
    const assistantText = aiResp.choices?.[0]?.message?.content;
    if (!assistantText) throw new Error("OpenAI empty response");

    let jsonText = assistantText.trim();

    // strip code fences if present
    if (jsonText.startsWith("```")) {
      const parts = jsonText.split("```");
      jsonText = parts.filter(Boolean).slice(-1)[0] || jsonText;
    }

    // extract first {...} block
    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonText = jsonText.slice(firstBrace, lastBrace + 1);
    }

    aiJson = JSON.parse(jsonText);
  } catch (err) {
    console.error("OpenAI parsing/error — falling back to rule-based:", err.message || err);
    // fallback minimal predictions
    const predicted_symptoms = {
      hot_flashes: Number((1 - featureVector.avg_sleep / 10 + (featureVector.age || 50) / 100).toFixed(3)),
      mood_drop_risk: Number((1 - featureVector.avg_mood / 5 - featureVector.mood_trend).toFixed(3)),
      fatigue_probability: Number((1 + (5 - featureVector.avg_energy) / 10).toFixed(3)),
    };

    aiJson = {
      predicted_symptoms,
      confidence: 0.5,
      insights: {
        short: "Fallback rule-based prediction.",
        partner_friendly: "Basic prediction available.",
      },
      recommendation: ["Try to improve sleep consistency", "Limit late caffeine", "Short walks during day"],
      scenarios: [
        { scenario: "Increase sleep by 1 hour", simulated_outcomes: { mood_up: 0.2, fatigue_drop: -0.2 } },
        { scenario: "Walk 15 minutes extra", simulated_outcomes: { energy_boost: 0.15 } },
      ],
    };
  }

  // persist predictive log
  let savedPredict = null;
  try {
    savedPredict = await PredictiveLog.create({
      user_id: userId,
      feature_vector: featureVector,
      predicted_symptoms: aiJson.predicted_symptoms ?? {},
      model_version: process.env.OPENAI_MODEL || "gpt-4.1",
      confidence: aiJson.confidence ?? null,
    });
  } catch (err) {
    console.error("Failed to save PredictiveLog:", err.message || err);
  }

  // persist digital twin scenarios (append; avoid duplicates by simple check)
  if (Array.isArray(aiJson.scenarios) && aiJson.scenarios.length > 0) {
    for (const s of aiJson.scenarios.slice(0, 8)) {
      try {
        // small validation
        if (!s.scenario || !s.simulated_outcomes) continue;
        await DigitalTwinScenario.create({
          user_id: userId,
          scenario: s.scenario,
          simulated_outcomes: s.simulated_outcomes,
        });
      } catch (err) {
        console.warn("Failed to create DigitalTwinScenario:", err.message || err);
      }
    }
  }

  return {
    savedPredict,
    aiResult: aiJson,
  };
};

export default runPredictionEngine;
