const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        minlength: 1,
        trim: true
    },
    _listId: {
        type: mongoose.Types.ObjectId,
        required: true
    },
    completed: {
        type: Boolean,
        default: false
    },
    location: {
        type: {
            type: String,
            enum: ['Point']
        },
        coordinates: {
            type: [Number],
            validate: {
                validator: (coordinates) => !coordinates || (
                    coordinates.length === 2 &&
                    coordinates[0] >= -180 && coordinates[0] <= 180 &&
                    coordinates[1] >= -90 && coordinates[1] <= 90
                ),
                message: 'Location must be [longitude, latitude]'
            }
        }
    },
    address: {
        type: String,
        trim: true,
        maxlength: 240
    },
    geofenceRadiusMeters: {
        type: Number,
        min: 25,
        max: 5000,
        default: 100
    },
    syncVersion: {
        type: Number,
        default: 1
    },
    operationId: {
        type: String,
        maxlength: 128
    }
}, { timestamps: true })

TaskSchema.index({ _listId: 1 });
TaskSchema.index({ location: '2dsphere' }, { sparse: true });
TaskSchema.index({ operationId: 1 }, { unique: true, sparse: true });

const Task = mongoose.model('Task', TaskSchema);

module.exports = { Task }
