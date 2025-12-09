// src/controllers/userConsentController.js
import PartnerShare from "../models/PartnerShare.js";
import Consent from "../models/Consent.js";
import DigestLog from "../models/DigestLog.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import { runDigestForUser } from "../jobs/digestJob.js";

export const getMyPartnerShares = async (req, res) => {
  try {
    const userId = req.user.id;
    const shares = await PartnerShare.findAll({ where: { user_id: userId } });
    return res.json({ success: true, data: shares });
  } catch (err) {
    console.error("getMyPartnerShares:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateSharedFields = async (req, res) => {
  try {
    const userId = req.user.id;
    const { partner_share_id, shared_fields } = req.body;
    const share = await PartnerShare.findOne({ where: { id: partner_share_id, user_id: userId } });
    if (!share) return res.status(404).json({ success: false, message: "Not found" });

    share.shared_fields = shared_fields;
    share.last_shared = new Date();
    await share.save();

    await AuditLog.create({ user_id: userId, actor_id: userId, action: "update_shared_fields", details: { partner_share_id, shared_fields }});

    return res.json({ success: true, message: "Shared fields updated", data: share });
  } catch (err) {
    console.error("updateSharedFields:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const triggerDigestPreview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { partner_share_id, send } = req.body;

    const share = await PartnerShare.findOne({
      where: { id: partner_share_id, user_id: userId }
    });

    if (!share) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    // Ensure array
    const sharedFields = Array.isArray(share.shared_fields)
      ? share.shared_fields
      : [];

    // Always preview
    const preview = await runDigestForUser(
      userId,
      share.partner_id,
      sharedFields,
      { preview: true }
    );

    // Send if requested
    if (send) {
      await runDigestForUser(
        userId,
        share.partner_id,
        sharedFields,
        { preview: false }
      );
    }

    return res.json({ success: true, preview });

  } catch (err) {
    console.error("triggerDigestPreview:", err);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};
