import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { applicationLimiter } from "../middleware/rateLimiters.js";
import {
  listOpportunities, getOpportunity, updateOpportunity, updateOpportunityStatus, deleteOpportunity,
} from "../controllers/opportunityController.js";
import { applyToOpportunity, listOpportunityApplications } from "../controllers/applicationController.js";
import { createShift, listOpportunityShifts } from "../controllers/shiftController.js";

const router = Router();

// Public
router.get("/", listOpportunities);
router.get("/:id", getOpportunity);
router.get("/:id/shifts", listOpportunityShifts);

// Logged in (managers are checked inside the controllers)
router.patch("/:id", protect, updateOpportunity);
router.patch("/:id/status", protect, updateOpportunityStatus);
router.delete("/:id", protect, deleteOpportunity);
router.post("/:id/shifts", protect, createShift);
router.post("/:id/applications", protect, applicationLimiter, applyToOpportunity);
router.get("/:id/applications", protect, listOpportunityApplications);

export default router;