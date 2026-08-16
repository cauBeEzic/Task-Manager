// This file will handle connection logic to the MongoDB database

const mongoose = require('mongoose');

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/TaskManager';
let connectionPromise;

const connectToDatabase = async () => {
    if (mongoose.connection.readyState === 1) {
        return mongoose;
    }

    if (!connectionPromise) {
        connectionPromise = mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 10000
        }).then(() => {
            connectionPromise = undefined;
            return mongoose;
        }).catch((error) => {
            connectionPromise = undefined;
            throw error;
        });
    }

    await connectionPromise;
    return mongoose;
};

module.exports = {
    mongoose,
    connectToDatabase
};
