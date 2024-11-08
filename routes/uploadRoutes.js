import express from 'express';
import { uploadFilesToDrive, uploadFilesToLocal } from "../controllers/uploadsController.js";
import multer from 'multer';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post('/drive/upload', protect, upload.array("files"), uploadFilesToDrive);

// store/upload the assets locally
router.post('/local/upload', protect, uploadFilesToLocal);

export default router;