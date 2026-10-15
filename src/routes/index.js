// src/routes/index.js
import { Router } from 'express';

import authRoutes from './authRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import ngoRoutes from './ngoRoutes.js';
import fundraiserRoutes from './fundraiserRoutes.js';
import campaignRoutes from './campaignRoutes.js';
import donationRoutes from './donationRoutes.js';
import meRoutes from './meRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/me', meRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/ngos', ngoRoutes);
router.use('/fundraisers', fundraiserRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/donations', donationRoutes);

export default router;