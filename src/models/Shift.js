import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema({
    opportunityId : {type : mongoose.Schema.Types.ObjectId, ref : "Opportunity", required : true},
    startTime : {type : Date, required : true},
    endTime : {type : Date, required : true},
    volunteerId : {type : mongoose.Schema.Types.ObjectId, ref : "User", required : true},
    status : {type : String, required : true, enum : ["scheduled", "completed", "cancelled"]}
},  {
    timestamps : true
});

export default mongoose.model("Shift", shiftSchema);
