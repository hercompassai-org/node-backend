import OpenAI from "openai";
import SymptomLog from "../models/SymptomLog.js";
import User from "../models/User.js";
import PredictiveLog from "../models/PredictiveLog.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runPredictionEngine = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) return;

  // ---- Last 7 days of logs ----
  const logs = await SymptomLog.findAll({
    where: { user_id: userId },
    order: [["log_date", "DESC"]],
    limit: 7,
  });

  if (!logs.length) return;

  // ---- FEATURE ENGINEERING ----
  const avgSleep =
    logs.reduce((s, l) => s + Number(l.sleep_hours || 0), 0) / logs.length;

  const avgEnergy =
    logs.reduce((s, l) => s + Number(l.energy_level || 0), 0) / logs.length;

  const symptomCounts = {};
  logs.forEach((l) => {
    let parsedSymptoms = [];

    if (Array.isArray(l.symptoms)) {
      parsedSymptoms = l.symptoms;
    } else if (typeof l.symptoms === "string") {
      try {
        parsedSymptoms = JSON.parse(l.symptoms);
      } catch {
        parsedSymptoms = [];
      }
    }

    parsedSymptoms.forEach((sym) => {
      symptomCounts[sym] = (symptomCounts[sym] || 0) + 1;
    });
  });

  const featureVector = {
    age: user.age,
    menopause_phase: user.menopause_phase,
    avg_sleep_7d: Number(avgSleep.toFixed(1)),
    avg_energy_7d: Number(avgEnergy.toFixed(1)),
    symptoms_frequency: symptomCounts,
    activity_level: user.activity_level,
  };

  // ---- AI PROMPT ----
  const systemPrompt = `
You are a women's menopause health prediction model.
You analyze recent symptom patterns and lifestyle data.
You do NOT diagnose disease.
You provide supportive, evidence-informed guidance.
You return STRUCTURED JSON ONLY.
`;

  const userPrompt = `
Feature vector:
${JSON.stringify(featureVector, null, 2)}

Based on menopause patterns, return JSON exactly in this format:

{
  "likely_symptoms": ["fatigue", "hot_flashes"],
  "risk_level": "low | medium | high",

  "nutrition": {
    "radar": ["Magnesium", "Phytoestrogens", "Hydration"],
    "summary": "Explain why these nutrients matter based on symptoms",
    "shopping_list": ["Spinach", "Lentils", "Soy yogurt", "Chamomile tea"],
    "suggested_recipe": {
      "title": "Recipe name",
      "benefit": "How this recipe helps current symptoms"
    }
  },

  "movement_tip": "One gentle movement or calming practice",
  "partner_summary": "Supportive sentence safe to share with partner (no symptoms mentioned)"
}
`;

  const response = await openai.responses.create({
    model: "gpt-5-mini",

    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const prediction = JSON.parse(response.output_text);

  // ---- SAVE AI OUTPUT ----
  await PredictiveLog.create({
    user_id: userId,
    feature_vector: featureVector,
    predicted_symptoms: prediction,
    model_version: "v1.1",
  });
};
