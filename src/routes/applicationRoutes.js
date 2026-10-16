import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  listMyApplications, getApplication, acceptApplication, rejectApplication, withdrawApplication,
} from "../controllers/applicationController.js";

const router = Router();

router.use(protect);

// "/mine" must come before "/:id", or "mine" is treated as an ID
router.get("/mine", listMyApplications);
router.get("/:id", getApplication);
router.patch("/:id/accept", acceptApplication);
router.patch("/:id/reject", rejectApplication);
router.patch("/:id/withdraw", withdrawApplication);

export default router;