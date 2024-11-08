import mongoose from "mongoose";

const teamMemberSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    role: { type: String, required: true, enum: ['ADMIN', 'MEMBER'] },
}, {
    timestamps: true,
});

const User = mongoose.model('User', userSchema)

export default User;