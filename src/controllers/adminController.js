
import Admin from "../models/Admin.js";


// 🟢 Get all admins
export const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.findAll();
    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins,
    });
  } catch (error) {
    console.error("❌ Error fetching admins:", error.message);
    res.status(500).json({ success: false, message: "Server error while fetching admins" });
  }
};

// 🟢 Get single admin
export const getAdminById = async (req, res) => {
  try {
    const admin = await Admin.findByPk(req.params.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    res.status(200).json({ success: true, admin });
  } catch (err) {
    console.error("❌ Error fetching admin:", err.message);
    res.status(500).json({ success: false, message: "Server error while fetching admin" });
  }
};

// 🟢 Create new admin
export const createAdmin = async (req, res) => {
  try {
    const { full_name, email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const existing = await Admin.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: "Admin email already exists" });
    }

    const newAdmin = await Admin.create({ full_name, email, password, role });
    res.status(201).json({ success: true, message: "Admin created successfully", admin: newAdmin });
  } catch (error) {
    console.error("❌ Error creating admin:", error.message);
    res.status(500).json({ success: false, message: "Server error while creating admin" });
  }
};

// 🟢 Update admin
export const updateAdmin = async (req, res) => {
  try {
    const admin = await Admin.findByPk(req.params.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }

    await admin.update(req.body);
    res.status(200).json({ success: true, message: "Admin updated successfully", admin });
  } catch (err) {
    console.error("❌ Error updating admin:", err.message);
    res.status(500).json({ success: false, message: "Server error while updating admin" });
  }
};

// 🟢 Delete admin
export const deleteAdmin = async (req, res) => {
  try {
    const admin = await Admin.findByPk(req.params.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }

    await admin.destroy();
    res.status(200).json({ success: true, message: "Admin deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting admin:", err.message);
    res.status(500).json({ success: false, message: "Server error while deleting admin" });
  }
};

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ where: { email } });

    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }

    if (admin.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    req.session.admin = {
      id: admin.id,
      name: admin.full_name,
      role: admin.role,
      email: admin.email,
    };
  
    res.status(200).json({ success: true, message: "Admin login successful", admin });
  } catch (error) {
    console.error("❌ Login error:", error.message);
    res.status(500).json({ success: false, message: "Server error during admin login" });
  }
};

// 🟢 Logout admin
export const logoutAdmin = async (req, res) => {
  try {
    if (req.session && req.session.admin) {
      await Admin.update({ last_active: new Date() }, { where: { id: req.session.admin.id } });
      req.session.destroy();
    }
    res.redirect("/login");
  } catch (error) {
    console.error("❌ Logout error:", error.message);
    res.status(500).send("Error during admin logout");
  }
};

