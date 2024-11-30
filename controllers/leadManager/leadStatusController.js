import mongoose from 'mongoose';
import LeadStatus from '../../models/leadManager/leadStatusModel.js';
import Lead from '../../models/leadModel.js';
import CustomError from '../../utils/CustomError.js';

// Create a new LeadStatus
const createLeadStatus = async (req, res, next) => {
    const owner = req.user;

    try {
        const { name, color, status } = req.body;
        if (!name || !color) {
            throw new Error("name, and color are required");
        }

        // get all the active leadsStatuses of this user
        const activeLeadStatuses = await LeadStatus.countDocuments({ owner: owner._id, status: "Active" });

        const userLimit = req.user.plan.planFeatures.activeLeadStatusLimit;
        // check user plan how much active leads statuses a user can have
        // -1 is for unlimited
        // check user plan
        if (userLimit == 0) {
            throw new CustomError(`Lead Statuses Creation are not allowed in ${req.user.plan.planName} plan`, 403);
        }
        let leadStatus = status;
        // check user plan how much active leads statuses a user can have
        if (userLimit !== -1 && activeLeadStatuses >= userLimit) {
            leadStatus = "Deactive";
        }

        const totalLeadsStatuses = await LeadStatus.countDocuments({ owner: owner._id });
        const newLeadStatus = new LeadStatus({
            owner: owner._id,
            name,
            color,
            order: totalLeadsStatuses + 1,
            status: leadStatus
        });

        const savedLeadStatus = await newLeadStatus.save();
        res.status(201).json({ success: true, result: savedLeadStatus });
    } catch (error) {
        next(error);
    }
};

// Get all LeadStatuses
const getAllLeadStatuses = async (req, res, next) => {
    const { page = 1, limit = 10 } = req.query;
    const owner = req.user
    try {
        const query = {};
        if (owner.role !== 'admin') {
            query.owner = owner._id;
        }
        const userTotalActiveStatuses = await LeadStatus.countDocuments({ status: "Active", owner: owner._id })
        const leadStatuses = await LeadStatus.find(query)
            .skip((Number(page) - 1) * limit)
            .limit(Number(limit));

        const totalItems = await LeadStatus.countDocuments({ owner: owner._id });
        res.status(200).json({ success: true, result: leadStatuses, totalItems, page, limit, userTotalActiveStatuses });
    } catch (error) {
        next(error);
    }
};

// Get a single LeadStatus by ID
const getLeadStatusById = async (req, res, next) => {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    try {
        const leadStatus = await LeadStatus.findById(id);
        if (!leadStatus) {
            return res.status(404).json({ success: false, message: 'LeadStatus not found' });
        }
        res.status(200).json({ success: true, result: leadStatus });
    } catch (error) {
        next(error);
    }
};

// Update a LeadStatus by ID
const updateLeadStatusById = async (req, res, next) => {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
    }
    try {
        const updatedLeadStatus = await LeadStatus.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        if (!updatedLeadStatus) {
            return res.status(404).json({ success: false, message: 'LeadStatus not found' });
        }
        res.status(200).json({ success: true, result: updatedLeadStatus });
    } catch (error) {
        next(error);
    }
};

// Delete LeadStatuses by ID(s)
const deleteLeadStatusesById = async (req, res, next) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ success: false, message: 'IDs must be an array' });
    }
    try {
        const deletedLeadStatuses = await LeadStatus.deleteMany({ _id: { $in: ids } });
        if (!deletedLeadStatuses) {
            return res.status(404).json({ success: false, message: 'LeadStatuses not found' });
        }
        res.status(200).json({ success: true, message: 'LeadStatuses deleted successfully' });
    } catch (error) {
        next(error);
    }
};


const getAllLeadsStatusForLeads = async (req, res, next) => {
    const owner = req.user;
    try {
        const sortSettings = owner.settings.leadsStatusesOrder;

        const query = {
            status: "Active"
        };

        if (owner.role !== 'admin') {
            query.owner = owner._id;
        }

        const leads = await LeadStatus.find(query).sort({ order: 'asc' });

        const leadsStatuses = leads.map((status, index) => {
            return {
                ...status.toJSON(),
                index: index + 1
            }
        });
        res.status(200).json({ success: true, result: { leadsStatuses, sortSettings } });
    } catch (error) {
        next(error);
    }
};

// order (arrange) a customer leadstatuses

const leadsStatusOrder = async (req, res, next) => {
    const customer = req.user
    try {
        const { sortSettings } = req.body;

        if (!sortSettings) {
            return res.status(400).json({ success: false, message: 'Statuses orders array is required' });
        }

        // update the leadsstatus order settings for the customer

        res.status(200).json({ success: true, result: {}, message: 'Leads statuses ordered successfully' });
    } catch (error) {
        next(error);
    }
};

const updateLeadStatus = async (req, res, next) => {
    try {
        const { leadId, statusId } = req.body;

        if (!leadId || !statusId) {
            return res.status(400).json({ success: false, message: 'Lead ID and status ID are required' });
        }

        const lead = await Lead.findByIdAndUpdate(leadId, { status: statusId }, { new: true }).populate("status");

        if (!lead) {
            return res.status(404).json({ success: false, message: 'Lead not found' });
        }

        res.status(200).json({ success: true, result: lead, message: 'Lead status updated successfully' });
    } catch (error) {
        next(error);
    }
};


export {
    createLeadStatus,
    getAllLeadStatuses,
    getLeadStatusById,
    updateLeadStatusById,
    deleteLeadStatusesById,
    getAllLeadsStatusForLeads,
    leadsStatusOrder,
    updateLeadStatus
};
