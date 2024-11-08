
import Stripe from "stripe";
import express from "express";
import User from "../models/userModel.js";
import Plan from "../models/plans/planModel.js";
import { paymentFailedEmail, paymentMethodUpdateEmail, planUpgradedEmail, subscriptionConformation } from "../services/sendHtmlTemplates.js";
import Sale from "../models/plans/salesModel.js";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.route('/').post(express.raw({ type: 'application/json' }), async (request, response) => {

    const sig = request.headers['stripe-signature'];

    let event;
    try {
        event = stripe.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Error message:', err.message);
        return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
        case 'checkout.session.completed':
            const checkoutSessionCompleted = event.data.object;
            let checkoutTotalPrice = 0;
            const checkoutSub = await stripe.subscriptions.retrieve(checkoutSessionCompleted.subscription);

            // Calculate the total price from subscription items
            for (const item of checkoutSub.items.data) {
                // Retrieve the price object from Stripe
                const price = await stripe.prices.retrieve(item.price.id);

                // Calculate the item total price (price * quantity)
                checkoutTotalPrice += price.unit_amount * item.quantity;
            }


            const checkoutProduct = await stripe.products.retrieve(checkoutSub.plan.product);
            const checkoutCredits = Number(checkoutProduct.metadata.credits);

            // update user credits
            const checkoutUser = await User.findById(checkoutSessionCompleted.metadata.userId);
            checkoutUser.plan.stripeCustomerId = checkoutSessionCompleted.customer;
            checkoutUser.plan.credits = checkoutCredits;
            const checkoutPlan = await Plan.findOne({ stripeProductId: checkoutSub.plan.product });
            await Sale.create({ planName: checkoutPlan.name, interval: checkoutPlan.interval });

            break;
        case 'customer.subscription.updated':
            const paymentIntentSucceeded = event.data.object;
            let totalPrice = 0;
            const sub = await stripe.subscriptions.retrieve(paymentIntentSucceeded.id);

            // Calculate the total price from subscription items
            for (const item of sub.items.data) {
                // Retrieve the price object from Stripe
                const price = await stripe.prices.retrieve(item.price.id);

                // Calculate the item total price (price * quantity)
                totalPrice += price.unit_amount * item.quantity;
            }
            const user = await User.findOne({ 'plan.stripeCustomerId': paymentIntentSucceeded.customer });

            if (paymentIntentSucceeded.status === 'incomplete' && user.plan.name !== process.env.FREE_PLAN_NAME) {
                // Plan upgrade failed; do nothing, keep the user on the current plan
                console.log(`Payment failed for plan upgrade, keeping user on current plan: ${user.plan.planName}`);
            } else {
                const product = await stripe.products.retrieve(paymentIntentSucceeded.plan.product);
                const credits = Number(product.metadata.credits);
                const plan = await Plan.findOne({ stripeProductId: paymentIntentSucceeded.plan.product });
                const userPrevPlan = await Plan.findById(user.plan.plan);
                if (plan.name === process.env.FREE_PLAN_NAME) {
                    user.plan.isOnFreePlan = true;
                }
                if (plan.name !== process.env.FREE_PLAN_NAME) {
                    // send plan upgrade email to user
                    user.plan.isOnFreePlan = false;
                    await Sale.create({ planName: plan.name, interval: plan.interval });
                    planUpgradedEmail(user.email, `${user.firstName} ${user.lastName}`)
                }
                if (user.plan.isFromFreePlan && plan.name !== process.env.FREE_PLAN_NAME) {
                    // ist paid subscription of the user

                    // next time we will false it
                    user.plan.isFromFreePlan = false
                    subscriptionConformation(user.email, `${user.firstName} ${user.lastName}`);
                }

                // update the user
                user.plan.credits = credits;
                user.plan.creditsUsed = 0;
                user.plan.planUpdatedDate = new Date();
                user.plan.planName = plan.name;
                user.plan.plan = plan._id;

                // -1 means Unlimited quantity
                // false means feature is not available
                // 0 means feature not available
                // true means feature is available

                if (plan.name === "Free") {
                    user.plan.planFeatures.directAndCompanyPhones = false;
                    user.plan.planFeatures.exportContactsEnabled = false;
                    user.plan.planFeatures.leadManagerAccess = false;
                    user.plan.planFeatures.activeSequencesLimit = 0;
                    user.plan.planFeatures.activeLeadStatusLimit = 0;
                    user.plan.planFeatures.folderCreationLimit = 0;
                    user.plan.planFeatures.realtimeEmailVerify = false;
                    user.plan.planFeatures.customSMTPEnabled = false;
                    user.plan.planFeatures.advancedDataFilter = false;
                    user.plan.planFeatures.appIntegration = false;
                    user.plan.planFeatures.realtimeEmailSendingReport = false;
                    user.plan.planFeatures.activeFollowUpEmails = 0;
                }
                if (plan.name === "Basic") {
                    user.plan.planFeatures.directAndCompanyPhones = true;
                    user.plan.planFeatures.exportContactsEnabled = true;
                    user.plan.planFeatures.leadManagerAccess = true;
                    user.plan.planFeatures.activeSequencesLimit = 5;
                    user.plan.planFeatures.activeLeadStatusLimit = 5;
                    user.plan.planFeatures.folderCreationLimit = 5;
                    user.plan.planFeatures.realtimeEmailVerify = true;
                    user.plan.planFeatures.customSMTPEnabled = true;
                    user.plan.planFeatures.advancedDataFilter = true;
                    user.plan.planFeatures.appIntegration = true;
                    user.plan.planFeatures.realtimeEmailSendingReport = true;
                    user.plan.planFeatures.activeFollowUpEmails = 5;

                } else if (plan.name === "Advance") {
                    user.plan.planFeatures.directAndCompanyPhones = true;
                    user.plan.planFeatures.exportContactsEnabled = true;
                    user.plan.planFeatures.leadManagerAccess = true;
                    user.plan.planFeatures.activeSequencesLimit = -1; // Unlimited
                    user.plan.planFeatures.activeLeadStatusLimit = -1; // Unlimited
                    user.plan.planFeatures.folderCreationLimit = -1; // Unlimited
                    user.plan.planFeatures.realtimeEmailVerify = true;
                    user.plan.planFeatures.customSMTPEnabled = true;
                    user.plan.planFeatures.advancedDataFilter = true;
                    user.plan.planFeatures.appIntegration = true;
                    user.plan.planFeatures.realtimeEmailSendingReport = true;
                    user.plan.planFeatures.activeFollowUpEmails = -1; // Unlimited

                } else if (plan.name === "Enterprise") {
                    user.plan.planFeatures.directAndCompanyPhones = true;
                    user.plan.planFeatures.exportContactsEnabled = true;
                    user.plan.planFeatures.leadManagerAccess = true;
                    user.plan.planFeatures.activeSequencesLimit = -1; // Unlimited
                    user.plan.planFeatures.activeLeadStatusLimit = -1; // Unlimited
                    user.plan.planFeatures.folderCreationLimit = -1; // Unlimited
                    user.plan.planFeatures.realtimeEmailVerify = true;
                    user.plan.planFeatures.customSMTPEnabled = true;
                    user.plan.planFeatures.advancedDataFilter = true;
                    user.plan.planFeatures.appIntegration = true;
                    user.plan.planFeatures.realtimeEmailSendingReport = true;
                    user.plan.planFeatures.activeFollowUpEmails = -1; // Unlimited
                }


                await user.save();
                await plan.save();

                await userPrevPlan.save();
            }


            break;
        case "invoice.payment_failed":
            // Retrieve the customer object
            const paymentFailedData = event.data.object
            const customer = await User.findOne({ 'plan.stripeCustomerId': paymentFailedData.customer })
            // Retrieve the charge object
            const charge = await stripe.charges.retrieve(paymentFailedData.charge);
            const paymentMethodId = charge.payment_method;

            // Retrieve the payment method object
            const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
            const last4 = paymentMethod.card.last4;

            const freePlan = await Plan.findOne({ name: process.env.FREE_PLAN_NAME });

            user.plan.credits = 100;
            user.plan.creditsUsed = 0;
            user.plan.planUpdatedDate = new Date();
            user.plan.planName = freePlan.name;
            user.plan.plan = freePlan._id;

            // We have to shift user to free plan
            customer.plan.planFeatures.directAndCompanyPhones = false;
            customer.plan.planFeatures.exportContactsEnabled = false;
            customer.plan.planFeatures.leadManagerAccess = false;
            customer.plan.planFeatures.activeSequencesLimit = 0;
            customer.plan.planFeatures.activeLeadStatusLimit = 0;
            customer.plan.planFeatures.folderCreationLimit = 0;
            customer.plan.planFeatures.realtimeEmailVerify = false;
            customer.plan.planFeatures.customSMTPEnabled = false;
            customer.plan.planFeatures.advancedDataFilter = false;
            customer.plan.planFeatures.appIntegration = false;
            customer.plan.planFeatures.realtimeEmailSendingReport = false;
            customer.plan.planFeatures.activeFollowUpEmails = 0;

            if (customer) {
                if (paymentFailedData.attempt_count > 1) {
                    paymentMethodUpdateEmail(customer.email, `${customer.firstName} ${customer.lastName}`, last4, paymentFailedData.attempt_count)
                }
                else {
                    // Send the email notification
                    paymentFailedEmail(customer.email, `${customer.firstName} ${customer.lastName}`, last4);
                }
            }
        // Add more event types as needed...
        default:
            // Unexpected event type
            console.log(`Unhandled event type ${event.type}.`);
            // Unexpected event type
            return response.status(400).end();
    }
    // Return a 200 response to acknowledge receipt of the event
    response.send();
});

export default router