import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
    userId : {type : mongoose.Schema.Types.ObjectId, ref : "User", required : true},
    opportunityId : {type : mongoose.Schema.Types.ObjectId, ref : "Opportunity", required : true},
    status : {type : String, required : true, enum : ["pending", "accepted", "rejected"]},
    applicationDate : {type : Date, default : Date.now},
    message : {type : String, required : true},
},  {
    timestamps : true
});

export default mongoose.model("Application", applicationSchema);