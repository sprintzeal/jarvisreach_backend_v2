import mongoose from "mongoose";

const InvitationSchema = new mongoose.Schema({
    link: { type: String, required: true, unique: true },
    inviter: { type: String, required: true },
    inviteeEmail: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: Date.now, index: { expires: '7d' } },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    }
}
)


const Invitation = mongoose.model('Invitation', InvitationSchema)

export default Invitation;