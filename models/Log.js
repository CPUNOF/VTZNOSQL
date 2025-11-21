const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    ts: { type: Date, default: Date.now },
    user: { type: String }, // Pode ser string (email)
    type: { type: String }, 
    message: { type: String },
    before: { type: mongoose.Schema.Types.Mixed }, 
    after: { type: mongoose.Schema.Types.Mixed },
    meta: { type: mongoose.Schema.Types.Mixed }
});

module.exports = mongoose.model('Log', LogSchema);