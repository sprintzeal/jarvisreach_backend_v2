import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/.+\@.+\..+/, 'Please fill a valid email address']
    },
    phone: {
        type: String,
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    password: {
        type: String,
        minlength: 6
    },
    plain_text: {
        type: String,
        minlength: 6
    },
    companyName: { 
        type: String, 
        required: false 
    },
    mainActivity: {
        type: String,
        required: false 
    },
    role: {
        type: String,
        enum: ['admin', 'customer', 'teammember'],
        default: 'customer'
    },
    customerRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: function () {
            return this.role === 'teammember';
        }
    },
    avatar: {
        type: String
    },
    organizationName: {
        type: String,
    },
    timeZone: {
        type: String,
        default: 'UTC',
    },
    status: {
        type: Boolean,
        default: false
    },
    plan: {
        stripeCustomerId: {
            type: String,
        },
        credits: {
            type: Number,
            default: 10
        },
        creditsUsed: {
            type: Number,
            default: 0
        },
        billingAddress: {
            address: { type: String },
            city: { type: String },
            postalCode: { type: String },
            state: { type: String },
            country: { type: String },
        },
        plan: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Plan',
        },
        isUnsubscribed: {
            type: Boolean,
            default: false
        },
        isFromFreePlan: {
            type: Boolean,
            default: false
        },
        isOnFreePlan: {
            type: Boolean,
            default: true
        },
        planName: {
            type: String,
            default: null
        },
        packagePeriod: {
            type: String,
            default: null
        },
        startDate: {
            type: Date,
            // default: Date.now
        }, 
        endDate: {
            type: Date,
            // default: Date.now
        }, 
        planUpdatedDate: {
            type: Date,
            default: Date.now
        },
        freeCreditsGivenDate: {
            type: Date,
            default: Date.now
        },
        planFeatures: {
            directAndCompanyPhones: {
                type: Boolean,
                default: false,
            },
            exportContactsEnabled: {
                type: Boolean,
                default: false,
            },
            leadManagerAccess: {
                type: Boolean,
                default: false,
            },
            activeSequencesLimit: {
                type: Number,
                default: 0, // 0 for feature not available, -1 for unlimited
            },
            activeLeadStatusLimit: {
                type: Number,
                default: 0, // 0 for feature not available, -1 for unlimited
            },
            folderCreationLimit: {
                type: Number,
                default: 0, // 0 for feature not available, -1 for unlimited
            },
            realtimeEmailVerify: {
                type: Boolean,
                default: false,
            },
            customSMTPEnabled: {
                type: Boolean,
                default: false,
            },
            advancedDataFilter: {
                type: Boolean,
                default: false,
            },
            appIntegration: {
                type: Boolean,
                default: false,
            },
            realtimeEmailSendingReport: {
                type: Boolean,
                default: false,
            },
            activeFollowUpEmails: {
                type: Number,
                default: 0 // 0 for feature not available, -1 for unlimited
            }
        }
    },
    // addional user settings
    settings: {
        exportSettings: {
            fileFormat: {
                type: String,
                enum: ['csv', 'xlsx']
            },
            includeResultsWithOutEmails: {
                type: Boolean,
                default: true
            },
            includeResultsWithOutPhones: {
                type: Boolean,
                default: true
            },
            directEmails: {
                type: Boolean,
                default: true
            },
            directPhones: {
                type: Boolean,
                default: true
            },
            workEmails: {
                type: Boolean,
                default: true
            },
            workPhones: {
                type: Boolean,
                default: true
            },
            customColumns: {
                type: [String]
            },
        },
        acceptedTermsAndConditions: {
            type: Boolean,
            required: true,
            default: false
        },
        completedTour: {
            type: Boolean,
            required: true,
            default: false
        },
        completedAppTour: {
            type: Boolean,
            default: false
        }
    },
    location: {
        country: {
            type: String,
        },
        lat: {
            type: Number,
        },
        lon: {
            type: Number,
        }
    },
    registredWith: {
        type: String,
        enum: ['google', 'linkedin', 'direct'],
        default: 'direct'
    },
    expiredAt: {
        type: Number,  
        default: Date.now
    },
},
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        }
    }
)

// there can be only one admin at a time
userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: 'admin' } });


userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }

    if (this.password) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }

    next();
})

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
}

const User = mongoose.model('User', userSchema)

export default User;