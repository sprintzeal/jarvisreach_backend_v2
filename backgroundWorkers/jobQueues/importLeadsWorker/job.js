import { Worker } from "worker_threads";
import path from "path";
import XLSX from "xlsx";
import nodemailer from "nodemailer";
import fs from 'fs';
import DataSummary from '../../../models/leadStatus.js';
import url from 'url';
import { json } from "express";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

let globalOriginalFilenames = []; 

function createFailedLeadsExcel(failedLeads) {
    if (!failedLeads || failedLeads.length === 0) {
        console.log("No failed leads available.");
        return null;
    }


// Function to create an Excel file for the first 50 failed leads
const formattedLeads = failedLeads.map(lead => ({
    LinkedInID: lead.linkedInId || "",
    ProfileURL: lead.profileUrl || "",
    FullName: lead.name || "",
    FirstName: lead.firstName || "",
    LastName: lead.lastName || "",
    Location_Country: lead.locationCountry,
    LocationMetro : lead.locationMetro,
    JobTitle: lead.company?.position || "",
    CompanyName: lead.company?.company || "",
    CompanySize: lead.company?.companySize || "",
    CompanyLocation: lead.company?.companyLocation || "",
    CompanyInstagramUrl: lead.company?.companyInstagramUrl || "",
    CompanyLogoUrl: lead.company?.imageSrc || "",
    CurrentPositionTitle: lead.currentPositions?.[0]?.position || "",
    CurrentPositionDuration: lead.currentPositions?.[0]?.duration || "",
    CurrentPositionCompany: lead.currentPositions?.[0]?.company || "",
    CurrentPositionLogoUrl: lead.currentPositions?.[0]?.imageSrc || ""
}));

const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(formattedLeads);
XLSX.utils.book_append_sheet(workbook, worksheet, "FailedLeads");

// Define the path for the Excel file
const filePath = path.join(__dirname, "failed_leads.xlsx");

// Write the workbook to the specified path
XLSX.writeFile(workbook, filePath);
return filePath;
}



// Function to send email with an Excel attachment
// async function sendEmailWithAttachment(toEmail, completionTime, totalAdded, totalFailed, ulContent, failedLeadsFilePath, originalFilenames) {
//     const transporter = nodemailer.createTransport({
//         service: "gmail",
//         auth: {
//             user: process.env.JARVIS_NO_REPLY_EMAIL,
//             pass:process.env.JARIVIS_NO_REPLY_PASSWORD, 
//         },
//     });

//     const mailOptions = {
//         from: process.env.EMAIL_USER,
//         to: toEmail,
//         subject: "Leads Import Completion",
//         html: `
//             <p>The leads import process has been completed.</p>
//             <ul>
//                 <li><strong>Completion Time:</strong> ${completionTime}</li>
//                 <li><strong>Total Leads Imported:</strong> ${totalAdded + totalFailed}</li>
//                 <li><strong>Total Leads Added:</strong> ${totalAdded}</li>
//                 <li><strong>Total Leads Failed:</strong> ${totalFailed}</li>
//             </ul>
//             <p>Find the attached file for details on the failed leads (first 50 entries).</p>
//             ${ulContent}
//         `,
//         attachments: [
//             {
//                 filename: globalOriginalFilenames,
//                 path: failedLeadsFilePath,
//             },
//         ],
//     };

//     await transporter.sendMail(mailOptions);
//     console.log("Email with Excel attachment sent successfully.");
// }
async function sendEmailWithAttachment(toEmail, completionTime, totalAdded, totalFailed, ulContent, failedLeadsFilePath) {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.JARVIS_NO_REPLY_EMAIL,
            pass: process.env.JARIVIS_NO_REPLY_PASSWORD,
        },
    });
    const filename = `${globalOriginalFilenames.replace(path.extname(globalOriginalFilenames), '')}_failed_leads.xlsx`;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: "Leads Import Completion",
        html: `
            <p>The leads import process has been completed.</p>
            <ul>
                <li><strong>Completion Time:</strong> ${completionTime}</li>
                <li><strong>Total Leads Imported:</strong> ${totalAdded + totalFailed}</li>
                <li><strong>Total Leads Added:</strong> ${totalAdded}</li>
                <li><strong>Total Leads Failed:</strong> ${totalFailed}</li>
            </ul>
            <p>Find the attached file for details on the failed leads (first 50 entries).</p>
            ${ulContent}
        `,
        attachments: [
            {
                filename: filename,
                path: failedLeadsFilePath,
            },
        ],
    };

    await transporter.sendMail(mailOptions);
}


export async function importsWorker(jsonLeadsData, email, originalFilenames) {

    if (!jsonLeadsData) {
        console.log("No data provided for leads import.");
        return;
    }

    const __dirname = path.resolve();
    const startedDate = new Date();
    const logData = []; // To collect logs during the process

    const workerPath = path.join(__dirname, "backgroundWorkers/jobQueues/importLeadsWorker/bulkLeadCreation.js");
    logData.push(`Starting worker at: ${workerPath}`);

    const worker = new Worker(workerPath, { workerData: { jsonLeadsData, originalFilenames } });

    worker.on("message", async (res) => {
        logData.push("Worker returned a message: " + JSON.stringify(res)); // Collecting worker result
        if (res.success) {
            const finishDate = new Date();
            const diff = (Math.floor(finishDate.getTime() - startedDate.getTime()) / 1000).toFixed(0);
            const completionTime = diff < 60 ? `${diff} seconds` : `${Math.floor(diff / 60)} minute${diff >= 120 ? "s" : ""}`;

            logData.push(`Import Process Summary:`);
            logData.push(`Completed in: ${completionTime}`);
            logData.push(`Total Leads Added: ${res.result.totalLeadsAdded}`);
            logData.push(`Total Leads Failed: ${res.result.totalFailed}`);
            logData.push(`First 50 Failed Leads List: ${JSON.stringify(res.result.firstFifty)}`);
             
            const totalFIleData = res.result.totalLeadsAdded +  res.result.totalFailed
            globalOriginalFilenames= originalFilenames[0]
            
            const importSummary = new DataSummary({
                filename: globalOriginalFilenames,
                totalFileData: totalFIleData,
                totalImported: res.result.totalLeadsAdded,
                totalFailed: res.result.totalFailed,
                failedLeads: res.result.failedLeads,
                logs: logData, 
            });

            try {
                await importSummary.save();
                logData.push("Import summary saved to MongoDB successfully.");
            } catch (err) {
                logData.push(`Error saving import summary to MongoDB: ${err.message}`);
            }

            let failedLeadsFilePath = null;
            if (res.result.firstFifty && res.result.firstFifty.length > 0) {
                // Only pass the first 50 failed leads for Excel export
                failedLeadsFilePath = createFailedLeadsExcel(res.result.firstFifty);
            }

            logData.push("Sending email...");
            await sendEmailWithAttachment(
                email,
                completionTime,
                res.result.totalLeadsAdded,
                res.result.totalFailed,
                res.result.ulContent,
                failedLeadsFilePath
            );
            if (failedLeadsFilePath) {
                fs.unlinkSync(failedLeadsFilePath); // Delete the file after sending
            }
        } else {
            logData.push("Worker returned failure message: " + res.message);
        }
    });

    worker.on("error", (err) => {
        logData.push("Worker encountered an error: " + err.message);
    });

    worker.on("exit", (code) => {
        logData.push(`Worker exited with code: ${code}`);
        if (code === 0) {
            logData.push("Worker completed successfully.");
        } else {
            logData.push(`Worker exited with error code: ${code}`);
        }
    });
}
