import express from "express"
import { createFolder, deleteFolder, getFolders, selectCustomerFolder, starCustomerFolder, updateFolder } from "../controllers/folderController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post('/', protect, createFolder);
router.get('/', protect, getFolders);
router.put('/:id', protect, updateFolder);
router.delete('/:id', protect, deleteFolder);
router.put('/select-folder', protect, selectCustomerFolder);

router.put('/make-faviorite', protect, starCustomerFolder);

export default router;

