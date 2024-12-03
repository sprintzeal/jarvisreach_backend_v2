import Lead from "../models/leadModel.js";
import LeadExport from "../models/leadsExportsModel.js";
import Folder from "../models/folderModel.js";
import User from "../models/userModel.js";
import { convertToXlsxCsv, convertXlsxCsvToJson } from "../utils/DataConversion.js";
import { uploadToGoogleDrive } from "../services/googleDriveUploadService.js";
import { leadsExportedEmail } from "../services/sendHtmlTemplates.js";
import { formatLeadData } from "../utils/functions.js";
import { importsWorker } from "../backgroundWorkers/jobQueues/importLeadsWorker/job.js";
import CustomError from "../utils/CustomError.js";
import LeadStatus from "../models/leadManager/leadStatusModel.js";


const getExportSettings = async (req, res, next) => {
    try {
        // settings separate for all the three users in.e admin customer and teammember
        const user = req.user;
        const exportsSettings = (await User.findById(user._id)).settings?.exportSettings;
        res.status(200).json({ success: true, result: exportsSettings });
    } catch (error) {
        next(error);
    }
}

const getAllLeadExports = async (req, res, next) => {

    try {
        const { page = 1, limit = 5, sortBy, sortOrder } = req.query;
        const customer = req.user;

        const query = {};

        // if (customer.role === 'customer') {
        //     query.owner = customer._id;
        // }

        // if (req.user.role === "teamMember") {
        //     query.owner = customer.customerRef
        // }
        query.owner = req.team._id;

        const totalItems = await LeadExport.countDocuments(query);

        const leads = await LeadExport.find(query)
            .skip((page - 1) * limit)
            .limit(limit)
        // .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 });

        res.status(200).json({ success: true, result: leads, totalItems, page, limit });
    } catch (error) {
        next(error);
    }
};

const createLeadExportOfFolder = async (req, res, next) => {

    const {
        folderId,
        fileFormat,
        includeResultsWithOutEmails,
        includeResultsWithOutPhones,
        directEmails,
        directPhones,
        workEmails,
        workPhones,
        customColumns,
        leadsIds,
    } = req.body;

    let userId

    if (req.user.role === "customer" || req.user.role === "admin") {
        userId = req.user._id
    }
    if (req.user.role === "teamMember") {
        userId = req.user.customerRef
    }

    // check user plan
    if(!req.user.plan.planFeatures.exportContactsEnabled) {
        throw new CustomError(`Exports are not allowed in ${req.user.plan.planName} plan`, 403);
    }

    // validate if the columns comming from request are valids
    try {
        const validColumns = [
            'profile',
            'name',
            'firstName',
            'lastName',
            'skills',
            'educations',
            'imageUrl',
            'emails',
            'phones',
            'tags',
            'notes',
            'status',
            'country',
            'state',
            'city',
            'createdAt',
            'updatedAt',
            'profileUrl'
        ]
        // so we have to check that ever entry in the customColumns must be there in the validColumns array
        customColumns.forEach(column => {
            if (!validColumns.includes(column)) {
                throw new Error(`Invalid column: ${column}`);
            }
        });

        // first save the export settings for the user
        const user = await User.findById(userId);
        // Update the export settings
        user.settings = {
            ...user.settings,
            exportSettings: {
                ...user.settings.exportSettings,
                fileFormat,
                includeResultsWithOutEmails,
                includeResultsWithOutPhones,
                directEmails,
                directPhones,
                workEmails,
                workPhones,
                customColumns,
            }
        };

        await user.save();

        // now we have to create an export
        const columnsToExport = customColumns

        if (customColumns.includes("createdAt")) {
            columnsToExport.unshift("created_at")
        }
        if (customColumns.includes("updatedAt")) {
            columnsToExport.unshift("updated_at")
        }
        // convert the array to string
        const selectedColumns = customColumns.join(" ")

        // find all the leads of a folder
        let leads

        if (leadsIds && Array.isArray(leadsIds)) {
            // we have to only export the selected leads (not all the leads of a folder)
            leads = await Lead.find({ _id: { $in: leadsIds } }).select(selectedColumns).lean().exec();
        } else {
            leads = await Lead.find({ folderId }).select(selectedColumns).lean().exec();
        }

        // find the folder name
        const folderName = (await Folder.findById(folderId).select("name"))?.name || "adminFolder"

        const formatedLeads = await Promise.all(leads.map(async lead => {
            const leadStatus = await LeadStatus.findById(lead.status)
            return formatLeadData(lead, folderName, leadStatus?.name)
        }))
        const timeStamp = new Date().getTime();

        // 1. convert the leads
        const converted = convertToXlsxCsv(formatedLeads, `export-${timeStamp}`, fileFormat)

        // upload to drive

        // const uploaded = await uploadToGoogleDrive({
        //     originalname:converted.fileName,
        //     mimeType: converted.fileType,
        //     path: converted.filePath,
        //     inputType:"path"
        // })

        // create export data
        const newExport = await LeadExport.create({
            owner: req.team._id,
            status: "Done",
            folderName,
            leadsCount: formatedLeads.length,
            resultFile: converted.filePath
        });

        // notify user about the created 
        leadsExportedEmail(user.email, `${user.firstName} ${user.lastName}`, converted.filePath);
        if (req.user.role === "admin") {
            res.status(200).json({ success: true, newExport });
        } else {
            res.status(200).json({ success: true, newExport });
        }

    } catch (error) {
        next(error);
    }

}

// controller to convert csv file to json

const importLeadsDataFromFile = async (req, res, next) => {
    const files = req.files;
    const email = req.body.email;

    try {
        if (!email) {
            throw new CustomError("Email Required", 400)
        }
        //validate email
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!regex.test(email)) {
            throw new CustomError("Invalid email format", 400)
        }
        const adminCustomerEmail = process.env.ADMIN_CUSTOMER_ACCOUNT_EMAIL || "admincustomer@gmail.com"
        const adminCustomer = await User.findOne({ email: adminCustomerEmail });

        if (!adminCustomer) {
            throw new CustomError(`Admin customer account not found please create an account with email: ${adminCustomerEmail}`, 404)
        }

        let folder = await Folder.findOne({ owner: adminCustomer._id });

        if (!folder) {
            folder = await Folder.create({ name: "My first Folder", owner: adminCustomer._id, leads: [], color: "#000000", selected: false });
        }
        const originalFilenames = files.map((file) => {
            const fileName = file.originalname;
            return fileName; 
        });
        const jsonLeadsData = files.reduce((acc, file) => {
            const fileLeadsData = convertXlsxCsvToJson(file);
            return fileLeadsData
        }, []); 
        importsWorker(jsonLeadsData, email, originalFilenames);

        await folder.save();
        res.status(200).json({ success: true, message: `Imports are in progress. You will be notified through email when imports are completed.` });

    } catch (error) {
        next(error);
    }
}

//     const email = req.body.email;

//     try {
//         if (!email) {
//             throw new CustomError("Email Required", 400);
//         }

//         // Validate email format
//         const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//         if (!regex.test(email)) {
//             throw new CustomError("Invalid email format", 400);
//         }

//         const adminCustomerEmail = process.env.ADMIN_CUSTOMER_ACCOUNT_EMAIL || "admincustomer@gmail.com";
//         const adminCustomer = await User.findOne({ email: adminCustomerEmail });

//         if (!adminCustomer) {
//             throw new CustomError(`Admin customer account not found. Please create an account with email: ${adminCustomerEmail}`, 404);
//         }

//         let folder = await Folder.findOne({ owner: adminCustomer._id });
//         if (!folder) {
//             folder = await Folder.create({ name: "My first Folder", owner: adminCustomer._id, leads: [], color: "#000000", selected: false });
//         }

//         // Ensure files exist before processing
//         if (!files || files.length === 0) {
//             throw new CustomError("No files uploaded", 400);
//         }

//         // Log original filenames to check if they're captured properly
//         const originalFilenames = files.map((file) => file.originalname);
//         console.log("Original Filenames: ", originalFilenames);  // Log the filenames to ensure it's captured

//         // Convert files to JSON
//         const jsonLeadsData = files.reduce((acc, file) => {
//             const fileLeadsData = convertXlsxCsvToJson(file);
//             return [...acc, ...fileLeadsData];
//         }, []);

//         // Call importsWorker with the necessary data
//         await importsWorker(jsonLeadsData, email, originalFilenames);  // Ensure correct data is passed

//         await folder.save();
//         res.status(200).json({ success: true, message: "Imports are in progress. You will be notified through email when imports are completed." });

//     } catch (error) {
//         next(error);
//     }
// };


// controller for downloading an export file

const downloadExportFile = async (req, res, next) => {

    try {
        const { leadExportUrl } = req.body;

        if (!leadExportUrl) {
            throw new Error("File path Required")
        }

        res.download(leadExportUrl);

    } catch (error) {
        next(error);
    }
}

export {
    getAllLeadExports,
    createLeadExportOfFolder,
    getExportSettings,
    downloadExportFile,
    importLeadsDataFromFile
}