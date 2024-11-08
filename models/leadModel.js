import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema({
    profile: {
        name: {
            type: String,
        },
        imageUrl: String,
        columnName: {
            type: String,
            default: "profile"
        }
    },
    folderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Folder',
        required: true,
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    assignedTo: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
    }],
    isImportedByAdmin: Boolean,
    linkedInId: {
        type: String,
        required: true,
    },
    profileUrl: String,
    name: {
        type: String,
        required: true
    },
    firstName: {
        type: String,
    },
    lastName: {
        type: String
    },
    about: String,
    industry: String,
    location: String,
    company: {},
    // experiences: [],
    currentPositions: [],
    pastPositions: [],
    skills: [],
    educations: [],
    imageUrl: String,
    emails: [{
        email: {
            type: String,
            match: [/.+\@.+\..+/, 'Please fill a valid email address']
        },
        type: {
            type: String,
            enum: ['Direct', 'Work'],
            default: 'Direct'
        },
        verified: {
            type: Boolean,
            default: false
        },
        validationStatus: {
            type: Number,
            enum: [1, 2, 3],
            default: 1
        },
        valid: {
            type: Boolean,
            default: true
        },
        percentage: String,
    }],
    emailsStatus: {
        type: String,
        enum: ["notSent", "singleSent", "sequenceAssigned", "allSequencesDeleted"],
        default: "notSent"
    },
    phones: [{
        phone: {
            type: String,
            // match: /^\+?\d{1,15}$/
        },
        type: {
            type: String,
            enum: ['Direct', 'Work'],
            default: 'Direct'
        },
        country: { type: String },
    }],
    tags: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tag',
    }],
    notes: [{ type: String }],
    updatedFromLinkedin: {
        type: Date,
        default: Date.now
    },
    status: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LeadStatus',
    },
    country: {
        type: String,
    },
    state: {
        type: String,
    },
    city: {
        type: String,
    },
    location: String,
    template: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SequenceTemplate',
        default: null
    },
    assignedSequences: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'Sequence',
        default: []
    },
    // new data
    id: String,
    gender: String,
    linkedinUserName: String,
    profileFacebookUrl: String,
    facebookUserName: String,
    facebookId: Number,
    jobTitle: String,
    jobTitleRole: String,
    jobTitleLevels: String,
    jobCompnayId: String,
    jobCompanyName: String,
    jobCompanyWebsite: String,
    jobCompanySize: String,
    jobCompanyFounded: Number,
    jobCompanyIndustry: String,
    jobCompanyLinkedinUrl: String,
    jobCompnayLinkedinId: Number,
    jobCompanyTwitterUrl: String,
    jobCompanyLocationStreetAddress: String,
    jobCompanyLocationPostalCode: String,
    jobCompanyLocationContinent: String,
    jobCompanyLocationCountry: String,
    jobCompanyLocationRegion: String,
    jobCompanyLocationMetro: String,
    jobLastUpdated: Number,
    jobStarted: String,
    locationName: String,
    locationPostalCode: Number,
    locationLocality: String,
    locationMetro: String,
    locationRegion: String,
    locationCountry: String,
    locationGeo: String,
    locationLastUpdate: Number,
    linkedinConnections: Number,
    inferredSalary: String,
    inferredYearsExperience: Number,
    summary: String,
    emailStatus: String,
    interests: [String],
    regions: [String],
    countries: [String],
    profiles: [{
        network: String,
        id: String,
        url: String,
        username: String
    }],
    certifications: [{
        organization: String,
        start_date: String,
        end_date: String,
        name: String
    }],
    languages: [{
        name: String
    }],
    versionStatus: {
        status: String,
        contains: [],
        previous_version: String,
        current_version: String
    },
    middleInitial: String,
    middleName: String,
    birthYear: Number,
    birthDate: Number,
    twitterUrl: String,
    gitHubUrl: String,
    locationAddressLine2: String,
    jobTitleSubRole: String,
    jobCompanyLocationAddressLine2: String,
    profileInstagramUrl: String,
    companyYoutubeUrl: String,
    allGroups: String,
    profileLanguages: [String],
    recruitingActivity: String,
    seniority: String,
    networkRelationships: String

},
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        }
    }
);

const Lead = mongoose.model('Lead', LeadSchema);

export default Lead;
