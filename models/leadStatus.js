import mongoose  from "mongoose";

const importSummarySchema = new mongoose.Schema({
  filename: { type: String, required: true },
  totalFileData: { type: Number, required: true },
  totalImported: { type: Number, required: true },
  totalFailed: { type: Number, required: true },
  failedLeads: [{ 
    name: { type: String },
    linkedInId: { type: String },
  }],
  logs: [{ type: String }], 
  timestamp: { type: Date, default: Date.now },
});

const DataSummary = mongoose.model('addedSummary', importSummarySchema);

export default DataSummary;
