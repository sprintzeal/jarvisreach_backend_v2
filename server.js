import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import connectDB from './db.js';
import cors from 'cors';
import session from "express-session"
import errorHandler from './middleware/errorHandler.js';
import cookieParser from 'cookie-parser';
import path from "path"

// routes
import usersRoutes from './routes/usersRoutes.js';
import leadManagerRoutes from './routes/leadManagerRoutes.js';
import LeadsRoutes from './routes/leadRoutes.js';
import folderRoutes from './routes/folderRoutes.js';
import viewRoutes from './routes/viewRoutes.js';
import teamMemberRoutes from './routes/teamMemberRoutes.js';
import linkedinRoutes from './routes/linkedinRoutes.js';
import leadExportsRoutes from './routes/leadExportsRoutes.js';
import plansRoutes from './routes/plansRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import helpSupportRoutes from './routes/helpSupportRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import configRoutes from './routes/configRoutes.js';

import stripeWebhook from './webhooks/stripeWebhook.js';
import "./backgroundWorkers/scheduleTasks/emailSequenceSender.js"
import "./backgroundWorkers/scheduleTasks/usersCreditsUpdater.js"

const app = express();

app.use(session({
    secret: process.env.SESSION_SECRET || "hsalfsdgisalfstu",
    resave: false,
    saveUninitialized: false
}));


const port = process.env.PORT || 5000;
// connection to database server
connectDB();

// cors middleware
app.use(cors({
    credentials: true,
    origin: true
}));


app.use((req, res, next) => {
    if (req.originalUrl === "/api/stripe-webhook") {
        next(); // Do nothing with the body because I need it in a raw state.
    } else {
        express.json()(req, res, next); // ONLY do express.json() if the received request is NOT a WebHook from Stripe.
    }
});

app.use(express.urlencoded({ extended: true }));

// parse the cookies
app.use(cookieParser());

app.get('/', (req, res) => res.send('Jarvisreach API is Running. 🚀'));
app.get('/api', (req, res) => res.send('Jarvisreach API Base URL. 📡'));

//stripe web hook
app.use('/api/stripe-webhook', stripeWebhook);

const dirname = path.resolve();

app.use('/assets', express.static(path.join(dirname, 'assets')));

//routes middlewares for deploying 

app.use('/api/users', usersRoutes);
app.use('/api/profiles', LeadsRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/views', viewRoutes);
app.use('/api/team', teamMemberRoutes);
app.use('/api/lin', linkedinRoutes);
app.use('/api/exports', leadExportsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/leadmanager', leadManagerRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/help', helpSupportRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/config', configRoutes);

//error handler middleware
app.use(errorHandler)

// catch all
app.use((req, res) => {
    res.status(404).send('404 Not Found. 🚫');
});

app.listen(port, () => console.log(`Jarvis app is listening on port ${port}`));

export default app;