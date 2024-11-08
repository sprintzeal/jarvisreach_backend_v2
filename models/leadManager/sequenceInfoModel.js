import mongoose from "mongoose";

const sequenceInfoSchema = new mongoose.Schema({
    owner:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    emailsSent:{
        type: Number,
        default: 0
    },
    emailsSentInSequence:{
        type: Number,
        default: 0
    },
    deletedSequences:{
        type:Number,
        default: 0
    }
})

const SequenceInfo = mongoose.model('SequenceInfo', sequenceInfoSchema);

export default SequenceInfo;