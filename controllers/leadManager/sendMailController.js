import SequenceInfo from "../../models/leadManager/sequenceInfoModel.js";
import UserMailSetting from "../../models/leadManager/userMailSetting.js";
import Lead from "../../models/leadModel.js";
import { sendMailService } from '../../services/sendMailService.js';


const sendMail = async (req, res, next) => {
    
    const userId = req.user._id;
    const { to, subject, body, leadId } = req.body;
    const attachments = req.files;

    try {
        const mailSettings = await UserMailSetting.findOne({ owner: userId });
        if (!mailSettings) {
            throw new Error("Mail settings for the user not found");
        }
        if (mailSettings.status === "Deactive") {
            throw new Error("Your Mail service is deactivated. Activate it from your SMTP settings.");
        }
        await Promise.all(to.map(async email => {
            const mailService = await sendMailService({
                host: mailSettings.host,
                port: mailSettings.port,
                fromMail: mailSettings.fromMail,
                smtpUsername: mailSettings.smtpUsername,
                smtpPassword: mailSettings.smtpPassword,
                to: email,
                subject,
                body,
                attachments
            })
        }))
        await SequenceInfo.findOneAndUpdate(
            { owner: userId },
            {
                $inc: {
                    emailsSent: 1,
                }
            },
            {
                new: true,
                upsert: true,
            }
        );
        if (to.length === 1 && leadId) {
            await Lead.findByIdAndUpdate(leadId, { emailsStatus: "singleSent" })
        }
        res.status(200).json({ success: true, message: "Emails sent Successfully" });
    } catch (error) {
        next(error);
    }
}

export {
    sendMail
}