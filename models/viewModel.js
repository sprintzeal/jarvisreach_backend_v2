import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Model for the views (tabs) of a customer. every customer has its own views

const viewSchema = new Schema({
    owner: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    name: { type: String, required: true },
    default: { type: Boolean,},
    filters: { type: String, default: '{}' }, 
    emailSorting: { type: String, enum: ['BF'] }, 
    phoneSorting: { type: String, enum: ['BF'] },
    emailsToInclude: { type: String, enum: ['AE'] },
    phonesToInclude: { type: String, enum: ['AP'] },
    includeUnverifiedEmails: { type: Boolean, required: true, default: true },
    includeUnverifiedPhones: { type: Boolean, required: true, default: true },
    template: {type: String, default: null },
    readOnly: { type: Boolean, required: true, default: true },
    columns:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Column',
    }
});

const View = mongoose.model('View', viewSchema);

export default View;