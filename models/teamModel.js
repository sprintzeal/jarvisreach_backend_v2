import mongoose from "mongoose";
const Schema = mongoose.Schema;

// define the Team schema
const TeamSchema = new Schema({
  accounts: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  creator: { type: Schema.Types.ObjectId, ref: 'User' },
});

// create the Team model
const Team = mongoose.model('Team', TeamSchema);

export default Team;
