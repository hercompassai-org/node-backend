// src/models/Consent.js
import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Consent = sequelize.define("consents", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  partner_id: { type: DataTypes.UUID, allowNull: false },
  scopes: { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] },
  symptoms_allowed: { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { timestamps: false });

export default Consent;
