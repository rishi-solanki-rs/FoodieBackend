
const mongoose = require('mongoose');
const auditLogSchema = new mongoose.Schema({
  entity: {
    type: String,
    required: true,
    enum: ['Order', 'User', 'Restaurant', 'Rider', 'Wallet', 'Settlement', 'Refund'],
    index: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'created',
      'updated',
      'deleted',
      'status_change',
      'payment',
      'refund',
      'settlement',
      'wallet_credit',
      'wallet_debit',
      'rider_assigned',
      'rider_unassigned',
      'admin_override',
      'cancellation',
      'delivery_confirmed'
    ],
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userRole: {
    type: String,
    required: true,
    enum: ['customer', 'restaurant_owner', 'rider', 'admin']
  },
  changes: {
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
  },
  reason: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: String,
  userAgent: String,
}, { 
  timestamps: true,
  capped: false // Set to true in production with size limit if needed
});
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.statics.log = async function({
  entity,
  entityId,
  action,
  userId,
  userRole,
  changes = null,
  reason = null,
  metadata = {},
  ipAddress = null,
  userAgent = null
}) {
  try {
    return await this.create({
      entity,
      entityId,
      action,
      userId,
      userRole,
      changes,
      reason,
      metadata,
      ipAddress,
      userAgent
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
    return null;
  }
};
auditLogSchema.statics.getHistory = async function(entity, entityId, limit = 50) {
  return await this.find({ entity, entityId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name email role')
    .lean();
};
auditLogSchema.statics.getUserActivity = async function(userId, limit = 100) {
  return await this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};
module.exports = mongoose.model('AuditLog', auditLogSchema);
