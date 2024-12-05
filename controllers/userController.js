import { defaultView } from '../data/data.js';
import Column from '../models/columnModel.js';
import Folder from '../models/folderModel.js';
import Lead from '../models/leadModel.js';
import Tag from '../models/tagModel.js';
import Team from '../models/teamModel.js';
import User from '../models/userModel.js';
import View from '../models/viewModel.js';
import generateToken from '../utils/generateToken.js';
import Stripe from "stripe";
import Plan from '../models/plans/planModel.js';
import UserMailSetting from '../models/leadManager/userMailSetting.js';
import Token from '../models/tokenModel.js';
import { afterVerificationEmail, forgotPasswordEmail, inviteCustomerToJarvis, newUserRegistrationInfoEmail, signUpEmailVerification } from '../services/sendHtmlTemplates.js';
import jwt from 'jsonwebtoken';
import SequenceInfo from '../models/leadManager/sequenceInfoModel.js';
import CustomError from '../utils/CustomError.js';
import { generate } from 'generate-password'
import SequenceTemplate from '../models/leadManager/sequenceTemplateModel.js';
import Sale from '../models/plans/salesModel.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const signIn = async (req, res, next) => {

    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            throw new CustomError(`Account does not exists`, 404);
        }
        if (user && !user.password) {
            // might be the user is registred with google or linkedin
            throw new CustomError(`Password not found for email:${user.email} please try google or linkedin login`, 404);
        }

        if (user && (await user.matchPassword(password))) {
            // if email not verified
            if (!user.isEmailVerified && user.role !== 'admin') {
                // create a token and send email verification email to the user email
                const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
                    expiresIn: '30d'
                });
                const emailVerificationToken = await Token.create({
                    user: user._id,
                    token: token
                })

                const url = `${process.env.APP_BASE_URL}/users/${user._id}/verification/${emailVerificationToken.token}`;
                signUpEmailVerification(email, `${user.firstName} ${user.lastName}`, url);

                throw new Error('Email not verified. Please check your inbox for the verification link.');
            }
            else {
                // make user active now
                user.status = true;
                await user.save();
                const token = generateToken(res, user._id);
                res.status(201).json({
                    success: true,
                    result: {
                        _id: user._id,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email,
                        role: user.role,
                        avatar: user.avatar,
                        token
                    }
                });

            }
        } else {
            res.status(401);
            throw new Error('Invalid email or password');
        }
    } catch (error) {
        next(error);
    }
};

const signUp = async (req, res, next) => {

    const { firstName, lastName, email, password, role = "customer", customerRef, location, phone, plan } = req.body;
    try {

        const userExists = await User.findOne({ email });

        if (userExists) {
            res.status(400);
            throw new Error('User already exists');
        }

        const user = await User.create({
            firstName,
            lastName,
            email,
            password,
            plain_text : password,
            role,
            customerRef,
            location,
            phone,
            companyName,
            mainActivity,
            registredWith: "direct",
        });

        // create Team 

        let team;
        if (role === "customer" || role === "admin") {
            team = await Team.create({
                accounts: [user._id],
                creator: user._id,
            })

            // create default view (tabs and table columns) for the customer
            const data = defaultView
            // create new view
            const newView = await View.create({
                owner: team._id,
                name: data.name,
                template: data.template,
                defaults: data.default,
            });
            // now create column data for this new view
            const newColumns = await Column.create({
                view: newView._id,
                columns: data.columns,
            })
            // add the new column data to the view
            newView.columns = newColumns._id
            await newView.save();
        }
        if (role === "teammember") {
            const existTeam = await Team.findOne({ creator: customerRef })
            if (existTeam) {
                existTeam.accounts.push(user._id)
                await existTeam.save()
            }
        }

        if (user) {

            // create  default Folder
            const folder = new Folder({ name: "My First Folder", owner: team._id, default: true, leads: [], color: "#323A46", selected: true });
            await folder.save();

            await SequenceInfo.create({ owner: user._id });

            // we have to put this user on free plan in stripe 
            const products = await stripe.products.list({
                limit: 100
            });

            const freePlanProducts = products.data.filter(p => p.name === plan)
            // Iterate over the found products to find the one with a monthly recurring price

            let freePlanMonthlyProduct
            for (const product of freePlanProducts) {
                // List prices for the current product
                const prices = await stripe.prices.list({ product: product.id });

                // Find the price with a monthly recurring interval
                const monthlyPrice = prices.data.find(price => price.recurring && price.recurring.interval === 'month');
                if (monthlyPrice) {
                    freePlanMonthlyProduct = product
                }
            }
            const freePlan = await Plan.findOne({ name: plan, interval: "month" })
            const prices = await stripe.prices.list({
                product: freePlanMonthlyProduct.id,
            });
            const freePlanId = prices.data[0].id

            // create customer
            const stripeCustomer = await stripe.customers.create({
                name: user.firstName + ' ' + user.lastName,
                email: user.email,
            });

            // create subscription for customer
            const subscription = await stripe.subscriptions.create({
                customer: stripeCustomer.id,
                items: [
                    {
                        price: freePlanId,
                    },
                ],
            });

            const sub = await stripe.subscriptions.retrieve(subscription.id);
            const product = await stripe.products.retrieve(sub.plan.product);
            const credits = Number(product.metadata.credits);

            user.plan.plan = freePlan._id;
            user.plan.stripeCustomerId = stripeCustomer.id;
            user.plan.credits = credits;
            user.plan.isOnFreePlan = true;
            user.plan.planUpdatedDate = new Date();
            user.plan.freeCreditsGivenDate = new Date()
            user.plan.planName = plan;

            await user.save();
            // Update sales 
            await Sale.create({ planName: plan, interval: freePlan.interval });

            const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
            // create a token and send email verification email to the user email
            const emailVerificationToken = await Token.create({
                user: user._id,
                token: token
            });
            const url = `${process.env.APP_BASE_URL}/users/${user._id}/verification/${emailVerificationToken.token}`;

            signUpEmailVerification(email, `${firstName} ${lastName}`, url);

            // send email to admin about new user registration
            const admin = await User.findOne({ role: "admin" });
            newUserRegistrationInfoEmail(admin.email, `${firstName} ${lastName}`, email, location?.country || '', process.env.FREE_PLAN_NAME)

            res.status(201).json({
                success: true,
                result: {},
                message: `An Email sent to ${email} Please Verify Your Email Address.`
            });
        } else {
            throw new Error('Invalid user data');
        }
    } catch (error) {
        next(error);
    }
};

const verifyEmail = async (req, res, next) => {
    const userId = req.params.id;
    try {
        const user = await User.findById(userId)
        if (!user) {
            // throw new Error("Invalid Link")
            return res.status(200).json({ user, message: "Invalid Link" });
        }

        if (user && user.isEmailVerified) {
            return res.status(200).json({ user, message: "Email already verified" });
        }
        // verify the token
        jwt.verify(req.params.token, process.env.JWT_SECRET)

        const token = await Token.findOne({
            user: user._id,
            token: req.params.token,
        })
        // if (!token) {
        //     // throw new Error("Invalid Link")
        //     return res.status(400).json({ user, token, message: "Invalid Link" })
        // }
        await User.updateOne({ _id: user._id }, { isEmailVerified: true })

        // send email to user after verification
        const freePlan = await Plan.findOne({ name: process.env.FREE_PLAN_NAME })
        afterVerificationEmail(user.email, `${user.firstName} ${user.lastName}`, freePlan.credits)

        if (token) {
            await Token.deleteOne({
                user: user._id,
                token: req.params.token
            })
        }
        res.status(200).json({
            success: true,
            message: "Email Verified"
        });
    } catch (error) {
        next(error);
    }
};

const loginWithGoogle = async (req, res, next) => {
    const googleUser = req.body
    if (!googleUser) {
        res.status(400).json({ error: "Authentication failed" });
    }

    const role = "customer"
    const firstName = googleUser.userDetails.given_name;
    const lastName = googleUser.userDetails.family_name || googleUser.userDetails.given_name;
    const email = googleUser.userDetails.email;
    const avatar = googleUser.userDetails.picture;
    const location = googleUser.location
    const customerRef = ''
    try {

        const userExists = await User.findOne({ email });
        if (userExists) {

            const token = generateToken(res, userExists._id);
            return res.status(201).json({
                success: true,
                result: {
                    _id: userExists._id,
                    firstName: userExists.firstName,
                    lastName: userExists.lastName,
                    email: userExists.email,
                    role: userExists.role,
                    avatar: userExists.avatar,
                    token
                }
            });
        }
        else {
            const user = await User.create({
                firstName,
                lastName,
                email,
                role,
                status: true,
                location,
                avatar,
                isEmailVerified: true,
                registredWith: "google"
            });

            // create Team 

            let team;
            if (role === "customer" || role === "admin") {
                team = await Team.create({
                    accounts: [user._id],
                    creator: user._id,
                })

                // create default view (tabs and table columns) for the customer
                const data = defaultView
                // create new view
                const newView = await View.create({
                    owner: team._id,
                    name: data.name,
                    template: data.template,
                    defaults: data.default,
                });
                // now create column data for this new view
                const newColumns = await Column.create({
                    view: newView._id,
                    columns: data.columns,
                })
                // add the new column data to the view
                newView.columns = newColumns._id
                await newView.save();
            }
            if (role === "teammember") {
                const existTeam = await Team.findOne({ creator: customerRef })
                if (existTeam) {
                    existTeam.accounts.push(user._id)
                    await existTeam.save()
                }
            }

            if (user) {

                const token = generateToken(res, user._id);

                // create  default Folder
                const folder = new Folder({ name: "My First Folder", owner: team._id, default: true, leads: [], color: "#323A46", selected: true });
                await folder.save();

                await SequenceInfo.create({ owner: user._id });

                // we have to put this user on free plan in stripe 
                const products = await stripe.products.list({
                    limit: 100
                });

                const freePlanProducts = products.data.filter(p => p.name === process.env.FREE_PLAN_NAME)
                // Iterate over the found products to find the one with a monthly recurring price

                let freePlanMonthlyProduct
                for (const product of freePlanProducts) {
                    // List prices for the current product
                    const prices = await stripe.prices.list({ product: product.id });

                    // Find the price with a monthly recurring interval
                    const monthlyPrice = prices.data.find(price => price.recurring && price.recurring.interval === 'month');
                    if (monthlyPrice) {
                        freePlanMonthlyProduct = product
                    }
                }
                const freePlan = await Plan.findOne({ name: process.env.FREE_PLAN_NAME, interval: "month" })
                const prices = await stripe.prices.list({
                    product: freePlanMonthlyProduct.id,
                });
                const freePlanId = prices.data[0].id

                // create customer
                const stripeCustomer = await stripe.customers.create({
                    name: user.firstName + ' ' + user.lastName,
                    email: user.email,
                });

                // create subscription for customer
                const subscription = await stripe.subscriptions.create({
                    customer: stripeCustomer.id,
                    items: [
                        {
                            price: freePlanId,
                        },
                    ],
                });

                const sub = await stripe.subscriptions.retrieve(subscription.id);
                const product = await stripe.products.retrieve(sub.plan.product);
                const credits = Number(product.metadata.credits);

                user.plan.plan = freePlan._id;
                user.plan.stripeCustomerId = stripeCustomer.id;
                user.plan.credits = credits;
                user.plan.isOnFreePlan = true;
                user.plan.planUpdatedDate = new Date();
                user.plan.freeCreditsGivenDate = new Date()
                user.plan.planName = process.env.FREE_PLAN_NAME;

                await user.save();
                // create a Sale
                await Sale.create({ planName: process.env.FREE_PLAN_NAME, interval: freePlan.interval });

                // send email to admin
                const admin = await User.findOne({ role: "admin" });
                newUserRegistrationInfoEmail(admin.email, `${firstName} ${lastName}`, email, location?.country || '', process.env.FREE_PLAN_NAME)

                return res.status(201).json({
                    success: true,
                    result: {
                        _id: user._id,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email,
                        role: user.role,
                        token
                    }
                });
            } else {
                throw new Error('Invalid user data');
            }
        }
    } catch (error) {
        res.status(400).json({ success: false, error: error.message })
    }
}

const loginWithLinkedin = async (req, res, next) => {
    const { code, location } = req.body;

    try {
        if (!code) {
            throw new Error('Missing code parameter');
        }

        const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: `${process.env.APP_BASE_URL}/login`,
                client_id: process.env.LINKEDIN_CLIENT_ID,
                client_secret: process.env.LINKEDIN_CLIENT_SECRET,
            }),
        });

        if (!response.ok) {
            // Throw an error if the response status is not ok
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        const accessToken = data.access_token;

        // Fetch user data from LinkedIn using the access token
        const userDataResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
            method: "GET",
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json", // Ensure Content-Type is set
            },
        });

        const linkedinUser = await userDataResponse.json()

        const role = "customer"
        const firstName = linkedinUser.given_name;
        const lastName = linkedinUser.family_name || linkedinUser.given_name;
        const email = linkedinUser.email;
        const avatar = linkedinUser.picture || "";
        const customerRef = ''


        const userExists = await User.findOne({ email });
        if (userExists) {
            const token = generateToken(res, userExists._id);
            return res.status(201).json({
                success: true,
                result: {
                    _id: userExists._id,
                    firstName: userExists.firstName,
                    lastName: userExists.lastName,
                    email: userExists.email,
                    role: userExists.role,
                    avatar: userExists.avatar,
                    token
                }
            });
        }
        else {
            const user = await User.create({
                firstName,
                lastName,
                email,
                role,
                status: true,
                location,
                avatar,
                isEmailVerified: true,
                registredWith: "linkedin"
            });

            // create Team 

            let team;
            if (role === "customer" || role === "admin") {
                team = await Team.create({
                    accounts: [user._id],
                    creator: user._id,
                })

                // create default view (tabs and table columns) for the customer
                const data = defaultView
                // create new view
                const newView = await View.create({
                    owner: team._id,
                    name: data.name,
                    template: data.template,
                    defaults: data.default,
                });
                // now create column data for this new view
                const newColumns = await Column.create({
                    view: newView._id,
                    columns: data.columns,
                })
                // add the new column data to the view
                newView.columns = newColumns._id
                await newView.save();
            }
            if (role === "teammember") {
                const existTeam = await Team.findOne({ creator: customerRef })
                if (existTeam) {
                    existTeam.accounts.push(user._id)
                    await existTeam.save()
                }
            }

            if (user) {

                const token = generateToken(res, user._id);

                // create  default Folder
                const folder = new Folder({ name: "My First Folder", owner: team._id, default: true, leads: [], color: "#323A46", selected: true });
                await folder.save();

                await SequenceInfo.create({ owner: user._id });

                // we have to put this user on free plan in stripe 
                const products = await stripe.products.list({
                    limit: 100
                });

                const freePlanProducts = products.data.filter(p => p.name === process.env.FREE_PLAN_NAME)
                // Iterate over the found products to find the one with a monthly recurring price

                let freePlanMonthlyProduct
                for (const product of freePlanProducts) {
                    // List prices for the current product
                    const prices = await stripe.prices.list({ product: product.id });

                    // Find the price with a monthly recurring interval
                    const monthlyPrice = prices.data.find(price => price.recurring && price.recurring.interval === 'month');
                    if (monthlyPrice) {
                        freePlanMonthlyProduct = product
                    }
                }
                const freePlan = await Plan.findOne({ name: process.env.FREE_PLAN_NAME, interval: "month" })
                const prices = await stripe.prices.list({
                    product: freePlanMonthlyProduct.id,
                });
                const freePlanId = prices.data[0].id

                // create customer
                const stripeCustomer = await stripe.customers.create({
                    name: user.firstName + ' ' + user.lastName,
                    email: user.email,
                });

                // create subscription for customer
                const subscription = await stripe.subscriptions.create({
                    customer: stripeCustomer.id,
                    items: [
                        {
                            price: freePlanId,
                        },
                    ],
                });

                const sub = await stripe.subscriptions.retrieve(subscription.id);
                const product = await stripe.products.retrieve(sub.plan.product);
                const credits = Number(product.metadata.credits);

                user.plan.plan = freePlan._id;
                user.plan.stripeCustomerId = stripeCustomer.id;
                user.plan.credits = credits;
                user.plan.isOnFreePlan = true;
                user.plan.planUpdatedDate = new Date();
                user.plan.freeCreditsGivenDate = new Date();
                user.plan.planName = process.env.FREE_PLAN_NAME;

                await user.save();
                // Create a Sale
                await Sale.create({ planName: process.env.FREE_PLAN_NAME, interval: freePlan.interval });

                // send email to admin
                const admin = await User.findOne({ role: "admin" });
                newUserRegistrationInfoEmail(admin.email, `${firstName} ${lastName}`, email, location?.country || '', process.env.FREE_PLAN_NAME)

                return res.status(201).json({
                    success: true,
                    result: {
                        _id: user._id,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email,
                        role: user.role,
                        token
                    }
                });
            } else {
                throw new Error('Invalid user data');
            }
        }

    } catch (error) {
        next(error); // Pass the error to the next middleware or error handler
    }
};


const signOut = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            message: 'User logged out'
        });
    } catch (error) {
        next(error);
    }
};

// get Logedin user

const getLoggedInUser = async (req, res, next) => {
    try {
        const userId = req.user._id;

        // Promise.all to run queries concurrently
        const [user, userActiveTemplates] = await Promise.all([
            User.findById(userId).select('-password').lean(), // Lean query for performance
            SequenceTemplate.countDocuments({ owner: userId, enabled: true }) // Ensure 'owner' is correctly set
        ]);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({ success: true, result: { ...user, userActiveTemplates } });
    } catch (error) {
        next(error);
    }
};


// controller for user accept the terms and conditions

const acceptTermsAndConditions = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const user = await User.findByIdAndUpdate(userId, { 'settings.acceptedTermsAndConditions': true }, { new: true });

        if (!user) {
            throw new Error(`User ${userId} not found`);
        }

        res.status(200).json({ success: true, result: user });
    } catch (error) {
        next(error);
    }
}

// controller for user accept the terms and conditions

const completeTour = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const user = await User.findByIdAndUpdate(userId, { 'settings.completedTour': true }, { new: true });

        if (!user) {
            throw new Error(`User ${userId} not found`);
        }

        res.status(200).json({ success: true, result: user });
    } catch (error) {
        next(error);
    }
};

const completeAppTour = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const user = await User.findByIdAndUpdate(userId, { 'settings.completedAppTour': true }, { new: true });

        if (!user) {
            throw new CustomError(`User ${userId} not found`, 404);
        }

        res.status(200).json({ success: true, result: user });
    } catch (error) {
        next(error);
    }
}

//controller for updating user (customer) data
const updateCustomer = async (req, res, next) => {

    const { firstName, lastName, organizationName, timeZone, avatar } = req.body

    try {
        const userId = req.user._id;
        const user = await User.findByIdAndUpdate(userId, req.body, { new: true });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        res.status(200).json({ success: true, result: { user } });
    } catch (error) {
        next(error);
    }
}

// controller for cnaging the email of a user
const updateUserEmail = async (req, res, next) => {

    const { newEmail } = req.body;

    try {
        const userId = req.user._id;
        // test email syntax
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(newEmail)) {
            throw new CustomError('Invalid email format', 400);
        }

        const newEmailExists = await User.findOne({ email: newEmail });

        if (newEmailExists) {
            throw new CustomError(`Account on this ${newEmail} email already exists`, 409)
        }

        // create a token and send email verification email to the user email
        const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
            expiresIn: '30d'
        });

        const emailVerificationToken = await Token.create({
            user: userId,
            token: token
        })

        const user = await User.findByIdAndUpdate(userId, { email: newEmail, isEmailVerified: false }, { new: true });
        if (!user) {
            throw new Error(`User ${user} not found`);
        }

        const url = `${process.env.APP_BASE_URL}/users/${userId}/verification/${emailVerificationToken.token}`;

        signUpEmailVerification(newEmail, `${user.firstName} ${user.lastName}`, url);

        await stripe.customers.update(user.plan.stripeCustomerId, {
            email: newEmail,
        });

        res.status(200).json({ success: true, result: user, message: "Your email has been updated. Please check inbox for the verification link." });
    } catch (error) {
        next(error);
    }
}

// controller for changing the password of a user user will send current password and new password
const updateUserPassword = async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;

    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        const isPasswordMatched = await user.matchPassword(currentPassword)
        if (!isPasswordMatched) {
            throw new Error('Current password is incorrect');
        }

        user.password = newPassword;
        await user.save();

        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        next(error);
    }
}

// controller for account reset we have to delete all the leads etc of the customer
const resetAccount = async (req, res, next) => {
    const { password } = req.body;
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user) {
            throw new Error(`User ${user} not found`);
        }
        const isPasswordMatched = await user.matchPassword(password)
        if (!isPasswordMatched) {
            throw new Error('Password is incorrect');
        }

        // delete all leads of the customer
        const leads = await Lead.find({ owner: userId });
        leads.forEach(async (lead) => {
            await Lead.findByIdAndDelete(lead._id);
        });

        // delete all folders of the customer
        const folders = await Folder.find({ owner: userId });
        folders.forEach(async (folder) => {
            await Folder.findByIdAndDelete(folder._id);
        });

        res.status(200).json({ success: true, message: 'Account reset successfully' });
    } catch (error) {
        next(error);
    }
}

// controller for deleting the user (customer) account all the customer leads and folders etc will be removed

const deleteUserAccount = async (req, res, next) => {
    const { password } = req.body;
    try {

        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user) {
            throw new Error(`User ${user} not found`);
        }
        const withNoPassword = user.registredWith !== "direct";
        const isPasswordMatched = await user.matchPassword(password)
        if (!isPasswordMatched && !withNoPassword) {
            throw new Error('Password is incorrect');
        }

        // delete all leads of the customer
        const leads = await Lead.find({ owner: userId });
        leads.forEach(async (lead) => {
            await Lead.findByIdAndDelete(lead._id);
        });

        // delete all folders of the customer
        const folders = await Folder.find({ owner: userId });
        folders.forEach(async (folder) => {
            await Folder.findByIdAndDelete(folder._id);
        });

        // delete all the views and columns of the customer
        const views = await View.find({ owner: userId });
        views.forEach(async (view) => {
            await View.findByIdAndDelete(view._id);
            await Column.findOneAndDelete({ view: view._id })
        });

        // delete all the tags os customer
        const tags = await Tag.find({ owner: userId });
        tags.forEach(async (tag) => {
            await Tag.findByIdAndDelete(tag._id);
        });

        // delete all the team members of the customer
        const teamMembers = await User.find({ customerRef: userId });
        teamMembers.forEach(async (teamMember) => {
            await User.findByIdAndDelete(teamMember._id);
        });

        // stripe deletion
        if (user.plan.stripeCustomerId) {
            const customerId = user.plan.stripeCustomerId;

            // Retrieve active subscriptions
            const subscriptions = await stripe.subscriptions.list({
                customer: customerId,
                status: 'active',
            });

            // Cancel each active subscription
            const cancelSubscriptions = subscriptions.data.map(sub =>
                stripe.subscriptions.cancel(sub.id)
            );

            // Optionally, retrieve and delete payment methods
            const paymentMethods = await stripe.paymentMethods.list({
                customer: customerId,
                type: 'card',
            });

            const deletePaymentMethods = paymentMethods.data.map(pm =>
                stripe.paymentMethods.detach(pm.id)
            );

            // Await all cancellations and deletions
            await Promise.all([...cancelSubscriptions, ...deletePaymentMethods]);

            // Delete the customer
            await stripe.customers.del(customerId);
        }

        await User.findByIdAndDelete(userId);

        res.status(200).json({ success: true, message: 'User (customer) account deleted successfully' });
    } catch (error) {
        next(error);
    }
}

const getCustomers = async (req, res, next) => {
    try {

        const { page = 1, limit = 5 } = req.query;
        const adminCustomerEmail = process.env.ADMIN_CUSTOMER_ACCOUNT_EMAIL || "admincustomer@gmail.com"
        const query = {
            role: "customer",
            email: { $ne: adminCustomerEmail }
        };

        // Retrieve customers from the database
        const customers = await User.find(query).sort({ created_at: -1 }).select("-password")
            .skip((page - 1) * limit)
            .limit(Number(limit));

        // Map over the customers to get subscription details
        const customerWithPlanInfo = await Promise.all(customers.map(async (customer) => {
            const stripeCustomerId = customer.plan.stripeCustomerId;

            if (!stripeCustomerId) {
                return {
                    ...customer.toObject(), // Convert to plain object to avoid Mongoose Document methods
                    planName: null,
                    paymentStatus: null,
                    purchaseDate: null,
                    expirationDate: null,
                };
            }

            try {
                // Retrieve subscriptions for the customer
                const subscriptions = await stripe.subscriptions.list({
                    customer: stripeCustomerId,
                });

                // Assuming the customer has only one subscription
                const subscription = subscriptions.data[0];

                if (!subscription) {
                    return {
                        ...customer.toObject(),
                        planName: null,
                        paymentStatus: null,
                        purchaseDate: null,
                        expirationDate: null,
                    };
                }

                const plan = await Plan.findById(customer.plan.plan)

                const mailSettings = await UserMailSetting.findOne({ owner: customer._id }).select("status")
                return {
                    ...customer.toObject(),
                    planName: plan?.name,
                    paymentStatus: subscription.status,
                    purchaseDate: new Date(subscription.created * 1000).getTime(),
                    expirationDate: new Date(subscription.current_period_end * 1000).getTime(),
                    smtp: mailSettings ? mailSettings.status : "Deactive"
                };
            } catch (err) {
                return {
                    ...customer.toObject(),
                    planName: null,
                    paymentStatus: null,
                    purchaseDate: null,
                    expirationDate: null,
                };
            }
        }));

        const totalItems = await User.countDocuments(query);

        res.status(200).json({ success: true, result: customerWithPlanInfo, totalItems, page, limit });
    } catch (error) {
        next(error);
    }
};

const changeCustomerSMTPSettings = async (req, res, next) => {
    const { customerId, smtp } = req.body;
    const userRole = req.user.role;
    try {

        if (!customerId || !smtp) {
            throw new Error('customerId and smtp required')
        }

        let isDeactive;

        if (smtp === "Deactive") {
            isDeactive = true;
        } else {
            isDeactive = false;
        }

        let settings;

        if (userRole === 'admin') {
            settings = await UserMailSetting.findOneAndUpdate({ owner: customerId }, { status: smtp, isDeactivatedByAdmin: isDeactive }, { new: true });
        } else {
            settings = await UserMailSetting.findOneAndUpdate({ owner: customerId }, { status: smtp }, { new: true });
        }

        if (!settings) {
            throw new CustomError('Customer mail settings not found', 404)
        }
        res.status(200).json({ success: true, message: 'SMTP settings updated successfully', settings });
    } catch (error) {
        next(error);
    }
}

//controller for updating user (customer) data
// const updateCustomerByAdmin = async (req, res, next) => {
//     const userId = req.params.id
//     console.log('userId : ',userId)
//     console.log(req.body)
//     try {

//         const user = await User.findByIdAndUpdate(userId, req.body, { new: true });
//         if (!user) {
//             return res.status(404).json({ success: false, message: 'Customer not found' });
//         }
//         res.status(200).json({ success: true, result: { user } });
//     } catch (error) {
//         next(error);
//     }
// }





// const updateCustomerByAdmin = async (req, res, next) => {
//     const userId = req.params.id;
//     console.log('userId : ', userId);
//     console.log('req.body', req.body);


//     try {
//         // Fetch the original user document
//         const originalUser = await User.findById(userId);
//         console.log(originalUser)
//         console.log('Before updating:', originalUser.expiredAt)

//         if (!originalUser) {
//             return res.status(404).json({ success: false, message: 'Customer not found' });
//         }

//         // Define the credits based on plan and packagePeriod
//         let credits = originalUser.plan.credits; // Default to current credits if no plan change

//         // Handle plan change logic
//         if (req.body.plan) {
//             originalUser.plan.planName = req.body.plan;  // Update planName

//             // Determine credits based on the selected plan and package period
//             const selectedPlan = req.body.plan;
//             const packagePeriod = req.body.packagePeriod || originalUser.plan.packagePeriod; // Use existing if not provided in request

//             const products = await stripe.products.list({ limit: 100 });
//             const selectedPlanProducts = products.data.filter(p => p.name === selectedPlan);

//             let yearlyCredits = 0;
//             let monthlyCredits = 0;

//             // Get credits from selected plan product
//             if (selectedPlanProducts.length > 0) {
//                 yearlyCredits = parseInt(selectedPlanProducts[0]?.metadata.credits, 10) || 0;
//                 monthlyCredits = parseInt(selectedPlanProducts[1]?.metadata.credits, 10) || 0;
//             }

//             console.log(`${selectedPlan} Monthly Credits: ${monthlyCredits} credits`);
//             console.log(`${selectedPlan} Yearly Credits: ${yearlyCredits} credits`);

//             if (packagePeriod === "Month") {
//                 credits = monthlyCredits;
//             } else if (packagePeriod === "Year") {
//                 credits = yearlyCredits;
//             } else {
//                 credits = monthlyCredits; 
//             }

//             // Update packagePeriod as well
//             if (req.body.packagePeriod) {
//                 originalUser.plan.packagePeriod = req.body.packagePeriod;
//             }
//         }

//         // Handling startDate and endDate changes
//         if (req.body.startDate) {
//             const startDate = new Date(req.body.startDate);  // Ensure it's a Date object
//             originalUser.plan.startDate = startDate;  // Update startDate
//         }

//         // Handle endDate and expiredAt based on packagePeriod
//         let expiredAt;

//         // If packagePeriod is provided or endDate is provided, calculate expiredAt
//         if (req.body.packagePeriod || req.body.endDate) {
//             const endDateObj = req.body.endDate ? new Date(req.body.endDate) : new Date();  // Use provided endDate or current date if not provided
//             originalUser.plan.endDate = endDateObj;  // Update endDate with the provided value

//             const packagePeriod = req.body.packagePeriod || originalUser.plan.packagePeriod;  // Use new packagePeriod if provided

//             // Calculate expiredAt based on packagePeriod
//             if (packagePeriod === 'Month') {
//                 expiredAt = new Date(endDateObj); // Copy endDate object
//                 expiredAt.setMonth(expiredAt.getMonth() + 1); // 1 month later
//                 console.log('ExpiredAt for Month:', expiredAt);
//             } else if (packagePeriod === 'Year') {
//                 expiredAt = new Date(endDateObj); // Copy endDate object
//                 expiredAt.setFullYear(expiredAt.getFullYear() + 1); // 1 year later
//                 console.log('ExpiredAt for Year:', expiredAt);
//             } else if (packagePeriod === 'Custom Date') {
//                 expiredAt = endDateObj;  // Use the custom end date
//                 console.log('ExpiredAt for Custom:', expiredAt);
//             } else {
//                 expiredAt = new Date();  // Default expiredAt to current date if no valid packagePeriod
//                 console.log('ExpiredAt for Default:', expiredAt);
//             }

//             // Ensure expiredAt reflects the current time (preserving hours, minutes, seconds)
//             const currentTime = new Date();
//             expiredAt.setHours(currentTime.getHours());
//             expiredAt.setMinutes(currentTime.getMinutes());
//             expiredAt.setSeconds(currentTime.getSeconds());
//             expiredAt.setMilliseconds(currentTime.getMilliseconds());

//             originalUser.plan.expiredAt = expiredAt.getTime();  // Store the timestamp
//             console.log('Updated expiredAt:', originalUser.plan.expiredAt);
//         }
//         console.log(originalUser.plan.expiredAt)

//         // Update the other fields that are present in req.body
//         Object.keys(req.body).forEach(key => {
//             if (key !== 'plan' && key !== 'packagePeriod' && key !== 'endDate') {
//                 originalUser[key] = req.body[key];  // Update all other fields except 'plan', 'packagePeriod', 'endDate'
//             }
//         });

//         // Apply the credits to the plan
//         originalUser.plan.credits = credits;

//         // Update planUpdatedDate to the current time
//         originalUser.plan.planUpdatedDate = new Date();  // Explicit update

//         // Save the updated user document
//         const updatedUser = await originalUser.save();

//         res.status(200).json({ success: true, result: { user: updatedUser } });
//     } catch (error) {
//         next(error);
//     }
// };

const updateCustomerByAdmin = async (req, res, next) => {
    const userId = req.params.id;
    console.log('userId : ', userId);
    console.log('req.body', req.body);

    try {
        // Fetch the original user document
        const originalUser = await User.findById(userId);
        console.log(originalUser);
        console.log('Before updating expiredAt:', originalUser.expiredAt);

        if (!originalUser) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        // Define the credits based on plan and packagePeriod
        let credits = originalUser.plan.credits; // Default to current credits if no plan change

        // Handle plan change logic
        if (req.body.plan) {
            originalUser.plan.planName = req.body.plan;  // Update planName

            // Determine credits based on the selected plan and package period
            const selectedPlan = req.body.plan;
            const packagePeriod = req.body.packagePeriod || originalUser.plan.packagePeriod; // Use existing if not provided in request

            const products = await stripe.products.list({ limit: 100 });
            const selectedPlanProducts = products.data.filter(p => p.name === selectedPlan);

            let yearlyCredits = 0;
            let monthlyCredits = 0;

            // Get credits from selected plan product
            if (selectedPlanProducts.length > 0) {
                yearlyCredits = parseInt(selectedPlanProducts[0]?.metadata.credits, 10) || 0;
                monthlyCredits = parseInt(selectedPlanProducts[1]?.metadata.credits, 10) || 0;
            }

            console.log(`${selectedPlan} Monthly Credits: ${monthlyCredits} credits`);
            console.log(`${selectedPlan} Yearly Credits: ${yearlyCredits} credits`);

            if (packagePeriod === "Month") {
                credits = monthlyCredits;
            } else if (packagePeriod === "Year") {
                credits = yearlyCredits;
            } else {
                credits = monthlyCredits; 
            }

            // Update packagePeriod as well
            if (req.body.packagePeriod) {
                originalUser.plan.packagePeriod = req.body.packagePeriod;
            }
        }

        // Handling startDate and endDate changes
        if (req.body.startDate) {
            const startDate = new Date(req.body.startDate);  // Ensure it's a Date object
            originalUser.plan.startDate = startDate;  // Update startDate
        }

        // Handle endDate and expiredAt based on packagePeriod
        let expiredAt;

        // If packagePeriod is provided or endDate is provided, calculate expiredAt
        if (req.body.packagePeriod || req.body.endDate) {
            const endDateObj = req.body.endDate ? new Date(req.body.endDate) : new Date();  // Use provided endDate or current date if not provided
            originalUser.plan.endDate = endDateObj;  // Update endDate with the provided value

            const packagePeriod = req.body.packagePeriod || originalUser.plan.packagePeriod;  // Use new packagePeriod if provided

            // Calculate expiredAt based on packagePeriod
            if (packagePeriod === 'Month') {
                expiredAt = new Date(endDateObj); // Copy endDate object
                expiredAt.setMonth(expiredAt.getMonth() + 1); // 1 month later
                console.log('ExpiredAt for Month:', expiredAt);
            } else if (packagePeriod === 'Year') {
                expiredAt = new Date(endDateObj); // Copy endDate object
                expiredAt.setFullYear(expiredAt.getFullYear() + 1); // 1 year later
                console.log('ExpiredAt for Year:', expiredAt);
            } else if (packagePeriod === 'Custom Date') {
                expiredAt = endDateObj;  // Use the custom end date
                console.log('ExpiredAt for Custom:', expiredAt);
            } else {
                expiredAt = new Date();  // Default expiredAt to current date if no valid packagePeriod
                console.log('ExpiredAt for Default:', expiredAt);
            }

            // Ensure expiredAt reflects the current time (preserving hours, minutes, seconds)
            const currentTime = new Date();
            expiredAt.setHours(currentTime.getHours());
            expiredAt.setMinutes(currentTime.getMinutes());
            expiredAt.setSeconds(currentTime.getSeconds());
            expiredAt.setMilliseconds(currentTime.getMilliseconds());

            // Update expiredAt on the main document
            originalUser.expiredAt = expiredAt.getTime();  // Store the timestamp
            console.log('Updated expiredAt:', originalUser.expiredAt);
        }

        // Update the other fields that are present in req.body
        Object.keys(req.body).forEach(key => {
            if (key !== 'plan' && key !== 'packagePeriod' && key !== 'endDate') {
                originalUser[key] = req.body[key];  // Update all other fields except 'plan', 'packagePeriod', 'endDate'
            }
        });

        // Apply the credits to the plan
        originalUser.plan.credits = credits;

        // Update planUpdatedDate to the current time
        originalUser.plan.planUpdatedDate = new Date();  // Explicit update

        // Save the updated user document
        const updatedUser = await originalUser.save();

        res.status(200).json({ success: true, result: { user: updatedUser } });
    } catch (error) {
        next(error);
    }
};




//controller for updating user (customer) data
const inviteCustomerToApp = async (req, res, next) => {
    const userId = req.params.id;
    try {
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        if (user.status) {
            return res.status(404).json({ success: false, message: 'Customer account is active.' });
        }
        const password = generate({
            length: 10,
            numbers: true
        });
        user.password = password;
        const createdDate = new Date(user.created_at).toLocaleDateString();
        await user.save();
        inviteCustomerToJarvis(user.email, `${user.firstName} ${user.lastName}`, password, createdDate)
        res.status(200).json({ success: true, message: "Invitation Sent." });
    } catch (error) {
        next(error);
    }
}

const deleteUserAccountWithoutPAssword = async (req, res, next) => {

    try {

        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            throw new Error(`User ${user} not found`);
        }

        // delete all leads of the customer
        const leads = await Lead.find({ owner: userId });
        leads.forEach(async (lead) => {
            await Lead.findByIdAndDelete(lead._id);
        });

        // delete all folders of the customer
        const folders = await Folder.find({ owner: userId });
        folders.forEach(async (folder) => {
            await Folder.findByIdAndDelete(folder._id);
        });

        // delete all the views and columns of the customer
        const views = await View.find({ owner: userId });
        views.forEach(async (view) => {
            await View.findByIdAndDelete(view._id);
            await Column.findOneAndDelete({ view: view._id })
        });

        // delete all the tags os customer
        const tags = await Tag.find({ owner: userId });
        tags.forEach(async (tag) => {
            await Tag.findByIdAndDelete(tag._id);
        });

        // delete all the team members of the customer
        const teamMembers = await User.find({ customerRef: userId });
        teamMembers.forEach(async (teamMember) => {
            await User.findByIdAndDelete(teamMember._id);
        });

        // stripe deletion
        if (user.plan.stripeCustomerId) {
            const customerId = user.plan.stripeCustomerId;

            // Retrieve active subscriptions
            const subscriptions = await stripe.subscriptions.list({
                customer: customerId,
                status: 'active',
            });

            // Cancel each active subscription
            const cancelSubscriptions = subscriptions.data.map(sub =>
                stripe.subscriptions.cancel(sub.id)
            );

            // Optionally, retrieve and delete payment methods
            const paymentMethods = await stripe.paymentMethods.list({
                customer: customerId,
                type: 'card',
            });

            const deletePaymentMethods = paymentMethods.data.map(pm =>
                stripe.paymentMethods.detach(pm.id)
            );

            // Await all cancellations and deletions
            await Promise.all([...cancelSubscriptions, ...deletePaymentMethods]);

            // Delete the customer
            await stripe.customers.del(customerId);
        }

        await User.findByIdAndDelete(userId);

        res.status(200).json({ success: true, message: 'User (customer) account deleted successfully' });
    } catch (error) {
        next(error);
    }
}

const forgotPassword = async (req, res, next) => {
    const email = req.body.email;
    try {
        if (!email) {
            throw new Error('email required')
        }
        const user = await User.findOne({ email });
        if (!user) {
            throw new Error(`User with email ${email} not found`);
        }
        // generate token which expires in 15 mins
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        await new Token({
            user: user._id,
            token: token
        }).save();
        const url = `${process.env.APP_BASE_URL}/users/${user._id}/resetPassword/${token}`;

        forgotPasswordEmail(email, `${user.firstName} ${user.lastName}`, url);

        res.status(200).json({ success: true, result: {}, message: `Please check your inbox for the forgot password link.` });
    } catch (error) {
        next(error);
    }
};

// controller for the changing the password after verifiing the token

const resetPassword = async (req, res, next) => {
    const { password, token } = req.body;
    try {
        if (!password || !token) {
            throw new Error('password and token required')
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded) {
            throw new Error('Invalid or expired token');
        }
        const user = await User.findById(decoded.userId);
        if (!user) {
            throw new Error(`User with id ${decoded.userId} not found`);
        }
        const existingToken = await Token.findOne({
            user: user._id,
            token: token
        });
        if (!existingToken) {
            throw new Error("Invalid Link")
        }
        user.password = password;
        await user.save();
        await Token.deleteOne({
            user: user._id,
            token: token
        })
        // now make the token expired
        res.status(200).json({ success: true, result: {}, message: `Password reset successfully.` });
    } catch (error) {
        next(error);
    }
};


const deleteCustomers = async (req, res, next) => {
    const userIds = req.body.ids

    try {
        const adminCustomerEmail = process.env.ADMIN_CUSTOMER_ACCOUNT_EMAIL || "admincustomer@gmail.com"
        if (!userIds || !Array.isArray(userIds)) { throw new Error("Users Ids Required") }

        for (const userId of userIds) {

            const user = await User.findById(userId);
            if (user.email === adminCustomerEmail) {
                return
            }
            const team = await Team.findOne({ creator: user._id })
            if (!user || !team) {
                throw new Error(`User ${user} or team ${team} not found`);
            }

            // delete all leads of the customer
            const leads = await Lead.find({ owner: team._id });
            leads.forEach(async (lead) => {
                await Lead.findByIdAndDelete(lead._id);
            });

            // delete all folders of the customer
            const folders = await Folder.find({ owner: team._id });
            folders.forEach(async (folder) => {
                await Folder.findByIdAndDelete(folder._id);
            });

            // delete all the views and columns of the customer
            const views = await View.find({ owner: team._id });
            views.forEach(async (view) => {
                await View.findByIdAndDelete(view._id);
                await Column.findOneAndDelete({ view: view._id })
            });

            // delete all the tags os customer
            const tags = await Tag.find({ owner: team._id });
            tags.forEach(async (tag) => {
                await Tag.findByIdAndDelete(tag._id);
            });

            // delete all the team members of the customer
            const teamMembers = await User.find({ customerRef: user._id });
            teamMembers.forEach(async (teamMember) => {
                await User.findByIdAndDelete(teamMember._id);
            });

            // stripe deletion
            if (user.plan.stripeCustomerId) {
                const customerId = user.plan.stripeCustomerId;

                // Retrieve active subscriptions
                const subscriptions = await stripe.subscriptions.list({
                    customer: customerId,
                    status: 'active',
                });

                // Cancel each active subscription
                const cancelSubscriptions = subscriptions.data.map(sub =>
                    stripe.subscriptions.cancel(sub.id)
                );

                // Optionally, retrieve and delete payment methods
                const paymentMethods = await stripe.paymentMethods.list({
                    customer: customerId,
                    type: 'card',
                });

                const deletePaymentMethods = paymentMethods.data.map(pm =>
                    stripe.paymentMethods.detach(pm.id)
                );

                // Await all cancellations and deletions
                await Promise.all([...cancelSubscriptions, ...deletePaymentMethods]);

                // Delete the customer
                await stripe.customers.del(customerId);
            }

            await User.findByIdAndDelete(userId);
        }


        res.status(200).json({ success: true, message: 'User (customer) account deleted successfully' });
    } catch (error) {
        next(error);
    }
}

// const createCustomer = async (req, res, next) => {

//     const { firstName, lastName, email, role = "customer", customerRef, location, phone, plan, packagePeriod, startDate, endDate } = req.body;
//     try {
//         const userExists = await User.findOne({ email });

//         if (userExists) {
//             res.status(400);
//             throw new Error('User already exists');
//         }

//         const startDateObj = startDate ? new Date(startDate) : new Date();  
//         const endDateObj = endDate ? new Date(endDate) : new Date();  
//         const localStartDate = startDateObj.toLocaleDateString("en-CA"); 
//         const localEndDate = endDateObj.toLocaleDateString("en-CA");  


        
//         let expiredAt;

//         // Calculate expiredAt based on packagePeriod
//         if (packagePeriod === 'Month') {
//             expiredAt = new Date().setMonth(new Date().getMonth() + 1); // 1 month later
//         } else if (packagePeriod === 'Year') {
//             expiredAt = new Date().setFullYear(new Date().getFullYear() + 1); // 1 year later
//         } else if (packagePeriod === 'Custom Date' && endDateObj) {
//             expiredAt = endDateObj.getTime();
//         } else {
//             expiredAt = new Date().getTime();
//         }


//         const user = await User.create({
//             firstName,
//             lastName,
//             email,
//             role,
//             status: false,
//             customerRef,
//             location,
//             phone,
//             // companyName,
//             // mainActivity,    
//             planName: plan,
//             packagePeriod: packagePeriod,
//             startDate: localStartDate,
//             endDate: localEndDate,
//             expiredAt: expiredAt,
//             isEmailVerified: true,
//             registredWith: "direct",
//             // created_at: packagePeriod === 'Custom Date' ? startDateObj : undefined,     
//         });

//         // create Team 
//         let team;
//         team = await Team.create({
//             accounts: [user._id],
//             creator: user._id,
//         })

//         // create default view (tabs and table columns) for the customer
//         const data = defaultView
//         // create new view
//         const newView = await View.create({
//             owner: team._id,
//             name: data.name,
//             template: data.template,
//             defaults: data.default,
//         });
//         // now create column data for this new view
//         const newColumns = await Column.create({
//             view: newView._id,
//             columns: data.columns,
//         })
//         // add the new column data to the view
//         newView.columns = newColumns._id
//         await newView.save();


//         if (user) {

//             // create  default Folder
//             const folder = new Folder({ name: "My First Folder", owner: team._id, default: true, leads: [], color: "#323A46", selected: true });
//             await folder.save();

//             await SequenceInfo.create({ owner: user._id });

//             // we have to put this user on free plan in stripe 
//             const products = await stripe.products.list({
//                 limit: 100
//             });

//             const freePlanProducts = products.data.filter(p => p.name === process.env.FREE_PLAN_NAME)
//             const selectedPlanProducts = products.data.filter(p => p.name === plan);
//             // console.log('selectedPlanProducts', selectedPlanProducts);
//             // console.log('freePlanProducts', freePlanProducts)

//             const yearlyCredits = parseInt(selectedPlanProducts[0]?.metadata.credits, 10) || 0;
//             const monthlyCredits = parseInt(selectedPlanProducts[1]?.metadata.credits, 10) || 0;
    
//             // Log both monthly and yearly credits
//             console.log(`${plan} Monthly Credits: ${monthlyCredits} credits`);
//             console.log(`${plan} Yearly Credits: ${yearlyCredits} credits`);

//             let credits = 0;
//             if (packagePeriod === "Month") {
//                 credits = monthlyCredits;
//             } else if (packagePeriod === "Year") {
//                 credits = yearlyCredits;
//             } else if (packagePeriod === "Custom Date") {
//                 credits = monthlyCredits;  
//             }
            
            
//             // Iterate over the found products to find the one with a monthly recurring price

//             let freePlanMonthlyProduct
//             for (const product of freePlanProducts) {
//                 // List prices for the current product
//                 const prices = await stripe.prices.list({ product: product.id });

//                 // Find the price with a monthly recurring interval
//                 const monthlyPrice = prices.data.find(price => price.recurring && price.recurring.interval === 'month');
//                 if (monthlyPrice) {
//                     freePlanMonthlyProduct = product
//                 }
//             }
//             const freePlan = await Plan.findOne({ name: plan, interval: "month" })
//             const prices = await stripe.prices.list({
//                 product: freePlanMonthlyProduct.id,
//             });
//             const freePlanId = prices.data[0].id

//             // create customer
//             const stripeCustomer = await stripe.customers.create({
//                 name: user.firstName + ' ' + user.lastName,
//                 email: user.email,
//             });

//             // create subscription for customer
//             const subscription = await stripe.subscriptions.create({
//                 customer: stripeCustomer.id,
//                 items: [
//                     {
//                         price: freePlanId,
//                     },
//                 ],
//             });

//             const sub = await stripe.subscriptions.retrieve(subscription.id);
//             const product = await stripe.products.retrieve(sub.plan.product);
//             // console.log(product)
//             // const credits = Number(product.metadata.credits);

//             user.plan.plan = freePlan._id;
//             user.plan.stripeCustomerId = stripeCustomer.id;
//             user.plan.credits = credits;
//             user.plan.isOnFreePlan = true;
//             user.plan.planUpdatedDate = new Date();
//             user.plan.freeCreditsGivenDate = new Date()
//             user.plan.planName = plan;
//             user.plan.packagePeriod = packagePeriod;
//             user.plan.startDate = localStartDate;
//             user.plan.endDate = localEndDate;

//             await user.save();
//             // Create a Sale
//             await Sale.create({ planName: plan, interval: freePlan.interval });
//             console.log("User data", user)
//             const admin = await User.findOne({ role: "admin" });

//             if (admin) {
//                 console.log(admin.email, `${firstName} ${lastName}`, email, location?.country || '', plan)
//                 newUserRegistrationInfoEmail(admin.email, `${firstName} ${lastName}`, email, location?.country || '', plan);
//             }
//             res.status(201).json({
//                 success: true,
//                 result: {},
//                 message: `Customer Created and Email sent to ${email} Please Verify Your Email Address.`
//             });
//         } else {
//             throw new Error('Invalid user data');
//         }
//     } catch (error) {
//         next(error);
//     }
// };

const createCustomer = async (req, res, next) => {
    const { firstName, lastName, email, role = "customer", customerRef, location, phone, plan, packagePeriod, startDate, endDate } = req.body;

    try {
        const userExists = await User.findOne({ email });

        if (userExists) {
            res.status(400);
            throw new Error('User already exists');
        }

        const startDateObj = startDate ? new Date(startDate) : new Date();
        const endDateObj = endDate ? new Date(endDate) : new Date();
        const localStartDate = startDateObj.toLocaleDateString("en-CA");
        const localEndDate = endDateObj.toLocaleDateString("en-CA");

        let expiredAt;

        // Calculate expiredAt based on packagePeriod
        if (packagePeriod === 'Month') {
            expiredAt = new Date().setMonth(new Date().getMonth() + 1); // 1 month later
        } else if (packagePeriod === 'Year') {
            expiredAt = new Date().setFullYear(new Date().getFullYear() + 1); // 1 year later
        } else if (packagePeriod === 'Custom Date' && endDateObj) {
            expiredAt = endDateObj.getTime();
        } else {
            expiredAt = new Date().getTime();
        }

        const user = await User.create({
            firstName,
            lastName,
            email,
            role,
            status: false, // Customer needs to verify email
            customerRef,
            location,
            phone,
            planName: plan,
            packagePeriod: packagePeriod,
            startDate: localStartDate,
            endDate: localEndDate,
            expiredAt: expiredAt,
            isEmailVerified: false, // Email verification will be done manually
            registredWith: "direct",
        });

        // Create Team
        let team;
        team = await Team.create({
            accounts: [user._id],
            creator: user._id,
        });

        // Create default view (tabs and table columns) for the customer
        const data = defaultView;
        const newView = await View.create({
            owner: team._id,
            name: data.name,
            template: data.template,
            defaults: data.default,
        });

        // Create column data for this new view
        const newColumns = await Column.create({
            view: newView._id,
            columns: data.columns,
        });

        // Add the new column data to the view
        newView.columns = newColumns._id;
        await newView.save();

        // Create default Folder
        const folder = new Folder({ name: "My First Folder", owner: team._id, default: true, leads: [], color: "#323A46", selected: true });
        await folder.save();

        await SequenceInfo.create({ owner: user._id });

        // We have to put this user on free plan in stripe
        const products = await stripe.products.list({
            limit: 100
        });

        const freePlanProducts = products.data.filter(p => p.name === process.env.FREE_PLAN_NAME);
        const selectedPlanProducts = products.data.filter(p => p.name === plan);

        const yearlyCredits = parseInt(selectedPlanProducts[0]?.metadata.credits, 10) || 0;
        const monthlyCredits = parseInt(selectedPlanProducts[1]?.metadata.credits, 10) || 0;

        let credits = 0;
        if (packagePeriod === "Month") {
            credits = monthlyCredits;
        } else if (packagePeriod === "Year") {
            credits = yearlyCredits;
        } else if (packagePeriod === "Custom Date") {
            credits = monthlyCredits;
        }

        let freePlanMonthlyProduct;
        for (const product of freePlanProducts) {
            const prices = await stripe.prices.list({ product: product.id });
            const monthlyPrice = prices.data.find(price => price.recurring && price.recurring.interval === 'month');
            if (monthlyPrice) {
                freePlanMonthlyProduct = product;
            }
        }

        const freePlan = await Plan.findOne({ name: plan, interval: "month" });
        const prices = await stripe.prices.list({
            product: freePlanMonthlyProduct.id,
        });
        const freePlanId = prices.data[0].id;

        // Create customer in Stripe
        const stripeCustomer = await stripe.customers.create({
            name: user.firstName + ' ' + user.lastName,
            email: user.email,
        });

        // Create subscription for customer
        const subscription = await stripe.subscriptions.create({
            customer: stripeCustomer.id,
            items: [
                {
                    price: freePlanId,
                },
            ],
        });

        // Generate JWT token for email verification
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

        // Create a token for email verification
        const emailVerificationToken = await Token.create({
            user: user._id,
            token: token
        });

        // Send email verification link
        const url = `${process.env.APP_BASE_URL}/users/${user._id}/verification/${emailVerificationToken.token}`;
        signUpEmailVerification(user.email, `${firstName} ${lastName}`, url);

        // Send email to admin about new user registration
        const admin = await User.findOne({ role: "admin" });
        newUserRegistrationInfoEmail(admin.email, `${firstName} ${lastName}`, email, location?.country || '', process.env.FREE_PLAN_NAME);

        res.status(201).json({
            success: true,
            result: {},
            message: `An Email sent to ${email} Please Verify Your Email Address.`
        });

        // Save user plan details
        user.plan.plan = freePlan._id;
        user.plan.stripeCustomerId = stripeCustomer.id;
        user.plan.credits = credits;
        user.plan.isOnFreePlan = true;
        user.plan.planUpdatedDate = new Date();
        user.plan.freeCreditsGivenDate = new Date();
        user.plan.planName = plan;
        user.plan.packagePeriod = packagePeriod;
        user.plan.startDate = localStartDate;
        user.plan.endDate = localEndDate;

        await user.save();

        // Create a Sale record
        await Sale.create({ planName: plan, interval: freePlan.interval });

        console.log("User data", user);
    } catch (error) {
        next(error);
    }
};



export {
    signIn,
    signUp,
    verifyEmail,
    loginWithGoogle,
    loginWithLinkedin,
    signOut,
    getLoggedInUser,
    acceptTermsAndConditions,
    completeTour,
    completeAppTour,
    updateCustomer,
    updateUserEmail,
    updateUserPassword,
    resetAccount,
    deleteUserAccount,
    getCustomers,
    changeCustomerSMTPSettings,
    deleteUserAccountWithoutPAssword,
    forgotPassword,
    resetPassword,
    deleteCustomers,
    updateCustomerByAdmin,
    inviteCustomerToApp,
    createCustomer,
}

