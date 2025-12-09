import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const AuditLog = sequelize.define("audit_logs", {
  id: { 
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  actor_id: { 
    type: DataTypes.UUID,
    allowNull: true
  },

  action: { 
    type: DataTypes.TEXT,
    allowNull: true
  },

  target_table: { 
    type: DataTypes.TEXT,
    allowNull: true
  },

  target_id: { 
    type: DataTypes.UUID,
    allowNull: true
  },

  ip_address: { 
    type: DataTypes.CITEXT || DataTypes.STRING,
    allowNull: true
  },

  created_at: { 
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }

}, { 
  timestamps: false,
  tableName: "audit_logs",
  underscored: true
});

export default AuditLog;
