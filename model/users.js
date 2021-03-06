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
    },
    name: {
        type: String,
    },
    // response: {
    //     type: String,
    // }
});

module.exports = mongoose.model("users", UserSchema);
