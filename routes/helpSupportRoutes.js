import express from 'express';

import { protect } from '../middleware/authMiddleware.js';
import {
    createHelpSupportCategory,
    deleteHelpSupportCategoriesById,
    getAllHelpSupportCategories,
    getHelpSupportCategoryById,
    updateHelpSupportCategoryById,
    createHelpSupport,
    getAllHelpSupports,
    getHelpSupportById,
    updateHelpSupportById,
    deleteHelpSupportsById,
    getAllHelpSupportsOfCategory
} from '../controllers/helpSupportController.js';

const router = express.Router();

// help support Category Routes
router.post('/categories', protect, createHelpSupportCategory);
router.get('/categories', getAllHelpSupportCategories);
router.get('/categories/:id', getHelpSupportCategoryById)
router.put('/categories/:id', protect, updateHelpSupportCategoryById);
router.delete('/categories', protect, deleteHelpSupportCategoriesById);

// help support Routes
router.post('/help-supports', protect, createHelpSupport); 
router.get('/help-supports', getAllHelpSupports);
router.get('/help-supports-category/:id', getAllHelpSupportsOfCategory);  
router.get('/help-supports/:id', getHelpSupportById);
router.put('/help-supports/:id', protect, updateHelpSupportById); 
router.delete('/help-supports', protect, deleteHelpSupportsById);
export default router;
