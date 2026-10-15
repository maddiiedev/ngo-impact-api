import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { getMe } from "../controllers/authController.js";
import { updateProfile, changePassword, deactivateAccount } from "../controllers/accountController.js";
import { accountSecurityLimiter } from "../middleware/rateLimiters.js";

const router = Router();

router.use(protect);

router.get("/", getMe);
router.patch("/", updateProfile);
router.patch("/password", changePassword);
router.post("/deactivate", deactivateAccount);
router.patch("/password", accountSecurityLimiter, changePassword);
router.post("/deactivate", accountSecurityLimiter, deactivateAccount);

export default router;