// controller for files uploads

import { uploadToGoogleDrive } from "../services/googleDriveUploadService.js";
import path from "path";
import multer from 'multer';
import fs from 'fs';

const dirname = path.resolve();

// Middleware to configure multer dynamically
const configureMulter = (folderName) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadPath = path.join(`${dirname}/assets`, folderName);
            // Create the directory if it doesn't exist
            if (!fs.existsSync(uploadPath)) {
                fs.mkdirSync(uploadPath, { recursive: true });
            }
            cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
            // Create a unique filename
            cb(null, Date.now() + path.extname(file.originalname));
        }
    });

    return multer({ storage: storage });
};

// Controller to handle file uploads
const uploadFilesToLocal = async (req, res, next) => {
    const { folder } = req.query;
    if (!folder) {
        return res.status(400).json({ success: false, message: "Folder name is required" });
    }

    try {
        // Configure multer with the dynamic folder name
        const localupload = configureMulter(folder);

        // Use multer middleware to handle file uploads
        localupload.array('files')(req, res, async (err) => {
            if (err) {
                return next(err); // Handle multer errors
            }

            const files = req.files; // Files will be available here

            if (!files || !Array.isArray(files)) {
                throw new Error("No files uploaded");
            }

            // Process the uploaded files if needed
            // Construct the response with file details
            const result = files.map(file => ({
                filename: file.filename,
                path: file.path,
                url: `${process.env.API_BASE_URL}/assets/${folder}/${file.filename}` // Adjust URL as needed
            }));

            res.status(200).json({ success: true, files: result });
        });
    } catch (error) {
        next(error);
    }
};

const uploadFilesToDrive = async (req, res, next) => {
    try {
        const files = req.files;

        if (!files || !Array.isArray(files)) {
            throw new Error("No files uploaded")
        }
        const uploadFiles = files.map(async file => {
            const uploaded = await uploadToGoogleDrive(file)
            return uploaded
        })
        const result = await Promise.all(uploadFiles)

        res.status(200).json({ success: true, result });


    } catch (error) {
        next(error);
    }
};

export {
    uploadFilesToDrive,
    uploadFilesToLocal
}