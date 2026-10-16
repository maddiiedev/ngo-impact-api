
import { Router } from 'express';

import { protect } from '../middleware/auth.js';
import {
  listCampaigns,
  getCampaign,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
} from '../controllers/campaignController.js';
import { uploadReceipt } from '../middleware/upload.js';
import {
  createDonation,
  listPublicDonations,
} from '../controllers/donationController.js';
import { donationUploadLimiter } from '../middleware/rateLimiters.js';

const router = Router();

// Public campaign reads
router.get('/', listCampaigns);
router.get('/:id', getCampaign);

// Campaign management; ownership is checked in the controller
router.patch('/:id', protect, updateCampaign);
router.patch('/:id/status', protect, updateCampaignStatus);
router.delete('/:id', protect, deleteCampaign);

// Public list of confirmed campaign donations
router.get('/:id/donations', listPublicDonations('campaign'));

// Donation upload: authenticate, rate-limit, then process the receipt
router.post(
  '/:id/donations',
  protect,
  donationUploadLimiter,
  uploadReceipt,
  createDonation('campaign')
);

export default router;