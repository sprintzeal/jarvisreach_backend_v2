import express from "express"
import {
    addNotesAndTags,
    assignLeadToTeamMember,
    checkLeadsExistance,
    createBulkLeads,
    createLead,
    createTag,
    deleteAdminImportedLeads,
    deleteLeads,
    getAllLeads,
    getAllTags,
    getLeadsOfCustomer,
    getLeadsOfFolder,
    moveLeadsToOtherFolder,
    tagUntagMultipleLeads,
    updateMultipleLeadsStatus,
    updateProfileById
} from "../controllers/leadController.js";

import { protect } from "../middleware/authMiddleware.js";


const router = express.Router()

router.post('/', protect, createLead);
router.get('/',protect, getAllLeads);
router.put('/update/:id',protect, updateProfileById);
router.delete('/deleteLeads',protect, deleteLeads);
router.delete('/deleteImportedLeads',protect, deleteAdminImportedLeads);
router.get('/:ownerId',protect, getLeadsOfCustomer);
router.get('/folder/:folderId',protect, getLeadsOfFolder);
router.post('assign/:profileId',protect, assignLeadToTeamMember);

//create a tag for the customer
router.post('/tags/createTag', protect, createTag)

router.get('/tags/getallTags', protect, getAllTags)

// apply or remove tags from multiple leads 
router.put('/tags/multiple/tagUntag', protect, tagUntagMultipleLeads)


// router for the addNotesAndTags
router.post('/tags/addnotesortags/:leadId',protect, addNotesAndTags)

// bulk actions
router.put('/moveToFolder',protect, moveLeadsToOtherFolder);
router.put('/multiple/status/updateStatus',protect, updateMultipleLeadsStatus);
router.post('/bulk/check/leads',protect, checkLeadsExistance)
router.post('/bulk/create',protect, createBulkLeads)






export default router;

