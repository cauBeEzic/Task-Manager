const mongoose = require('mongoose');

const ActionReceiptSchema = new mongoose.Schema({
    _userId: {
        type: mongoose.Types.ObjectId,
        required: true
    },
    operationId: {
        type: String,
        required: true,
        maxlength: 128
    },
    method: {
        type: String,
        required: true
    },
    path: {
        type: String,
        required: true
    },
    state: {
        type: String,
        enum: ['pending', 'confirmed'],
        default: 'pending'
    },
    statusCode: {
        type: Number
    },
    responseBody: mongoose.Schema.Types.Mixed,
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
}, { timestamps: true });

ActionReceiptSchema.index({ _userId: 1, operationId: 1 }, { unique: true });
ActionReceiptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ActionReceipt = mongoose.model('ActionReceipt', ActionReceiptSchema);

module.exports = { ActionReceipt };
