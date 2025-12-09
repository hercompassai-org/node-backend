
import sequelize from "../config/db.js";
import { QueryTypes } from "sequelize";

export const renderEngagement = async (req, res) => {
    const admin = req.session.admin;
    if (!admin) return res.redirect("/login");

    try {

        const [heatmapData] = await sequelize.query(
            `SELECT
                TO_CHAR(logged_at, 'Dy') AS weekday,
                EXTRACT(HOUR FROM logged_at) AS hour,
                COUNT(*) AS login_count
            FROM user_login_logs
            GROUP BY weekday, hour
            ORDER BY weekday, hour;
            `
        );

        const [streak] = await sequelize.query(
            `WITH daily_logins AS (
                    SELECT DISTINCT 
                        user_id, 
                        DATE(logged_at) AS login_day
                    FROM user_login_logs
                ),

                ordered AS (
                    SELECT
                        user_id,
                        login_day,
                        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_day) AS rn
                    FROM daily_logins
                ),

                groups AS (
                    SELECT
                        user_id,
                        login_day,
                        login_day - (rn * INTERVAL '1 day') AS grp
                    FROM ordered
                ),

                streaks AS (
                    SELECT
                        user_id,
                        COUNT(*) AS streak_length
                    FROM groups
                    GROUP BY user_id, grp
                )

                SELECT
                    COUNT(*) FILTER (WHERE streak_length >= 3)  AS total_streak_3_day,
                    COUNT(*) FILTER (WHERE streak_length >= 7)  AS total_streak_7_day,
                    COUNT(*) FILTER (WHERE streak_length >= 14) AS total_streak_14_day,
                    COUNT(*) FILTER (WHERE streak_length >= 30) AS total_streak_30_day
                FROM streaks;
                `,
            { type: QueryTypes.SELECT }
        );

        const [chorts] = await sequelize.query(
            `WITH first_login AS (
                -- Each user's cohort is their first login week
                SELECT
                    user_id,
                    DATE_TRUNC('week', MIN(logged_at)) AS cohort_week
                FROM user_login_logs
                GROUP BY user_id
            ),

            activity AS (
                -- Weekly activity per user
                SELECT
                    user_id,
                    DATE_TRUNC('week', logged_at) AS activity_week
                FROM user_login_logs
                GROUP BY user_id, DATE_TRUNC('week', logged_at)
            ),

            cohort_activity AS (
                -- Weeks since cohort start (week_offset)
                SELECT
                    f.cohort_week,
                    a.user_id,
                    a.activity_week,
                    FLOOR(EXTRACT(EPOCH FROM (a.activity_week - f.cohort_week)) / 604800) AS week_offset
                    -- 604800 seconds = 1 week
                FROM first_login f
                JOIN activity a USING (user_id)
            ),

            retention AS (
                -- Count users retained each week offset
                SELECT
                    cohort_week,
                    week_offset,
                    COUNT(DISTINCT user_id) AS retained_users
                FROM cohort_activity
                GROUP BY cohort_week, week_offset
            ),

            cohort_sizes AS (
                -- Size of each weekly cohort
                SELECT
                    cohort_week,
                    COUNT(*) AS cohort_size
                FROM first_login
                GROUP BY cohort_week
            ),

            ltv AS (
                -- LTV = total logins grouped by week offset
                SELECT
                    f.cohort_week,
                    FLOOR(EXTRACT(EPOCH FROM (l.logged_at - f.cohort_week)) / 604800) AS week_offset,
                    COUNT(*) AS login_count
                FROM user_login_logs l
                JOIN first_login f USING (user_id)
                GROUP BY f.cohort_week, week_offset
            ),

            final AS (
                SELECT
                    r.cohort_week,
                    r.week_offset,
                    ROUND((r.retained_users::decimal / c.cohort_size) * 100, 2) AS retention_percent,
                    COALESCE(l.login_count, 0) AS ltv
                FROM retention r
                JOIN cohort_sizes c USING (cohort_week)
                LEFT JOIN ltv l ON r.cohort_week = l.cohort_week
                            AND r.week_offset = l.week_offset
                ORDER BY r.cohort_week, r.week_offset
            )

            SELECT 
                ARRAY_AGG(week_offset ORDER BY week_offset) AS categories,
                ARRAY_AGG(retention_percent ORDER BY week_offset) AS retention_series,
                ARRAY_AGG(ltv ORDER BY week_offset) AS ltv_series
            FROM final;
            `,
            { type: QueryTypes.SELECT }
        )

        res.render("admin/engagement", {
            title: "Dashboard",
            admin,
            stats: {
                heatmapData: heatmapData,
                streak: streak,
                chorts: chorts,
            },
        });
    } catch (error) {
        console.error("❌ Dashboard Error:", error.message);
        console.error(error.stack);
        res.status(500).json({ message: "Dashboard query failed", error: error.message });
    }

};
