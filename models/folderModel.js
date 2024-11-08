import mongoose from "mongoose";

const folderSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    default:{
        type: Boolean,
        default: false
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    leads: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProfileData',
    }],
    color: {
        type: String,
        default: '#FFB569'
    },
    starred: {
        type: Boolean,
        default: false
    },
    selected:Boolean,
},
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        }
    }
);

const Folder = mongoose.model('Folder', folderSchema);

export default Folder
