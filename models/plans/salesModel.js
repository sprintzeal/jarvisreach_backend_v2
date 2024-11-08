import mongoose from "mongoose";

const saleSchema = new mongoose.Schema({
    planName: {
        type: String,
        required: true,
    },
    unsubscribed: {
        type: Boolean,
        default: false,
    },
    interval:{
        type: String,
        required: true,
    }
},
    { timestamps: true }
);

const Sale = mongoose.model('Sale', saleSchema);

export default Sale;