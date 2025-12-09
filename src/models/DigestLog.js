
import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const DigestLog = sequelize.define("digest_logs", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  partner_id: { type: DataTypes.UUID, allowNull: false },
  sent_at: { type: DataTypes.DATE, allowNull: true },
  opened_at: { type: DataTypes.DATE, allowNull: true },
  clicked_at: { type: DataTypes.DATE, allowNull: true },
  digest_type: { type: DataTypes.TEXT, defaultValue: "weekly" },
  fields_shared: { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] }
}, { timestamps: false });

export default DigestLog;
