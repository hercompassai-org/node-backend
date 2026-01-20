import OpenAI from "openai";
import SymptomLog from "../models/SymptomLog.js";
import User from "../models/User.js";
import PredictiveLog from "../models/PredictiveLog.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateImageFromPrompt(prompt) {
  if (!prompt) return null;

  const img = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "auto"
  });

  return img?.data?.[0]?.url || null;
}


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
IMPORTANT:
All example values in the prompt are placeholders.
Generate ORIGINAL, context-aware values derived from the feature vector.
Do NOT reuse example phrases verbatim unless they are clearly the best clinical fit.

You are a women's menopause health prediction model.
You analyze recent symptom patterns and lifestyle data.
You do NOT diagnose disease.
You provide supportive, evidence-informed guidance.
You return STRUCTURED JSON ONLY.
`;


  const userPrompt = `
Feature vector:
${JSON.stringify(featureVector, null, 2)}

Based on menopause patterns, return JSON that matches this SCHEMA.
Values must be dynamically generated from the feature vector.
Do NOT reuse example text verbatim unless it is the best possible recommendation:

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
    },
    "image_prompt": "Soft natural light, warm bowl of lentils, leafy greens, chamomile tea, calming evening mood, flat lay, modern health photography"
  },

   "movement": {
    "tonight": {
      "title": "10-minute evening meditation",
      "description": "Calming guided practice to support sleep and nervous system recovery",
      "duration": "10 min",
      "type": "meditation | yoga | walking | mobility"
    },
    "routine": {
      "title": "Gentle weekly movement plan",
      "description": "Low-impact movement supporting energy, mood and sleep"
    },
    "couple_mode": {
      "challenge": "Walk together 3x this week",
      "benefit": "Encourages connection and gentle activity"
    }
  },

  "mens_support": {
  "recommended_module": {
    "title": "Empathy 101",
    "duration": "5 min",
    "description": "Short lesson helping partners understand emotional needs and communicate calmly"
  },
  "why_recommended": "Explain briefly why this module helps given current symptoms and mood trends",
  "digest_note": "Short weekly summary safe to share with partner"
},


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

if (prediction?.nutrition?.image_prompt) {
  try {
    prediction.nutrition.image_url =
      await generateImageFromPrompt(
        prediction.nutrition.image_prompt
      );
  } catch (e) {
    console.warn("Image generation failed:", e.message);
    prediction.nutrition.image_url = null;
  }
}


  // ---- SAVE AI OUTPUT ----
  await PredictiveLog.create({
    user_id: userId,
    feature_vector: featureVector,
    predicted_symptoms: prediction,
    model_version: "v1.1",
  });
};
