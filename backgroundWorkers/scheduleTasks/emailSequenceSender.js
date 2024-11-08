import cron from "node-cron"
import Sequence from "../../models/leadManager/sequenceModel.js";
import SequenceTemplate from "../../models/leadManager/sequenceTemplateModel.js";
import { sendMailService } from "../../services/sendMailService.js";
import UserMailSetting from "../../models/leadManager/userMailSetting.js";


const sendSequence = async () => {
    try {
        // we will get all thoses sequence records those nextMailDate is inside the prev 24 hours
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const query = {
            nextMailDate: {
                $gte: yesterday.getTime(),
                $lte: today.getTime()
            }
        }
        // find all the sequences
        const sequences = await Sequence.find(query);

        sequences.map(async (sequence) => {
            // get the assigned template
            const template = await SequenceTemplate.findById(sequence.sequenceTemplate);
            if (sequence.nextFollowup >= template.followUps.length) {
                return;  // do not send more emails for this sequence, since it has reached its end.
            }
            const mailSettings = await UserMailSetting.findOne({ owner: sequence.owner });
            if(!mailSettings){
                return;
            }
            // if templete is disabled OR if user mail settings is deactivated
            if (!template.enabled || mailSettings.status === "Deactive") {
                // we have to update the sending date ("nextMailDate") of this sequence so once the template of this 
                // sequence is enabled so we should be able to send the skipped emails then.
                // Convert timestamp to a Date object
                let sequenceSendindDate = new Date(sequence.nextMailDate);
                // Add 24 hours (24 * 60 * 60 * 1000 milliseconds)
                sequenceSendindDate.setTime(sequenceSendindDate.getTime() + (24 * 60 * 60 * 1000));
                sequence.nextMailDate = sequenceSendindDate.getTime();
                return
            }
            // which follow up we have to send 
            const readyFollowUp = template.followUps[sequence.nextFollowup];


            const dynamicSubject = sequence.subject.replace("{{lead_name}}", sequence.leadName);
            const dynamicBody = readyFollowUp.templateContent.replace("{{lead_name}}", sequence.leadName)
            // send the followup email
            await sendMailService({
                host: mailSettings.host,
                port: mailSettings.port,
                fromMail: mailSettings.fromMail,
                smtpUsername: mailSettings.smtpUsername,
                smtpPassword: mailSettings.smtpPassword,
                to: sequence.email,
                subject: dynamicSubject,
                body: dynamicBody,
            });

            // update the nextfollowup to send next followup email for the sequence
            sequence.nextFollowup = sequence.nextFollowup + 1;

            // update the next mail date to send next mail for the sequence
            const nextFollowupEmail = template.followUps[sequence.nextFollowup + 1];

            if (nextFollowupEmail) {
                // calculate the next mail date by adding the daysUntilNext to the current date
                const daysUntilNext = nextFollowupEmail.daysUntilNext;
                const nextDate = new Date()
                nextDate.setDate(nextDate.getDate() + daysUntilNext)
                sequence.nextMailDate = nextDate.getTime();
            }
            await sequence.save();
        })
    } catch (error) {
        console.log(error)
    }
}


// the job will be executed on every 11:58 AM to send the emails of today
cron.schedule('58 11 * * *', () => {
    sendSequence()
});
