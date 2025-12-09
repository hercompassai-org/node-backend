import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Videos = sequelize.define(
  "videos",
  {
    title: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false },
    video_url: { type: DataTypes.TEXT, allowNull: true },
    video_file: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false
  }
);

export default Videos;
