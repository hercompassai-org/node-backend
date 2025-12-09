import crypto from 'crypto';
import PartnerInvite from '../models/PartnerInvite.js';
import User from '../models/User.js';
import { transporter } from "../utils/mailTransporter.js";
import PartnerShare from "../models/PartnerShare.js";



export const createPartnerInvite = async (inviter_id, partner_email) => {
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await PartnerInvite.create({
        inviter_id,
        partner_email,
        token,
        expires_at: expiresAt,
        status: "pending"
    });

    try {
        const acceptUrl = `${process.env.APP_URL}/accepted?token=${token}`;

        const html = `
            <p>You have been invited to join HerCompass as a partner.</p>
            <p><a href="${acceptUrl}">Click here to accept the invitation</a></p>
            <p>If the button does not work, copy this link:</p>
            <p>${acceptUrl}</p>
        `;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: partner_email,
            subject: "HerCompass Partner Invitation",
            html,
        });

    } catch (err) {
        console.error("❌ Invite email failed:", err.message);
    }

    return invite;
};


export const validateInviteToken = async (req, res) => {
    try {
        const { token } = req.params;
        const invite = await PartnerInvite.findOne({ where: { token } });

        if (!invite)
            return res.status(404).json({ valid: false, message: "Invalid token" });

        if (new Date(invite.expires_at) < new Date())
            return res.status(400).json({ valid: false, message: "Token expired" });

        // Fetch inviter details
        const inviter = await User.findByPk(invite.inviter_id, {
            attributes: ["id", "full_name", "email"]
        });

        return res.json({
            valid: true,
            inviter: inviter ? {
                id: inviter.id,
                full_name: inviter.full_name,
                email: inviter.email
            } : null,
            partner_email: invite.partner_email,
        });
    } catch (err) {
        console.error("validateInviteToken error:", err);
        res.status(500).json({ valid: false, message: "Server error" });
    }
};

// ------------------------
// ACCEPT INVITE
// ------------------------
export const acceptInvite = async (req, res) => {
    try {
        const { token, password, full_name } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: "token and password required",
            });
        }

        const invite = await PartnerInvite.findOne({ where: { token } });
        if (!invite)
            return res.status(400).json({ success: false, message: "Invalid invite" });

        if (new Date(invite.expires_at) < new Date())
            return res.status(400).json({ success: false, message: "Invite expired" });

        // Get or create partner user
        let partnerUser = await User.findOne({
            where: { email: invite.partner_email },
        });

        if (!partnerUser) {
            partnerUser = await User.create({
                full_name: full_name || invite.partner_email.split("@")[0],
                email: invite.partner_email,
                password,
                role: "partner",
            });
        }

        const inviter = await User.findByPk(invite.inviter_id);

        if (inviter) {
            inviter.partner_id = partnerUser.id;
            inviter.partner_consent = true;
            await inviter.save();

            partnerUser.partner_id = inviter.id;
            await partnerUser.save();
        }

        // Find or create partner share
        let partnerShare = await PartnerShare.findOne({
            where: {
                user_id: inviter.id,
                partner_id: partnerUser.id
            }
        });

        if (!partnerShare) {
            partnerShare = await PartnerShare.create({
                id: crypto.randomUUID(),
                user_id: inviter.id,
                partner_id: partnerUser.id,
                consent: true,
                shared_fields: []
            });
        }

        invite.status = "accepted";
        await invite.save();

        return res.json({
            success: true,
            message: "Partner account created and linked",
            partner: partnerUser,
            partnerShareId: partnerShare.id,
        });

    } catch (err) {
        console.error("acceptInvite error:", err);
        res.status(500).json({
            success: false,
            message: "Server error accepting invite",
        });
    }
};

