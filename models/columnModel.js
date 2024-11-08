import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Model for the columns in a view (tab) of a customer. every customer has its own views and in each view there can be any number of columns

const columnSchema = new Schema({
    view:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'View',
        required: true,
    },
    columns: [{
        name: { type: String, required: true },
        display: { type: Boolean, required: true, default: true },
        order: { type: Number, required: true, default: 1 },
        sort: { type: String, enum: ['NS','DS','AS'] },
        sortOrder: { type: Number, required: true, default: 0 },
        columnWidth: { type: Number, default: null },
    }]
});

const Column = mongoose.model('Column', columnSchema);

export default Column;