import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
    linkedinUrl: {
        type: String,
        unique: true,
    },
    emailPattrens: [{
        pattern: { type: String, required: true },
        percentage: { type: String },
    }],
    phones: [{
        phone: { type: String, required: true },
        type: { type: String, required: true },
        country: { type: String }
    }],
    links: [
        {
            link: {
                type: String,
                required: true,
            },
            type: { type: String },
        }
    ],
    location: { type: String },
    companySize: { type: String },
    founded: { type: String },
},
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        }
    }
)


const Company = mongoose.model('Company', companySchema)

export default Company;