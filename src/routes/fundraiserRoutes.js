// src/routes/fundraiserRoutes.js
import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { uploadReceipt } from "../middleware/upload.js";
import {
  createFundraiser,
  listFundraisers,
  listMyFundraisers,
  getFundraiser,
  updateFundraiser,
  deleteFundraiser,
} from "../controllers/fundraiserController.js";
import {
  createDonation,
  listPublicDonations,
} from "../controllers/donationController.js";
import { donationUploadLimiter } from "../middleware/rateLimiters.js";

const router = Router();

// "/mine" must come before "/:id", or "mine" is treated as an ID
router.get("/mine", protect, listMyFundraisers);

// Public read routes
router.get("/", listFundraisers);
router.get("/:id", getFundraiser);
router.get("/:id/donations", listPublicDonations("fundraiser"));

// Protected write routes
router.post("/", protect, createFundraiser);
router.post("/:id/donations", protect, uploadReceipt, createDonation("fundraiser"));
router.patch("/:id", protect, updateFundraiser);
router.delete("/:id", protect, deleteFundraiser);
router.post("/:id/donations", protect, donationUploadLimiter, uploadReceipt, createDonation("fundraiser"));

export default router;