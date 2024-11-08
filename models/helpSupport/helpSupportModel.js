import mongoose from "mongoose";

const helpSupportSchema = new mongoose.Schema({
  category:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HelpSupportCategory',
    required: true,
  },
  question:{
    type: String,
    required: true,
  },
  answer:{
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Deactive'],
    default: 'Active',
  },
},{
  timestamps: true,
});

const HelpSupport = mongoose.model('HelpSupport', helpSupportSchema);

export default HelpSupport;
