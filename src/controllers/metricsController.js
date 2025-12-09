import User from "../models/User.js";
import { Op } from "sequelize";

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export const getUserMetrics = async (req, res) => {
  try {
    const totalUsers = await User.count();
    const DAU = await User.count({ where: { last_active: { [Op.gte]: daysAgo(1) } } });
    const WAU = await User.count({ where: { last_active: { [Op.gte]: daysAgo(7) } } });
    const MAU = await User.count({ where: { last_active: { [Op.gte]: daysAgo(30) } } });

    res.status(200).json({ success: true, totalUsers, DAU, WAU, MAU });
  } catch (err) {
    console.error("❌ Error fetching metrics:", err.message);
    res.status(500).json({ success: false, message: "Server error fetching metrics" });
  }
};
