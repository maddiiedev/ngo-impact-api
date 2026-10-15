import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  listCampaigns,
  getCampaign,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
} from "../controllers/campaignController.js";
import { uploadReceipt } from "../middleware/upload.js";
import { createDonation, listPublicDonations } from "../controllers/donationController.js";
import { donationUploadLimiter } from "../middleware/rateLimiters.js";

const router = Router();

// Public read routes
router.get("/", listCampaigns);
router.get("/:id", getCampaign);

// Protected write routes (ownership is checked inside the controller)
router.patch("/:id", protect, updateCampaign);
router.patch("/:id/status", protect, updateCampaignStatus);
router.delete("/:id", protect, deleteCampaign);

router.get("/:id/donations", listPublicDonations("campaign"));
router.post("/:id/donations", protect, uploadReceipt, createDonation("campaign"));
router.post("/:id/donations", protect, donationUploadLimiter, uploadReceipt, createDonation("campaign"));

export default router;