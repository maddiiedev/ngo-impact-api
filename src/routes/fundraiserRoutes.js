import { Router } from 'express';

import { protect } from '../middleware/auth.js';
import { uploadReceipt } from '../middleware/upload.js';
import {
  createFundraiser,
  listFundraisers,
  listMyFundraisers,
  getFundraiser,
  updateFundraiser,
  deleteFundraiser,
} from '../controllers/fundraiserController.js';
import {
  createDonation,
  listPublicDonations,
} from '../controllers/donationController.js';
import { donationUploadLimiter } from '../middleware/rateLimiters.js';

// "/mine" must come before "/:id"
const router = Router();

router.get('/mine', protect, listMyFundraisers);

// Public fundraiser reads
router.get('/', listFundraisers);
router.get('/:id', getFundraiser);
router.get('/:id/donations', listPublicDonations('fundraiser'));

// Create and manage fundraisers
router.post('/', protect, createFundraiser);
router.patch('/:id', protect, updateFundraiser);
router.delete('/:id', protect, deleteFundraiser);

// Donation upload: authenticate, rate-limit, then process the receipt
router.post(
  '/:id/donations',
  protect,
  donationUploadLimiter,
  uploadReceipt,
  createDonation('fundraiser')
);

export default router;