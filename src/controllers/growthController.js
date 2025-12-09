import sequelize from "../config/db.js";
import { QueryTypes } from "sequelize";

export const growthDashboard = async(req,res)=>{
     const admin = req.session.admin;

    if (!admin) return res.redirect("/login");

    try {
        const leaderboard = await sequelize.query(
            `
            SELECT 
                u.id,
                u.full_name,
                u.role,

                COUNT(r.id) AS referrals_sent,
                COUNT(CASE WHEN r.status = 'activated' THEN 1 END) AS activated_count,

                COUNT(p.id) AS linked_partners,

                -- Demo CPS
                ROUND(COUNT(r.id) * 2.5) AS cps

            FROM users u
            LEFT JOIN referrals r ON r.inviter_id = u.id
            LEFT JOIN users p ON p.partner_id = u.id

            GROUP BY u.id, u.full_name, u.role
            ORDER BY referrals_sent DESC
            `,
            { type: QueryTypes.SELECT }
        );

        const [userLinked] = await sequelize.query(
            `SELECT COUNT(*)::int FROM users WHERE linked_user IS NOT NULL;`,
            { type: QueryTypes.SELECT }
        );
 
        const [invitesSent] = await sequelize.query(
            `SELECT COUNT(*)::int FROM referrals;`,
            { type: QueryTypes.SELECT }
        );
 
        const [accepted] = await sequelize.query(
            `SELECT COUNT(*)::int FROM referrals WHERE status = 'joined';`,
            { type: QueryTypes.SELECT }
        );
 
        const [activated] = await sequelize.query(
            `SELECT COUNT(*)::int FROM referrals WHERE status = 'activated';`,
            { type: QueryTypes.SELECT }
        );
 
        const [landing] = await sequelize.query(
            `SELECT COUNT(*)::int FROM users;`,
            { type: QueryTypes.SELECT }
        );
 
        const [signup] = await sequelize.query(
            `SELECT COUNT(*)::int FROM users;`,
            { type: QueryTypes.SELECT }
        );
 
        const [onboarding] = await sequelize.query(
            `SELECT COUNT(*)::int FROM users WHERE linked_user IS NOT NULL;`,
            { type: QueryTypes.SELECT }
        );
 
        const [firstLog] = await sequelize.query(
            `SELECT COUNT(*)::int FROM users WHERE logs_count_7d::int > 0;`,
            { type: QueryTypes.SELECT }
        );

        res.render("admin/growth", {
            title: "Growth & Acquisition",
            admin,
            leaderboard,
            stats: {
                invitesSent: invitesSent.count || 0,
                accepted: accepted.count || 0,
                activated: activated.count || 0,
                userLinked: userLinked.count || 0,
                landing: landing.count || 0,
                signup: signup.count || 0,
                onboarding: onboarding.count || 0,
                firstLog: firstLog.count || 0,
            },
        });

    } catch (err) {
        console.error("Growth Dashboard Error:", err);
        return res.render("admin/growth", {
            title: "Growth & Acquisition",
            admin,
            leaderboard: []
        });
    }         
};