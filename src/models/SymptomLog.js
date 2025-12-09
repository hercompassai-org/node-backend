import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const SymptomLog = sequelize.define(
  "symptom_logs",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    log_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    mood: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    sleep_hours: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    energy_level: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    symptoms: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: false,
    freezeTableName: true,
  }
);

export default SymptomLog;
