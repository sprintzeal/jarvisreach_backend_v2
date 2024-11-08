import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import dotenv from 'dotenv';
import Team from '../models/teamModel.js';
import CustomError from '../utils/CustomError.js';
dotenv.config();

const protect = async (req, res, next) => {
    let token;
    // get the token from the headers
    token = req.headers.authorization?.split(' ')[1] 
    // || req.cookies?.jwt

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId).select('-password');
            if (!user) {
                console.log(token, process.env.JWT_SECRET, decoded)
                throw new CustomError('user deleted', 404);
            }
            const team = await Team.findOne({ accounts: { $in: [user._id] } })

            if (user.role !== "admin" && !team) {
                throw new Error('Not authorized, user is not a team member or team admin');
            }

            else {
                req.user = user
                req.team = team
            }
            next();
        } catch (error) {
            res.status(401).json({
                success: false,
                status: false,
                message: error.message,
                stack: process.env.NODE_ENV === 'production' ? {} : error.stack
            })
        }
    } else {
        res.status(401).json({
            success: false,
            status: false,
            message: "'Not authorized, no token'",
        })
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(401).json({
            success: false,
            status: false,
            message: error.message,
            stack: process.env.NODE_ENV === 'production' ? {} : err.stack
        })
        throw new Error('Not authorized as an admin');
    }
};

export {
    protect,
    admin
};