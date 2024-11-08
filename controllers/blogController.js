import mongoose from 'mongoose';
import BlogCategory from '../models/blog/blogCategoryModel.js';
import Blog from '../models/blog/blogModel.js';


// Create a new blog category
const createBlogCategory = async (req, res, next) => {
    try {
        const { categoryName, status } = req.body;
        if (!categoryName || !status) {
            throw new Error("Category Name and status is required");
        }
        const newCategory = new BlogCategory(req.body);
        const savedCategory = await newCategory.save();
        res.status(201).json({ success: true, result: savedCategory });
    } catch (error) {
        next(error);
    }
};

// Get a list of all blog categories
const getAllBlogCategories = async (req, res, next) => {
    const { pagination, page = 1, limit = 10 } = req.query;
    try {
        let categories = [];
        if (pagination === "false") {
            categories = await BlogCategory.find();
        } else {
            categories = await BlogCategory.find().skip((Number(page) - 1) * limit).limit(Number(limit));
        }
        const totalItems = await BlogCategory.countDocuments();

        res.status(200).json({ success: true, result: categories, totalItems, page, limit });
    } catch (error) {
        next(error);
    }
};

// Get a single blog category by ID
const getBlogCategoryById = async (req, res, next) => {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    try {
        const category = await BlogCategory.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        res.status(200).json({ success: true, result: category });
    } catch (error) {
        next(error);
    }
};

// Update a blog category by ID
const updateBlogCategoryById = async (req, res, next) => {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    try {
        const updatedCategory = await BlogCategory.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        if (!updatedCategory) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        res.status(200).json({ success: true, result: updatedCategory });
    } catch (error) {
        next(error);
    }
};

// Delete a blog category by ID
const deleteBlogCategoriesById = async (req, res, next) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ success: false, message: 'IDs must be Array' });
    }
    try {
        const deletedCategory = await BlogCategory.deleteMany({ _id: { $in: ids } });
        if (!deletedCategory) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        await Blog.deleteMany({ category: { $in: ids } })
        res.status(200).json({ success: true, message: 'Category and the related blogs deleted successfully' });
    } catch (error) {
        next(error);
    }
};


// Create a new blog
const createBlog = async (req, res, next) => {
    try {
        const {
            category,
            blogStatus,
            blogInfo,
            blogBannerImage,
            blogThumbnailImage,
            websiteMetadata,
            authorProfile,
            tableOfContents,
            authorSocialLinks
        } = req.body;

        if (!category || !mongoose.Types.ObjectId.isValid(category)) {
            throw new Error("Valid Category ID is required");
        }
        if (!blogStatus || !['Online', 'Offline'].includes(blogStatus)) {
            throw new Error("Valid Blog Status is required");
        }
        if (!blogInfo || !blogInfo.title || !blogInfo.slugUrl) {
            throw new Error("Blog Info (title, slugUrl, h1Tag, description) is required");
        }
        if (!blogBannerImage || !blogThumbnailImage) {
            throw new Error("Blog Banner Image and Thumbnail Image are required");
        }
        if (!websiteMetadata || !websiteMetadata.title || !websiteMetadata.keywords || !websiteMetadata.description) {
            throw new Error("Website Metadata (title, keywords, description) is required");
        }
        if (!authorProfile || !authorProfile.authorName || !authorProfile.authorImage || !authorProfile.authorDescription) {
            throw new Error("Author Profile (name, image, description) is required");
        }

        const newBlog = new Blog(req.body);
        const savedBlog = await newBlog.save();
        res.status(201).json({ success: true, result: savedBlog });
    } catch (error) {
        next(error);
    }
};

// Get a list of all blogs
const getAllBlogs = async (req, res, next) => {
    const { page = 1, limit = 10 } = req.query;

    try {
        const blogs = await Blog.find().sort({ createdAt: -1 }).skip((Number(page) - 1) * limit).limit(Number(limit)).populate('category');
        const totalItems = await Blog.countDocuments();
        const blogSlugsObj = await Blog.find().select("blogInfo.slugUrl")
        const blogSlugs = blogSlugsObj.map(slug => slug.blogInfo)
        res.status(200).json({ success: true, result: blogs, totalItems, page, limit: Number(limit), blogSlugs });
    } catch (error) {
        next(error);
    }
};

// Get a list of all blogs grouped by categories
const getCategorizedBlogs = async (req, res, next) => {
    const { page = 1, limit = 5 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    try {
        // Aggregate blogs by category
        const blogsByCategory = await Blog.aggregate([
            {
                // Match blogs with status 'Online'
                $match: { blogStatus: 'Online' }
            },
            {
                $lookup: {
                    from: 'blogcategories', // Assuming the collection name is 'blogcategories'
                    localField: 'category',
                    foreignField: '_id',
                    as: 'categoryDetails'
                }
            },
            {
                $unwind: '$categoryDetails'
            },
            {
                // Match only categories with status 'Online'
                $match: { 'categoryDetails.status': 'Active' }
            },
            {
                // Sort blogs by the latest created first within each category
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: '$categoryDetails._id', // Group by category
                    categoryName: { $first: '$categoryDetails.name' }, // Store the category name
                    blogs: { $push: '$$ROOT' }, // Store all blogs in this category
                    latestBlogCreatedAt: { $first: '$createdAt' } // Store the creation date of the latest blog in this category
                }
            },
            {
                // Sort categories by the creation date of the latest blog in descending order
                $sort: { latestBlogCreatedAt: -1 }
            },
            {
                $skip: skip
            },
            {
                $limit: Number(limit)
            }
        ]);

        // Count total number of documents for pagination
        const totalItems = await BlogCategory.countDocuments();

        res.status(200).json({
            success: true,
            result: blogsByCategory,
            totalItems,
            page: Number(page),
            limit: Number(limit)
        });
    } catch (error) {
        next(error);
    }
};



// Get a single blog by ID
const getBlogById = async (req, res, next) => {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    try {
        const blog = await Blog.findById(id).populate('category'); // Populate if needed
        if (!blog) {
            return res.status(404).json({ success: false, message: 'Blog not found' });
        }
        res.status(200).json({ success: true, result: blog });
    } catch (error) {
        next(error);
    }
};

// Update a blog by ID
const updateBlogById = async (req, res, next) => {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }

    try {
        const updatedBlog = await Blog.findByIdAndUpdate(id, req.body, { new: true });
        if (!updatedBlog) {
            return res.status(404).json({ success: false, message: 'Blog not found' });
        }
        res.status(200).json({ success: true, result: updatedBlog });
    } catch (error) {
        next(error);
    }
};

// Delete a blog by ID
const deleteBlogById = async (req, res, next) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ success: false, message: 'IDs must be Array' });
    }
    try {
        const deletedBlogs = await Blog.deleteMany({ _id: { $in: ids } });
        if (!deletedBlogs) {
            return res.status(404).json({ success: false, message: 'Blogs not found' });
        }
        res.status(200).json({ success: true, message: 'Blogs deleted successfully' });
    } catch (error) {
        next(error);
    }
};

export {
    createBlogCategory,
    getAllBlogCategories,
    getBlogCategoryById,
    updateBlogCategoryById,
    deleteBlogCategoriesById,
    createBlog,
    getAllBlogs,
    getCategorizedBlogs,
    getBlogById,
    updateBlogById,
    deleteBlogById
};