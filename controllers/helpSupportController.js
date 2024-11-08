import mongoose from 'mongoose';
import HelpSupportCategory from '../models/helpSupport/categoryModel.js';
import Blog from '../models/helpSupport/categoryModel.js';
import HelpSupport from '../models/helpSupport/helpSupportModel.js';
import CustomError from '../utils/CustomError.js';


// Create a new helpSupport category
const createHelpSupportCategory = async (req, res, next) => {
    try {
        const { categoryName, status } = req.body;
        if (!categoryName || !status) {
            throw new CustomError("Category Name and status is required", 400);
        }
        if(categoryName.trim().length === 0) {
            throw new CustomError("Category Name cannot be empty", 400);
        }
        const newCategory = new HelpSupportCategory(req.body);
        const savedCategory = await newCategory.save();
        res.status(201).json({ success: true, result: savedCategory });
    } catch (error) {
        next(error);
    }
};

// Get a list of all helpSupport categories
const getAllHelpSupportCategories = async (req, res, next) => {
    const { pagination, page = 1, limit = 10, search } = req.query;
    try {
        const query = {};
        let categories = [];

        if (search && search !== "undefined") {
            query.categoryName = { $regex: search, $options: 'i' };
        }
        if (pagination === "false") {
            categories = await HelpSupportCategory.find(query)
        } else {
            categories = await HelpSupportCategory.find(query).skip((Number(page) - 1) * limit).limit(Number(limit));
        }
        const totalItems = await HelpSupportCategory.countDocuments();

        const catagoriesWithHelpSupportNumbers = await Promise.all(categories.map(async (category) => {
            const helpSupports = await HelpSupport.countDocuments({ category: category._id, status: "Active" });
            return { ...category.toObject(), helpSupportCount: helpSupports };
        }))

        res.status(200).json({ success: true, result: catagoriesWithHelpSupportNumbers, totalItems, page, limit });
    } catch (error) {
        next(error);
    }
};

// Get a single helpSupport category by ID
const getHelpSupportCategoryById = async (req, res, next) => {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    try {
        const category = await HelpSupportCategory.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        res.status(200).json({ success: true, result: category });
    } catch (error) {
        next(error);
    }
};

// Update a helpSupport category by ID
const updateHelpSupportCategoryById = async (req, res, next) => {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    try {
        const updatedCategory = await HelpSupportCategory.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        if (!updatedCategory) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        res.status(200).json({ success: true, result: updatedCategory });
    } catch (error) {
        next(error);
    }
};

// Delete a helpSupport category by ID
const deleteHelpSupportCategoriesById = async (req, res, next) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ success: false, message: 'IDs must be Array' });
    }
    try {
        const deletedCategory = await HelpSupportCategory.deleteMany({ _id: { $in: ids } });
        if (!deletedCategory) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        await HelpSupport.deleteMany({ category: { $in: ids } })
        res.status(200).json({ success: true, message: 'Category and the related blogs deleted successfully' });
    } catch (error) {
        next(error);
    }
};


// Create a new helpSupport question and answer
const createHelpSupport = async (req, res, next) => {
    try {
        const { category, question, answer, status } = req.body;
        if(!category || !question || !answer || !status){
            throw new CustomError("Category, Question, Answer and Status are required", 400)
        }
        if (answer && answer.trim().length == 0 || question && question.trim().length == 0) {
            throw new CustomError("Question and Answer cannot be empty", 400)
        }
        // Check if category exists
        const categoryExists = await HelpSupportCategory.findById(category);
        if (!categoryExists) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        const newHelpSupport = new HelpSupport({ category, question, answer, status });
        const savedHelpSupport = await newHelpSupport.save();
        res.status(201).json({ success: true, result: savedHelpSupport });
    } catch (error) {
        next(error);
    }
};

// Get all helpSupport questions and answers with pagination
const getAllHelpSupports = async (req, res, next) => {
    const { page = 1, limit = 10, search } = req.query;
    try {
        const query = {};
        if (search && search !== "undefined") {
            query.question = { $regex: search, $options: 'i' };
        }
        const helpSupports = await HelpSupport.find(query)
            .skip((Number(page) - 1) * limit)
            .limit(Number(limit));
        const totalItems = await HelpSupport.countDocuments();

        res.status(200).json({ success: true, result: helpSupports, totalItems, page, limit });
    } catch (error) {
        next(error);
    }
};

// Get all helpSupport questions and answers with pagination
const getAllHelpSupportsOfCategory = async (req, res, next) => {
    const { id } = req.params;
    const { page = 1, limit = 10, search } = req.query;
    try {
        const query = {};
        query.category = id;
        query.status = "Active";
        if (search && search !== "undefined") {
            query.question = { $regex: search, $options: 'i' };
        }
        const helpSupports = await HelpSupport.find(query).select("-answer") // Populate category name
        // .skip((Number(page) - 1) * limit)
        // .limit(Number(limit));
        const totalItems = await HelpSupport.countDocuments();

        res.status(200).json({
            success: true,
            result: helpSupports,
            //  totalItems, page, limit 
        });
    } catch (error) {
        next(error);
    }
};

// Get a single helpSupport question and answer by ID
const getHelpSupportById = async (req, res, next) => {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    try {
        const helpSupport = await HelpSupport.findById(id).populate('category', 'categoryName');
        if (!helpSupport) {
            return res.status(404).json({ success: false, message: 'Help Support entry not found' });
        }
        res.status(200).json({ success: true, result: helpSupport });
    } catch (error) {
        next(error);
    }
};

// Update a helpSupport question and answer by ID
const updateHelpSupportById = async (req, res, next) => {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    try {
        const updatedHelpSupport = await HelpSupport.findByIdAndUpdate(id, req.body, { new: true, runValidators: true })
            .populate('category', 'categoryName');
        if (!updatedHelpSupport) {
            return res.status(404).json({ success: false, message: 'Help Support entry not found' });
        }
        res.status(200).json({ success: true, result: updatedHelpSupport });
    } catch (error) {
        next(error);
    }
};

// Delete helpSupport entries by IDs
const deleteHelpSupportsById = async (req, res, next) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ success: false, message: 'IDs must be an array' });
    }
    try {
        const deletedHelpSupports = await HelpSupport.deleteMany({ _id: { $in: ids } });
        if (deletedHelpSupports.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'No Help Support entries found' });
        }
        res.status(200).json({ success: true, message: 'Help Support entries deleted successfully' });
    } catch (error) {
        next(error);
    }
};


export {
    createHelpSupportCategory,
    getAllHelpSupportCategories,
    getHelpSupportCategoryById,
    updateHelpSupportCategoryById,
    deleteHelpSupportCategoriesById,
    createHelpSupport,
    getAllHelpSupports,
    getAllHelpSupportsOfCategory,
    getHelpSupportById,
    updateHelpSupportById,
    deleteHelpSupportsById,
};