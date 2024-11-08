import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();
import Invitation from "../models/invitationModel.js"
import nodemailer from 'nodemailer'
import User from '../models/userModel.js';
import Team from '../models/teamModel.js';
import { teamInviteEmail } from '../services/sendHtmlTemplates.js';

const sendInvitation = async (req, res, next) => {
  const { inviteeEmail, inviteeName, } = req.body;
  const inviterEmail = req.user.email;
  const inviterName = req.user.name;

  try {
    const token = jwt.sign({ inviteeEmail }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    const invitationLink = `${process.env.APP_BASE_URL}login?token=${token}&teamAdmin=${req.user._id}`;

    teamInviteEmail(inviteeEmail, inviterName, inviteeName, invitationLink)

    const newInvitation = await Invitation.create({
      link: invitationLink,
      inviter: inviterEmail,
      inviteeEmail,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    });

    return res.status(200).json({
      success: true,
      message: 'Invitation sent successfully',
      result: newInvitation
    });
  } catch (error) {
    next(error);
  }

}

const getTeamMembers = async (req, res, next) => {

  const team = req.team;
  try {
    const allTeam = await User.find({ _id: { $in: team.accounts } })

    return res.status(200).json({
      success: true,
      result: allTeam
    });

  } catch (error) {
    next(error)
  }
}

// delete a team member

const deleteTeamMember = async (req, res, next) => {
  const customer = req.user;
  const teamMemberId = req.params.id;

  try {
    const teamMember = await User.findOneAndDelete({ role: "teammember", _id: teamMemberId, customerRef: customer._id })

    return res.status(200).json({
      success: true,
      message: 'Team member deleted successfully'
    });

  } catch (error) {
    next(error)
  }
}

// change role from teammember to admin

const changeRoleToAdmin = async (req, res, next) => {
  const customer = req.user;
  const teamMemberId = req.params.id;

  try {
    const teamMember = await User.findOneAndUpdate({ role: "teammember", _id: teamMemberId, customerRef: customer._id }, { role: "admin" }, { new: true })

    return res.status(200).json({
      success: true,
      message: 'Team member role changed to admin',
      result: teamMember
    });

  } catch (error) {
    next(error)
  }
}

const getTeamData = async (req, res, next) => {

  const team = req.team;
  try {
    const allTeam = await Team.find()

    return res.status(200).json({
      success: true,
      result: allTeam
    });

  } catch (error) {
    next(error)
  }
}

export {
  sendInvitation,
  getTeamMembers,
  deleteTeamMember,
  getTeamData
}