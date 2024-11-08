import mongoose from "mongoose";

const sequenceSchema = new mongoose.Schema({
    owner:{
        type: mongoose.Schema.Types.ObjectId,
        ref:'User',
        required: true,
    },
    lead:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        required: true,
    },
    leadName:{
        type: String,
        required: true,
    },
    name:{
        type: String,
        required:true,   
    },
    email:{
        type: String,
        required: true,
    },
    subject:{
        type: String,   
        required: true,
    },
    sequenceTemplate:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SequenceTemplate',
        required: true,
    },
    nextFollowup:{
        type: Number,
        required: true,
        default: 1
    },
    nextMailDate:{
        type: Number,
        required: true,
    },
    mailStatus:{
        type: String,
        required: true,
        enum: ['Pending', 'Send', 'Failed']
    },
    CreatedAt:{
        type: Date,
        default: Date.now()
    }
})

const Sequence = mongoose.model('Sequence',sequenceSchema)

export default Sequence;