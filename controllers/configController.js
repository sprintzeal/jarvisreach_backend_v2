
// create leads statuses

import Column from "../models/columnModel.js";
import Folder from "../models/folderModel.js";
import Lead from "../models/leadModel.js";
import User from "../models/userModel.js";
import View from "../models/viewModel.js";
import Invitation from "../models/invitationModel.js";
import LeadExport from "../models/leadsExportsModel.js";
import Team from "../models/teamModel.js";
import SequenceTemplate from "../models/leadManager/sequenceTemplateModel.js";
import UserMailSetting from "../models/leadManager/userMailSetting.js";
import Plan from "../models/plans/planModel.js";
import LeadStatus from "../models/leadManager/leadStatusModel.js";
import SequenceInfo from "../models/leadManager/sequenceInfoModel.js";
import Sequence from "../models/leadManager/sequenceModel.js";
import Company from "../models/companyModel.js";
import Tag from "../models/tagModel.js";
import HelpSupport from "../models/helpSupport/helpSupportModel.js";
import BlogCategory from "../models/blog/blogCategoryModel.js";
import Blog from "../models/blog/blogModel.js";
import HelpSupportCategory from "../models/helpSupport/categoryModel.js";

const clearDB = async (req, res, next) => {

    try {
        if (req.user.role === 'admin') {
            await User.deleteMany({});
            await UserMailSetting.deleteMany({});
            await Plan.deleteMany({});
            await View.deleteMany({});
            await Column.deleteMany({});
            await Folder.deleteMany({});
            await Lead.deleteMany({});
            await Invitation.deleteMany({});
            await LeadExport.deleteMany({});
            await Team.deleteMany({});
            await SequenceTemplate.deleteMany({});
            await LeadStatus.deleteMany({});
            await SequenceInfo.deleteMany({});
            await Sequence.deleteMany({});
            await UserMailSetting.deleteMany({});
            await Company.deleteMany({});
            await Tag.deleteMany({});
            await BlogCategory.deleteMany({});
            await Blog.deleteMany({});
            await HelpSupportCategory.deleteMany({});
            await HelpSupport.deleteMany({});

            res.status(200).json({ success: true, message: 'Database cleared successfully' });
        } else {
            throw new Error("NOT ADMIN")
        }
    } catch (error) {
        next(error);
    }
}

export {

    clearDB
}