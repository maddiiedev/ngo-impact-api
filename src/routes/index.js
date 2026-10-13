// src/routes/index.js
import { Router } from 'express';
import authRoutes from './authRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import { getMe } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.get('/me', protect, getMe);
router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);

// Add these as you build them:
// router.use('/ngos', ngoRoutes);
// router.use('/campaigns', campaignRoutes);
// router.use('/fundraisers', fundraiserRoutes);
// router.use('/donations', donationRoutes);

export default router;