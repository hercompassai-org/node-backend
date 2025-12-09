
import sequelize from "../config/db.js";
import { QueryTypes } from "sequelize";

export const renderDashboard = async (req, res) => {
  const admin = req.session.admin;
  if (!admin) return res.redirect("/login");

  try {
   
    const [totalUsers] = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM users`,
      { type: QueryTypes.SELECT }
    );

    const [activeUsers] = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE last_active > NOW() - INTERVAL '7 days'`,
      { type: QueryTypes.SELECT }
    );

    const [activationRate] = await sequelize.query(
      `SELECT ROUND((COUNT(*) FILTER (WHERE goals IS NOT NULL)::numeric / NULLIF(COUNT(*),0)) * 100, 0) AS rate FROM users`,
      { type: QueryTypes.SELECT }
    );

    const [partnersLinked] = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE partner_id IS NOT NULL`,
      { type: QueryTypes.SELECT }
    );

    const [forecastsDelivered] = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM predictive_logs WHERE created_at > NOW() - INTERVAL '7 days'`,
      { type: QueryTypes.SELECT }
    );

    const [forecastUsefulness] = await sequelize.query(
      `SELECT ROUND(AVG(forecast_useful_rating)::numeric, 2) AS avg FROM users WHERE forecast_useful_rating IS NOT NULL`,
      { type: QueryTypes.SELECT }
    );

    const [contentVerified] = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM clinical_reviews WHERE status = 'approved'`,
      { type: QueryTypes.SELECT }
    );

    const [churn] = await sequelize.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM billing WHERE status IN ('failed','pending') AND paid_at > NOW() - INTERVAL '14 days'`,
      { type: QueryTypes.SELECT }
    );
    const totalINR = parseFloat(churn.total || 0) * 88;
    const formattedChurn =
      totalINR >= 1000
        ? `₹${Math.round(totalINR / 1000)}K`
        : `₹${Math.round(totalINR)}`;

    const [engagement] = await sequelize.query(
    `SELECT 
        COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '1 day') AS dau,
        COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '7 days') AS wau,
        COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '30 days') AS mau
    FROM users`,
    { type: QueryTypes.SELECT }
    );


    res.render("admin/dashboard", {
      title: "Dashboard",
      admin,
      stats: {
        totalUsers: totalUsers.count || 0,
        activeUsers: activeUsers.count || 0,
        activationRate: activationRate.rate || 0,
        partnersLinked: partnersLinked.count || 0,
        forecastsDelivered: forecastsDelivered.count || 0,
        forecastUsefulness: forecastUsefulness.avg || 0,
        contentVerified: contentVerified.count || 0,
        churn: formattedChurn,
      },
      engagement: engagement || { dau: 0, wau: 0, mau: 0 },
    });
 } catch (error) {
  console.error("❌ Dashboard Error:", error.message);
  console.error(error.stack);
  res.status(500).json({ message: "Dashboard query failed", error: error.message });
}

};
