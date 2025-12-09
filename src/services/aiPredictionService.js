import PredictiveLog from "../models/PredictiveLog.js";
import DigitalTwinScenario from "../models/digitalTwin.js";
import SymptomLog from "../models/SymptomLog.js";
import User from "../models/User.js";

// Simple trend calculation
const calculateTrend = (arr) => {
  if (arr.length < 2) return 0;
  let slope = (arr[arr.length - 1] - arr[0]) / arr.length;
  return slope;
};

export const runPredictionEngine = async (userId) => {
  const user = await User.findByPk(userId);
  const logs = await SymptomLog.findAll({
    where: { user_id: userId },
    order: [["log_date", "ASC"]],
  });

  if (!logs.length) return;

  // --- Extract recent data ---
  const moods = logs.map(l => Number(l.mood));
  const sleep = logs.map(l => Number(l.sleep_hours || 0));
  const energy = logs.map(l => Number(l.energy_level || 0));

  const featureVector = {
    age: user.age,
    gender: user.gender,
    menopause_phase: user.menopause_phase,
    avg_mood: moods.reduce((a, b) => a + b, 0) / moods.length,
    avg_sleep: sleep.reduce((a, b) => a + b, 0) / sleep.length,
    avg_energy: energy.reduce((a, b) => a + b, 0) / energy.length,
    mood_trend: calculateTrend(moods),
    sleep_trend: calculateTrend(sleep),
    energy_trend: calculateTrend(energy),
    logs_count: logs.length,
  };

  // --- Real prediction model ---
  const predictedSymptoms = {
    hot_flashes: (1 - featureVector.avg_sleep / 10 + featureVector.age / 100),
    mood_drop_risk: (1 - featureVector.avg_mood / 5 + featureVector.mood_trend * -1),
    fatigue_probability: (1 + (5 - featureVector.avg_energy) / 10),
  };

  // Save to predictive_logs table
  await PredictiveLog.create({
    user_id: userId,
    feature_vector: featureVector,
    predicted_symptoms: predictedSymptoms,
    model_version: "v1.0"
  });

  // Create digital twin scenarios
  const scenarios = [
    {
      scenario: "Increase sleep by 1 hour",
      deltaSleep: +1,
      simulated_outcomes: {
        mood_improvement: +0.3,
        fatigue_drop: -0.2,
      }
    },
    {
      scenario: "Reduce caffeine after 6pm",
      simulated_outcomes: {
        hot_flashes_reduction: -0.15,
        sleep_quality_boost: +0.4,
      }
    },
    {
      scenario: "Walk 15 minutes extra",
      simulated_outcomes: {
        energy_boost: +0.25,
        mood_up: +0.2,
      }
    }
  ];

  for (const s of scenarios) {
    await DigitalTwinScenario.create({
      user_id: userId,
      scenario: s.scenario,
      simulated_outcomes: s.simulated_outcomes
    });
  }

  return true;
};
