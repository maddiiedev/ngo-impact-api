// src/routes/fundraiserRoutes.js
import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  createFundraiser,
  listFundraisers,
  listMyFundraisers,
  getFundraiser,
  updateFundraiser,
  deleteFundraiser,
} from "../controllers/fundraiserController.js";

const router = Router();

// Authentication
router.use('/auth', authRoutes);

// Public read routes
router.get("/", listFundraisers);
router.get("/:id", getFundraiser);

// Protected write routes
router.post("/", protect, createFundraiser);
router.patch("/:id", protect, updateFundraiser);
router.delete("/:id", protect, deleteFundraiser);

export default router;
