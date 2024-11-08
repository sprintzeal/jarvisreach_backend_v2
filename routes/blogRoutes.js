import express from 'express';
import {
    createBlogCategory,
    getAllBlogCategories,
    getBlogCategoryById,
    updateBlogCategoryById,
    deleteBlogCategoriesById,
    createBlog,
    getAllBlogs,
    getBlogById,
    updateBlogById,
    deleteBlogById,
    getCategorizedBlogs
} from '../controllers/blogController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Blog Category Routes
router.post('/categories', protect, createBlogCategory); 
router.get('/categories', getAllBlogCategories); 
router.get('/categories/:id', getBlogCategoryById)
router.put('/categories/:id', protect, updateBlogCategoryById);
router.delete('/categories', protect, deleteBlogCategoriesById); 

// Blog Routes
router.post('/blogs/create', protect, createBlog);
router.get('/blogs', getAllBlogs);
router.get('/blogs/categorized', getCategorizedBlogs);
router.get('/blogs/:id', getBlogById);
router.put('/blogs/:id', protect, updateBlogById);
router.delete('/blogs', protect, deleteBlogById);

export default router;
