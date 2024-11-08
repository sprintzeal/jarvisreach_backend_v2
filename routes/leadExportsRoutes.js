import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { createLeadExportOfFolder, downloadExportFile, getAllLeadExports, getExportSettings, importLeadsDataFromFile } from "../controllers/leadExportsImportsController.js";
import multer from "multer";
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', protect, getAllLeadExports);
router.get('/exports-settings', protect, getExportSettings);
router.post('/create-export', protect, createLeadExportOfFolder);
router.post('/import-leads', protect,upload.array('files'), importLeadsDataFromFile);
router.post('/download-export/', protect, downloadExportFile);

export default router;

