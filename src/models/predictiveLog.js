import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const PredictiveLog = sequelize.define("predictive_logs", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },

  feature_vector: {
    type: DataTypes.JSONB,
    allowNull: false,
  },

  predicted_symptoms: {
    type: DataTypes.JSONB,
    allowNull: false,
  },

  model_version: {
    type: DataTypes.STRING,
    defaultValue: "v1.0"
  },

  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },

}, {
  tableName: "predictive_logs",
  timestamps: false,
});

export default PredictiveLog;
