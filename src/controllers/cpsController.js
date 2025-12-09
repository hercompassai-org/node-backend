import { QueryTypes } from "sequelize";
import sequelize from "../config/db.js";


export const cpsTools = async (req, res) => {
  const admin = req.session.admin;
  if (!admin) return res.redirect("/login");

  try {

    const partners = await sequelize.query(
      `SELECT COUNT(*) AS count
       FROM users
       WHERE role = 'partner'`,
      { type: QueryTypes.SELECT }
    );

    const activation = await sequelize.query(
      `
  SELECT
      COUNT(*) FILTER (WHERE ps.partner_id IS NOT NULL) AS activated,
      COUNT(*) AS total
  FROM users u
  LEFT JOIN (
      SELECT DISTINCT partner_id
      FROM partner_shares
  ) ps ON ps.partner_id = u.id
  WHERE u.role = 'partner'
  `,
      { type: QueryTypes.SELECT }
    );

    const { activated, total } = activation[0];
    const activationRate =
      total === 0 ? 0 : Math.round((activated / total) * 100);


    const digest = await sequelize.query(
      `
      SELECT
        SUM(CASE WHEN opened_at >= NOW() - interval '7 days' THEN 1 END) AS recent_opens,
        SUM(CASE WHEN sent_at >= NOW() - interval '7 days' THEN 1 END) AS recent_sent,

        SUM(CASE WHEN opened_at BETWEEN NOW() - interval '14 days' AND NOW() - interval '7 days' THEN 1 END) AS prev_opens,
        SUM(CASE WHEN sent_at BETWEEN NOW() - interval '14 days' AND NOW() - interval '7 days' THEN 1 END) AS prev_sent
      FROM digest_logs
      `,
      { type: QueryTypes.SELECT }
    );

    const d = digest[0];

    const recentOpenRate =
      !d.recent_sent || d.recent_sent === 0
        ? 0
        : Math.round((d.recent_opens / d.recent_sent) * 100);

    const prevOpenRate =
      !d.prev_sent || d.prev_sent === 0
        ? 0
        : Math.round((d.prev_opens / d.prev_sent) * 100);

    const openRateDrop = prevOpenRate - recentOpenRate;


    const consents = await sequelize.query(
      `
      SELECT 
        ps.user_id,
        ps.partner_id,
        ps.shared_fields,
        ps.last_shared
      FROM partner_shares ps
      ORDER BY ps.last_shared DESC
      `,
      { type: QueryTypes.SELECT }
    );
    res.render("admin/cpstools", {
      title: "CPS Tools",
      admin,
      metrics: {
        partners: partners[0].count,
        activationRate,
        recentOpenRate,
        openRateDrop: openRateDrop < 0 ? 0 : openRateDrop,
      },
      consents,
    });

  } catch (err) {
    console.error("CPS Dashboard Error:", err);
    res.render("admin/cpstools", { title: "CPS Tools", metrics: {}, consents: [] });
  }
};
