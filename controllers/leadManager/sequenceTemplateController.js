import SequenceTemplate from '../../models/leadManager/sequenceTemplateModel.js'; // Adjust the path as necessary
import UserMailSetting from '../../models/leadManager/userMailSetting.js';
import Lead from '../../models/leadModel.js';
import CustomError from '../../utils/CustomError.js';

const createSequenceTemplate = async (req, res, next) => {
    const owner = req.user._id;
    try {
        const { name, followUps, subject } = req.body;
        if (!Array.isArray(followUps)) {
            throw new Error("followUps must be array of objects")
        }
        const alreadyCreated = await SequenceTemplate.findOne({ owner, name });

        if (alreadyCreated) {
            throw new CustomError('Sequence template with the same name already exists', 409);
        }
        const userLimit = req.user.plan.planFeatures.activeSequencesLimit;

        // check user plan
        if (userLimit == 0) {
            throw new CustomError(`Sequences are not allowed in ${req.user.plan.planName} plan`, 403);
        }

        const activeTemplates = await SequenceTemplate.countDocuments({ owner, enabled: true });

        // check user plan how much active Templates can have
        // -1 is for unlimited
        let isTemplateEnabled
        if (userLimit !== -1 && activeTemplates >= userLimit) {
            isTemplateEnabled = false;
        } else {
            isTemplateEnabled = true;
        }

        // Create a new sequence template
        const newTemplate = new SequenceTemplate({
            owner,
            name,
            noOfFollowUps: followUps.length,
            followUps,
            enabled: isTemplateEnabled,
            subject
        });

        // Save the new template
        await newTemplate.save();

        res.status(201).json({ success: true, message: 'Sequence template created successfully.', result: newTemplate });
    } catch (error) {
        next(error);
    }
};

const getAllSequenceTemplates = async (req, res, next) => {
    const { page = 1, limit = 5, search } = req.query;
    try {
        const owner = req.user;

        const query = {
            name: new RegExp(search, 'i'),
        }
        if (owner.role !== 'admin') {
            query.owner = owner._id
        }
        // Find all templates for the given user
        const templates = await SequenceTemplate.find(query).skip((Number(page) - 1) * limit).limit(Number(limit));
        const totalItems = await SequenceTemplate.countDocuments(query)

        res.status(200).json({ success: true, result: templates, page, limit, totalItems });
    } catch (error) {
        next(error);
    }
};

const getSequenceTemplateById = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Find the template by ID
        const template = await SequenceTemplate.findById(id);

        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found.' });
        }

        res.status(200).json({ success: true, result: template });
    } catch (error) {
        next(error);
    }
};

const updateSequenceTemplate = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body.updates;
        const owner = req.user._id;

        if(updates.name){
            const alreadyCreated = await SequenceTemplate.findOne({owner, name: updates.name});
            if (alreadyCreated) {
                throw new CustomError('Sequence template with the same name already exists', 409);
            }
        }
        // Find and update the template
        const updatedTemplate = await SequenceTemplate.findByIdAndUpdate(id, updates, { new: true });

        // we have to pause or resume the emails sequences of a template

        if (!updatedTemplate) {
            return res.status(404).json({ success: false, message: 'Template not found.' });
        }

        res.status(200).json({ success: true, message: 'Template updated successfully.', result: updatedTemplate });
    } catch (error) {
        next(error);
    }
};


const deleteSequenceTemplate = async (req, res, next) => {
    try {
        const { ids } = req.body;

        // Find and delete the template
        const deletedTemplate = await SequenceTemplate.deleteMany({ _id: { $in: ids } });
        if (deletedTemplate.deletedCount === 0) {
            throw new CustomError('No templates found for the provided IDs', 404)
        }
        res.status(200).json({ success: true, message: `Templates deleted successfully.` });
    } catch (error) {
        next(error);
    }
};

// assign template to a lead

const assignTemplateToLead = async (req, res, next) => {
    const owner = req.user._id;
    try {
        const { ids, templateId } = req.body;
        if (!ids && !Array.isArray(ids)) {
            throw new Error("field Ids must be an array")
        }
        const mailSettings = await UserMailSetting.findOne({ owner });
        if (!mailSettings) {
            throw new Error("Mail settings not found. Please setup your mail settings");
        };
        const template = await SequenceTemplate.findById(templateId)
        if (!template.enabled) {
            throw new Error("Selected template is disabled")
        }
        // Find the lead and update its template
        await Promise.all(ids.map(async id => {
            await Lead.findByIdAndUpdate(id, { $set: { template: templateId } }, { new: true });
        }))

        res.status(200).json({ success: true, message: 'Template assigned successfully.' });
    } catch (error) {
        next(error);
    }
};


export {
    createSequenceTemplate,
    getAllSequenceTemplates,
    getSequenceTemplateById,
    updateSequenceTemplate,
    deleteSequenceTemplate,
    assignTemplateToLead
}
