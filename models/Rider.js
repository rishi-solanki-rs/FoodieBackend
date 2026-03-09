const mongoose = require('mongoose');
const riderSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true, 
        unique: true 
    },
    associatedRestaurant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant' // Optional
    },
    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String
    },
    workCity: { type: String }, 
    workZone: { type: String },
    vehicle: {
        type: { 
            type: String, 
            enum: ['bike', 'car', 'scooter', 'other'],
            required: true
        },
        model: { type: String }, 
        number: { type: String, required: true },
        vehicleVerified: { type: Boolean, default: false },
        vehicleApproval: {
            status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
            reason: { type: String },
            approvedAt: { type: Date },
            approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        }
    },
    documents: {
        // Driving License - REQUIRED & EXPIRES
        license: {
            frontImage: { type: String },
            backImage: { type: String },
            number: { type: String },
            expiryDate: { type: Date }, // License expiry date - CRITICAL for verification
            verifiedAt: { type: Date },
            verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        },
        // Registration Certificate - REQUIRED & EXPIRES
        rc: {
            number: { type: String },
            image: { type: String },
            expiryDate: { type: Date }, // RC expiry date - vehicle registration validity
            verifiedAt: { type: Date },
            verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        },
        // Insurance - REQUIRED & EXPIRES
        insurance: {
            number: { type: String },
            image: { type: String },
            expiryDate: { type: Date }, // Insurance expiry - vehicle insurance validity
            verifiedAt: { type: Date },
            verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        },
        // PAN Card - FOR INCOME TAX & BANKING
        panCard: {
            number: { type: String },
            image: { type: String },
            verifiedAt: { type: Date },
            verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        },
        // Aadhar Card - IDENTIFICATION PROOF
        aadharCard: {
            number: { type: String },
            image: { type: String },
            verifiedAt: { type: Date },
            verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        },
        // Medical Certificate - HEALTH VERIFICATION
        medicalCertificate: { 
            image: { type: String },
            expiryDate: { type: Date }, // Medical certificate validity period
            verifiedAt: { type: Date },
            verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        },
        // Policy Verification - INSURANCE POLICY
        policyVerification: {
            image: { type: String },
            expiryDate: { type: Date }, // Policy expiry date
            verifiedAt: { type: Date },
            verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        }
    },
    permanentAddress: {
        street: String,
        city: String,
        state: String,
        zipCode: String
    },
    localAddress: {
        street: String,
        city: String,
        state: String,
        zipCode: String
    },
    emergencyContactNumber: { type: String },
    bankDetails: {
        accountName: { type: String },
        accountNumber: { type: String },
        bankName: { type: String },
        branchName: { type: String },
        branchAddress: { type: String },
        swiftCode: { type: String },
        routingNumber: { type: String },
        verified: { type: Boolean, default: false },
        verificationStatus: { 
            type: String, 
            enum: ['pending', 'approved', 'rejected'], 
            default: 'pending' 
        },
        rejectionReason: { type: String },
        approvedAt: { type: Date },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    pendingUpdate: {
        email: { type: String },
        mobile: { type: String },
        otp: { type: String },
        otpExpires: { type: Date },
        otpAttempts: { type: Number, default: 0 }
    },
    riderVerified: { type: Boolean, default: false }, 
    isOnline: { type: Boolean, default: false },      
    isAvailable: { type: Boolean, default: true },    
    breakMode: { type: Boolean, default: false },
    breakReason: { type: String },
    sosActive: { type: Boolean, default: false },
    sosLastAt: { type: Date },
    sosLocation: { type: { type: String, default: 'Point' }, coordinates: { type: [Number], default: [0,0] } },
    verificationStatus: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'suspended'], 
        default: 'pending' 
    },
    rejectionReason: { type: String },
    rejectionDate: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Document Expiry Tracking - for admin alerts
    documentsExpiryStatus: {
        licenseExpiring: { type: Boolean, default: false }, // Expires within 30 days
        licenseExpired: { type: Boolean, default: false },   // Has expired
        rcExpiring: { type: Boolean, default: false },       // Expires within 30 days
        rcExpired: { type: Boolean, default: false },        // Has expired
        insuranceExpiring: { type: Boolean, default: false }, // Expires within 30 days
        insuranceExpired: { type: Boolean, default: false },  // Has expired
        medicalExpiring: { type: Boolean, default: false },   // Expires within 30 days
        medicalExpired: { type: Boolean, default: false },    // Has expired
        policyExpiring: { type: Boolean, default: false },    // Expires within 30 days
        policyExpired: { type: Boolean, default: false },     // Has expired
        lastCheckedAt: { type: Date }                         // When expiry was last checked
    },
    currentLocation: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], default: [0, 0], index: '2dsphere' } 
    },
    lastLocationUpdateAt: { type: Date },
    rating: { 
        average: { type: Number, default: 0, min: 0, max: 5 },
        count: { type: Number, default: 0 },
        breakdown: {
            five: { type: Number, default: 0 },
            four: { type: Number, default: 0 },
            three: { type: Number, default: 0 },
            two: { type: Number, default: 0 },
            one: { type: Number, default: 0 }
        },
        lastRatedAt: { type: Date }
    },
    totalEarnings: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    totalDeliveries: { type: Number, default: 0 },
    cancelledOrders: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 }
}, { timestamps: true });
riderSchema.index({ "currentLocation": "2dsphere" });
riderSchema.index({ isOnline: 1 });
riderSchema.index({ isAvailable: 1 });
riderSchema.index({ verificationStatus: 1 });
riderSchema.index({ workCity: 1, workZone: 1 });
module.exports = mongoose.model('Rider', riderSchema);
