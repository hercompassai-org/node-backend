// src/jobs/digestJob.js
import { Op } from "sequelize";
import SymptomLog from "../models/SymptomLog.js";
import PredictiveLog from "../models/PredictiveLog.js";
import PartnerShare from "../models/PartnerShare.js";
import DigestLog from "../models/DigestLog.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import { transporter } from "../utils/mailTransporter.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Build summary for last 7 days
 */
const buildSummaryForUser = async (userId) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const logs = await SymptomLog.findAll({
    where: {
      user_id: userId,
      log_date: { [Op.gte]: since }
    },
    order: [["log_date", "ASC"]]
  });

  const moods = logs.map(l => Number(l.mood)).filter(Boolean);
  const avgMood = moods.length
    ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(2)
    : null;

  const notes = logs.slice(-3).map(l => l.notes).filter(Boolean);

  const latestPredict = await PredictiveLog.findOne({
    where: { user_id: userId },
    order: [["created_at", "DESC"]]
  });

  return {
    period: { from: since.toISOString(), to: new Date().toISOString() },
    avg_mood: avgMood,
    recent_notes: notes,
    predictive_snapshot: latestPredict?.predicted_symptoms || null,
    logs_count: logs.length
  };
};


/**
 * runDigestForUser
 */
export const runDigestForUser = async (
  userId,
  partnerId,
  sharedFields = [],
  opts = { preview: true }
) => {

  const share = await PartnerShare.findOne({
    where: { user_id: userId, partner_id: partnerId }
  });

  if (!share || !share.consent) {
    throw new Error("No consent for this partner");
  }

  const summary = await buildSummaryForUser(userId);

  let emailHtml = `
<div style="font-family: 'Segoe UI', sans-serif; max-width: 640px; margin: auto; background: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #eee;">

    <!-- Header -->
    <div style="text-align: center; padding-bottom: 10px; border-bottom: 2px solid #e7d0ff;">
        <h2 style="color: #6b2fa0; margin: 0;">HerCompass — Weekly Digest</h2>
        <p style="color: #555; margin-top: 6px;">
            <strong>Period:</strong> ${summary.period.from.slice(0, 10)} → ${summary.period.to.slice(0, 10)}
        </p>
    </div>
`;

  if (sharedFields.includes("mood_trend")) {
    emailHtml += `
    <div style="margin-top: 20px; padding: 15px; background: #faf5ff; border-radius: 10px;">
        <h3 style="color: #6b2fa0; margin: 0;">💜 Mood Trends</h3>
        <p style="font-size: 15px; margin-top: 8px;">
            <strong>Average Mood:</strong> ${summary.avg_mood ?? "N/A"}
        </p>
    </div>
`;
  }

  if (sharedFields.includes("notes") && summary.recent_notes?.length) {
    emailHtml += `
    <div style="margin-top: 20px; padding: 15px; background: #fff7e6; border-radius: 10px;">
        <h3 style="color: #a36300; margin: 0;">📝 Recent Note</h3>
        <p style="font-size: 15px; margin-top: 8px; font-style: italic; color: #333;">
            "${summary.recent_notes[0]}"
        </p>
    </div>
`;
  }

  if (sharedFields.includes("ai_prediction") && summary.predictive_snapshot) {
    emailHtml += `
    <div style="margin-top: 20px; padding: 15px; background: #eaf7ff; border-radius: 10px;">
        <h3 style="color: #005a8d; margin: 0;">🤖 AI Prediction Snapshot</h3>
        <pre style="background: #ffffff; padding: 10px; border-radius: 8px; border: 1px solid #cce7ff; font-size: 14px; margin-top: 8px;">
${JSON.stringify(summary.predictive_snapshot, null, 2)}
        </pre>
    </div>
`;
  }

  emailHtml += `
    <div style="margin-top: 25px; padding: 20px; background: #fdf1f7; border-radius: 10px; border: 1px solid #ffd4e5;">
        <h3 style="color: #b30059; margin: 0;">🌸 Recommended Actions</h3>
        <ul style="font-size: 15px; color: #444; margin-top: 10px;">
            <li>Maintain consistent sleep routine</li>
            <li>Light afternoon walk improves energy</li>
        </ul>
    </div>

    <p style="text-align: center; margin-top: 30px; color: #888; font-size: 13px;">
        HerCompass • Supporting your wellness journey 💜
    </p>

</div>
`;

  // PREVIEW MODE
  if (opts.preview) {
    return {
      summary: {
        ...summary,
        // Return only allowed fields
        avg_mood: sharedFields.includes("mood_trend") ? summary.avg_mood : null,
        recent_notes: sharedFields.includes("notes") ? summary.recent_notes : [],
        predictive_snapshot: sharedFields.includes("ai_prediction") ? summary.predictive_snapshot : null
      },
      emailHtml
    };
  }

  // SEND MODE
  const digestId = uuidv4();

  const digestEntry = await DigestLog.create({
    id: digestId,
    user_id: userId,
    partner_id: partnerId,
    digest_type: "weekly",
    fields_shared: sharedFields,
    sent_at: new Date()
  });

  const partner = await User.findByPk(partnerId);

  if (!partner || !partner.email) throw new Error("Partner email missing");

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: partner.email,
      subject: "HerCompass Weekly Digest",
      html: emailHtml
    });

    await AuditLog.create({
      actor_id: userId,
      action: "digest_sent",
      target_table: "digest_logs",
      target_id: digestEntry.id,
      ip_address: "0.0.0.0"
    });

    return { success: true, digestId, info };

  } catch (err) {
    await AuditLog.create({
      actor_id: userId,
      action: "digest_send_failed",
      target_table: "digest_logs",
      target_id: digestEntry.id,
      ip_address: "0.0.0.0"
    });
    throw err;
  }
};


/**
 * Weekly Cron
 */
export const runWeeklyDigestForAllUsers = async () => {
  const shares = await PartnerShare.findAll({ where: { consent: true } });

  const results = [];

  for (const s of shares) {
    try {
      const result = await runDigestForUser(
        s.user_id,
        s.partner_id,
        s.shared_fields,
        { preview: false }
      );

      results.push({ share: s.id, ok: true, result });

    } catch (err) {
      results.push({ share: s.id, ok: false, error: err.message });
    }
  }

  return results;
};

export default runDigestForUser;
