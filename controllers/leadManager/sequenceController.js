import SequenceInfo from '../../models/leadManager/sequenceInfoModel.js';
import Sequence from '../../models/leadManager/sequenceModel.js'; // Adjust the path as needed
import SequenceTemplate from '../../models/leadManager/sequenceTemplateModel.js';
import UserMailSetting from '../../models/leadManager/userMailSetting.js';
import Lead from '../../models/leadModel.js';
import { sendMailService } from '../../services/sendMailService.js';

const createSequence = async (req, res, next) => {
    const owner = req.user._id;
    try {
        const { name, ids, subject, sequenceTemplate, mailStatus } = req.body;
        if (!name || !ids || !subject || !sequenceTemplate || !mailStatus) {
            throw new Error(`All fields are required`);
        }

        let sequences = [];

        const template = await SequenceTemplate.findById(sequenceTemplate);
        if (!template) {
            throw new Error("Sequence template not found");
        };
        if(!template.enabled){
            throw new Error("Selected template is disabled")
        }

        await Promise.all(ids.map(async leadId => {
            const lead = await Lead.findById(leadId);
            if (!lead) {
                return
            }

            const emails = lead.emails;
            await Promise.all(emails.map(async (email) => {

                // send ist email and update the sequence details for the followup emails

                // get the ist followup email template
                const istFollowupEmailTemplate = template.followUps[0];

                // send the ist email
                const mailSettings = await UserMailSetting.findOne({ owner });
                if (!mailSettings) {
                    throw new Error("Mail settings not found. Please setup your mail settings");
                };

                const dynamicSubject = subject.replace("{{lead_name}}", `${lead.firstName} ${lead.lastName}`);
                const dynamicBody = istFollowupEmailTemplate.templateContent.replace("{{lead_name}}", `${lead.firstName} ${lead.lastName}`)

                if (mailSettings && mailSettings.status === "Active" && template.enabled) {
                    
                    await sendMailService({
                        host: mailSettings.host,
                        port: mailSettings.port,
                        fromMail: mailSettings.fromMail,
                        smtpUsername: mailSettings.smtpUsername,
                        smtpPassword: mailSettings.smtpPassword,
                        to: email.email,
                        subject: dynamicSubject,
                        body: dynamicBody,
                    });

                    await SequenceInfo.findOneAndUpdate(
                        { owner: owner },
                        {
                            $inc: {
                                emailsSentInSequence: 1
                            }
                        },
                        {
                            new: true,
                            upsert: true,
                        }
                    );
                }
                // save updated sequence data
                let nextMailDate = new Date();
                nextMailDate.setHours(0, 0, 0, 0);
                if (istFollowupEmailTemplate.daysUntilNext) {
                    // if there is next followUp email in the template 
                    nextMailDate.setDate(nextMailDate.getDate() + istFollowupEmailTemplate.daysUntilNext);
                } else {
                    nextMailDate.setDate(nextMailDate.getDate() + 0);
                };

                const sequence = new Sequence({
                    name,
                    email: email.email,
                    nextFollowup: 1,
                    nextMailDate: nextMailDate.getTime(),
                    mailStatus,
                    sequenceTemplate,
                    owner,
                    subject,
                    lead: lead._id,
                    leadName: `${lead.firstName} ${lead.lastName}`
                });
                await sequence.save();
                lead.assignedSequences.push(sequence._id)
                sequences.push(sequence);
            }))
            lead.emailsStatus = "sequenceAssigned";
            await lead.save();
        }))

        res.status(200).json({ success: true, result: sequences });

    } catch (error) {
        next(error);
    }
};

const getSequences = async (req, res, next) => {
    const owner = req.user._id;
    const search = req.query.search;
    try {
        const query = {
            owner: owner,
        };
        if (search) {
            query.leadName = new RegExp(search, 'i');
        }
        const sequences = await Sequence.find(query).populate('owner sequenceTemplate').lean();
        res.status(200).send({ success: true, result: sequences });
    } catch (error) {
        next(error);
    }
};

const getSequenceById = async (req, res, next) => {
    const { id } = req.params;
    try {
        const sequence = await Sequence.findById(id).populate('sequenceTemplate');
        if (!sequence) {
            return res.status(404).json({ message: 'Sequence not found' });
        }
        res.status(200).send({ success: true, result: sequence });
    } catch (error) {
        next(error);
    }
};

const updateSequence = async (req, res, next) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const sequence = await Sequence.findByIdAndUpdate(id, updates, { new: true }).populate('owner sequenceTemplate');
        if (!sequence) {
            return res.status(404).json({ message: 'Sequence not found' });
        }
        res.status(200).send({ success: true, result: sequence });

    } catch (error) {
        next(error);
    }
};

const deleteSequences = async (req, res, next) => {
    const ids = req.body.ids
    const owner = req.user._id;

    if (!ids || ids.length === 0) {
        return res.status(400).json({ message: 'No IDs provided' });
    }

    try {
        // Delete sequences by IDs
        const result = await Sequence.deleteMany({ _id: { $in: ids } });

        // Check if any sequences were deleted
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'No sequences found for the provided IDs' });
        }

        // Update SequenceInfo with the number of deleted sequences
        await SequenceInfo.findOneAndUpdate(
            { owner },
            { $inc: { deletedSequences: ids.length } },
            { new: true, upsert: true }
        );
        // remove the deleted sequences ids from the corresponding leads
        const leads = await Lead.find({ assignedSequences: { $in: ids } });
        await Promise.all(leads.map(async (lead) => {
            // remove those assigned sequences ids from the lead which are in the ids
            lead.assignedSequences = lead.assignedSequences.filter((sequenceId) => ids.indexOf(sequenceId.toString()) === -1);
            // now we have to check if the sequences of the lead is now empty so
            // we can mark the lead as not having any sequence
            if (lead.assignedSequences.length === 0) {
                lead.emailsStatus = "allSequencesDeleted";
            }
            await lead.save();
        }))
        res.status(200).json({ success: true, result: result });
    } catch (error) {
        next(error);
    }
};


const getSequenceInfo = async (req, res, next) => {

    const owner = req.user._id;
    try {
        // those sequences which will be send 
        const sequenceInfo = await SequenceInfo.findOne({ owner });
        if (!sequenceInfo) {
            sequenceInfo = await SequenceInfo.create({ owner: owner });
        }
        // get the timestamp after next 24 hours
        const next24Hours = new Date();
        next24Hours.setHours(next24Hours.getHours() + 24);
        // the number of sequences that will be sent out in next 24 hours
        const nextSequences = await Sequence.find({ owner, nextMailDate: { $lt: next24Hours.getTime() } });
        res.status(200).send({
            success: true, result: {
                ...sequenceInfo.toObject(),
                nextSequenceEmails: nextSequences.length
            }
        }); // No content
    } catch (error) {
        next(error);
    }
};

export {
    createSequence,
    getSequences,
    getSequenceById,
    updateSequence,
    deleteSequences,
    getSequenceInfo
};
