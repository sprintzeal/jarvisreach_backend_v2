import mongoose from "mongoose";

const tokenSchema = new mongoose.Schema({
    user:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
  token: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now(), expires: 86400 }  // Set TTL to 24 hour
});

const Token = mongoose.model('Token', tokenSchema);

export default Token;
