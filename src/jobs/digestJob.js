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
 * Helper: call OpenAI for digest generation
 */
const callOpenAI = async (messages) => {
  const API_KEY = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1";
  if (!API_KEY) throw new Error("OPENAI_API_KEY missing");

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

  const resp = await axios.post(url, payload, { headers, timeout: 20000 });
  return resp.data;
};

/**
 * Build summary for last 7 days
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
  const avgMood = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(2) : null;

  const notes = logs.slice(-3).map((l) => l.notes).filter(Boolean);

  const latestPredict = await PredictiveLog.findOne({
    where: { user_id: userId },
    order: [["created_at", "DESC"]],
  });

  return {
    period: { from: since.toISOString(), to: new Date().toISOString() },
    avg_mood: avgMood,
    recent_notes: notes,
    predictive_snapshot: latestPredict?.predicted_symptoms || null,
    logs_count: logs.length,
    recent_logs: logs.slice(-6).map((l) => ({
      date: l.log_date,
      mood: l.mood,
      sleep_hours: l.sleep_hours,
      energy_level: l.energy_level,
      symptoms: l.symptoms,
      notes: l.notes,
    })),
  };
};

/**
 * Use OpenAI to build partner-friendly digest (JSON)
 * returns object: { partner_summary, academy_lesson, do_dont, partner_one_liner }
 */
const generatePartnerDigest = async (user, summary) => {
  const system = {
    role: "system",
    content:
      "You are a compassionate assistant that converts weekly user data into a short partner-friendly summary, a 1-paragraph Men’s Academy lesson, a 3-item do/don't list, and an encouraging one-liner. Return only JSON.",
  };

  const userMsg = {
    role: "user",
    content: `USER: ${JSON.stringify({ id: user.id, age: user.age, menopause_phase: user.menopause_phase })}
WEEK_SUMMARY: ${JSON.stringify(summary)}
Return JSON with keys: partner_summary, academy_lesson, do_dont (array of strings), partner_one_liner. Keep it short and practical.`,
  };

  try {
    const aiResp = await callOpenAI([system, userMsg], 700, 0.2);
    const assistantText = aiResp.choices?.[0]?.message?.content;
    if (!assistantText) throw new Error("Empty AI response");
    let jsonText = assistantText.trim();
    if (jsonText.startsWith("```")) {
      const parts = jsonText.split("```");
      jsonText = parts.filter(Boolean).slice(-1)[0] || jsonText;
    }
    const first = jsonText.indexOf("{");
    const last = jsonText.lastIndexOf("}");
    if (first >= 0 && last > first) jsonText = jsonText.slice(first, last + 1);
    const parsed = JSON.parse(jsonText);
    return parsed;
  } catch (err) {
    console.warn("Partner digest AI failed:", err.message || err);
    return {
      partner_summary: summary.recent_notes?.length
        ? `Mood lower this week. Key symptom: ${summary.recent_logs?.[summary.recent_logs.length - 1]?.symptoms || "reported symptoms"}.`
        : "No significant updates this week.",
      academy_lesson: "Short, consistent routines (sleep window, light evening activity) help.",
      do_dont: [
        "Do: Encourage calm evening activities",
        "Don't: Bring up stressful topics late at night",
        "Do: Help with nutritious dinners",
      ],
      partner_one_liner: "A little calm support this week can really help.",
    };
  }
};

/**
 * runDigestForUser - builds summary, optionally calls AI, sends or previews digest
 */
export const runDigestForUser = async (userId, partnerId, sharedFields = [], opts = { preview: true }) => {
  // check consent
  const share = await PartnerShare.findOne({ where: { user_id: userId, partner_id: partnerId } });
  if (!share || !share.consent) {
    throw new Error("No consent for this partner");
  }

  const user = await User.findByPk(userId);
  const summary = await buildSummaryForUser(userId);

  // attempt to generate partner-friendly digest via AI
  let aiDigest = null;
  try {
    aiDigest = await generatePartnerDigest(user, summary);
  } catch (err) {
    console.warn("generatePartnerDigest failed:", err.message || err);
    aiDigest = null;
  }

  // build html (simple)
  let emailHtml = `
    <h3>HerCompass — Weekly Digest</h3>
    <p>Period: ${summary.period.from.slice(0, 10)} → ${summary.period.to.slice(0, 10)}</p>
  `;

  if (sharedFields.includes("mood_trend")) {
    emailHtml += `<p><strong>Average Mood:</strong> ${summary.avg_mood ?? "N/A"}</p>`;
  }

  if (sharedFields.includes("notes") && summary.recent_notes?.length) {
    emailHtml += `<p><strong>Recent Note:</strong> "${summary.recent_notes[0]}"</p>`;
  }

  if (sharedFields.includes("ai_prediction") && summary.predictive_snapshot) {
    emailHtml += `<h4>AI Prediction Snapshot</h4><pre>${JSON.stringify(summary.predictive_snapshot, null, 2)}</pre>`;
  }

  // insert AI partner-friendly sections if available
  if (aiDigest) {
    if (sharedFields.includes("partner_summary") || sharedFields.length === 0) {
      emailHtml += `<hr/><h4>Partner Summary</h4><p>${aiDigest.partner_summary}</p>`;
    }
    if (sharedFields.includes("academy_lesson")) {
      emailHtml += `<h4>Men's Academy — Quick Lesson</h4><p>${aiDigest.academy_lesson}</p>`;
    }
    if (sharedFields.includes("do_dont")) {
      emailHtml += `<h4>Do / Don't</h4><ul>${(aiDigest.do_dont || []).map((d) => `<li>${d}</li>`).join("")}</ul>`;
    }
  }

  emailHtml += `
    <hr/>
    <p><strong>Recommended Actions (generic):</strong></p>
    <ul>
      <li>Maintain consistent sleep routine</li>
      <li>Short afternoon walks to boost energy</li>
    </ul>
  `;

  // preview -> return JSON and html
  if (opts.preview) {
    return {
      summary: {
        ...summary,
        avg_mood: sharedFields.includes("mood_trend") ? summary.avg_mood : null,
        recent_notes: sharedFields.includes("notes") ? summary.recent_notes : [],
        predictive_snapshot: sharedFields.includes("ai_prediction") ? summary.predictive_snapshot : null,
        partner_digest: aiDigest ? aiDigest.partner_summary : null,
        academy_lesson: aiDigest ? aiDigest.academy_lesson : null,
        do_dont: aiDigest ? aiDigest.do_dont : [],
      },
      emailHtml,
    };
  }

  // SEND MODE: persist digest and email
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
  if (!partner || !partner.email) throw new Error("Partner email missing");

  try {
    const info = await transporter.sendMail({
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
      ip_address: "0.0.0.0",
    });

    return { success: true, digestId, info };
  } catch (err) {
    await AuditLog.create({
      actor_id: userId,
      action: "digest_send_failed",
      target_table: "digest_logs",
      target_id: digestEntry.id,
      ip_address: "0.0.0.0",
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
      const result = await runDigestForUser(s.user_id, s.partner_id, s.shared_fields, { preview: false });
      results.push({ share: s.id, ok: true, result });
    } catch (err) {
      results.push({ share: s.id, ok: false, error: err.message });
    }
  }
  return results;
};

export default runDigestForUser;
