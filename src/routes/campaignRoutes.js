import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  listCampaigns,
  getCampaign,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
} from "../controllers/campaignController.js";

const router = Router();

// Public read routes
router.get("/", listCampaigns);
router.get("/:id", getCampaign);

// Protected write routes (ownership is checked inside the controller)
router.patch("/:id", protect, updateCampaign);
router.patch("/:id/status", protect, updateCampaignStatus);
router.delete("/:id", protect, deleteCampaign);

export default router;
