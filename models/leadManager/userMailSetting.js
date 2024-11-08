import mongoose from 'mongoose';

const userMailSettingSchema = new mongoose.Schema({
    owner:{
        type: mongoose.Schema.Types.ObjectId,
        ref:'User'
    },
    protocol:{
        type:String,
        required:true
    },
    host:{
        type:String,
        required:true
    },
    port:{
        type:Number,
        required:true
    },
    smtpUsername:{
        type:String,
        required:true
    },
    smtpPassword:{
        type:String,
        required:true
    },
    fromMail:{
        type:String,
        required:true
    },
    fromName:{
        type:String,
        required:true
    },
    status:{
        type:String,
        enum:['Active', 'Deactive'],
        default:"Active"
    },
    isDeactivatedByAdmin:{
        type: Boolean,
        default: false
    }
})

const UserMailSetting = mongoose.model('UserMailSetting', userMailSettingSchema);

export default UserMailSetting;