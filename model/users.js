const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    phone: {
        type: String,
        required: true,
        unique: true,
    }
});

module.exports = mongoose.model("users", UserSchema);
