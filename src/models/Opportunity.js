import mongoose from 'mongoose';

const opportunitySchema = new mongoose.Schema({
    title : {type : String, required : true},
    description : {type : String, required : true},
    category : {type : String, required : true},
    imageUrl : {type : String, required : true},
    status : {type : String, required : true, enum : ["active", "inactive"]},
    location : {type : String, required : true},
},  {
    timestamps : true
});
export default mongoose.model('Opportunity', opportunitySchema);