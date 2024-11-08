import cron from "node-cron"
import User from "../../models/userModel.js";
import Stripe from "stripe";

// this background worker will update the credits of every user who is on free plan every month 
// this worker will be called every day to check that to which users the new credits are to be given



const addFreePlanCredits = async () => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastMonth = new Date(today);
    lastMonth.setMonth(today.getMonth() - 1);

    const query = {
        role: "customer",
        email: {
            $ne: "admincustomer@gmail.com"
        },
        'plan.isOnFreePlan': true,
        'plan.freeCreditsGivenDate': {
            $lte: lastMonth // Ensure it's been over a month
        }
    };

    try {
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
        const freeCredits = freePlanMonthlyProduct.metadata?.credits || 50;

        // Find all users who haven't been given free credits in the last month
        const users = await User.find(query);

        // Give the users the monthly free credits and update their free credits date
        const creditPromises = users.map(async (user) => {
            try {
                user.plan.credits += Number(freeCredits);
                user.plan.freeCreditsGivenDate = today; // Update the date to today
                await user.save();
            } catch (err) {
                console.log(`Failed to update user ${user.id}: ${err.message}`);
            }
        });

        await Promise.all(creditPromises);

        console.log(`${users.length * Number(freeCredits)} credits given to ${users.length} users.`);
    } catch (error) {
        console.log(error.message)
    }
};

// Schedule the job to run every day at midnight
cron.schedule('0 0 * * *', addFreePlanCredits);
