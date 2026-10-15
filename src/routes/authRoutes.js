import { Router } from "express";
import {
  register, login, refresh, logout, forgotPassword, resetPassword,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import {
  registerLimiter, loginIpLimiter, loginEmailLimiter, refreshLimiter,
  forgotIpLimiter, forgotEmailLimiter, resetIpLimiter, resetEmailLimiter,
} from "../middleware/rateLimiters.js";

const router = Router();

router.post("/register", registerLimiter, register);
router.post("/login", loginIpLimiter, loginEmailLimiter, login);
router.post("/refresh", refreshLimiter, refresh);
router.post("/logout", protect, logout);
router.post("/forgot-password", forgotIpLimiter, forgotEmailLimiter, forgotPassword);
router.post("/reset-password", resetIpLimiter, resetEmailLimiter, resetPassword);

export default router;