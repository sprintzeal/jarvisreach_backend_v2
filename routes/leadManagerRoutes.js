import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { createUserMailSetting, deleteUserMailSetting, getUserMailSettings } from '../controllers/leadManager/userMailSettingController.js';
import { sendMail } from '../controllers/leadManager/sendMailController.js';
import multer from "multer";
import { assignTemplateToLead, createSequenceTemplate, deleteSequenceTemplate, getAllSequenceTemplates, getSequenceTemplateById, updateSequenceTemplate } from '../controllers/leadManager/sequenceTemplateController.js';
import { createSequence, deleteSequences, getSequenceById, getSequenceInfo, getSequences, updateSequence } from '../controllers/leadManager/sequenceController.js';
import { createLeadStatus, deleteLeadStatusesById, getAllLeadsStatusForLeads, getAllLeadStatuses, getLeadStatusById, leadsStatusOrder, updateLeadStatus, updateLeadStatusById } from '../controllers/leadManager/leadStatusController.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });


// mail routes
router.get('/mail-settings', protect, getUserMailSettings);
router.post('/mail-settings', protect, createUserMailSetting);
router.delete('/mail-settings', protect, deleteUserMailSetting);
router.post('/sendMail', protect, upload.array("attachments"), sendMail);

// Routes for sequence templates
router.post('/templates', protect, createSequenceTemplate);
router.get('/templates', protect, getAllSequenceTemplates);
router.get('/templates/:id', protect, getSequenceTemplateById);
router.put('/templates/:id', protect, updateSequenceTemplate);
router.delete('/templates', protect, deleteSequenceTemplate);
router.post('/templates/assignToLead', protect, assignTemplateToLead);

// routes from sequences
router.post('/sequences', protect, createSequence);
router.get('/sequences', protect, getSequences);
router.get('/sequences/:id', protect, getSequenceById);
router.put('/sequences/:id', protect, updateSequence);
router.delete('/sequences', protect, deleteSequences);

// sequences info
router.get('/sequences-info', protect, getSequenceInfo);

// LeadStatus Routes
router.post('/lead-statuses', protect, createLeadStatus);
router.get('/lead-statuses', protect, getAllLeadStatuses);
router.get('/lead-statuses/:id', protect, getLeadStatusById);
router.put('/lead-statuses/:id', protect, updateLeadStatusById);
router.delete('/lead-statuses', protect, deleteLeadStatusesById);
router.get('/status/getAllStatuses',protect, getAllLeadsStatusForLeads);
router.put('/status/orderStatuses',protect, leadsStatusOrder);
router.put('/status/updateStatus',protect, updateLeadStatus)



export default router;