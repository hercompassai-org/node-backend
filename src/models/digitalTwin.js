import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const DigitalTwinScenario = sequelize.define("digital_twin_scenarios", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  scenario: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  simulated_outcomes: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: false,
});

export default DigitalTwinScenario;
