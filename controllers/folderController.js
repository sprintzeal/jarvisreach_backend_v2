import Folder from '../models/folderModel.js'
import Lead from '../models/leadModel.js';
import CustomError from '../utils/CustomError.js';

export const createFolder = async (req, res, next) => {
    try {
        const user = req.user;
        const owner = req.team._id
        // if (user.role === "customer") {
        //     owner = user._id
        // }
        // if (user.role === "teamMember") {
        //     // will create folder with admin customer id
        //     owner = user.customerRef
        // }


        const { name, leads, color, selected } = req.body;

        if (!owner) {
            throw new Error('Not Authenticated');
        }
        const userFolders = await Folder.countDocuments({ owner })
        // check user plan
        const userLimit = req.user.plan.planFeatures.activeLeadStatusLimit;

        // check user plan how much folders a user can have
        // -1 is for unlimited
         // check user plan
        if (userLimit === 0) {
            throw new CustomError(`Folder Creation are not allowed in ${req.user.plan.planName} plan`, 403);
        }

        // check user plan
        if (userLimit !== -1 && userFolders >= userLimit) {
            throw new CustomError(`Folders Creation limit reached in ${req.user.plan.planName} plan`, 429);
        }

        // find the already selected folder and make it unselected
        const alreadySelectedFolder = await Folder.findOne({ owner, selected: true });
        if (alreadySelectedFolder) {
            alreadySelectedFolder.selected = false;
            await alreadySelectedFolder.save();
        }

        const folder = new Folder({ name, owner, leads, color, selected });
        const newFolder = await folder.save();
        res.status(201).json({ success: true, result: newFolder });
    } catch (error) {
        next(error)
    }
};

export const getFolders = async (req, res, next) => {
    const { search } = req.query;

    try {

        let query = {};
        // if (req.user.role === "customer") {
        //     query.owner = req.user._id
        // }
        // if (req.user.role === "teammember") {
        //     query.owner = req.user.customerRef.toString()
        // }
        query.owner = req.team._id
        if (search && search !== "undefined") {
            // we have to search in the folder name but we want to be case insensitive
            query.name = new RegExp(search, 'i');
        }
        // we need the selected one as first item so we sort it accordingly
        const folders = await Folder.find(query).sort({ selected: -1 })
        const foldersWithLeadsInfo = await Promise.all(folders.map(async f => {
            const leads = await Promise.all(f.leads.map(async l => {
                const lead = await Lead.findById(l).select('linkedInId');
                return lead
            }))

            return {
                _id: f._id,
                name: f.name,
                owner: f.owner,
                color: f.color,
                starred: f.starred,
                selected: f.selected,
                leads: leads,
                created_at: f.created_at,
                updated_at: f.updated_at,
                leads: leads,
                default: f.default
            }
        }))
        res.json({ success: true, result: foldersWithLeadsInfo });
    } catch (error) {
        next(error);
    }
};

export const getFolderById = async (req, res, next) => {
    try {
        const folder = await Folder.findById(req.params.id)
        if (!folder) {
            return res.status(404).json({ message: 'Folder not found' });
        }
        res.json({ success: true, result: folder });
    } catch (error) {
        next(error);
    }
};

export const updateFolder = async (req, res, next) => {
    try {
        const { name, color } = req.body;
        if (!name && !color) {
            return res.status(400).json({ message: 'At least one field must be provided for update' });
        }

        const folder = await Folder.findById(req.params.id);
        if (!folder) {
            return res.status(404).json({ message: 'Folder not found' });
        }

        if (name) {
            folder.name = name;
        }
        if (color) {
            folder.color = color;
        }

        const updatedFolder = await folder.save();
        res.json({ success: true, result: updatedFolder });
    } catch (error) {
        next(error);
    }
};

export const deleteFolder = async (req, res, next) => {
    try {
        const folder = await Folder.findById(req.params.id);
        if (!folder) {
            return res.status(404).json({ message: 'Folder not found' });
        }
        await Folder.findByIdAndDelete(req.params.id);
        await Lead.deleteMany({ folderId: req.params.id });
        res.json({ success: true, message: 'Folder deleted' });
    } catch (error) {
        next(error);
    }
};

// controller to change a customer selected Folder
// we have to unselect the current selected folder and make the new as selected

const selectCustomerFolder = async (req, res, next) => {
    try {
        const { folderId } = req.body;
        let ownerId

        // if (req.user.role === "customer") {
        //     ownerId = req.user._id
        // }
        // if (req.user.role === "teamMember") {
        //     ownerId = req.user.customerRef
        // }

        ownerId = req.team._id


        if (!folderId) {
            throw new Error('folderId is required');
        }

        // find the already selected folder and make it unselected
        const folder = await Folder.findOne({ owner: ownerId, selected: true });
        folder.selected = false;
        await folder.save();

        // find the target folder and make it selected
        const target = await Folder.findById(folderId);
        target.selected = true;
        await target.save();
        if (!folder) {
            throw new Error('folder not found');
        }

        res.json({ success: true, message: 'Folder selected successfully' });
    } catch (error) {
        next(error);
    }
};

// to make a customer folder starred

const starCustomerFolder = async (req, res, next) => {
    try {
        const { folderId } = req.body;

        if (!folderId) {
            throw new Error('folderId is required');
        }

        // find the target folder and toggle its starred status
        const folder = await Folder.findById(folderId);
        folder.starred = !folder.starred;
        await folder.save();

        res.json({ success: true, message: `Folder starred status updated to ${folder.starred}` });
    } catch (error) {
        next(error);
    }
};

export {
    selectCustomerFolder,
    starCustomerFolder
}