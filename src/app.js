// src/app.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import growthRoutes from "./routes/growthRoutes.js";
import engagementRoutes from "./routes/engagementRoutes.js";
import cpstoolsRoutes from "./routes/cpstoolsRoutes.js";
import videosRoutes from "./routes/videosRoutes.js";
import symptomLogRoutes from "./routes/symptomLogRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import partnerRoutes from './routes/partnerRoutes.js';
import consentRoutes from "./routes/consentRoutes.js";
import userDashboardRoutes from "./routes/userDashboardRoutes.js";



const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://progressive-hercompass.vercel.app"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    exposedHeaders: ["Content-Length"],
    credentials: true,
  })
);


app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

// Static files and view engine
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Simple pages
app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.render("login", { title: "Login" });
});

app.get("/admins", (req, res) => {
  const admin = req.session.admin;
  if (!admin) return res.redirect("/login");
  res.render("admin/admins", { title: "Admins", admin });
});

app.get("/users", (req, res) => {
  const admin = req.session.admin;
  if (!admin) return res.redirect("/login");
  res.render("admin/users", { title: "Users", admin });
});

app.get("/add-user", (req, res) => {
  res.render("admin/add-user", { title: "Add User", admin: req.session.admin || null });
});

app.get("/aimodels", (req, res) => {
  const admin = req.session.admin;
  if (!admin) return res.redirect("/login");
  res.render("admin/aimodels", { title: "Dashboard", admin });
});


// API / feature routes
app.use("/api/users", userRoutes);

app.use("/api/users/dashboard", userDashboardRoutes);

app.use("/api/admins", adminRoutes);

app.use("/dashboard", dashboardRoutes);
app.use("/growth", growthRoutes);
app.use("/engagement", engagementRoutes);
app.use("/cpstools", cpstoolsRoutes);
app.use("/videos", videosRoutes);
app.use("/api/logs", symptomLogRoutes);
app.use("/api/ai", aiRoutes);
app.use('/api/partner', partnerRoutes);
app.use("/api/consent", consentRoutes);


app.use('/uploads', express.static('uploads'));
export default app;
