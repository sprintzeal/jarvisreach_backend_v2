import mongoose from "mongoose";

const helpSupportCategorySchema = new mongoose.Schema({
  categoryName: {
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

const HelpSupportCategory = mongoose.model('HelpSupportCategory', helpSupportCategorySchema);

export default HelpSupportCategory;
