import express from "express"
import { createNewView, deleteView, getAllViews, getColumnsByView, updateView } from "../controllers/viewsController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router()


//reset user password
router.post('/',protect, createNewView);

// get all views
router.get('/',protect, getAllViews);

// get Coulmn of view
router.get('/columns/:id',protect, getColumnsByView);
// profile routes

// delete view and its columns
router.delete('/:id',protect, deleteView);

router.put('/:id',protect, updateView);

export default router;

