import mongoose from "mongoose";


const planSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        required: true,
        enum: ['Active', 'Deactive'],
        default: 'Active'
    },
    stripePriceId: {
        type: String
    },
    stripeProductId: {
        type: String
    },
    createdAt:{
        type: Date,
        default: Date.now
    },
    interval:{
        type: String,
        enum:['month', 'year'],
        default:'month',
        required: true
    },
    credits:{
        type: Number,
        required: true,
        default: 0
    },
    price:{
        type: Number,
        required: true,
        default: 0
    },
    isDeleted:{
        type: Boolean,
        default: false,
    },
    sales:[{
        createdAt:{
            type: Date,
            default: Date.now
        },
        amount:{
            type: Number,
            required: true,
            default: 0
        }
    }]
},
    { timestamps: true }
);

// Define a compound index for uniqueness on the combination of 'name' and 'interval'
// planSchema.index({ name: 1, interval: 1 }, { unique: true });

const Plan = mongoose.model('Plan', planSchema);

export default Plan;