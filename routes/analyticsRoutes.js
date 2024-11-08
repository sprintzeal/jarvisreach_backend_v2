import express from 'express';

import { protect } from '../middleware/authMiddleware.js';
import { preferredPlans, getSubscriptionsContries, getTotalFreePlanUsers, getTotalPaidPlanUsers, getTotalPayouts, getTotalSales, getTotalUnsubscriptions, testAPi, topSellingPlans } from '../controllers/analyticsController.js';

const router = express.Router();


router.get('/getTotalSales', protect, getTotalSales);
router.get('/getTotalPayouts', protect, getTotalPayouts);
router.get('/getTotalFreePlanUsers', protect, getTotalFreePlanUsers);
router.get('/getTotalPaidPlanUsers', protect, getTotalPaidPlanUsers);
router.get('/preferredPlans', protect, preferredPlans);
router.get('/topPlans', protect, topSellingPlans);
router.get('/locations', protect, getSubscriptionsContries);
router.get('/unsubscriptions', protect, getTotalUnsubscriptions);
router.get('/test', testAPi);



export default router;  
