import mongoose from "mongoose";


const tagSchema = new mongoose.Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    color: {
        type: String,
        required: true,
        default: "#FFB569"
    },
    status: {
        type: Boolean,
        default: false
    }
})

const Tag = mongoose.model('Tag', tagSchema)

export default Tag;