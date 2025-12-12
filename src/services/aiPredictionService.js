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
 * Option A: hardcoded model "gpt-5.1-mini"
 */
const callOpenAI = async (messages) => {
  const API_KEY = process.env.OPENAI_API_KEY;
  const model = "gpt-5.1-mini";

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

  const resp = await axios.post(url, payload, { headers, timeout: 25000 });
  return resp.data;
};
export const runPredictionEngine = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) throw new Error("User not found");

  const logs = await SymptomLog.findAll({
    where: { user_id: userId },
    order: [["log_date", "ASC"]],
  });

  if (!logs.length) {
    return null;
  }

  const moods = logs.map((l) => Number(l.mood || 0));
  const sleep = logs.map((l) => Number(l.sleep_hours || 0));
  const energy = logs.map((l) => Number(l.energy_level || 0));

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const featureVector = {
    id: user.id,
    age: user.age ?? null,
    gender: user.gender ?? null,
    menopause_phase: user.menopause_phase ?? null,
    diet_preferences: user.diet_preferences ?? [],
    partner_consent: !!user.partner_consent,
    avg_mood: Number(avg(moods).toFixed(2)),
    avg_sleep: Number(avg(sleep).toFixed(2)),
    avg_energy: Number(avg(energy).toFixed(2)),
    mood_trend: Number(calculateTrend(moods).toFixed(4)),
    sleep_trend: Number(calculateTrend(sleep).toFixed(4)),
    energy_trend: Number(calculateTrend(energy).toFixed(4)),
    logs_count: logs.length,
    last_logs: logs.slice(-8).map((l) => ({
      date: l.log_date,
      mood: l.mood,
      sleep_hours: l.sleep_hours,
      energy_level: l.energy_level,
      symptoms: l.symptoms,
      notes: l.notes,
    })),
    mood_baseline: user.mood_baseline || {},
    health_concerns: user.health_concerns || [],
    medical_conditions: user.medical_conditions || null,
    exercise_preferences: user.exercise_preferences || [],
    preferred_recommendations: user.preferred_recommendations || [],
  };
  const system = {
    role: "system",
    content:
      "You are a conservative clinical assistant. You read structured patient tracking data (user meta + recent logs) and return ONLY JSON (no commentary). " +
      "Your job: infer which symptoms matter for this user (do not restrict to pre-defined keys). Produce dynamic predicted symptom scores (0 to 2 scale where 0 low risk and 2 high risk), a confidence (0-1), short human-friendly insights, partner-friendly one-liner, recommendations (3-6 short actionable items), digital twin scenarios (small numeric deltas) and auto_tags (possible symptoms or drivers you infer but user didn't log). Keep outputs JSON-serializable and clinically conservative.",
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
1) Inspect the user's recent logs and profile and INFER which symptom types or drivers are relevant (e.g., "hot_flashes", "insomnia", "fatigue", "anxiety", "sleep_fragmentation", "night_sweats", "caffeine_trigger", etc.). You should return predicted_symptoms as an object with keys equal to the inferred symptom names and numeric scores from 0 to 2 (use decimals if needed).

2) Return confidence (0-1), insights: { short, partner_friendly }, recommendation: array (3-6 actionable items), scenarios: array of { scenario, simulated_outcomes } where simulated_outcomes contains small numeric deltas (e.g., mood_up: 0.2), and auto_tags: array of additional inferred tags/possible causes the user did not explicitly log.

3) Output only valid JSON. Example shape (you must follow shape but symptom keys should be dynamic):
{
  "predicted_symptoms": { "night_sweats": 1.3, "insomnia": 1.8, "fatigue": 0.9 },
  "confidence": 0.82,
  "insights": { "short": "...", "partner_friendly": "..." },
  "recommendation": ["...","..."],
  "scenarios": [ { "scenario":"Increase sleep by 1 hour", "simulated_outcomes": { "mood_up": 0.2, "fatigue_drop": -0.2 } } ],
  "auto_tags": ["evening-caffeine", "low-magnesium"]
}

Be conservative and realistic. Return only JSON (no explanatory text).`,
  };
  let aiJson = null;
  try {
    const aiResp = await callOpenAI([system, userPrompt], 1000, 0.0);
    const assistantText = aiResp.choices?.[0]?.message?.content;
    if (!assistantText) throw new Error("OpenAI empty response");
    let jsonText = assistantText.trim();
    if (jsonText.startsWith("```")) {
      const parts = jsonText.split("```");
      jsonText = parts.filter(Boolean).slice(-1)[0] || jsonText;
    }
    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonText = jsonText.slice(firstBrace, lastBrace + 1);
    }

    aiJson = JSON.parse(jsonText);
  } catch (err) {
    console.error("OpenAI parsing/error — falling back to rule-based:", err.message || err);
    const predicted_symptoms = {};
    const loggedSymptomStrings = logs
      .map((l) => (l.symptoms ? String(l.symptoms).replace(/[{}"]/g, "") : ""))
      .join(", ")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const candidateKeys = new Set([...loggedSymptomStrings, ...(user.health_concerns || [])]);

    if (candidateKeys.size === 0) {
      candidateKeys.add("fatigue");
      candidateKeys.add("sleep_disturbance");
    }

    for (const key of candidateKeys) {
      const k = key.replace(/\s+/g, "_").toLowerCase();
      const base =
        k.includes("sleep") || k.includes("insomnia") || k.includes("night") ? 1.2 : k.includes("fatigue") ? 1.0 : 0.6;
      predicted_symptoms[k] = Number(base.toFixed(3));
    }

    aiJson = {
      predicted_symptoms,
      confidence: 0.45,
      insights: {
        short: "Fallback: rule-based suggestion based on recent logs.",
        partner_friendly: "Notable changes this week; please offer calm support and encourage sleep routine.",
      },
      recommendation: ["Try to improve sleep consistency", "Reduce late caffeine", "Short calming evening walk"],
      scenarios: [
        {
          scenario: "Increase sleep by 1 hour",
          simulated_outcomes: { mood_up: 0.2, fatigue_drop: -0.2 },
        },
      ],
      auto_tags: ["possible_caffeine_trigger"],
    };
  }
  let savedPredict = null;
  try {
    const finalPredicted = { ...(aiJson.predicted_symptoms || {}) };
    if (Array.isArray(aiJson.auto_tags) && aiJson.auto_tags.length) {
      finalPredicted._auto_tags = aiJson.auto_tags;
    }

    savedPredict = await PredictiveLog.create({
      user_id: userId,
      feature_vector: featureVector,
      predicted_symptoms: finalPredicted,
      model_version: "gpt-5.1-mini",
      confidence: aiJson.confidence ?? null,
    });
  } catch (err) {
    console.error("Failed to save PredictiveLog:", err.message || err);
  }

  if (Array.isArray(aiJson.scenarios) && aiJson.scenarios.length > 0) {
    for (const s of aiJson.scenarios.slice(0, 10)) {
      try {
        if (!s || !s.scenario || !s.simulated_outcomes) continue;
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
