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

  // Last 7 days of logs
  const logs = await SymptomLog.findAll({
    where: { user_id: userId },
    order: [["log_date", "DESC"]],
    limit: 7,
  });

  if (!logs.length) return;

  // -------- FEATURE ENGINEERING --------
  const avgSleep =
    logs.reduce((s, l) => s + (l.sleep_hours || 0), 0) / logs.length;

  const avgEnergy =
    logs.reduce((s, l) => s + (l.energy_level || 0), 0) / logs.length;

  const symptomCounts = {};
  logs.forEach(l => {
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

    parsedSymptoms.forEach(sym => {
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

  // -------- AI PROMPT --------
  const systemPrompt = `
You are a women's menopause health prediction model.
You analyze recent trends and predict likely short-term symptoms.
You do NOT diagnose disease.
You return structured JSON only.
`;

  const userPrompt = `
Feature vector:
${JSON.stringify(featureVector, null, 2)}

Based on menopause patterns, predict:
- Top 3 likely symptoms in next 3–5 days
- Risk level (low | medium | high)
- 1 nutrition suggestion
- 1 gentle movement or calming practice
- 1 partner-safe supportive sentence (NO symptoms mentioned)

Return JSON exactly in this format:
{
  "likely_symptoms": ["fatigue", "hot_flashes"],
  "risk_level": "medium",
  "nutrition_tip": "string",
  "movement_tip": "string",
  "partner_summary": "string"
}
`;

const response = await openai.responses.create({
  model: "gpt-5-mini",
  input: [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: userPrompt
    }
  ]
});

const prediction = JSON.parse(response.output_text);


  // -------- SAVE TO predictive_logs --------
  await PredictiveLog.create({
    user_id: userId,
    feature_vector: featureVector,
    predicted_symptoms: prediction,
    model_version: "v1.0",
  });
};
