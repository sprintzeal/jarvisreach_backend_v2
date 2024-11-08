import mongoose from "mongoose";

const Schema = mongoose.Schema;

const leadsExportSchema = new Schema({
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'Done', 'Failed']
    },
    resultFile: {
        type: String,
        required: true
    },
    leadsCount: {
        type: Number,
        required: true
    },
    folderName: {
        type: String,
        required: true
    }
},
    {
        timestamps: true,
    }
);

const LeadExport = mongoose.model('LeadExport', leadsExportSchema);

export default LeadExport;