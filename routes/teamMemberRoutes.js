import express from "express"


import { protect } from "../middleware/authMiddleware.js";
import { deleteTeamMember, getTeamData, getTeamMembers, sendInvitation } from "../controllers/teamController.js";


const router = express.Router()

router.post('/send-invitation', protect, sendInvitation);

router.get('/getAllTeam', protect, getTeamMembers);

router.get('/getTeamData', protect, getTeamData);

router.delete('/deleteMember/:id', protect, deleteTeamMember)



export default router;

