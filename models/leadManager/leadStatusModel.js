import mongoose from "mongoose";

const leadStatusSchema = new mongoose.Schema({
    owner:{
        type: mongoose.Schema.Types.ObjectId,
        ref:'User',
        required: true, 
    },
    name: {
        type: String,
        required: true
    },
    color: {
        type: String,
        required: true
    },
    order: {
        type: Number,
        required: true,
        default: 1
    },
    status: {
        type: String,
        enum: ['Active', 'Deactive'],
        default: 'Active'
    }
},
    {
        timestamps: true,
    }
);


const LeadStatus = mongoose.model('LeadStatus', leadStatusSchema);

export default LeadStatus;