import mongoose from "mongoose";

const blogCategorySchema = new mongoose.Schema({
  categoryName: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Deactive'],
    default: 'Active',
  },
  blogs:[
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Blog',
    },
  ],
},{
  timestamps: true,
});

const BlogCategory = mongoose.model('BlogCategory', blogCategorySchema);

export default BlogCategory;
