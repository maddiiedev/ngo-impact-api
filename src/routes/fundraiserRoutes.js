import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  createFundraiser,
  listFundraisers,
  getFundraiser,
  updateFundraiser,
  deleteFundraiser,
} from "../controllers/fundraiserController.js";

const router = Router();

// Public read routes
router.get("/", listFundraisers);
router.get("/:id", getFundraiser);

// Protected write routes
router.post("/", protect, createFundraiser);
router.patch("/:id", protect, updateFundraiser);
router.delete("/:id", protect, deleteFundraiser);

export default router;
