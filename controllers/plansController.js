import Stripe from "stripe";
import Plan from "../models/plans/planModel.js";
import User from "../models/userModel.js";
import { cancleSubscriptionEmail } from "../services/sendHtmlTemplates.js";
import CustomError from "../utils/CustomError.js";
import Folder from "../models/folderModel.js";
import SequenceTemplate from "../models/leadManager/sequenceTemplateModel.js";
import LeadStatus from "../models/leadManager/leadStatusModel.js";
import Sale from "../models/plans/salesModel.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


// create a simple package in our database

const createPackage = async (req, res, next) => {
	let { name, status } = req.body;
	if (!name || !status) {
		return res.status(400).json({ success: false, message: 'Name and status are required' });
	}
	try {
		if (name[0] !== name[0].toUpperCase()) {
			// make the ist letter capital
			name = name.charAt(0).toUpperCase() + name.slice(1);
		}
		// const freePlan = await Plan.findOne({ name: process.env.FREE_PLAN_NAME });
		const alreadyPlan = await Plan.find({ name, isDeleted: { $ne: true } });

		if (alreadyPlan.length >= 2) {
			// a plan name can only be same twice for yearly and monthly
			throw new Error("Plan already exists");
		}

		// we will create 2 packages one monthly and one yearly

		const newPackages = await Promise.all(["month", "year"].map(async (interval) => {
			const newPackage = await Plan.create({
				name,
				status,
				interval,
				isDeleted: false,
			});
			return newPackage;
		}))

		return res.status(200).json({ status: true, result: newPackages });

	} catch (error) {
		next(error);
	}
}

// create a plan (product and price) in stripe

const createPlan = async (req, res, next) => {
	const { period, name, price, currency, credits, description, marketingFeatures, status } = req.body;
	try {
		if (!["Active", "Deactive"].includes(status)) {
			throw new Error('Status should be either Active or Deactive.');
		}
		if (!Array.isArray(marketingFeatures)) {
			throw new Error('Input must be an array.');
		}
		if (marketingFeatures.length > 15) {
			throw new Error('Maximum number of allowed features is 15.');
		}
		marketingFeatures.map((feature, index) => {

			if (typeof feature !== 'object' || !feature.name || feature.name.trim() === '') {
				throw new Error(`Any feature can not be empty`);
			}
		});
		if (name === process.env.FREE_PLAN_NAME && price && Number(price) > 0) {
			throw new Error("Free plan cannot have a price more then zero.");
		}
		if (!period) {
			throw new Error('Interval is required')
		}

		// if the plan already exists (in stripe) then we have to update it
		const alreadyPlan = await Plan.findOne({ name, interval: period, isDeleted: { $ne: true } });

		if (alreadyPlan && alreadyPlan.stripeProductId && alreadyPlan.stripePriceId) {
			const product = await stripe.products.update(alreadyPlan.stripeProductId, {
				name: name,
				description: description,
				marketing_features: marketingFeatures,
				metadata: {
					credits: credits
				}
			});
			await Plan.findOneAndUpdate({ name, interval: period, isDeleted: { $ne: true } },
				{
					status,
					credits,
				});
			return res.status(200).json({ success: true, result: product, message: "Product updated successfully." });
		}
		else {
			// Create the product in Stripe
			const product = await stripe.products.create({
				name: name,
				description: description,
				marketing_features: marketingFeatures,
				metadata: {
					credits: credits
				}
			});

			// Create the price for the product
			const stripePrice = await stripe.prices.create({
				unit_amount: price * 100, // Stripe expects the amount in cents
				currency: currency,
				recurring: {
					interval: period,
					// interval_count: internalCount
				},
				product: product.id,
			});
			await Plan.findOneAndUpdate({ name, interval: period, isDeleted: { $ne: true } },
				{
					stripePriceId: stripePrice.id,
					stripeProductId: product.id,
					status,
					credits,
					price: stripePrice.unit_amount / 100
				});
			return res.status(200).json({ success: true, result: product });
		}
	} catch (error) {
		next(error);
	}
};

// get all packages from database with pagination

const getAllPackages = async (req, res, next) => {
	const { page = 1, limit = 10 } = req.query;

	try {
		const offset = (Number(page) - 1) * limit;

		// Aggregation to group by "name" and get one occurrence of each
		const packages = await Plan.find({ isDeleted: { $ne: true }, interval: "year" });

		// now i want to get the document that is not selected to get its status 
		const packagesWithOtherDoc = await Promise.all(packages.map(async (p) => {
			const otherDoc = await Plan.findOne({ name: p.name, isDeleted: { $ne: true }, interval: { $ne: p.interval } })

			return {
				otherPackage: {
					status: otherDoc?.status,
					interval: otherDoc?.interval
				},
				...p.toObject(),
			}

		}))

		const totalRecord = (await Plan.countDocuments({ isDeleted: { $ne: true } })) / 2;

		res.status(200).json({ success: true, result: packagesWithOtherDoc, totalRecord, currentPage: Number(page), limit: Number(limit) });
	} catch (error) {
		next(error);
	}
};

// get all packages from database with pagination

const getAllPackagesDetails = async (req, res, next) => {

	const { page = 1, limit = 10 } = req.query;
	const { search } = req.query;

	try {
		const query = {};
		if (search) {
			query.name = { $regex: search, $options: 'i' };
		}
		query.isDeleted = { $ne: true };
		// we have to filter those plans for those the stripe data (product) is created
		query.stripeProductId = { $exists: true };
		query.stripePriceId = { $exists: true };

		const offset = (Number(page) - 1) * limit;

		const packages = await Plan.find(query).select("-sales")
			.skip(offset)
			.limit(Number(limit))
			.exec();

		const totalRecord = await Plan.countDocuments(query);

		const packagesWithFeatures = await Promise.all(packages.map(async p => {
			if (!p.stripeProductId) {
				return p
			}
			const product = await stripe.products.retrieve(p.stripeProductId);
			const price = await stripe.prices.retrieve(p.stripePriceId);
			return {
				...p.toObject(),
				features: product.marketing_features,
				currency: price.currency
			};
		}))

		res.status(200).json({ success: true, result: packagesWithFeatures, totalRecord, currentPage: Number(page), limit: Number(limit) });
	} catch (error) {
		next(error);
	}
};


// get all plans from stripe

const getPlans = async (req, res, next) => {
	const user = req.user;
	const { duration } = req.query;
	try {
		if (!duration === "month" || !duration === "year") {
			throw new CustomError(`Invalid duration. Please use either "month" or "year"`, 400);
		}
		const plans = await Plan.find({
			$and: [
				{ status: "Active" },
				{ stripeProductId: { $exists: true } },
				{ stripePriceId: { $exists: true } },
				{
					// we want those plans those are not deleted but we want that deleted plan in case of if the current loggedin user is subscribed on that deleted
					// one plan
					$or: [
						{ isDeleted: { $ne: true } },
						{ _id: req.user?.plan?.plan }
					]
				}
			]
		});

		const plansPromises = plans.map(async plan => {
			// Fetch all products
			const product = await stripe.products.retrieve(plan.stripeProductId);
			const productPrice = await stripe.prices.retrieve(plan.stripePriceId);

			if (user.role === 'admin') {
				return {
					...plan.toObject(),
					product: product,
					price: productPrice,
				}
			} else {
				return {
					...plan.toObject(),
					product: product,
					price: productPrice,
					current: user.plan?.plan?.toString() === plan._id.toString(),
				}
			}
		})
		const productsWithPrices = await Promise.all(plansPromises);
		let filtred = productsWithPrices.filter(product => product.price.recurring.interval === duration);
		// if the duration is yearly then we have to sent the price / 100
		if (duration === "month") {
			filtred = filtred.map(product => ({
				...product,
				price: {
					...product.price,
					unit_amount: product.price.unit_amount / 100,
				} // 1200 is for 12 months
			}));
		}

		const getThisPlanMonthlyPrice = (product) => {
			const filtredProduct = productsWithPrices.filter(p => p.name === product.name && p.interval === "month")[0];
			const price = filtredProduct?.price?.unit_amount;
			let correctedPrice = null;

			if (price) {
				correctedPrice = filtredProduct?.price?.unit_amount / 100
			}
			return correctedPrice;
		}

		// if the duration is yearly then we have to sent the price / 1200 (to show the permonth in that yearly plan) 
		if (duration === "year") {
			filtred = filtred.map(product => ({
				...product,
				price: {
					...product.price,
					unit_amount: Math.round(product.price.unit_amount / 1200).toFixed(0),
				}, // 1200 is for 12 months
				monthlyPlanPrice: getThisPlanMonthlyPrice(product)
			}));
		}
		res.status(200).json({ success: true, result: filtred });
	} catch (error) {
		next(error);
	}
};


const getMarketingPlans = async (req, res, next) => {
	const { duration } = req.query;
	try {
		if (!duration === "month" || !duration === "year") {
			throw new Error(`Invalid duration. Please use either "month" or "year"`);
		}
		// Only fetch necessary fields with lean
		const plans = await Plan.find({
			$and: [
				{ status: "Active" },
				{ stripeProductId: { $exists: true } },
				{ stripePriceId: { $exists: true } },
				{ isDeleted: { $ne: true } },
			]
		}).lean();

		// Retrieve all Stripe products and prices in parallel
		const productIds = plans.map(plan => plan.stripeProductId);
		const priceIds = plans.map(plan => plan.stripePriceId);

		// Batch retrieve products and prices (Consider caching these results)
		const productsPromise = Promise.all(productIds.map(id => stripe.products.retrieve(id)));
		const pricesPromise = Promise.all(priceIds.map(id => stripe.prices.retrieve(id)));

		const [products, prices] = await Promise.all([productsPromise, pricesPromise]);

		const productsWithPrices = plans.map((plan, index) => ({
			...plan,
			product: products[index],
			price: prices[index],
		}));


		let filtred = productsWithPrices.filter(product => product.price.recurring.interval === duration)
		// if the duration is yearly then we have to sent the price / 100
		if (duration === "month") {
			filtred = filtred.map(product => ({
				...product,
				price: {
					...product.price,
					unit_amount: Math.round(product.price.unit_amount / 100).toFixed(0),
				} // 1200 is for 12 months
			}));
		}

		const getThisPlanMonthlyPrice = (product) => {
			const filtredProduct = productsWithPrices.filter(p => p.name === product.name && p.interval === "month")[0];
			const price = filtredProduct?.price?.unit_amount;
			let correctedPrice = null;

			if (price) {
				correctedPrice = filtredProduct?.price?.unit_amount / 100
			}
			return correctedPrice;
		}

		// if the duration is yearly then we have to sent the price / 1200 (to show the permonth in that yearly plan) 
		if (duration === "year") {
			filtred = filtred.map(product => ({
				...product,
				price: {
					...product.price,
					unit_amount: Math.round(product.price.unit_amount / 1200).toFixed(0),
				}, // 1200 is for 12 months
				monthlyPlanPrice: getThisPlanMonthlyPrice(product)
			}));
		}
		res.status(200).json({ success: true, result: filtred });
	} catch (error) {
		next(error);
	}
};


const checkout = async (req, res, next) => {
	const { planId } = req.query;

	try {
		if (!planId) {
			throw new Error(`Plan Id not specified`);
		}
		const plan = await Plan.findById(planId);

		if (!plan) {
			throw new Error(`Plan with the provided id "${planId}" not found`);
		}
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: [
				{
					price: plan.stripePriceId, // the ID of the price created in the Stripe Dashboard
					quantity: 1,
				},
			],
			mode: 'subscription',
			success_url: `${process.env.APP_BASE_URL}`,
			cancel_url: `${process.env.APP_BASE_URL}/see-plan`,
			metadata: {
				userId: req.user._id.toString(),
				planId: planId,
			},
		});
		res.status(400).json({ status: true, result: { url: session.url } });
	} catch (error) {
		next(error)
	}
};

const customerBillingPortal = async (req, res, next) => {
	const user = req.user
	try {
		if (!user) {
			throw new Error('User not found');
		}
		const session = await stripe.billingPortal.sessions.create({
			customer: user.plan.stripeCustomerId,
			return_url: `${process.env.APP_BASE_URL}`,
		});
		res.status(200).json({ status: true, result: { url: session.url } });
	} catch (error) {
		next(error)
	}
}

const customerNewPaymentMethod = async (req, res, next) => {
	const user = req.user;
	const customerId = user.plan.stripeCustomerId;
	const { paymentMethodId, billingAddress } = req.body;
	try {
		if (!paymentMethodId) {
			throw new Error('Payment method ID is required');
		}
		if (!billingAddress) {
			throw new Error('Billing address is required');
		}
		// Attach the payment method to the customer
		const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
			customer: customerId,
		});

		const updatedUser = await User.findByIdAndUpdate(user._id, { 'plan.billingAddress': billingAddress }, { new: true })

		// Update the customer's default payment method
		const customer = await stripe.customers.update(customerId, {
			invoice_settings: {
				default_payment_method: paymentMethodId,
			},
			address: {
				line1: updatedUser.plan.billingAddress?.address,
				city: updatedUser.plan.billingAddress?.city,
				postal_code: updatedUser.plan.billingAddress?.postalCode,
				state: updatedUser.plan.billingAddress?.state,
				country: updatedUser.plan.billingAddress?.country,
			},
		});
		res.status(200).json({ success: true, result: paymentMethod });
	} catch (error) {
		next(error);
	}
}

// delete customer payment method

const detachCustomerPaymentMethod = async (req, res, next) => {
    const { paymentMethodId } = req.body;
    try {
        if (!paymentMethodId) {
            throw new CustomError('Payment method ID is required',400);
        }

        // Detach the payment method from the customer
        await stripe.paymentMethods.detach(paymentMethodId);

        res.status(200).json({ success: true, message: 'Payment method deleted successfully' });
    } catch (error) {
        next(error);
    }
}	

const upgradePlan = async (req, res, next) => {
	const user = req.user;
	const { priceId } = req.body;

	try {
		if (!priceId) {
			throw new Error('Price ID is required');
		}

		// Retrieve the user's current subscription
		const userSub = await stripe.subscriptions.list({ customer: user.plan.stripeCustomerId });
		const subscription = userSub.data[0];

		if (!subscription) {
			throw new Error('No active subscription found for the user');
		}

		// Get the current item's price and currency
		const currentItem = subscription.items.data[0];
		const currentPriceId = currentItem.price.id;
		const currentCurrency = currentItem.price.currency;

		// Retrieve the new price details
		const newPrice = await stripe.prices.retrieve(priceId);
		const newCurrency = newPrice.currency;

		if (currentCurrency === newCurrency) {

			// Update the subscription if the currency is the same
			const updatedSubscription = await stripe.subscriptions.update(subscription.id, {

				items: [{
					id: currentItem.id,
					price: priceId,
				}],
				proration_behavior: 'create_prorations', // Handle proration if needed
			});

			// Poll the database until the user data is updated by the  stripe webhook
			const maxRetries = 10; // Maximum retries to wait for webhook processing
			const delay = 3000; // Delay between each poll, e.g., 3 seconds

			let retries = 0;
			let userDataUpdated = false;

			while (retries < maxRetries && !userDataUpdated) {
				// Fetch the latest user data from the database
				const userData = await User.findById(user._id).lean();

				// Check if the user data has the updated subscription information
				if (user.plan.planName !== userData.plan.planName) {
					userDataUpdated = true;
					break;
				}

				// Wait before polling again
				await new Promise((resolve) => setTimeout(resolve, delay));
				retries++;
			}

			return res.status(200).json({ status: true, result: updatedSubscription });
		}

		// Currency change requires canceling the old subscription and creating a new one
		// Remove or void any open discounts, invoice items, invoices, or quotes in the previous currency
		// (This is handled automatically by Stripe, but you may need to handle it in your logic if needed)

		// Cancel the old subscription immediately
		await stripe.subscriptions.cancel(subscription.id);

		// Create a new subscription with the new price and currency
		const newSubscription = await stripe.subscriptions.create({
			customer: user.plan.stripeCustomerId,
			items: [{
				price: priceId,
			}],
			proration_behavior: 'create_prorations', // Handle proration if needed
			// billing_cycle_anchor: subscription.current_period_end,
			proration_behavior: 'none',
		});

		const updatedSubscription = await stripe.subscriptions.update(newSubscription.id, {
			metadata: { updated: 'true' }  // Updating metadata to trigger the event
		});

		res.status(200).json({ status: true, result: updatedSubscription });
	} catch (error) {
		next(error);
	}
};

const cancleSubscription = async (req, res, next) => {
	const userId = req.user._id;
	try {
		// Retrieve user details
		const user = await User.findById(userId);

		// Retrieve the current subscription
		const customerSubscription = await stripe.subscriptions.list({ customer: user.plan.stripeCustomerId });
		const subscription = customerSubscription.data[0];
		const currentItemId = subscription.items.data[0].id;



		const freePlan = await Plan.findOne({ name: process.env.FREE_PLAN_NAME, interval: "month" })

		const freeProduct = await stripe.products.retrieve(freePlan.stripeProductId);
		// filter the free plan
		const productPrice = await stripe.prices.list({ product: freeProduct.id })

		// Update the subscription to the free plan
		await stripe.subscriptions.update(customerSubscription.data[0].id, {
			items: [{
				id: currentItemId, // Update the first item
				price: productPrice.data[0].id, // Replace with your free plan price ID
			}],
			// proration_behavior: 'create_prorations', // Handle proration if needed
		});

		const newCredits = Number(freeProduct.metadata.credits);

		// // Update user record
		user.plan.credits = newCredits;
		user.plan.creditsUsed = 0;
		user.plan.isUnsubscribed = true;
		user.plan.isOnFreePlan = true;
		user.plan.planUpdatedDate = new Date();
		await user.save();

		await Sale.create({ planName: freePlan.name, interval: freePlan.interval });

		// Poll the database until the user data is updated by the  stripe webhook
		const maxRetries = 10; // Maximum retries to wait for webhook processing
		const delay = 3000; // Delay between each poll, e.g., 3 seconds
		let retries = 0;
		let userDataUpdated = false;
		while (retries < maxRetries && !userDataUpdated) {
			// Fetch the latest user data from the database
			const userData = await User.findById(req.user._id).lean();
			// Check if the user data has the updated subscription information
			if (req.user.plan.planName !== userData.plan.planName) {
				userDataUpdated = true;
				break;
			}
			// Wait before polling again
			await new Promise((resolve) => setTimeout(resolve, delay));
			retries++;
		}

		// notify user
		cancleSubscriptionEmail(user.email, `${user.firstName} ${user.lastName}`)
		res.status(200).json({ success: true, productPrice, message: 'Subscription canceled successfully' });
	} catch (error) {
		next(error);
	}
}

const getCustomerPaymentMethods = async (req, res, next) => {
	const user = req.user;
	try {
		console.log(user.plan)
		const customer = await stripe.customers.retrieve(user.plan.stripeCustomerId)
		const paymentMethods = await stripe.customers.listPaymentMethods(
			user.plan.stripeCustomerId,
		);
		// we have to point out the default method
		const modifiedMethods = {
			...paymentMethods,
			data: paymentMethods.data.map(paymentMethod => {
				return {
					...paymentMethod,
                    isDefault: paymentMethod.id === customer.invoice_settings.default_payment_method,
				}
			})
		}
		res.status(200).json({ status: true, result: modifiedMethods , });
	} catch (error) {
		next(error);
	}
}

const getCustomerSubscriptionDetails = async (req, res, next) => {
	const user = req.user;
	const customerId = user.plan?.stripeCustomerId;
	try {
		if (!customerId) {
			throw new Error('Customer stripe ID is required');
		}
		// Retrieve all subscriptions for the customer
		const subscriptions = await stripe.subscriptions.list({
			customer: customerId,
			status: 'all', // Can use 'active' if you only want active subscriptions
		});

		if (subscriptions.data.length === 0) {
			return { message: 'No subscriptions found for this customer.' };
		}

		// Get the first subscription (assuming the customer only has one subscription)
		const subscription = subscriptions.data[0];

		// Retrieve the plan details
		const plan = subscription.items.data[0].price;

		// Retrieve product details
		const product = await stripe.products.retrieve(plan.product);

		// Convert timestamp to a readable date
		const startDate = new Date(subscription.current_period_start * 1000).getTime();
		const renewalDate = new Date(subscription.current_period_end * 1000).getTime();
		const credits = user.plan.credits;
		const creditsUsed = user.plan.creditsUsed;

		res.status(200).json({
			//plan: product.name,
			plan: user.plan.planName,
			subscriptionStatus: subscription.status,
			startDate,
			renewalDate,
			credits,
			creditsUsed
		});
	} catch (error) {
		next(error)
	}
}

const getCustomerInvoices = async (req, res, next) => {
	const user = req.user;
	try {
		// Retrieve all invoices for the customer
		const invoices = await stripe.invoices.list({
			customer: user.plan.stripeCustomerId,
			limit: 10
		});

		// Fetch product details for each invoice item
		const data = await Promise.all(invoices.data.map(async (invoice) => {
			// Map invoice details
			const planNames = (await Promise.all(invoice.lines.data.map(async (lineItem) => {
				// Retrieve the product details
				const price = await stripe.prices.retrieve(lineItem.price.id);
				const product = await stripe.products.retrieve(price.product);
				return product.name
			})))
			const invoiceData = {
				id: invoice.id,
				amountDue: invoice.amount_due,
				//date: new Date(invoice.created * 1000).getTime(),
				date: user.expiredAt,
				view: invoice.hosted_invoice_url,
				//plan: planNames[planNames.length - 1]
				plan: user.plan.planName,
			};

			return invoiceData;
		}));

		res.status(200).json({ status: true, result: data });
	} catch (error) {
		next(error);
	}
};


const updateCustomerBillingAddress = async (req, res, next) => {
	const user = req.user;
	const customerId = user.plan.stripeCustomerId;
	const { billingAddress } = req.body;
	try {
		if (!customerId) {
			throw new Error('Customer stripe ID is required');
		}
		const updatedUser = await User.findByIdAndUpdate(user._id, { 'plan.billingAddress': billingAddress }, { new: true })
		await stripe.customers.update(customerId, {
			address: {
				line1: updatedUser.plan.billingAddress?.address,
				city: updatedUser.plan.billingAddress?.city,
				postal_code: updatedUser.plan.billingAddress?.postalCode,
				state: updatedUser.plan.billingAddress?.state,
				country: updatedUser.plan.billingAddress?.country,
			},
		});
		res.status(200).json({ status: true, result: updatedUser });
	} catch (error) {
		next(error);
	}
}

// delete a plan from

const deletePlan = async (req, res, next) => {

	const planId = req.params.id;

	try {
		const plan = await Plan.findById(planId);
		if (!plan) {
			throw new Error(`Plan with id ${planId} not found.`);
		}
		// delete (archive) both the yearly and monthly plan
		const plans = await Plan.find({ name: plan.name });

		await Promise.all(plans.map(async plan => {
			plan.isDeleted = true;
			await plan.save();
		}))

		// if (plan.stripeProductId) {
		// 	// we can delete the product or prices in stripe instead we can archive the product (deactivate it)
		// 	await stripe.products.update(
		// 		plan.stripeProductId,
		// 		{ active: false }, // set the product to inactive
		// 	);
		// }

		res.status(200).json({ status: true, message: 'Plan deleted successfully.' });
	} catch (error) {
		next(error);
	}
};

// update plan in stripe and the pachkage
const updatePlan = async (req, res, next) => {
	const planId = req.params.id;
	const { name, status } = req.body;
	try {
		if (name === process.env.FREE_PLAN_NAME) {
			throw new Error(`Cannot user name "${process.env.FREE_PLAN_NAME}".`);
		}
		const planName = (await Plan.findById(planId)).name;

		const plansToUpdate = await Plan.find({ name: planName, isDeleted: { $ne: true } });

		await Promise.all(plansToUpdate.map(async (plan) => {
			if (plan.name === process.env.FREE_PLAN_NAME) {
				throw new Error(`Cannot update plan "${process.env.FREE_PLAN_NAME}".`);
			}
			plan.name = name;
			plan.status = status;
			await plan.save();
			if (plan.stripeProductId) {
				// we can delete the product or prices in stripe instead we can archive the product (deactivate it)
				await stripe.products.update(
					plan.stripeProductId,
					{
						name: name
					}
				);
			}
		}))

		res.status(200).json({ status: true, message: 'Plan Updated successfully.' });
	} catch (error) {
		next(error);
	}
};


const getUserFeaturesInfo = async (req, res, next) => {
	const owner = req.user._id;
	const teamId = req.team._id;
	const planId = req.params.id;
	try {
		//
		const [userFolders, userSequences, templateWithMaxFollowups, activeLeadStatuses] = await Promise.all([
			await Folder.countDocuments({ owner: teamId }),
			await SequenceTemplate.countDocuments({ owner, enabled: true }),
			await SequenceTemplate.countDocuments({ owner, $expr: { $gte: [{ $size: "$followUps" }, 5] } }),
			await LeadStatus.countDocuments({ owner, status: "Active" }),
		])
		res.status(200).json({
			success: true,
			result: {
				userFolders,
				userSequences,
				templateWithMaxFollowups,
				userStatuses: activeLeadStatuses
			}
		})
	} catch (error) {
		next(error);
	}
}

export {
	createPlan,
	checkout,
	getPlans,
	getMarketingPlans,
	createPackage,
	getAllPackages,
	customerBillingPortal,
	upgradePlan,
	customerNewPaymentMethod,
	getCustomerPaymentMethods,
	getCustomerSubscriptionDetails,
	getCustomerInvoices,
	updateCustomerBillingAddress,
	deletePlan,
	updatePlan,
	cancleSubscription,
	getAllPackagesDetails,
	getUserFeaturesInfo,
	detachCustomerPaymentMethod
}