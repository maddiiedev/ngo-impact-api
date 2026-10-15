// src/routes/index.js
import { Router } from "express";
import authRoutes from "./authRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";
import ngoRoutes from "./ngoRoutes.js";
import fundraiserRoutes from "./fundraiserRoutes.js";
import campaignRoutes from "./campaignRoutes.js";
import donationRoutes from "./donationRoutes.js";
import { getMe } from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.get("/me", protect, getMe);
router.use("/auth", authRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/ngos", ngoRoutes);
router.use("/fundraisers", fundraiserRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/donations", donationRoutes);

export default router;