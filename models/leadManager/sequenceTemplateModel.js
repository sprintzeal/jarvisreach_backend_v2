import mongoose from 'mongoose';

const { Schema } = mongoose;

// Define the schema for an email template
const sequenceTemplateSchema = new Schema({
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true  // Owner of the sequence template
    },
    name: {
        type: String,
        required: true,
    },
    subject: {
        type: String,
        required: true  // Subject of the email
    },
    enabled: {
        type: Boolean,
        default: true  // Is this sequence template enabled or disabled?
    },
    noOfFollowUps: {
        type: Number,
        required: true // Number of follow-ups in this sequence template
    },
    followUps: [
        {
            templateContent: {
                type: String,
                required: true // Template content
            },
            daysUntilNext: {
                type: Number,
            }
        }
    ]
},
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        }
    }
);
sequenceTemplateSchema.index({ owner: 1 });
// Create and export the model
const SequenceTemplate = mongoose.model('SequenceTemplate', sequenceTemplateSchema);

export default SequenceTemplate;
