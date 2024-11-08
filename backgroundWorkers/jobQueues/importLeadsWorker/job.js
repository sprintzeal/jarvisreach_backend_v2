import { Worker } from "worker_threads"
import path from "path";
import { importsCompletedEmail } from "../../../services/sendHtmlTemplates.js";

// Function to start the heavy task in the background
export async function importsWorker(jsonLeadsData, email) {
    if (!jsonLeadsData) return;
    // it takes a script 
    const __dirname = path.resolve();
    const startedDate = new Date();
    const workerPath = path.join(__dirname, 'backgroundWorkers/jobQueues/importLeadsWorker/bulkLeadCreation.js');

    const worker = new Worker(workerPath, { workerData: { jsonLeadsData } });

    worker.on('message', (res) => {
        if (res.success) {
            const finishDate = new Date();
            const diff = (Math.floor(finishDate.getTime() - startedDate.getTime()) / (1000)).toFixed(0);
            let completionTime;
            if (diff < 60) {
                completionTime = `${diff} seconds`
            } else {
                const time = (diff / 60).toFixed(0)
                if (time < 2) {
                    completionTime = `${(diff / 60).toFixed(0)} minute`
                } else {
                    completionTime = `${(diff / 60).toFixed(0)} minutes`
                }

            }
            // send email 
            importsCompletedEmail(email, completionTime, res.result.totalLeadsAdded, res.result.totalFailed, res.result.ulContent,  res.result.firstFifty);

            console.log("Email sent successfully after leads imported");
        } else {
            console.log(res.message)
        }

    });

    worker.on('error', (err) => {
        console.error('Worker encountered an error:', err);
    });

    worker.on('exit', (code) => {
        console.log("code:", code);
        if (code === 0) {
            console.log("Worker Completed")
        } else {
            console.log(`Worker exited with code ${code}`);
        }
    });
}
