const mongoose = require("mongoose");

const SpeechResultSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
        // unique: true,
    },
});

module.exports = mongoose.model("speechResult", SpeechResultSchema);