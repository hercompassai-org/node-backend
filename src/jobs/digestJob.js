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
import axios from "axios";

/**
 * -------------------------------------------------------
 *  Helper: call OpenAI (auto-detect model)
 * -------------------------------------------------------
 */
const callOpenAI = async (messages) => {
  const API_KEY = process.env.OPENAI_API_KEY;
  const model = "gpt-5.1-mini";

  if (!API_KEY) throw new Error("❌ OPENAI_API_KEY missing");

  const url = "https://api.openai.com/v1/chat/completions";

  const payload = {
    model,
    messages,
    n: 1,
  };

  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };

  const resp = await axios.post(url, payload, { headers, timeout: 25000 });
  return resp.data;
};

/**
 * -------------------------------------------------------
 *  Build 7-day summary for a user
 * -------------------------------------------------------
 */
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
  const avgMood =
    moods.length ?
    (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(2)
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
    recent_logs: logs.slice(-6).map((l) => ({
      date: l.log_date,
      mood: l.mood,
      energy_level: l.energy_level,
      sleep_hours: l.sleep_hours,
      symptoms: l.symptoms,
      notes: l.notes,
    })),
    predictive_snapshot: latestPredict?.predicted_symptoms || null,
  };
};

/**
 * -------------------------------------------------------
 *  Use OpenAI to build partner-friendly digest (JSON)
 * -------------------------------------------------------
 */
const generatePartnerDigest = async (user, summary) => {
  const system = {
    role: "system",
    content: `
You convert weekly logs into:

- partner_summary (short)
- academy_lesson (1 paragraph)
- do_dont (array of 3)
- partner_one_liner

Return ONLY JSON. No markdown.
    `,
  };

  const userMsg = {
    role: "user",
    content: JSON.stringify({
      user: {
        id: user.id,
        age: user.age,
        menopause_phase: user.menopause_phase,
      },
      week_summary: summary,
    }),
  };

  try {
    const aiResp = await callOpenAI([system, userMsg]);
    let text = aiResp.choices?.[0]?.message?.content?.trim();

    // strip accidental code fences
    if (text.startsWith("```")) {
      text = text.replace(/```json|```/g, "");
    }

    return JSON.parse(text);
  } catch (e) {
    console.warn("Digest AI failed → fallback used");

    return {
      partner_summary: "She had a mixed week. Keep things calm and supportive.",
      academy_lesson: "Hormonal shifts can change mood, sleep, and stress tolerance.",
      do_dont: [
        "Do: Offer calm support",
        "Don't: Push heavy conversations",
        "Do: Help with evening routines",
      ],
      partner_one_liner: "Small empathy = big impact this week.",
    };
  }
};

/**
 * -------------------------------------------------------
 *  MAIN ENGINE: runDigestForUser()
 * -------------------------------------------------------
 */
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
    throw new Error("❌ No consent for this partner");
  }

  const user = await User.findByPk(userId);
  const summary = await buildSummaryForUser(userId);

  let aiDigest = null;
  try {
    aiDigest = await generatePartnerDigest(user, summary);
  } catch (e) {
    aiDigest = null;
  }

  /**
   * -----------------------------
   * Build Email HTML
   * -----------------------------
   */
  let emailHtml = `
    <h2>HerCompass — Weekly Digest</h2>
    <p><strong>Period:</strong> ${summary.period.from.slice(0, 10)} → ${
    summary.period.to.slice(0, 10)
  }</p>
  `;

  if (sharedFields.includes("mood_trend")) {
    emailHtml += `<p><strong>Average Mood:</strong> ${summary.avg_mood || "N/A"}</p>`;
  }

  if (sharedFields.includes("notes") && summary.recent_notes.length) {
    emailHtml += `<p><strong>Recent Note:</strong> "${summary.recent_notes[0]}"</p>`;
  }

  if (sharedFields.includes("ai_prediction") && summary.predictive_snapshot) {
    emailHtml += `<h4>AI Symptom Prediction</h4><pre>${JSON.stringify(
      summary.predictive_snapshot,
      null,
      2
    )}</pre>`;
  }

  // AI sections
  if (aiDigest) {
    if (sharedFields.includes("partner_summary") || sharedFields.length === 0) {
      emailHtml += `<hr/><h4>Partner Summary</h4><p>${aiDigest.partner_summary}</p>`;
    }
    if (sharedFields.includes("academy_lesson")) {
      emailHtml += `<h4>Men’s Academy</h4><p>${aiDigest.academy_lesson}</p>`;
    }
    if (sharedFields.includes("do_dont")) {
      emailHtml += `<h4>Do / Don’t</h4><ul>${aiDigest.do_dont
        .map((d) => `<li>${d}</li>`)
        .join("")}</ul>`;
    }
  }

  emailHtml += `
    <hr/>
    <p><strong>General Recommendations:</strong></p>
    <ul>
      <li>Maintain a consistent sleep window</li>
      <li>Light movement in the afternoon</li>
    </ul>
  `;

  /**
   * -----------------------------
   * PREVIEW MODE
   * -----------------------------
   */
  if (opts.preview) {
    return {
      summary: {
        ...summary,
        avg_mood: sharedFields.includes("mood_trend") ? summary.avg_mood : null,
        recent_notes: sharedFields.includes("notes") ? summary.recent_notes : [],
        predictive_snapshot: sharedFields.includes("ai_prediction")
          ? summary.predictive_snapshot
          : null,
        partner_digest: aiDigest ? aiDigest.partner_summary : null,
      },
      emailHtml,
    };
  }

  /**
   * -----------------------------
   * SEND MODE
   * -----------------------------
   */
  const digestId = uuidv4();
  const digestEntry = await DigestLog.create({
    id: digestId,
    user_id: userId,
    partner_id: partnerId,
    digest_type: "weekly",
    fields_shared: sharedFields,
    sent_at: new Date(),
  });

  const partner = await User.findByPk(partnerId);
  if (!partner?.email) throw new Error("Partner missing email");

  try {
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
      target_id: digestEntry.id,
    });

    return { success: true, digestId };
  } catch (err) {
    await AuditLog.create({
      actor_id: userId,
      action: "digest_send_failed",
      target_table: "digest_logs",
      target_id: digestEntry.id,
    });
    throw err;
  }
};

/**
 * -------------------------------------------------------
 *  Weekly Cron
 * -------------------------------------------------------
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
      results.push({ share_id: s.id, ok: true, result });
    } catch (err) {
      results.push({ share_id: s.id, ok: false, error: err.message });
    }
  }

  return results;
};

export default runDigestForUser;
