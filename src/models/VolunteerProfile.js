import mongoose from 'mongoose';

const volunteerProfileSchema = new mongoose.Schema({
    userId : {type : mongoose.Schema.Types.ObjectId, ref : "User", required : true},
    skills : {type : [String], required : true},
    interests : {type : String, required : true},
    availability : {type : String, required : true},
    bio : {type : String, required : true},
},  {
    timestamps : true
});

export default mongoose.model("VolunteerProfile", volunteerProfileSchema);