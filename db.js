import mongoose from "mongoose";

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            maxPoolSize: 100,             // Maximum number of connections in the pool
            minPoolSize: 10,              // Minimum number of connections in the pool
            serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds if unable to connect
        });

        console.log(`Database connected successfull.`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1); // Exit process with failure
    }
};

export default connectDB;
