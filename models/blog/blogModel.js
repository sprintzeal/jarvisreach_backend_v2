import mongoose from "mongoose";

const blogSchema = new mongoose.Schema({
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BlogCategory',
        required: true
    },
    blogStatus: {
        type: String,
        required: true,
        enum: ['Online', 'Offline']
    },
    blogInfo: {
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BlogCategory',
            required: true
        },
        title: {
            type: String,
            required: true
        },
        slugUrl: {
            type: String,
            required: true,
            unique: true
        },
        h1Tag: {
            type: String,
        },
        description: {
            type: String,
        }
    },
    blogBannerImage: {
        type: String,
        required: true
    },
    blogThumbnailImage: {
        type: String,
        required: true
    },
    websiteMetadata: {
        title: {
            type: String,
            required: true
        },
        keywords: {
            type: [String],
            required: true
        },
        description: {
            type: String,
            required: true
        }
    },
    authorProfile: {
        authorName: {
            type: String,
            required: true
        },
        authorImage: {
            type: String,
            required: true
        },
        authorDescription: {
            type: String,
            required: true
        }
    },
    tableOfContents: [{
        question: {
            type: String,
        },
        show: {
            type: String,
            enum: ["Show", "Hide"],
            default: "Show",
        },
        description: {
            type: String,
        }
    }],
    authorSocialLinks: {
        facebook: {
            type: String,
        },
        twitter: {
            type: String,
        },
        linkedIn: {
            type: String,
        },
        instagram: {
            type: String,
        },
        skype: {
            type: String,
        },
        youtube: {
            type: String,
        }
    }
},
    {
        timestamps: true
    }
);

const Blog = mongoose.model('Blog', blogSchema);

export default Blog;
