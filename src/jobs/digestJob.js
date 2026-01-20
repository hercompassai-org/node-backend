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

const buildSummaryForUser = async (userId) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const logs = await SymptomLog.findAll({
    where: {
      user_id: userId,
      log_date: { [Op.gte]: since },
    },
    order: [["log_date", "ASC"]],
  });

  const moods = logs.map((l) => Number(l.mood)).filter(Boolean);
  const avgMood = moods.length
    ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(2)
    : null;

  const latestPredict = await PredictiveLog.findOne({
    where: { user_id: userId },
    order: [["created_at", "DESC"]],
  });

  return {
    period: { from: since.toISOString(), to: new Date().toISOString() },
    avg_mood: avgMood,
    logs_count: logs.length,
    recent_notes: logs.slice(-3).map((l) => l.notes).filter(Boolean),
    predictive_snapshot: latestPredict?.predicted_symptoms || null,
  };
};

const buildPartnerDigestFromPrediction = (prediction) => {
  if (!prediction) return null;

  return {
    partner_summary:
      prediction.partner_summary ||
      "This week is about balance, patience, and gentle support.",

    couple_challenge: prediction?.movement?.couple_mode?.challenge || null,

    mens_module: prediction?.mens_support?.recommended_module || null,
  };
};

export const runDigestForUser = async (
  userId,
  partnerId,
  sharedFields = [],
  opts = { preview: true }
) => {
  const share = await PartnerShare.findOne({
    where: { user_id: userId, partner_id: partnerId },
  });

  if (!share || !share.consent) {
    throw new Error("No consent for this partner");
  }

  const summary = await buildSummaryForUser(userId);
  const partnerDigest = buildPartnerDigestFromPrediction(
    summary.predictive_snapshot
  );

  let emailHtml = `
    <h2>HerCompass — Weekly Digest</h2>
    <p><strong>Period:</strong>
      ${summary.period.from.slice(0, 10)} → ${summary.period.to.slice(0, 10)}
    </p>
  `;

  if (sharedFields.includes("mood_trend")) {
    emailHtml += `<p><strong>Average Mood:</strong> ${summary.avg_mood || "N/A"}</p>`;
  }

  if (sharedFields.includes("notes") && summary.recent_notes.length) {
    emailHtml += `<p><strong>Recent Note:</strong> "${summary.recent_notes[0]}"</p>`;
  }

  if (partnerDigest?.partner_summary) {
    emailHtml += `
      <hr/>
      <h4>This Week</h4>
      <p>${partnerDigest.partner_summary}</p>
    `;
  }

  if (partnerDigest?.couple_challenge) {
    emailHtml += `
      <p><strong>Try together:</strong> ${partnerDigest.couple_challenge}</p>
    `;
  }

  if (partnerDigest?.mens_module) {
    emailHtml += `
      <h4>Men’s Academy</h4>
      <p>
        ${partnerDigest.mens_module.title}
        (${partnerDigest.mens_module.duration})
      </p>
    `;
  }

  if (opts.preview) {
    return {
      emailHtml,
    };
  }

  const digestId = uuidv4();

  await DigestLog.create({
    id: digestId,
    user_id: userId,
    partner_id: partnerId,
    digest_type: "weekly",
    fields_shared: sharedFields,
    sent_at: new Date(),
  });

  const partner = await User.findByPk(partnerId);
  if (!partner?.email) throw new Error("Partner email missing");

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: partner.email,
    subject: "HerCompass Weekly Digest",
    html: emailHtml,
  });

  await AuditLog.create({
    actor_id: userId,
    action: "digest_sent",
    target_table: "digest_logs",
    target_id: digestId,
  });

  return { success: true, digestId };
};

export const runWeeklyDigestForAllUsers = async () => {
  const shares = await PartnerShare.findAll({ where: { consent: true } });

  for (const s of shares) {
    await runDigestForUser(
      s.user_id,
      s.partner_id,
      s.shared_fields,
      { preview: false }
    );
  }
};

export default runDigestForUser;
