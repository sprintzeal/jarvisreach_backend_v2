import express from "express"

import { protect } from "../middleware/authMiddleware.js";
import { emailVerification, extractPattrens, getCompaniesInfo, testdata } from "../controllers/linkedinController.js";

const router = express.Router();

router.post('/company-details', protect, getCompaniesInfo);
router.post('/test-compnay-details', protect, testdata);
router.post('/email-verification', protect, emailVerification);
router.post('/extract-pattrens', extractPattrens);


export default router;

