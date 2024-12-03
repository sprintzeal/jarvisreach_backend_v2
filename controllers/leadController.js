import Column from '../models/columnModel.js';
import Folder from '../models/folderModel.js';
import Sequence from '../models/leadManager/sequenceModel.js';
import Lead from '../models/leadModel.js';
import addedSummary from '../models/leadStatus.js';
import Tag from '../models/tagModel.js';
import User from '../models/userModel.js';
import View from '../models/viewModel.js';
import mongoose from 'mongoose';
import { freeCreditsUsedEmail, leadsExportedEmail } from '../services/sendHtmlTemplates.js';
import Plan from '../models/plans/planModel.js';
import { extractCompanyName, generateEmailFromSequenceAndVerify, sixStepsEmailVerification } from '../utils/functions.js';
import { getCompanySocialLinks, getEmailsService, getPhoneNumbersService } from '../services/googleSearchService.js';
import CustomError from '../utils/CustomError.js';
import { lockControllerForUser, unlockControllerForUser } from '../services/requestLocker.js';
import Team from '../models/teamModel.js';




// Create a new profile
const createLead = async (req, res, next) => {
    let data = req.body;
    data.profileUrl = `${'https://www.linkedin.com/in/' + data.linkedInId}`
    let owner

    // if (req.user.role === "customer") {
    //     owner = req.user._id
    // }
    // if (req.user.role === "teamMember") {
    //     owner = req.user.customerRef
    // }
    owner = req.team._id

    try {

        if (!owner) {
            throw new Error('Not Authenticated');
        }

        // we have to store the lead in the folder and make this folder as selected
        const folder = await Folder.findById(data.folderId);

        if (!folder) {
            return next(new Error('Folder not found'));
        }

        // // Deselect any currently selected folder
        // await Folder.updateOne({ owner, selected: true }, { selected: false })
        // folder.selected = true;

        // we have to replace if this profile already exists with this customer previous
        const existingLead = await Lead.findOne({ owner, linkedInId: data.linkedInId });
    

        let lead;

        if (existingLead) {
            // If it exists, replace it with new data but keep the same _id
            lead = await Lead.findOneAndUpdate(
                { _id: existingLead._id },
                { ...data, owner: owner.toString() },
                { new: true }
            );
            // Remove the old lead from the folder leads array
            const oldFolder = await Folder.findById(existingLead.folderId)
            const leadIndex = oldFolder.leads.indexOf(existingLead._id.toString());
            if (leadIndex > -1) {
                oldFolder.leads.splice(leadIndex, 1)
                await oldFolder.save()
            }
            // add the lead to the other folder
            folder.leads.push(existingLead._id);
        } else {
            // check the user plan credits remanning
            if (req.user.plan.credits <= req.user.plan.creditsUsed) {
                throw new Error("Not enough credits");
            }
            // If no existing profile, create a new one
            lead = new Lead({ ...data, owner: owner.toString() });
            await lead.save();
            folder.leads.push(lead._id);
            // decrease the user credits
            const userWithUpdatedCredits = await User.findByIdAndUpdate(req.user._id, { $inc: { 'plan.creditsUsed': +1 } }, { new: true });

            // notify user about the free plan credits end
            if (userWithUpdatedCredits.plan.plan && req.user.plan.credits <= userWithUpdatedCredits.plan.creditsUsed) {
                const userPlan = await Plan.findById(userWithUpdatedCredits.plan.plan)
                // now the credits are fully used so notify the user
                if (userPlan.name === process.env.FREE_PLAN_NAME) {
                    // send mail in the user is on free plan and his credits are fully used
                    freeCreditsUsedEmail(req.user.email, req.user.name, req.user.plan.credits)
                }
            }
        }
        await folder.save();
        res.status(200).json({ success: true, result: lead });
    } catch (error) {
        next(error)
    }
};



// Get a single profile by ID
const getProfileById = async (req, res, next) => {
    try {
        const profile = await Lead.findById(req.params.id);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        res.status(200).json({ success: true, result: profile });
    } catch (error) {
        next(error);
    }
};

// Update a profile by ID
const updateProfileById = async (req, res, next) => {
    const { updates } = req.body;
    try {
        const profile = await Lead.findByIdAndUpdate(req.params.id, { $set: updates }, {
            new: true,
            runValidators: true,
        });
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        res.status(200).json({ success: true, result: profile });
    } catch (error) {
        next(error);
    }
};

// Delete a profile by ID
const deleteLeads = async (req, res, next) => {
    console.log("Deleting files...");
    console.log(req.body)
    const { leadIds, folderId } = req.body;
    try {
        if (!leadIds || !Array.isArray(leadIds) || !folderId) {
            throw new Error("Lead IDs (Array) and folder ID are required")
        }
        // delete the leads
        await Lead.deleteMany({ _id: { $in: leadIds } });
        // remove the leads from the folder leads array
        const folder = await Folder.findById(folderId)
        folder.leads = folder.leads.filter(leadId => !leadIds.includes(leadId));
        await folder.save()

        // delete the Sequences assigned to this lead
        await Sequence.deleteMany({ lead: { $in: leadIds } })
        res.status(200).json({ success: true, message: 'Profile deleted successfully' });
    } catch (error) {
        next(error);
    }
};


//Delete by files name 
const deleteByFiles = async (req, res, next) => {
    const { filenames } = req.body;
    if (!filenames || !Array.isArray(filenames)) {
      return res.status(400).json({ message: "Invalid filenames array" });
    }
  
    try {
      const deletedLeads = await Lead.deleteMany({ filename: { $in: filenames } });
      if (deletedLeads.deletedCount === 0) {
        console.log("No leads found with the specified filenames");
      } else {
        console.log(`${deletedLeads.deletedCount} leads deleted successfully`);
      }
      const deletedSummaries = await addedSummary.deleteMany({
        filename: { $in: filenames },
      });
      if (deletedSummaries.deletedCount === 0) {
        console.log("No added summaries found with the specified filenames");
      } else {
        console.log(`${deletedSummaries.deletedCount} added summaries deleted successfully`);
      }
      res.status(200).json({
        success: true,
        message: `${deletedLeads.deletedCount + deletedSummaries.deletedCount} records deleted successfully`,
      });
    } catch (error) {
      console.error("Error deleting files:", error.message);
      next(error); 
    }
  };
  
  //get addedsumary Data
  const getAllAddedSummaries = async (req, res, next) => {
    try {
      const summaries = await addedSummary.find();
  
      if (summaries.length === 0) {
        return res.status(404).json({ message: "No added summaries found" });
      }
  
      res.status(200).json({
        success: true,
        addedData: summaries, 
        message: `${summaries.length} added summaries found.`,
      });
    } catch (error) {
      console.error("Error fetching added summaries:", error.message);
      next(error); 
    }
  };


// Get all the customer profiles 
const getLeadsOfCustomer = async (req, res, next) => {
    // const owner = req.params.ownerId
    const owner = owner = req.team._id
    try {
        const customerProfiles = await Lead.find({ owner })
        res.status(200).json({ success: true, result: customerProfiles });
    } catch (error) {
        next(error);
    }
};

// assign a profileData to a customer

const assignLeadToTeamMember = async (req, res, next) => {
    const { teamMemberId } = req.body;
    try {
        const targetProfile = await Lead.findOne(req.params.profileId);
        targetProfile.assignedTo.push(teamMemberId);
        await targetProfile.save();
        res.status(200).json({ success: true, message: 'Profile assigned successfully' });
    } catch (error) {
        next(error);
    }
}

// Get all the profiles of a folder
// for the table shown in customer dashboard
const getLeadsOfFolder = async (req, res, next) => {
    const folderId = req.params.folderId;
    const {
        page = 1,
        limit = 5,
        search,
        tags,
        created,
        creationDate,
        creationEndDate,
        updated,
        updationDate,
        updationEndDate,
        createdBy,
        recentlyCreated,
        customFilters,
        customFilterOperation,
        viewId,
        sequence,
        statuses
    } = req.query;

    try {
        if (!folderId) {
            throw new CustomError("Folder ID is required", 422)
        }
        const offset = (Number(page) - 1) * limit;

        let query = {};

        // searching
        if (search) {
            const searchQuery = {
                $or: [
                    { name: new RegExp(search, 'i') },
                    { emails: { $elemMatch: { email: { $regex: search, $options: 'i' } } } },
                    { linkedInId: new RegExp(search, 'i') },
                    { city: new RegExp(search, 'i') },
                    { state: new RegExp(search, 'i') },
                    { country: new RegExp(search, 'i') },
                ]
            };
            query = { ...query, ...searchQuery };
        }

        //-------------------------------------------------------------filtering start----------------------------------------------------------------//

        // Filter by Tags (exact match)
        if (tags) {
            const tagsArray = tags.split(',').map(tag => tag.trim());
            // Ensure tagsArray is not empty
            if (tagsArray.length > 0) {
                query.tags = { $in: tagsArray };
            }
        }

        if (statuses) {
            const statusesArray = statuses.split(',').map(status => status.trim());
            // Ensure statuses is not empty
            if (statuses.length > 0) {
                query.status = { $in: statusesArray };
            }
        }

        if (sequence) {
            query.template = sequence;
        }

        // Filter by Date Created On
        if (created) {
            const currentDate = new Date();
            switch (created) {
                case 'today':
                    query.created_at = {
                        $gte: new Date(currentDate.setHours(0, 0, 0, 0)),
                        $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                    };
                    break;
                case 'exactDate':
                    if (creationDate) {
                        const exactDate = new Date(parseInt(creationDate));
                        query.created_at = {
                            $gte: new Date(exactDate.setHours(0, 0, 0, 0)),
                            $lt: new Date(exactDate.setHours(23, 59, 59, 999))
                        };
                    }
                    break;
                case 'beforeDate':
                    if (creationDate) {
                        query.created_at = { $lt: new Date(parseInt(creationDate)) };
                    }
                    break;
                case 'afterDate':
                    if (creationDate) {
                        const dateEndTime = new Date(parseInt(creationDate))
                        // set the hourse to end of the day
                        dateEndTime.setHours(23, 59, 59, 999);
                        query.created_at = { $gte: dateEndTime };
                    }
                    break;
                case 'thisWeek':
                    const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                    startOfWeek.setHours(0, 0, 0, 0);
                    const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                    endOfWeek.setHours(23, 59, 59, 999);
                    query.created_at = { $gte: startOfWeek, $lt: endOfWeek };
                    break;
                case 'thisMonth':
                    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                    startOfMonth.setHours(0, 0, 0, 0);
                    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                    endOfMonth.setHours(23, 59, 59, 999);
                    query.created_at = { $gte: startOfMonth, $lt: endOfMonth };
                    break;
                case 'lastMonth':
                    const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                    startOfLastMonth.setHours(0, 0, 0, 0);
                    const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                    endOfLastMonth.setHours(23, 59, 59, 999);
                    query.created_at = { $gte: startOfLastMonth, $lt: endOfLastMonth };
                    break;
                case 'customRange':
                    if (creationDate && creationEndDate) {
                        const startTimeOfCreationDate = new Date(parseInt(creationDate));
                        startTimeOfCreationDate.setHours(0, 0, 0, 0);
                        const endTimeOfCreationEndDate = new Date(parseInt(creationEndDate));
                        endTimeOfCreationEndDate.setHours(23, 59, 59, 999);
                        query.created_at = {
                            $gte: startTimeOfCreationDate,
                            $lt: endTimeOfCreationEndDate
                        };
                    }
                    break;
                default:
                    break;
            }
        }

        // Filter by Date Updated On
        if (updated) {
            const currentDate = new Date();
            switch (updated) {
                case 'today':
                    query.updated_at = {
                        $gte: new Date(currentDate.setHours(0, 0, 0, 0)),
                        $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                    };
                    break;
                case 'exactDate':
                    if (updationDate) {
                        const exactUpdatedDate = new Date(parseInt(updationDate));
                        query.updated_at = {
                            $gte: new Date(exactUpdatedDate.setHours(0, 0, 0, 0)),
                            $lt: new Date(exactUpdatedDate.setHours(23, 59, 59, 999))
                        };
                    }
                    break;
                case 'beforeDate':
                    if (updationDate) {
                        query.updated_at = { $lt: new Date(parseInt(updationDate)) };
                    }
                    break;
                case 'afterDate':
                    if (updationDate) {
                        const dateEndTime = new Date(parseInt(updationDate))
                        // set the hourse to end of the day
                        dateEndTime.setHours(23, 59, 59, 999);
                        query.updated_at = { $gte: dateEndTime };
                    }
                    break;
                case 'thisWeek':
                    const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                    startOfWeek.setHours(0, 0, 0, 0);
                    const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                    endOfWeek.setHours(23, 59, 59, 999);
                    query.updated_at = { $gte: startOfWeek, $lt: endOfWeek };
                    break;
                case 'thisMonth':
                    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                    startOfMonth.setHours(0, 0, 0, 0);
                    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                    endOfMonth.setHours(23, 59, 59, 999);
                    query.updated_at = { $gte: startOfMonth, $lt: endOfMonth };
                    break;
                case 'lastMonth':
                    const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                    startOfLastMonth.setHours(0, 0, 0, 0);
                    const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                    endOfLastMonth.setHours(23, 59, 59, 999);
                    query.updated_at = { $gte: startOfLastMonth, $lt: endOfLastMonth };
                    break;
                case 'customRange':
                    if (updationDate && updationEndDate) {
                        const startTimeOfUpdationDate = new Date(parseInt(updationDate));
                        startTimeOfUpdationDate.setHours(0, 0, 0, 0);
                        const endTimeOfUpdationEndDate = new Date(parseInt(updationEndDate));
                        endTimeOfUpdationEndDate.setHours(23, 59, 59, 999);
                        query.updated_at = {
                            $gte: startTimeOfUpdationDate,
                            $lt: endTimeOfUpdationEndDate
                        };
                    }
                    break;
                default:
                    break;
            }
        }

        // filter based the owner of the leads
        if (createdBy) {
            const createdByUsers = createdBy.split(',');
            const users = await User.find({ name: { $in: createdByUsers } });
            const userIds = users.map(user => user._id);
            query.owner = { $in: userIds };
        }

        // advance filters for checking the data and existance of fileds, weather a field exists or weather there is data in that field or not
        if (customFilters) {
            // parse the custom filters 
            const filters = JSON.parse(customFilters);

            let advFilters = [];

            filters.forEach(filter => {
                const { name, operator, value, date, startDate, endDate } = filter;
                if (name === "firstName") {
                    //filter on name field
                    if (operator === "is") {
                        // here push filter that equles the name
                        advFilters.push({ firstName: { $regex: new RegExp(value, 'i') } })
                    }
                    else if (operator === "isNot") {
                        // here push filter that not equales the name
                        advFilters.push({ firstName: { $not: new RegExp(value, 'i') } })
                    }
                    else if (operator === "isBlank") {
                        // filter all the leads those name is blank or null
                        advFilters.push({ firstName: { $exists: false } })
                    }
                    else {
                        // filter all the leads those name is not blank or null
                        advFilters.push({ firstName: { $exists: true, $ne: "" } })
                    }
                }
                if (name === "lastName") {
                    //filter on name field
                    if (operator === "is") {
                        // here push filter that equles the name
                        advFilters.push({ lastName: { $regex: new RegExp(value, 'i') } })
                    }
                    else if (operator === "isNot") {
                        // here push filter that not equales the name
                        advFilters.push({ lastName: { $not: new RegExp(value, 'i') } })
                    }
                    else if (operator === "isBlank") {
                        // filter all the leads those name is blank or null
                        advFilters.push({ lastName: { $exists: false } })
                    }
                    else {
                        // filter all the leads those name is not blank or null
                        advFilters.push({ lastName: { $exists: true, $ne: "" } })
                    }
                }
                if (name === "leadStatus") {
                    //filter on name field
                    if (operator === "isAnyOf") {
                        // filter all the leads those status are in the provided value array
                        advFilters.push({ status: { $in: value } })
                    }
                    else if (operator === "isNonOf") {
                        // filter all the leads those status is not in the provided value array
                        advFilters.push({ status: { $nin: value } })
                    }
                    else if (operator === "isBlank") {
                        // filter all the leads those status is blank or null
                        advFilters.push({ status: { $exists: false } })
                    }
                    else {
                        // filter all the leads those status is not blank or null
                        advFilters.push({ status: { $exists: true } })
                    }
                }
                if (name === "country") {
                    // filter on name field
                    if (operator === "isAnyOf") {
                        // filter all the leads those country are in the provided value array
                        advFilters.push({ country: { $in: value } })

                    }
                    else if (operator === "isNonOf") {
                        // filter all the leads those country is not in the provided value array
                        advFilters.push({ country: { $nin: value } })

                    }
                    else if (operator === "isBlank") {
                        // filter all the leads those country is blank or null
                        advFilters.push({ country: { $exists: false } })
                    }
                    else {
                        // filter all the leads those country is not blank or null
                        advFilters.push({ country: { $exists: true, $ne: "" } })
                    }
                }
                if (name === "state") {
                    // filter on name field
                    if (operator === "is") {
                        // filter all the leads those state are in the provided value array
                        advFilters.push({ state: { $in: value } })

                    }
                    else if (operator === "isNot") {
                        // filter all the leads those state is not in the provided value array
                        advFilters.push({ state: { $nin: value } })

                    }
                    else if (operator === "isBlank") {
                        // filter all the leads those state is blank or null
                        advFilters.push({ state: { $exists: false } })
                    }
                    else {
                        // filter all the leads those state is not blank or null
                        advFilters.push({ state: { $exists: true, $ne: "" } })
                    }
                }
                if (name === "city") {
                    // filter on name field
                    if (operator === "isAnyOf") {
                        // filter all the leads those city are in the provided value array
                        advFilters.push({ city: { $in: value } })

                    }
                    else if (operator === "isNonOf") {
                        // filter all the leads those city is not in the provided value array
                        advFilters.push({ city: { $nin: value } })

                    }
                    else if (operator === "isBlank") {
                        // filter all the leads those city is blank or null
                        advFilters.push({ city: { $exists: false } })
                    }
                    else {
                        // filter all the leads those city is not blank or null
                        advFilters.push({ city: { $exists: true, $ne: "" } })
                    }
                }
                if (name === "company") {
                    //filter on name field
                    if (operator === "is") {
                        // here push filter that equles the company name
                        advFilters.push({ 'company.company': { $regex: new RegExp(value, 'i') } })
                    }
                    else if (operator === "isNot") {
                        // here push filter that not equales the company name
                        advFilters.push({ 'company.company': { $not: new RegExp(value, 'i') } })
                    }
                    else if (operator === "isBlank") {
                        // filter all the leads those company name is blank or null
                        advFilters.push({ 'company.company': { $exists: false } })
                    }
                    else {
                        // filter all the leads those company name is not blank or null
                        advFilters.push({ 'company.company': { $exists: true, $ne: "" } })
                    }
                }
                if (name === "jobTitle") {
                    //filter on name field
                    if (operator === "is") {
                        // here push filter that equles the company name
                        advFilters.push({ 'company.position': { $regex: new RegExp(value, 'i') } })
                    }
                    else if (operator === "isNot") {
                        // here push filter that not equales the company name
                        advFilters.push({ 'company.position': { $not: new RegExp(value, 'i') } })
                    }
                    else if (operator === "isBlank") {
                        // filter all the leads those company name is blank or null
                        advFilters.push({ 'company.position': { $exists: false } })
                    }
                    else {
                        // filter all the leads those company name is not blank or null
                        advFilters.push({ 'company.position': { $exists: true, $ne: "" } })
                    }
                }
                if (name === "tag") {
                    // filter on name field
                    if (operator === "isAnyOf") {
                        // filter all the leads those city are in the provided value array
                        advFilters.push({ tags: { $in: value } })

                    }
                    else if (operator === "isNonOf") {
                        // filter all the leads those tags is not in the provided value array
                        advFilters.push({ tags: { $nin: value } })

                    }
                    else if (operator === "isBlank") {
                        // filter all the leads those tags is blank or null
                        advFilters.push({ tags: { $exists: false } })
                    }
                    else {
                        // filter all the leads those tags is not blank or null
                        advFilters.push({ tags: { $exists: true, $ne: "" } })
                    }
                }
                if (name === "creationDate") {
                    if (operator === "isBlank") {
                        // filter all the leads those state is blank or null
                        advFilters.push({ created_at: { $exists: false } })
                    }
                    // filter on name field
                    if (operator === "is") {

                        const currentDate = new Date();

                        switch (value) {
                            case 'today':
                                advFilters.push({
                                    created_at: {
                                        $gte: new Date(currentDate.setHours(0, 0, 0, 0)),
                                        $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                                    }
                                });
                                break;
                            case 'exactDate':
                                if (date) {
                                    const exactDate = new Date(parseInt(date));
                                    advFilters.push({
                                        created_at: {
                                            $gte: new Date(exactDate.setHours(0, 0, 0, 0)),
                                            $lt: new Date(exactDate.setHours(23, 59, 59, 999))
                                        }
                                    });
                                }
                                break;
                            case 'beforeDate':
                                if (date) {
                                    advFilters.push({ created_at: { $lt: new Date(parseInt(date)) } });
                                }
                                break;
                            case 'afterDate':
                                if (date) {
                                    const dateEndTime = new Date(parseInt(date))
                                    // set the hourse to end of the day
                                    dateEndTime.setHours(23, 59, 59, 999);
                                    advFilters.push({ created_at: { $gte: dateEndTime } });
                                }
                                break;
                            case 'thisWeek':
                                const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                                startOfWeek.setHours(0, 0, 0, 0);
                                const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                                endOfWeek.setHours(23, 59, 59, 999);
                                advFilters.push({ created_at: { $gte: startOfWeek, $lt: endOfWeek } });
                                break;
                            case 'thisMonth':
                                const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                                startOfMonth.setHours(0, 0, 0, 0);
                                const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                                endOfMonth.setHours(23, 59, 59, 999);
                                advFilters.push({ created_at: { $gte: startOfMonth, $lt: endOfMonth } });
                                break;
                            case 'lastMonth':
                                const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                                startOfLastMonth.setHours(0, 0, 0, 0);
                                const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                                endOfLastMonth.setHours(23, 59, 59, 999);
                                advFilters.push({ created_at: { $gte: startOfLastMonth, $lt: endOfLastMonth } });
                                break;
                            case 'customRange':
                                if (startDate && endDate) {
                                    const startTimeOfStartDate = new Date(parseInt(startDate));
                                    startTimeOfStartDate.setHours(0, 0, 0, 0);
                                    const endTimeOfEndDate = new Date(parseInt(endDate));
                                    endTimeOfEndDate.setHours(23, 59, 59, 999);
                                    advFilters.push({
                                        created_at: {
                                            $gte: startTimeOfStartDate,
                                            $lt: endTimeOfEndDate
                                        }
                                    });
                                }
                                break;
                            default:
                                break;
                        }
                    }
                    else if (operator === "isNot") {
                        // filter all the leads whose date is not the provided value or in the range
                        const currentDate = new Date();

                        switch (value) {
                            case 'today':
                                // those leads which are not created today
                                advFilters.push({
                                    created_at: {
                                        $lt: new Date(currentDate.setHours(0, 0, 0, 0)),
                                        // $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                                    }
                                });
                                break;
                            case 'exactDate':
                                // those leads which are not created this exact date
                                if (date) {
                                    const exactDate = new Date(parseInt(date));
                                    advFilters.push({
                                        created_at: {
                                            $lt: new Date(exactDate.setHours(0, 0, 0, 0)),
                                            $gte: new Date(exactDate.setHours(23, 59, 59, 999))
                                        }
                                    });
                                }
                                break;
                            case 'beforeDate':
                                // those leads which are not created before this date
                                if (date) {
                                    advFilters.push({ created_at: { $gte: new Date(parseInt(date)) } });
                                }
                                break;
                            case 'afterDate':
                                // those leads which are not created after this date
                                if (date) {
                                    const dateEndTime = new Date(parseInt(date))
                                    // set the hourse to end of the day
                                    dateEndTime.setHours(23, 59, 59, 999);
                                    advFilters.push({ created_at: { $lt: dateEndTime } });
                                }
                                break;
                            case 'thisWeek':
                                // those leads which are not created this week
                                const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                                startOfWeek.setHours(0, 0, 0, 0);
                                const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                                endOfWeek.setHours(23, 59, 59, 999);
                                advFilters.push({ created_at: { $lt: startOfWeek, $gte: endOfWeek } });
                                break;
                            case 'thisMonth':
                                // those leads which are not created this month
                                const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                                startOfMonth.setHours(0, 0, 0, 0);
                                const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                                endOfMonth.setHours(23, 59, 59, 999);
                                advFilters.push({ created_at: { $lt: startOfMonth, $gte: endOfMonth } });
                                break;
                            case 'lastMonth':
                                // those leads which are not created last month
                                const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                                startOfLastMonth.setHours(0, 0, 0, 0);
                                const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                                endOfLastMonth.setHours(23, 59, 59, 999);
                                advFilters.push({ created_at: { $lt: startOfLastMonth, $gte: endOfLastMonth } });
                                break;
                            case 'customRange':
                                // those leads which are not created in between this range
                                if (startDate && endDate) {
                                    const startTimeOfStartDate = new Date(parseInt(startDate));
                                    startTimeOfStartDate.setHours(0, 0, 0, 0);
                                    const endTimeOfEndDate = new Date(parseInt(endDate));
                                    endTimeOfEndDate.setHours(23, 59, 59, 999);
                                    advFilters.push({
                                        created_at: {
                                            $lt: startTimeOfStartDate,
                                            $gte: new endTimeOfEndDate
                                        }
                                    });
                                }
                                break;
                            default:
                                break;
                        }
                    }
                    else {
                        // filter all the leads those state is not blank or null
                        advFilters.push({ created_at: { $exists: true, $ne: "" } })
                    }
                }
                if (name === "updationDate") {
                    if (operator === "isBlank") {
                        // filter all the leads those state is blank or null
                        advFilters.push({ updated_at: { $exists: false } })
                    }
                    // filter on name field
                    if (operator === "is") {

                        const currentDate = new Date();

                        switch (value) {
                            case 'today':
                                advFilters.push({
                                    updated_at: {
                                        $gte: new Date(currentDate.setHours(0, 0, 0, 0)),
                                        $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                                    }
                                });
                                break;
                            case 'exactDate':
                                if (date) {
                                    const exactDate = new Date(parseInt(date));
                                    advFilters.push({
                                        updated_at: {
                                            $gte: new Date(exactDate.setHours(0, 0, 0, 0)),
                                            $lt: new Date(exactDate.setHours(23, 59, 59, 999))
                                        }
                                    });
                                }
                                break;
                            case 'beforeDate':
                                if (date) {
                                    advFilters.push({ updated_at: { $lt: new Date(parseInt(date)) } });
                                }
                                break;
                            case 'afterDate':
                                if (date) {
                                    const dateEndTime = new Date(parseInt(date))
                                    // set the hourse to end of the day
                                    dateEndTime.setHours(23, 59, 59, 999);
                                    advFilters.push({ updated_at: { $gte: dateEndTime } });
                                }
                                break;
                            case 'thisWeek':
                                const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                                startOfWeek.setHours(0, 0, 0, 0);
                                const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                                endOfWeek.setHours(23, 59, 59, 999);
                                advFilters.push({ updated_at: { $gte: startOfWeek, $lt: endOfWeek } });
                                break;
                            case 'thisMonth':
                                const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                                startOfMonth.setHours(0, 0, 0, 0);
                                const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                                endOfMonth.setHours(23, 59, 59, 999);
                                advFilters.push({ updated_at: { $gte: startOfMonth, $lt: endOfMonth } });
                                break;
                            case 'lastMonth':
                                const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                                startOfLastMonth.setHours(0, 0, 0, 0);
                                const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                                endOfLastMonth.setHours(23, 59, 59, 999);
                                advFilters.push({ updated_at: { $gte: startOfLastMonth, $lt: endOfLastMonth } });
                                break;
                            case 'customRange':
                                if (startDate && endDate) {
                                    const startTimeOfStartDate = new Date(parseInt(startDate));
                                    startTimeOfStartDate.setHours(0, 0, 0, 0);
                                    const endTimeOfEndDate = new Date(parseInt(endDate));
                                    endTimeOfEndDate.setHours(23, 59, 59, 999);
                                    advFilters.push({
                                        updated_at: {
                                            $gte: startTimeOfStartDate,
                                            $lt: endTimeOfEndDate
                                        }
                                    });
                                }
                                break;
                            default:
                                break;
                        }
                    }
                    else if (operator === "isNot") {
                        // filter all the leads whose date is not the provided value or in the range
                        const currentDate = new Date();

                        switch (value) {
                            case 'today':
                                // those leads which are not created today
                                advFilters.push({
                                    updated_at: {
                                        $lt: new Date(currentDate.setHours(0, 0, 0, 0)),
                                        // $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                                    }
                                });
                                break;
                            case 'exactDate':
                                // those leads which are not created this exact date
                                if (date) {
                                    const exactDate = new Date(parseInt(date));
                                    advFilters.push({
                                        updated_at: {
                                            $lt: new Date(exactDate.setHours(0, 0, 0, 0)),
                                            $gte: new Date(exactDate.setHours(23, 59, 59, 999))
                                        }
                                    });
                                }
                                break;
                            case 'beforeDate':
                                // those leads which are not created before this date
                                if (date) {
                                    advFilters.push({ updated_at: { $gte: new Date(parseInt(date)) } });
                                }
                                break;
                            case 'afterDate':
                                // those leads which are not created after this date
                                if (date) {
                                    const dateEndTime = new Date(parseInt(date))
                                    // set the hourse to end of the day
                                    dateEndTime.setHours(23, 59, 59, 999);

                                    advFilters.push({ updated_at: { $lt: dateEndTime } });
                                }
                                break;
                            case 'thisWeek':
                                // those leads which are not created this week
                                const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                                startOfWeek.setHours(0, 0, 0, 0);
                                const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                                endOfWeek.setHours(23, 59, 59, 999);
                                advFilters.push({ updated_at: { $lt: startOfWeek, $gte: endOfWeek } });
                                break;
                            case 'thisMonth':
                                // those leads which are not created this month
                                const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                                startOfMonth.setHours(0, 0, 0, 0);
                                const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                                endOfMonth.setHours(23, 59, 59, 999);
                                advFilters.push({ updated_at: { $lt: startOfMonth, $gte: endOfMonth } });
                                break;
                            case 'lastMonth':
                                // those leads which are not created last month
                                const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                                startOfLastMonth.setHours(0, 0, 0, 0);
                                const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                                endOfLastMonth.setHours(23, 59, 59, 999);
                                advFilters.push({ updated_at: { $lt: startOfLastMonth, $gte: endOfLastMonth } });
                                break;
                            case 'customRange':
                                // those leads which are not created in between this range
                                if (startDate && endDate) {
                                    const startTimeOfStartDate = new Date(parseInt(startDate));
                                    startTimeOfStartDate.setHours(0, 0, 0, 0);
                                    const endTimeOfEndDate = new Date(parseInt(endDate));
                                    endTimeOfEndDate.setHours(23, 59, 59, 999);
                                    advFilters.push({
                                        updated_at: {
                                            $lt: startTimeOfStartDate,
                                            $gte: endTimeOfEndDate
                                        }
                                    });
                                }
                                break;
                            default:
                                break;
                        }
                    }
                    else {
                        // filter all the leads those state is not blank or null
                        advFilters.push({ updated_at: { $exists: true, $ne: "" } })
                    }
                }
            })
            // insert the advFilters in the query
            if (advFilters.length > 0) {
                if (customFilterOperation === "any") {
                    // if any of the filters matches
                    query.$or = advFilters;
                }
                else {
                    // all the filters must match
                    query.$and = advFilters;
                }
            }
        }

        //---------------------------------------------------filtering end----------------------------------------------------------------//


        //--------------sorting start-------------------//
        let sort = {
            created_at: -1 // default sort by created_at so get the latest created leads first
        };

        // we have to apply sorting based on the selected view setting of a user
        if (viewId) {
            const view = await View.findById(viewId);
            const viewColumns = await Column.findById(view.columns)
            // we need the columns whose are selected for sort
            const sortingColumns = viewColumns.columns.filter(column => column.sort !== "NS");
            // now we have to arrange the columns based on the sortOrder so the leads will be sorted based on that order
            sortingColumns.sort((a, b) => a.sortOrder - b.sortOrder);

            if (sortingColumns.length > 0) {
                sortingColumns.forEach(column => {
                    // sort the leads by the given column in the given order
                    const sortSequence = column.sort === "AS" ? 1 : -1

                    if (column.name === "createdAt") {
                        sort = { ...sort, 'created_at': sortSequence };
                    }
                    if (column.name === "owner") {
                        sort = { ...sort, 'owner': sortSequence };
                    }
                    if (column.name === "company") {
                        sort = { ...sort, 'company.company': sortSequence };
                    }
                    if (column.name === "profile") {
                        sort = { ...sort, 'profile.name': sortSequence };
                    }
                    if (column.name === "updatedFromLinkedin") {
                        sort = { ...sort, 'updatedFromLinkedin': sortSequence };
                    }
                })

            } else {
                // if no sort column is provided sort the leads by the created_at column in descending order
                sort = { created_at: -1 };
            }
        }

        //--------------sorting end-------------------//


        if (folderId && folderId !== 'null') {
            // only get the profiles belonging to this folder
            query.folderId = folderId;
        }
        else {
            // if the folderId is not provided so we have to set in the query the ist id of the ist folder
            const istItem = await Folder.findOne();

            query.folderId = istItem._id.toString();
        }


        // here we will look which columns of a view of a customer are not hidden so we will send data of those colomns
        // find the view of the customer
        // const view = await View.find({ owner: req.user._id })
        const folderProfiles = await Lead.find(query).sort(sort).skip(offset).limit(Number(limit)).populate('tags status template');

        const totalRecord = await Lead.countDocuments(query)

        res.status(200).json({
            success: true,
            result: { folderProfiles, totalRecord, currentPage: Number(page), limit: Number(limit) }
        });

    } catch (error) {
        next(error);
    }
};









// Get all the leads for admin
// for the table shown in admin dashboard
const getAllLeads = async (req, res, next) => {

    const {
        page = 1,
        limit = 5,
        search,
        tags,
        created,
        creationDate,
        creationEndDate,
        updated,
        updationDate,
        updationEndDate,
        createdBy,
        recentlyCreated,
        customFilters,
        customFilterOperation,
        viewId,
        sequence,
        statuses
    } = req.query;

    const offset = (Number(page) - 1) * limit;

    let query = {};

    // searching
    if (search) {
        const searchQuery = {
            $or: [
                { name: new RegExp(search, 'i') },
                { emails: { $elemMatch: { email: { $regex: search, $options: 'i' } } } },
                { linkedInId: new RegExp(search, 'i') },
                { city: new RegExp(search, 'i') },
                { state: new RegExp(search, 'i') },
                { country: new RegExp(search, 'i') },
            ]
        };
        query = { ...query, ...searchQuery };
    }

    //-------------------------------------------------------------filtering start----------------------------------------------------------------//

    // Filter by Tags (exact match)
    if (tags) {
        const tagsArray = tags.split(',').map(tag => tag.trim());
        // Ensure tagsArray is not empty
        if (tagsArray.length > 0) {
            query.tags = { $in: tagsArray };
        }
    }

    if (statuses) {
        const statusesArray = statuses.split(',').map(status => status.trim());
        // Ensure statuses is not empty
        if (statuses.length > 0) {
            query.status = { $in: statusesArray };
        }
    }

    if (sequence) {
        query.template = sequence;
    }

    // Filter by Date Created On
    if (created) {
        const currentDate = new Date();
        switch (created) {
            case 'today':
                query.created_at = {
                    $gte: new Date(currentDate.setHours(0, 0, 0, 0)),
                    $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                };
                break;
            case 'exactDate':
                if (creationDate) {
                    const exactDate = new Date(parseInt(creationDate));
                    query.created_at = {
                        $gte: new Date(exactDate.setHours(0, 0, 0, 0)),
                        $lt: new Date(exactDate.setHours(23, 59, 59, 999))
                    };
                }
                break;
            case 'beforeDate':
                if (creationDate) {
                    query.created_at = { $lt: new Date(parseInt(creationDate)) };
                }
                break;
            case 'afterDate':
                if (creationDate) {
                    const dateEndTime = new Date(parseInt(creationDate))
                    // set the hourse to end of the day
                    dateEndTime.setHours(23, 59, 59, 999);
                    query.created_at = { $gte: dateEndTime };
                }
                break;
            case 'thisWeek':
                const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                startOfWeek.setHours(0, 0, 0, 0);
                const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                endOfWeek.setHours(23, 59, 59, 999);
                query.created_at = { $gte: startOfWeek, $lt: endOfWeek };
                break;
            case 'thisMonth':
                const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                startOfMonth.setHours(0, 0, 0, 0);
                const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                endOfMonth.setHours(23, 59, 59, 999);
                query.created_at = { $gte: startOfMonth, $lt: endOfMonth };
                break;
            case 'lastMonth':
                const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                startOfLastMonth.setHours(0, 0, 0, 0);
                const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                endOfLastMonth.setHours(23, 59, 59, 999);
                query.created_at = { $gte: startOfLastMonth, $lt: endOfLastMonth };
                break;
            case 'customRange':
                if (creationDate && creationEndDate) {
                    const startTimeOfCreationDate = new Date(parseInt(creationDate));
                    startTimeOfCreationDate.setHours(0, 0, 0, 0);
                    const endTimeOfCreationEndDate = new Date(parseInt(creationEndDate));
                    endTimeOfCreationEndDate.setHours(23, 59, 59, 999);
                    query.created_at = {
                        $gte: startTimeOfCreationDate,
                        $lt: endTimeOfCreationEndDate
                    };
                }
                break;
            default:
                break;
        }
    }

    // Filter by Date Updated On
    if (updated) {
        const currentDate = new Date();
        switch (updated) {
            case 'today':
                query.updated_at = {
                    $gte: new Date(currentDate.setHours(0, 0, 0, 0)),
                    $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                };
                break;
            case 'exactDate':
                if (updationDate) {
                    const exactUpdatedDate = new Date(parseInt(updationDate));
                    query.updated_at = {
                        $gte: new Date(exactUpdatedDate.setHours(0, 0, 0, 0)),
                        $lt: new Date(exactUpdatedDate.setHours(23, 59, 59, 999))
                    };
                }
                break;
            case 'beforeDate':
                if (updationDate) {
                    query.updated_at = { $lt: new Date(parseInt(updationDate)) };
                }
                break;
            case 'afterDate':
                if (updationDate) {
                    const dateEndTime = new Date(parseInt(updationDate))
                    // set the hourse to end of the day
                    dateEndTime.setHours(23, 59, 59, 999);
                    query.updated_at = { $gte: dateEndTime };
                }
                break;
            case 'thisWeek':
                const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                startOfWeek.setHours(0, 0, 0, 0);
                const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                endOfWeek.setHours(23, 59, 59, 999);
                query.updated_at = { $gte: startOfWeek, $lt: endOfWeek };
                break;
            case 'thisMonth':
                const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                startOfMonth.setHours(0, 0, 0, 0);
                const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                endOfMonth.setHours(23, 59, 59, 999);
                query.updated_at = { $gte: startOfMonth, $lt: endOfMonth };
                break;
            case 'lastMonth':
                const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                startOfLastMonth.setHours(0, 0, 0, 0);
                const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                endOfLastMonth.setHours(23, 59, 59, 999);
                query.updated_at = { $gte: startOfLastMonth, $lt: endOfLastMonth };
                break;
            case 'customRange':
                if (updationDate && updationEndDate) {
                    const startTimeOfUpdationDate = new Date(parseInt(updationDate));
                    startTimeOfUpdationDate.setHours(0, 0, 0, 0);
                    const endTimeOfUpdationEndDate = new Date(parseInt(updationEndDate));
                    endTimeOfUpdationEndDate.setHours(23, 59, 59, 999);
                    query.updated_at = {
                        $gte: startTimeOfUpdationDate,
                        $lt: endTimeOfUpdationEndDate
                    };
                }
                break;
            default:
                break;
        }
    }

    // filter based the owner of the leads
    if (createdBy) {
        const createdByUsers = createdBy.split(',');
        const users = await User.find({ name: { $in: createdByUsers } });
        const userIds = users.map(user => user._id);
        query.owner = { $in: userIds };
    }

    // advance filters for checking the data and existance of fileds, weather a field exists or weather there is data in that field or not
    if (customFilters) {
        // parse the custom filters 
        const filters = JSON.parse(customFilters);

        let advFilters = [];

        filters.forEach(filter => {
            const { name, operator, value, date, startDate, endDate } = filter;
            if (name === "firstName") {
                //filter on name field
                if (operator === "is") {
                    // here push filter that equles the name
                    advFilters.push({ firstName: { $regex: new RegExp(value, 'i') } })
                }
                else if (operator === "isNot") {
                    // here push filter that not equales the name
                    advFilters.push({ firstName: { $not: new RegExp(value, 'i') } })
                }
                else if (operator === "isBlank") {
                    // filter all the leads those name is blank or null
                    advFilters.push({ firstName: { $exists: false } })
                }
                else {
                    // filter all the leads those name is not blank or null
                    advFilters.push({ firstName: { $exists: true, $ne: "" } })
                }
            }
            if (name === "lastName") {
                //filter on name field
                if (operator === "is") {
                    // here push filter that equles the name
                    advFilters.push({ lastName: { $regex: new RegExp(value, 'i') } })
                }
                else if (operator === "isNot") {
                    // here push filter that not equales the name
                    advFilters.push({ lastName: { $not: new RegExp(value, 'i') } })
                }
                else if (operator === "isBlank") {
                    // filter all the leads those name is blank or null
                    advFilters.push({ lastName: { $exists: false } })
                }
                else {
                    // filter all the leads those name is not blank or null
                    advFilters.push({ lastName: { $exists: true, $ne: "" } })
                }
            }
            if (name === "leadStatus") {
                //filter on name field
                if (operator === "isAnyOf") {
                    // filter all the leads those status are in the provided value array
                    advFilters.push({ status: { $in: value } })
                }
                else if (operator === "isNonOf") {
                    // filter all the leads those status is not in the provided value array
                    advFilters.push({ status: { $nin: value } })
                }
                else if (operator === "isBlank") {
                    // filter all the leads those status is blank or null
                    advFilters.push({ status: { $exists: false } })
                }
                else {
                    // filter all the leads those status is not blank or null
                    advFilters.push({ status: { $exists: true } })
                }
            }
            if (name === "country") {
                // filter on name field
                if (operator === "isAnyOf") {
                    // filter all the leads those country are in the provided value array
                    advFilters.push({ country: { $in: value } })

                }
                else if (operator === "isNonOf") {
                    // filter all the leads those country is not in the provided value array
                    advFilters.push({ country: { $nin: value } })

                }
                else if (operator === "isBlank") {
                    // filter all the leads those country is blank or null
                    advFilters.push({ country: { $exists: false } })
                }
                else {
                    // filter all the leads those country is not blank or null
                    advFilters.push({ country: { $exists: true, $ne: "" } })
                }
            }
            if (name === "state") {
                // filter on name field
                if (operator === "is") {
                    // filter all the leads those state are in the provided value array
                    advFilters.push({ state: { $in: value } })

                }
                else if (operator === "isNot") {
                    // filter all the leads those state is not in the provided value array
                    advFilters.push({ state: { $nin: value } })

                }
                else if (operator === "isBlank") {
                    // filter all the leads those state is blank or null
                    advFilters.push({ state: { $exists: false } })
                }
                else {
                    // filter all the leads those state is not blank or null
                    advFilters.push({ state: { $exists: true, $ne: "" } })
                }
            }
            if (name === "city") {
                // filter on name field
                if (operator === "isAnyOf") {
                    // filter all the leads those city are in the provided value array
                    advFilters.push({ city: { $in: value } })

                }
                else if (operator === "isNonOf") {
                    // filter all the leads those city is not in the provided value array
                    advFilters.push({ city: { $nin: value } })

                }
                else if (operator === "isBlank") {
                    // filter all the leads those city is blank or null
                    advFilters.push({ city: { $exists: false } })
                }
                else {
                    // filter all the leads those city is not blank or null
                    advFilters.push({ city: { $exists: true, $ne: "" } })
                }
            }
            if (name === "company") {
                //filter on name field
                if (operator === "is") {
                    // here push filter that equles the company name
                    advFilters.push({ 'company.company': { $regex: new RegExp(value, 'i') } })
                }
                else if (operator === "isNot") {
                    // here push filter that not equales the company name
                    advFilters.push({ 'company.company': { $not: new RegExp(value, 'i') } })
                }
                else if (operator === "isBlank") {
                    // filter all the leads those company name is blank or null
                    advFilters.push({ 'company.company': { $exists: false } })
                }
                else {
                    // filter all the leads those company name is not blank or null
                    advFilters.push({ 'company.company': { $exists: true, $ne: "" } })
                }
            }
            if (name === "jobTitle") {
                //filter on name field
                if (operator === "is") {
                    // here push filter that equles the company name
                    advFilters.push({ 'company.position': { $regex: new RegExp(value, 'i') } })
                }
                else if (operator === "isNot") {
                    // here push filter that not equales the company name
                    advFilters.push({ 'company.position': { $not: new RegExp(value, 'i') } })
                }
                else if (operator === "isBlank") {
                    // filter all the leads those company name is blank or null
                    advFilters.push({ 'company.position': { $exists: false } })
                }
                else {
                    // filter all the leads those company name is not blank or null
                    advFilters.push({ 'company.position': { $exists: true, $ne: "" } })
                }
            }
            if (name === "tag") {
                // filter on name field
                if (operator === "isAnyOf") {
                    // filter all the leads those city are in the provided value array
                    advFilters.push({ tags: { $in: value } })

                }
                else if (operator === "isNonOf") {
                    // filter all the leads those tags is not in the provided value array
                    advFilters.push({ tags: { $nin: value } })

                }
                else if (operator === "isBlank") {
                    // filter all the leads those tags is blank or null
                    advFilters.push({ tags: { $exists: false } })
                }
                else {
                    // filter all the leads those tags is not blank or null
                    advFilters.push({ tags: { $exists: true, $ne: "" } })
                }
            }
            if (name === "creationDate") {
                if (operator === "isBlank") {
                    // filter all the leads those state is blank or null
                    advFilters.push({ created_at: { $exists: false } })
                }
                // filter on name field
                if (operator === "is") {

                    const currentDate = new Date();

                    switch (value) {
                        case 'today':
                            advFilters.push({
                                created_at: {
                                    $gte: new Date(currentDate.setHours(0, 0, 0, 0)),
                                    $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                                }
                            });
                            break;
                        case 'exactDate':
                            if (date) {
                                const exactDate = new Date(parseInt(date));
                                advFilters.push({
                                    created_at: {
                                        $gte: new Date(exactDate.setHours(0, 0, 0, 0)),
                                        $lt: new Date(exactDate.setHours(23, 59, 59, 999))
                                    }
                                });
                            }
                            break;
                        case 'beforeDate':
                            if (date) {
                                advFilters.push({ created_at: { $lt: new Date(parseInt(date)) } });
                            }
                            break;
                        case 'afterDate':
                            if (date) {
                                const dateEndTime = new Date(parseInt(date))
                                // set the hourse to end of the day
                                dateEndTime.setHours(23, 59, 59, 999);
                                advFilters.push({ created_at: { $gte: dateEndTime } });
                            }
                            break;
                        case 'thisWeek':
                            const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                            startOfWeek.setHours(0, 0, 0, 0);
                            const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                            endOfWeek.setHours(23, 59, 59, 999);
                            advFilters.push({ created_at: { $gte: startOfWeek, $lt: endOfWeek } });
                            break;
                        case 'thisMonth':
                            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                            startOfMonth.setHours(0, 0, 0, 0);
                            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                            endOfMonth.setHours(23, 59, 59, 999);
                            advFilters.push({ created_at: { $gte: startOfMonth, $lt: endOfMonth } });
                            break;
                        case 'lastMonth':
                            const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                            startOfLastMonth.setHours(0, 0, 0, 0);
                            const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                            endOfLastMonth.setHours(23, 59, 59, 999);
                            advFilters.push({ created_at: { $gte: startOfLastMonth, $lt: endOfLastMonth } });
                            break;
                        case 'customRange':
                            if (startDate && endDate) {
                                const startTimeOfStartDate = new Date(parseInt(startDate));
                                startTimeOfStartDate.setHours(0, 0, 0, 0);
                                const endTimeOfEndDate = new Date(parseInt(endDate));
                                endTimeOfEndDate.setHours(23, 59, 59, 999);
                                advFilters.push({
                                    created_at: {
                                        $gte: startTimeOfStartDate,
                                        $lt: endTimeOfEndDate
                                    }
                                });
                            }
                            break;
                        default:
                            break;
                    }
                }
                else if (operator === "isNot") {
                    // filter all the leads whose date is not the provided value or in the range
                    const currentDate = new Date();

                    switch (value) {
                        case 'today':
                            // those leads which are not created today
                            advFilters.push({
                                created_at: {
                                    $lt: new Date(currentDate.setHours(0, 0, 0, 0)),
                                    // $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                                }
                            });
                            break;
                        case 'exactDate':
                            // those leads which are not created this exact date
                            if (date) {
                                const exactDate = new Date(parseInt(date));
                                advFilters.push({
                                    created_at: {
                                        $lt: new Date(exactDate.setHours(0, 0, 0, 0)),
                                        $gte: new Date(exactDate.setHours(23, 59, 59, 999))
                                    }
                                });
                            }
                            break;
                        case 'beforeDate':
                            // those leads which are not created before this date
                            if (date) {
                                advFilters.push({ created_at: { $gte: new Date(parseInt(date)) } });
                            }
                            break;
                        case 'afterDate':
                            // those leads which are not created after this date
                            if (date) {
                                const dateEndTime = new Date(parseInt(date))
                                // set the hourse to end of the day
                                dateEndTime.setHours(23, 59, 59, 999);
                                advFilters.push({ created_at: { $lt: dateEndTime } });
                            }
                            break;
                        case 'thisWeek':
                            // those leads which are not created this week
                            const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                            startOfWeek.setHours(0, 0, 0, 0);
                            const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                            endOfWeek.setHours(23, 59, 59, 999);
                            advFilters.push({ created_at: { $lt: startOfWeek, $gte: endOfWeek } });
                            break;
                        case 'thisMonth':
                            // those leads which are not created this month
                            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                            startOfMonth.setHours(0, 0, 0, 0);
                            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                            endOfMonth.setHours(23, 59, 59, 999);
                            advFilters.push({ created_at: { $lt: startOfMonth, $gte: endOfMonth } });
                            break;
                        case 'lastMonth':
                            // those leads which are not created last month
                            const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                            startOfLastMonth.setHours(0, 0, 0, 0);
                            const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                            endOfLastMonth.setHours(23, 59, 59, 999);
                            advFilters.push({ created_at: { $lt: startOfLastMonth, $gte: endOfLastMonth } });
                            break;
                        case 'customRange':
                            // those leads which are not created in between this range
                            if (startDate && endDate) {
                                const startTimeOfStartDate = new Date(parseInt(startDate));
                                startTimeOfStartDate.setHours(0, 0, 0, 0);
                                const endTimeOfEndDate = new Date(parseInt(endDate));
                                endTimeOfEndDate.setHours(23, 59, 59, 999);
                                advFilters.push({
                                    created_at: {
                                        $lt: startTimeOfStartDate,
                                        $gte: endTimeOfEndDate
                                    }
                                });
                            }
                            break;
                        default:
                            break;
                    }
                }
                else {
                    // filter all the leads those state is not blank or null
                    advFilters.push({ created_at: { $exists: true, $ne: "" } })
                }
            }
            if (name === "updationDate") {
                if (operator === "isBlank") {
                    // filter all the leads those state is blank or null
                    advFilters.push({ updated_at: { $exists: false } })
                }
                // filter on name field
                if (operator === "is") {

                    const currentDate = new Date();

                    switch (value) {
                        case 'today':
                            advFilters.push({
                                updated_at: {
                                    $gte: new Date(currentDate.setHours(0, 0, 0, 0)),
                                    $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                                }
                            });
                            break;
                        case 'exactDate':
                            if (date) {
                                const exactDate = new Date(parseInt(date));
                                advFilters.push({
                                    updated_at: {
                                        $gte: new Date(exactDate.setHours(0, 0, 0, 0)),
                                        $lt: new Date(exactDate.setHours(23, 59, 59, 999))
                                    }
                                });
                            }
                            break;
                        case 'beforeDate':
                            if (date) {
                                advFilters.push({ updated_at: { $lt: new Date(parseInt(date)) } });
                            }
                            break;
                        case 'afterDate':
                            if (date) {
                                const dateEndTime = new Date(parseInt(date))
                                // set the hourse to end of the day
                                dateEndTime.setHours(23, 59, 59, 999);
                                advFilters.push({ updated_at: { $gte: dateEndTime } });
                            }
                            break;
                        case 'thisWeek':
                            const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                            startOfWeek.setHours(0, 0, 0, 0);
                            const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                            endOfWeek.setHours(23, 59, 59, 999);
                            advFilters.push({ updated_at: { $gte: startOfWeek, $lt: endOfWeek } });
                            break;
                        case 'thisMonth':
                            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                            startOfMonth.setHours(0, 0, 0, 0);
                            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                            endOfMonth.setHours(23, 59, 59, 999);
                            advFilters.push({ updated_at: { $gte: startOfMonth, $lt: endOfMonth } });
                            break;
                        case 'lastMonth':
                            const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                            startOfLastMonth.setHours(0, 0, 0, 0);
                            const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                            endOfLastMonth.setHours(23, 59, 59, 999);
                            advFilters.push({ updated_at: { $gte: startOfLastMonth, $lt: endOfLastMonth } });
                            break;
                        case 'customRange':
                            if (startDate && endDate) {
                                const startTimeOfStartDate = new Date(parseInt(startDate));
                                startTimeOfStartDate.setHours(0, 0, 0, 0);
                                const endTimeOfEndDate = new Date(parseInt(endDate));
                                endTimeOfEndDate.setHours(23, 59, 59, 999);
                                advFilters.push({
                                    updated_at: {
                                        $gte: startTimeOfStartDate,
                                        $lt: endTimeOfEndDate
                                    }
                                });
                            }
                            break;
                        default:
                            break;
                    }
                }
                else if (operator === "isNot") {
                    // filter all the leads whose date is not the provided value or in the range
                    const currentDate = new Date();

                    switch (value) {
                        case 'today':
                            // those leads which are not created today
                            advFilters.push({
                                updated_at: {
                                    $lt: new Date(currentDate.setHours(0, 0, 0, 0)),
                                    // $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                                }
                            });
                            break;
                        case 'exactDate':
                            // those leads which are not created this exact date
                            if (date) {
                                const exactDate = new Date(parseInt(date));
                                advFilters.push({
                                    updated_at: {
                                        $lt: new Date(exactDate.setHours(0, 0, 0, 0)),
                                        $gte: new Date(exactDate.setHours(23, 59, 59, 999))
                                    }
                                });
                            }
                            break;
                        case 'beforeDate':
                            // those leads which are not created before this date
                            if (date) {
                                advFilters.push({ updated_at: { $gte: new Date(parseInt(date)) } });
                            }
                            break;
                        case 'afterDate':
                            // those leads which are not created after this date
                            if (date) {
                                const dateEndTime = new Date(parseInt(date))
                                // set the hourse to end of the day
                                dateEndTime.setHours(23, 59, 59, 999);
                                advFilters.push({ updated_at: { $lt: dateEndTime } });
                            }
                            break;
                        case 'thisWeek':
                            // those leads which are not created this week
                            const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
                            startOfWeek.setHours(0, 0, 0, 0);
                            const endOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay() + 6));
                            endOfWeek.setHours(23, 59, 59, 999);
                            advFilters.push({ updated_at: { $lt: startOfWeek, $gte: endOfWeek } });
                            break;
                        case 'thisMonth':
                            // those leads which are not created this month
                            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                            startOfMonth.setHours(0, 0, 0, 0);
                            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                            endOfMonth.setHours(23, 59, 59, 999);
                            advFilters.push({ updated_at: { $lt: startOfMonth, $gte: endOfMonth } });
                            break;
                        case 'lastMonth':
                            // those leads which are not created last month
                            const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                            startOfLastMonth.setHours(0, 0, 0, 0);
                            const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
                            endOfLastMonth.setHours(23, 59, 59, 999);
                            advFilters.push({ updated_at: { $lt: startOfLastMonth, $gte: endOfLastMonth } });
                            break;
                        case 'customRange':
                            // those leads which are not created in between this range
                            if (startDate && endDate) {
                                const startTimeOfStartDate = new Date(parseInt(startDate));
                                startTimeOfStartDate.setHours(0, 0, 0, 0);
                                const endTimeOfEndDate = new Date(parseInt(endDate));
                                endTimeOfEndDate.setHours(23, 59, 59, 999);
                                advFilters.push({
                                    updated_at: {
                                        $lt: startTimeOfStartDate,
                                        $gte: endTimeOfEndDate
                                    }
                                });
                            }
                            break;
                        default:
                            break;
                    }
                }
                else {
                    // filter all the leads those state is not blank or null
                    advFilters.push({ updated_at: { $exists: true, $ne: "" } })
                }
            }
        })
        // insert the advFilters in the query
        if (advFilters.length > 0) {
            if (customFilterOperation === "any") {
                // if any of the filters matches
                query.$or = advFilters;
            }
            else {
                // all the filters must match
                query.$and = advFilters;
            }
        }
    }

    //---------------------------------------------------filtering end----------------------------------------------------------------//


    //--------------sorting start-------------------//
    let sort = {};

    // we have to apply sorting based on the selected view setting of a user
    if (viewId) {
        const view = await View.findById(viewId);
        const viewColumns = await Column.findById(view.columns)
        // we need the columns whose are selected for sort
        const sortingColumns = viewColumns.columns.filter(column => column.sort !== "NS");
        // now we have to arrange the columns based on the sortOrder so the leads will be sorted based on that order
        sortingColumns.sort((a, b) => a.sortOrder - b.sortOrder);

        if (sortingColumns.length > 0) {
            sortingColumns.forEach(column => {
                // sort the leads by the given column in the given order
                const sortSequence = column.sort === "AS" ? 1 : -1

                if (column.name === "createdAt") {
                    sort = { ...sort, 'created_at': sortSequence };
                }
                if (column.name === "owner") {
                    sort = { ...sort, 'owner': sortSequence };
                }
                if (column.name === "company") {
                    sort = { ...sort, 'company.company': sortSequence };
                }
                if (column.name === "profile") {
                    sort = { ...sort, 'profile.name': sortSequence };
                }
                if (column.name === "updatedFromLinkedin") {
                    sort = { ...sort, 'updatedFromLinkedin': sortSequence };
                }
            })

        } else {
            // if no sort column is provided sort the leads by the created_at column in descending order
            sort = { created_at: -1 };
        }
    }

    //--------------sorting end-------------------//

    try {
        // here we will look which columns of a view of a customer are not hidden so we will send data of those colomns
        // find the view of the customer
        // const view = await View.find({ owner: req.user._id })
        const allLeads = await Lead.find(query).sort(sort).skip(offset).limit(Number(limit)).populate('tags status').lean();

        const totalRecord = await Lead.countDocuments(query)
        const uniqueLeads = Array.from(new Map(allLeads.map(lead => [lead.linkedInId, lead])).values());

        // we have to make the imageUrl of those leads empty (they are not working currently) so we will make there 
        // imageUrl empty
       const modifiedLeads = uniqueLeads.map(lead => {
            if(lead.isImportedByAdmin){
                return {
                    ...lead,
                    imageUrl: undefined,
                    profile: {
                        ...lead.profile,
                        imageUrl: undefined,
                    }
                }
            }
            else {
                return lead;
            }
        })
        res.status(200).json({
            success: true,
            result: { allLeads: modifiedLeads, totalRecord, currentPage: Number(page), limit: Number(limit) }
        });

    } catch (error) {
        next(error);
    }
};












// here we have make controller for adding the notes and the tages in a lead we can add lead or note at a time

const addNotesAndTags = async (req, res, next) => {
    try {
        const { notes, tags } = req.body;
        const { leadId } = req.params;

        if (!leadId) {
            return res.status(400).json({ success: false, message: 'Lead ID is required' });
        }
        let lead;

        if (notes) {
            lead = await Lead.findByIdAndUpdate(leadId, { notes }, { new: true });
        }
        if (tags) {
            lead = await Lead.findByIdAndUpdate(leadId, { tags }, { new: true });
        }

        if (!lead) {
            return res.status(404).json({ success: false, message: 'Lead not found' });
        }

        res.status(200).json({ success: true, message: 'Notes and tags added successfully', lead });
    } catch (error) {
        next(error);
    }
};


// tags controllers

// create a new tag of a customer
const createTag = async (req, res, next) => {
    const owner = req.team._id

    // if (req.user.role === "customer") {
    //     owner = req.user._id
    // }
    // if (req.user.role === "teamMember") {
    //     owner = req.user.customerRef
    // }



    try {
        const { name, color, status } = req.body;

        if (!owner || !name) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        const newTag = new Tag({ owner, name, color, status });

        await newTag.save();

        res.status(201).json({ success: true, message: 'Tag created successfully', newTag });
    } catch (error) {
        next(error);
    }
};

// get all the tags of customer

const getAllTags = async (req, res, next) => {

    try {
        const { name, ids } = req.query;

        let query;
        if (req.user.role !== "admin") {
            query = { owner: req.team._id }
        }

        if (name) {
            query = { ...query, name: new RegExp(name, 'i') };
        }
        if (ids) {
            query = { ...query, _id: { $in: ids.split(',') } }
        }

        const tags = await Tag.find(query);

        res.status(200).json({ success: true, result: tags });
    } catch (error) {
        next(error);
    }
};


// move multiple leads from one folder from one folder to another

const moveLeadsToOtherFolder = async (req, res, next) => {
    const { destinationFolderId, leadIds } = req.body;

    if (!destinationFolderId || !leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ success: false, message: 'Destination folder ID (string) and lead IDs (Array) are required' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const leads = await Lead.find({ _id: { $in: leadIds } }).exec();
        const oldFolderIds = leads.map(lead => lead.folderId);
        const [oldFolders, newFolder] = await Promise.all([
            Folder.find({ _id: { $in: oldFolderIds } }).exec(),
            Folder.findById(destinationFolderId).exec()
        ]);

        if (!newFolder) {
            throw new Error(`Destination folder not found for ID: ${destinationFolderId}`);
        }

        for (const lead of leads) {
            const leadOldFolder = oldFolders.find(folder => folder._id.equals(lead.folderId));
            if (!leadOldFolder) {
                throw new Error(`Lead folder not found for ID: ${lead.folderId}`);
            }

            // remove the lead from old folder
            const leadIndex = leadOldFolder.leads.indexOf(lead._id.toString());
            if (leadIndex > -1) {
                leadOldFolder.leads.splice(leadIndex, 1);
            }
            await leadOldFolder.save({ session });

            // update the lead folderId
            lead.folderId = destinationFolderId;
            await lead.save({ session });

            // add the lead to new folder
            newFolder.leads.push(lead._id);
            await newFolder.save({ session });
        }

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ success: true, message: 'Leads moved successfully' });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
};

// controller for adding or removing tags from multiple leads

const tagUntagMultipleLeads = async (req, res, next) => {
    const { leadIds, action, tagIds } = req.body;

    try {
        if (!leadIds || !Array.isArray(leadIds) || !action || !tagIds || !Array.isArray(tagIds)) {
            throw new Error('Lead IDs (Array), action (string), and tag ID (Array) are required')
        }
        if (!['tag', 'untag'].includes(action)) {
            throw new Error('Action should be either "tag" or "untag"')
        }

        await Promise.all(leadIds.map(async l => {
            const lead = await Lead.findById(l);
            // add the ids to the tags array in lead
            if (action === 'tag') {
                tagIds.map((tagId) => {
                    if (tagId && lead.tags && !lead.tags.includes(tagId)) {
                        lead.tags.push(tagId)
                    }
                })
            }
            else if (action === 'untag') {
                const filtred = tagIds.filter(tagId => tagId !== null || tagId !== undefined)
                lead.tags = lead.tags.filter(t => {
                    if (t) {
                        return !filtred.includes(t.toString())
                    }
                })
            }
            await lead.save()
        }))
        res.status(200).json({ success: true, message: `Tags Successfully ${action === "tag" ? "Added" : "Removed"}` })

    }
    catch (error) {
        next(error)
    }
}

// update the status of a lead

const updateMultipleLeadsStatus = async (req, res, next) => {
    try {
        const { leadIds, statusId } = req.body;

        if (!leadIds || !statusId || !Array.isArray(leadIds)) {
            return res.status(400).json({ success: false, message: 'Leads IDs (array) and status ID are required' });
        }

        const leads = await Promise.all(leadIds.map(async leadId => {
            const lead = await Lead.findByIdAndUpdate(leadId, { status: statusId }, { new: true }).populate("status");
            return lead
        }))

        res.status(200).json({ success: true, result: leads, message: 'Lead status updated successfully' });
    } catch (error) {
        next(error);
    }
};

// update the status of a lead

const checkLeadsExistance = async (req, res, next) => {
    const team = req.team;
    try {
        const { linkedinIds } = req.body;

        if (!linkedinIds || !Array.isArray(linkedinIds)) {
            return res.status(400).json({ success: false, message: 'Leads IDs (array) are required' });
        }

        const leads = await Lead.find({ owner: team._id, linkedInId: { $in: linkedinIds } }).select("linkedInId")
        const existingLinkedinIds = leads.map(lead => lead.linkedInId)
        res.status(200).json({ success: true, result: existingLinkedinIds });
    } catch (error) {
        next(error);
    }
};

const createBulkLeads = async (req, res, next) => {
    let { leads, folderId } = req.body;
    const team = req.team?._id;

    // Try to acquire the lock for this controller and user
    const isLocked = lockControllerForUser(req.user._id, "createBulkLeads");

    if (isLocked) {
        return res.status(429).json({ message: 'This Request is already in progress' });
    }

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
            reject(new Error('Operation timed out after 50 seconds'));
        }, 50000)
    );

    try {
        if (!leads || !Array.isArray(leads)) {
            throw new Error("Leads data is required")
        }
        const folder = await Folder.findById(folderId);
        if (!folder) {
            throw new Error("folder id is required")
        }
        // if (req.user.plan.creditsUsed >= req.user.plan.credits) {
        //     throw new Error(`You have used all of your ${req.user.plan.credits} credits`)
        // }
 
        const mainLogic = async () => {
            // First Extract company Names from the leads where there is the "currentPosition" field
            leads = leads.map((lead) => {
                const companyName = lead.currentPosition?.split(' at ')[1];
                if (companyName) {
                    console.log(companyName)
                    return {
                        ...lead,
                        companyName
                    }
                }
                else {
                    return lead
                }
            })

            // if not then
            // we have to only give those leads to AI where there is a headline but no companyName
            // so it can extract the company names
            const leadsWithHeadline = leads.filter(l => l.headline && !l.companyName);
            // here we have to extract the company name from the leads headline using GPT
            const leadsProcessedWithGPT = await extractCompanyName(leadsWithHeadline);
            // now we have to replace the leads processed with GPT in out leads
            leads = leads.map((lead) => {
                const processedLead = leadsProcessedWithGPT.find(l => l.id === lead.id);
                return processedLead ? processedLead : lead
            })

            // sort the leads 
            console.log(leads)
            leads = leads.sort((a, b) => a.id - b.id);

            // map on all leads and extract there data as much as possible and save the leads (linkedin users profiles)
            const leadsData = await Promise.all(leads.map(async (lead) => {
                let linkedInId
                const isUrl = new URL(lead.userUrl)
                if (isUrl) {
                    linkedInId = lead.userUrl.split("/in/")[1]
                } else {
                    linkedInId = lead.userUrl
                }
                // we will filter those leads of user which are already added
                const existingLead = await Lead.findOne({ owner: team, linkedInId: linkedInId });
                if (existingLead) {
                    // Remove the old lead from the folder leads array
                    const oldFolder = await Folder.findById(existingLead.folderId)

                    /// if the old and new folder is not the same for lead
                    if (folder?._id?.toString() !== oldFolder?._id?.toString()) {
                        const leadIndex = oldFolder.leads.indexOf(existingLead._id.toString());
                        if (leadIndex > -1) {
                            oldFolder.leads.splice(leadIndex, 1)
                            await oldFolder.save()
                        }
                        // add the lead to the other folder
                        folder.leads.push(existingLead._id);
                    }
                    return existingLead;
                }
                if (!lead.companyName) {
                    return { ...lead, linkedInId };
                } else {
                    // if the company name is found then apply the search services to find out the company social links and the user emails and phones

                    // get the company name from the headline
                    const companyName = lead.companyName;
                    console.log(companyName)
                    if (!companyName) {
                        return { ...lead, linkedInId }
                    }
                    // find the social links of company
                    // the the phones number for the company
                    const [companySocialLinks, phoneNumbers] = await Promise.all([
                        getCompanySocialLinks(companyName),
                        getPhoneNumbersService(companyName)
                    ])
                    ///////////--------------------   now we have to find out the work emails --------------------------------////////////////////////

                    // we will use google search for email service one if not emails founs then we will use google again and then 
                    // we will verify the email in not verified then we will use out sequence of emails pattrens function
                    let emails = [];

                    const queryAttempts = [1, 2, 3, 4]; // List of query numbers to try
                    for (const attempt of queryAttempts) {
                        emails = await getEmailsService(companyName.toLowerCase(), lead.userName, attempt);
                        if (emails.result?.modifiedEmails && emails.result?.modifiedEmails.length > 0) {
                            break; // Exit the loop if emails are found
                        }
                    }

                    const modifiedEmails = emails.result?.modifiedEmails || [];

                    let finalizedEmails = []

                    // emails verification of emails generated from pattren 
                    const verifiedEmailsFromPattern = await Promise.all(modifiedEmails.map(async emailObj => {
                        const verified = await sixStepsEmailVerification(emailObj.email)
                        if (verified.success) {
                            return {
                                ...emailObj,
                                validationStatus: 1,
                                valid: true,
                                type: "Work"
                            }
                        }
                        return undefined;
                    }));
                    const filteredVerifiedEmails = verifiedEmailsFromPattern.filter(emailObj => emailObj !== undefined);

                    if (filteredVerifiedEmails.length > 0) {
                        finalizedEmails = filteredVerifiedEmails;
                    } else {
                        const companyUrl = companySocialLinks.result.filter(link => link.type === "official")[0]?.link;
                        if (companyUrl) {
                            const companyTLDArray = new URL(companyUrl).host.split(".");
                            const companyDomain = companyTLDArray[companyTLDArray.length - 2] + "." + companyTLDArray[companyTLDArray.length - 1];
                            // here we will generate emails from sequences and verify them
                            // get the domain from companyUrl
                            const generated = await generateEmailFromSequenceAndVerify(lead.userName, companyDomain);
                            if (generated.success) {
                                finalizedEmails.push(generated.email)
                            }
                        }
                        // is there are no verifiedemails from the generated patterns then we will work on sequences
                    }

                    return {
                        ...lead,
                        links: companySocialLinks.result || [],
                        emails: finalizedEmails,
                        phones: phoneNumbers.result || [],
                        companyName,
                        linkedInId
                    }
                }
            }))
            let newLeadsAdded = 0;

            // this will be updated in the below logic when a lead is added
            let creditsUsed = req.user.plan.creditsUsed;
            // Process leads one by one to ensure proper credit updates

            for (const lead of leadsData) {
                // Skip if lead already exists
                if (!lead._id) {
                    // Check remaining user plan credits
                    if (creditsUsed >= req.user.plan.credits) {
                        await User.findByIdAndUpdate(
                            req.user._id,
                            { $inc: { 'plan.creditsUsed': newLeadsAdded } },  // Increment by the value of new added leads
                            { new: true }  // Return the updated document
                        );
                        throw new CustomError(`only ${newLeadsAdded} Added. Remaining not added because not enough credits`, 409);
                    }
                    const fileName = lead.userName?.split(' ')[0] || "default_filename"; 
                    const newLead = new Lead({
                        owner: team,
                        folderId: folderId,
                        filename: fileName,
                        firstName: lead.userName?.split(' ')[0],
                        lastName: lead.userName?.split(' ')[1],
                        name: lead.userName,
                        profile: {
                            imageUrl: lead.userImage,
                            name: lead.userName
                        },
                        linkedInId: lead.linkedInId,
                        emails: lead.emails,
                        links: lead.links,
                        phones: lead.phones,
                        imageUrl: lead.userImage,
                        company: {
                            company: lead.companyName,
                            position: lead.currentPosition || lead.headline
                        },
                        currentPositions: [{
                            company: lead.companyName,
                            position: lead.currentPosition || lead.headline
                        }],
                        location: lead.userLocation,
                        state: lead.userLocation,
                        country: lead.userLocation,
                        city: lead.userLocation,
                        about: lead.userSummary,
                    });
                    await newLead.save();
                    folder.leads.push(newLead._id);
                    newLeadsAdded++;
                    creditsUsed++;
                }
            }

            await User.findByIdAndUpdate(
                req.user._id,
                { $inc: { 'plan.creditsUsed': newLeadsAdded } },  // Increment by the value of new added leads
                { new: true }  // Return the updated document
            );

            await folder.save();

            return { newLeadsAdded, creditsUsed };
        }

        // Race between the main logic and the timeout
        const result = await Promise.race([mainLogic(), timeoutPromise]);
        //
        unlockControllerForUser(req.user._id, "createBulkLeads")
        res.status(200).json({
            success: true, redult: result
        })
    } catch (error) {
        unlockControllerForUser(req.user._id, "createBulkLeads")
        next(error);
    }
}

const deleteAdminImportedLeads = async (req, res, next) => {
    try {
        if (req.user.role !== "admin") {
            throw new CustomError("Admin Role Required", 403);
        }
        const adminCustomerEmail = process.env.ADMIN_CUSTOMER_ACCOUNT_EMAIL || "admincustomer@gmail.com";

        const adminUser = await User.findOne({ email: adminCustomerEmail });

        if (!adminUser) {
            throw new CustomError("Admin customer account not found", 404)
        }

        const adminCustomerTeam = await Team.findOne({ creator: adminUser._id });

        if (!adminCustomerTeam) {
            throw new CustomError("Admin customer account not found", 404)
        }
        const deletedLeads = await Lead.deleteMany({ owner: adminCustomerTeam });

        res.status(200).json({
            success: true,
            message: `${deletedLeads.deletedCount} imported leads deleted successfully`,
        })
    } catch (error) {
        console.log(error.message)
        next(error);
    }
}

export {
    createLead,
    getAllLeads,
    getProfileById,
    updateProfileById,
    deleteLeads,
     getLeadsOfCustomer,
    assignLeadToTeamMember,
    getLeadsOfFolder,
    addNotesAndTags,
    createTag,
    getAllTags,
    tagUntagMultipleLeads,
    moveLeadsToOtherFolder,
    updateMultipleLeadsStatus,
    checkLeadsExistance,
    createBulkLeads,
    deleteAdminImportedLeads,
    deleteByFiles,
    getAllAddedSummaries
}




