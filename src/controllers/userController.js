// src/controllers/userController.js
import User from "../models/User.js";
import PartnerShare from "../models/PartnerShare.js";
import { Op } from "sequelize";
import sequelize from "../config/db.js";
import { QueryTypes } from "sequelize";
import { Parser } from "json2csv";
import PDFDocument from "pdfkit";
import jwt from "jsonwebtoken";
import { createPartnerInvite } from './partnerController.js';



// 🟢 Get all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error("❌ Error fetching users:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching users",
    });
  }
};

// controllers/userController.js
export const getUserById = async (req, res) => {
  const userId = req.params.id;

  try {
    // Fetch the entire user record
    const user = await User.findByPk(userId);
    console.log("Fetched user:", user?.toJSON());

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const partnerScopes = await sequelize.query(
      `
      SELECT consent, shared_fields, last_shared, partner_id
      FROM partner_shares
      WHERE user_id = :id
      LIMIT 1
      `,
      {
        replacements: { id: userId },
        type: QueryTypes.SELECT,
      }
    );

    const partnerData = partnerScopes.length ? partnerScopes[0] : null;

    const logs = await sequelize.query(
      `
      SELECT 'activity' AS type, activity_type AS label, logged_at AS date
      FROM activity_logs WHERE user_id = :id AND logged_at >= NOW() - INTERVAL '30 days'

      UNION ALL

      SELECT 'symptom', symptoms::text AS label, log_date AS date
      FROM symptom_logs WHERE user_id = :id AND log_date >= NOW() - INTERVAL '30 days'

      UNION ALL

      SELECT 'meditation', session_type AS label, completed_at AS date
      FROM meditations WHERE user_id = :id AND completed_at >= NOW() - INTERVAL '30 days'

      ORDER BY date DESC
      `,
      {
        replacements: { id: userId },
        type: QueryTypes.SELECT
      }
    );

    const forecasts = await sequelize.query(
      `
      SELECT created_at AS date, predicted_symptoms AS forecast, confidence
      FROM predictive_logs
      WHERE user_id = :id
      ORDER BY created_at DESC
      `,
      {
        replacements: { id: userId },
        type: QueryTypes.SELECT
      }
    );

    // Return everything
    res.json({ success: true, user, logs, forecasts, partner_scopes: partnerData, });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // ⭐ Find partner share (if exists)
    let partnerShare = await PartnerShare.findOne({
      where: { user_id: user.id }
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET || "supersecretkey999",
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user,
      token,

      // ⭐ Return partner_share_id so frontend can store it
      partner_share_id: partnerShare ? partnerShare.id : null
    });

  } catch (error) {
    console.error("❌ Login error:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};


export const logoutUser = async (req, res) => {
  try {
    if (req.session && req.session.user) {
      const userId = req.session.user.id;

      // 🕒 Update last_active time in DB
      await User.update(
        { last_active: new Date() },
        { where: { id: userId } }
      );

      // 🔒 Destroy session
      req.session.destroy((err) => {
        if (err) {
          console.error("❌ Session destroy error:", err);
        }
      });
    }

    // Redirect to login page
    return res.redirect("/login");
  } catch (error) {
    console.error("❌ Logout error:", error.message);
    return res.status(500).send("Error during logout");
  }
};

// 🟢 Get users with role = 'user' or 'partner'
export const getNormalUsersAndPartners = async (req, res) => {
  try {
    const users = await User.findAll();

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error("❌ Error fetching normal users and partners:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching normal users and partners",
    });
  }
};

// 🟢 Get admins and other roles (excluding 'user' & 'partner')
export const getAdminsAndOthers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: {
        role: {
          [Op.notIn]: ["user", "partner"],
        },
      },
    });

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error("❌ Error fetching admin/other users:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while fetching admin/other users",
    });
  }
};



export const createUser = async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
      gender,
      menopause_phase,
      partner_id,
      subscription_status,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "Email already exists" });
    }

    const finalPassword = password;

    const newUser = await User.create({
      full_name,
      email,
      password: finalPassword,
      gender,
      menopause_phase,
      partner_id,
      subscription_status,
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
      },
    });
  } catch (err) {
    console.error("❌ Error creating user:", err);
    res.status(500).json({
      success: false,
      message: "Server error while creating user",
    });
  }
};


export const registerWithOnboarding = async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
      phone,
      age,
      menopause_phase,
      health_concerns,
      medical_conditions,
      hormone_therapy_status,
      diet_preferences,
      allergies,
      energy_after_meal_rating,
      mood_baseline,
      emotional_goals,
      meditation_frequency,
      activity_level,
      exercise_preferences,
      weekly_exercise,
      daily_checkin_opt_in,
      preferred_recommendations,
      partner_email,
      partner_consent,
    } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({
        success: false,
        message: "Full name, email & password are required."
      });
    }

    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already exists"
      });
    }
    const newUser = await User.create({
      full_name,
      email,
      password,
      phone,
      age,
      menopause_phase: menopause_phase,
      health_concerns: health_concerns || [],
      medical_conditions: medical_conditions || null,
      hormone_therapy_status: hormone_therapy_status || null,

      diet_preferences: diet_preferences || [],
      allergies: allergies || null,
      energy_after_meal_rating: energy_after_meal_rating
        ? Number(energy_after_meal_rating)
        : null,

      mood_baseline: mood_baseline || {},
      emotional_goals: emotional_goals || [],
      meditation_frequency: meditation_frequency || null,

      activity_level: activity_level || null,
      exercise_preferences: exercise_preferences || [],
      weekly_exercise: weekly_exercise || null,

      daily_checkin_opt_in: daily_checkin_opt_in ?? true,
      preferred_recommendations: preferred_recommendations || [],
      partner_email: partner_email || null,
      partner_consent: partner_consent || false,

      role: "user",
    });

    if (partner_email && partner_consent) {
      try {
        await createPartnerInvite(newUser.id, partner_email);
      } catch (err) {
        console.error("❌ Auto-invite failed:", err.message);
      }
    }
    return res.status(201).json({
      success: true,
      message: "User registered with full onboarding successfully",
      user: newUser,
    });


  } catch (error) {
    console.error("❌ Full onboarding error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while onboarding"
    });
  }
};


export const updateUser = async (req, res) => {
  const userId = req.params.id;
  try {
    const {
      full_name,
      email,
      password,
      gender,
      role,
      menopause_phase,
      partner_id,
      subscription_status,
    } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await user.update({
      full_name: full_name ?? user.full_name,
      email: email ?? user.email,
      password: password ?? user.password,
      gender: gender ?? user.gender,
      role: role ?? user.role,
      menopause_phase: menopause_phase ?? user.menopause_phase,
      partner_id: partner_id ?? user.partner_id,
      subscription_status: subscription_status ?? user.subscription_status,
      updated_at: new Date(),
    });

    res.status(200).json({ success: true, message: "User updated successfully", user });
  } catch (err) {
    console.error("❌ Error updating user:", err.message);
    res.status(500).json({ success: false, message: "Server error while updating user" });
  }
};

export const deleteUser = async (req, res) => {
  const userId = req.params.id;
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await user.destroy();

    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting user:", err.message);
    res.status(500).json({ success: false, message: "Server error while deleting user" });
  }
};


export const exportUsers = async (req, res) => {
  try {
    const users = await User.findAll();

    if (!users.length) {
      return res.status(404).json({ success: false, message: "No users found" });
    }

    const rows = users.map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      gender: u.gender,
      menopause_phase: u.menopause_phase,
      partner_id: u.partner_id,
      subscription_status: u.subscription_status,
      last_active: u.last_active,
      created_at: u.created_at,
    }));

    const parser = new Parser();
    const csv = parser.parse(rows);

    res.header("Content-Type", "text/csv");
    res.attachment("users_export.csv");
    return res.send(csv);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ success: false, message: "Failed to export users" });
  }
};



export const exportAnonymizedReport = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) return res.status(404).send("User not found");

    const cleanName = user.full_name.replace(/\s+/g, "-");
    const filename = `${cleanName}-anonymized.pdf`;

    // Mask email
    const maskEmail = (email) => {
      const [name, domain] = email.split("@");
      return name[0] + "***@" + domain;
    };

    // Fetch logs (last 30 days)
    const logs = await sequelize.query(
      `
      SELECT 'activity' AS type, activity_type AS label, logged_at AS date
      FROM activity_logs WHERE user_id = :id AND logged_at >= NOW() - INTERVAL '30 days'

      UNION ALL

      SELECT 'symptom', symptoms::text AS label, log_date AS date
      FROM symptom_logs WHERE user_id = :id AND log_date >= NOW() - INTERVAL '30 days'

      UNION ALL

      SELECT 'meditation', session_type AS label, completed_at AS date
      FROM meditations WHERE user_id = :id AND completed_at >= NOW() - INTERVAL '30 days'
      ORDER BY date DESC
      `,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    // Create PDF
    const doc = new PDFDocument();


    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    doc.pipe(res);

    // ----- PDF CONTENT ------
    doc.fontSize(20).text("Anonymized User Report", { underline: true });
    doc.moveDown(1);

    doc.fontSize(12).text(`User Identifier: USER-${id.slice(0, 4).toUpperCase()}`);
    doc.text(`Email: ${maskEmail(user.email)}`);
    doc.text(`Role: ${user.role}`);
    doc.text(`Subscription Status: ${user.subscription_status}`);
    doc.moveDown(1);

    doc.fontSize(16).text("Engagement Summary", { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(12).text(`Logs in last 30 days: ${logs.length}`);
    doc.text(`Last Active: ${user.last_active ? user.last_active.toDateString() : "Unknown"}`);
    doc.moveDown(1);

    doc.fontSize(16).text("Recent Logs (30 Days)", { underline: true });
    doc.moveDown(0.5);

    logs.forEach((log, i) => {
      doc.fontSize(12).text(
        `${i + 1}. [${log.type.toUpperCase()}] ${log.label} — ${new Date(log.date).toDateString()}`
      );
    });

    doc.end();

  } catch (err) {
    console.error("Anonymized export error:", err);
    res.status(500).send("Failed to generate anonymized report");
  }
};


