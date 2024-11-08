import Stripe from "stripe";
import Plan from "../models/plans/planModel.js";
import User from "../models/userModel.js";
import Sale from "../models/plans/salesModel.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


// Controller to get the total number of users with a free plan subscription
const getTotalFreePlanUsers = async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const fromDate = new Date(from);
    const toDate = new Date(to);
    fromDate.setHours(0, 0, 0, 0); // Start of the day
    toDate.setHours(23, 59, 59, 999); // End of the day

    // const oneDayBeforeFrom = new Date(from)
    // oneDayBeforeFrom.setDate(oneDayBeforeFrom.getDate() - 1);
    // const ondayAfterTo = new Date(to);
    // ondayAfterTo.setDate(ondayAfterTo.getDate() + 1);

    const freeUsers = await User.countDocuments({
      role: "customer",
      email: {
        $ne: "admincustomer@gmail.com"
      },
      'plan.planName': "Free",
      'plan.planUpdatedDate': { $gte: new Date(fromDate), $lte: new Date(toDate) }
    });

    res.status(200).json({
      success: true,
      totalFreePlanUsers: freeUsers,
    });

  } catch (error) {
    next(error);
  }
};

// Controller to get the total number of users with a free plan subscription
const getTotalPaidPlanUsers = async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const fromDate = new Date(from);
    const toDate = new Date(to);
    fromDate.setHours(0, 0, 0, 0); // Start of the day
    toDate.setHours(23, 59, 59, 999); // End of the day

    const totalPaidUsers = await User.countDocuments({
      role: "customer",
      email: {
        $ne: "admincustomer@gmail.com"
      },
      'plan.planName': { $ne: "Free" },
      'plan.planUpdatedDate': { $gte: new Date(fromDate), $lte: new Date(toDate) }
    });

    res.status(200).json({
      success: true,
      totalPaidPlanUsers: totalPaidUsers,
    });

  } catch (error) {
    next(error);
  }
};

// Controller to get total payouts
const getTotalPayouts = async (req, res, next) => {
  const { from, to } = req.query;

  const fromDate = new Date(from);
  const toDate = new Date(to);
  fromDate.setHours(0, 0, 0, 0); // Start of the day
  toDate.setHours(23, 59, 59, 999); // End of the day

  try {
    const plans = await Plan.find({
      stripePriceId: { $ne: null },
      stripeProductId: { $ne: null },
    });

    const plansData = await Promise.all(plans.map(async (plan) => {
      // Count the total number of users currently on the plan

      const query = {
        email: { $ne: "admincustomer@gmail.com" },
        role: "customer",
        'plan.plan': plan._id
      }
      const currentUsersOnPlan = await User.countDocuments(query);

      // Count the number of users on the plan before the "from" date
      const usersBeforeFrom = await User.countDocuments({
        ...query,
        created_at: { $lt: fromDate }
      });

      // Count the number of users created within the "from" and "to" date range
      const usersInDateRange = await User.countDocuments({
        ...query,
        created_at: {
          $gte: fromDate,
          $lte: toDate
        }
      });

      return {
        amount: plan.price * usersInDateRange,
      }
    }));

    const totalPayouts = plansData.reduce((curr, acc) => curr + acc.amount, 0);

    res.status(200).json({
      success: true,
      totalPayouts,
      currency: "USD"
    });
  } catch (error) {
    next(error);
  }
};


const getTotalUnsubscriptions = async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const fromDate = new Date(from);
    const toDate = new Date(to);
    fromDate.setHours(0, 0, 0, 0); // Start of the day
    toDate.setHours(23, 59, 59, 999); // End of the day

    const totalUnsubscriptions = await User.countDocuments({
      role: "customer",
      email: {
        $ne: "admincustomer@gmail.com"
      },
      'plan.isUnsubscribed': true,
      'plan.planUpdatedDate': { $gte: new Date(fromDate), $lte: new Date(toDate) }
    });
    res.status(200).json({
      success: true,
      totalUnsubscriptions,
    });
  } catch (error) {
    next(error);
  }
};

const getTotalSales = async (req, res, next) => {

  const { from, to } = req.query;

  const fromDate = new Date(from);
  const toDate = new Date(to);
  fromDate.setHours(0, 0, 0, 0); // Start of the day
  toDate.setHours(23, 59, 59, 999); // End of the day

  try {
    const planNames = ["Free", "Basic", "Advanced", "Enterprise"];

    const totalSalesInRange = await Sale.find({
      createdAt: { $gte: new Date(fromDate), $lte: new Date(toDate) }
    }).lean();

    let data = [];

    for (let i = 0; fromDate <= toDate; i++) {
      const currentDay = new Date(fromDate); // clone `fromDate`
      fromDate.setDate(fromDate.getDate() + 1); // move `fromDate` to the next day

      let plansDataInDate = {};
      const salesOfToday = totalSalesInRange.filter(s =>
        currentDay.toDateString() === new Date(s.createdAt).toDateString()
      );
      for (let j = 0; j < planNames.length; j++) {
        plansDataInDate[planNames[j]] = salesOfToday.filter(s => s.planName === planNames[j]).length;
      }

      data.push({
        [currentDay.toISOString()]: plansDataInDate
      });
    }

    const totalSales = await Sale.countDocuments({
      createdAt: { $gte: new Date(fromDate), $lte: new Date(toDate) }
    });

    res.status(200).json({
      success: true,
      result: {
        totalSales,
        graphData: data,
      }
    })
  } catch (error) {
    next(error);
  }
};

/**
 * Controller function to get product sales and trends.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const preferredPlans = async (req, res, next) => {
  const { from, to } = req.query;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  fromDate.setHours(0, 0, 0, 0); // Start of the day
  toDate.setHours(23, 59, 59, 999); // End of the day

  const plans = await Plan.find({
    stripePriceId: { $ne: null },
    stripeProductId: { $ne: null },
  });
  try {
    const totalSalesInRange = await Sale.find({
      createdAt: { $gte: new Date(fromDate), $lte: new Date(toDate) }
    }).lean();

    const plansData = plans.map((plan) => {
      const planSalesQuantity = totalSalesInRange.filter(s => s.planName === plan.name && s.interval === plan.interval).length
      return {
        planId: plan._id,
        planName: plan.name,
        isSalesIncreased: planSalesQuantity > 0 ? true : false,
        sales: planSalesQuantity,
        interval: plan.interval,
      }
    })

    res.status(200).json({
      success: true,
      data: plansData
    });
  } catch (error) {
    next(error);
  }
};

const getSubscriptionsContries = async (req, res, next) => {
  try {

    const query = {
      role: "customer",
      email: { $ne: "admincustomer@gmail.com" }
    }
    const usersLocation = await User.find(query).select("location");

    res.status(200).json({
      success: true,
      countries: usersLocation,
    });
  } catch (error) {
    next(error);
  }
};

const testAPi = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, message: 'API test passed' });
  } catch (error) {
    next(error);
  }
}

//controller for to selling plans 

const topSellingPlans = async (req, res, next) => {
  const { from, to } = req.query;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  fromDate.setHours(0, 0, 0, 0); // Start of the day
  toDate.setHours(23, 59, 59, 999); // End of the day

  const plans = await Plan.find({
    stripePriceId: { $ne: null },
    stripeProductId: { $ne: null },
  });

  try {
    const totalSalesInRange = await Sale.find({
      createdAt: { $gte: new Date(fromDate), $lte: new Date(toDate) }
    }).lean();

    const plansData = plans.map((plan) => {
      const planSalesQuantity = totalSalesInRange.filter(s => s.planName === plan.name && s.interval === plan.interval).length
      return {
        name: plan.name,
        isDeleted: plan.isDeleted,
        _id: plan._id,
        price: plan.price,
        quantity: planSalesQuantity,
        amount: plan.price * planSalesQuantity,
        interval: plan.interval,
      }
    })

    res.status(200).json({
      success: true,
      result: plansData
    });
  } catch (error) {
    next(error);
  }
}


export {
  getTotalFreePlanUsers,
  getTotalPaidPlanUsers,
  getTotalPayouts,
  getTotalUnsubscriptions,
  getTotalSales,
  preferredPlans,
  getSubscriptionsContries,
  topSellingPlans,
  testAPi,
}


// old code


// import Stripe from "stripe";
// import Plan from "../models/plans/planModel.js";
// import User from "../models/userModel.js";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


// // Controller to get total payouts
// const getTotalPayouts = async (req, res, next) => {
//   const { from, to } = req.query;
//   const fromDate = new Date(from);
//   const toDate = new Date(to);

//   // to include the data of these from and to also
//   const oneDayBeforeFrom = new Date(from)
//   oneDayBeforeFrom.setDate(oneDayBeforeFrom.getDate() - 1);

//   const ondayAfterTo = new Date(to);
//   ondayAfterTo.setDate(ondayAfterTo.getDate() + 1);

//   try {
//     const plans = await Plan.find({
//       stripePriceId: { $ne: null },
//       stripeProductId: { $ne: null },
//     });

//     const plansData = await Promise.all(plans.map(async (plan) => {
//       // Count the total number of users currently on the plan

//       const query = {
//         email: { $ne: "admincustomer@gmail.com" },
//         role: "customer",
//         'plan.plan': plan._id
//       }
//       const currentUsersOnPlan = await User.countDocuments(query);

//       // Count the number of users on the plan before the "from" date
//       const usersBeforeFrom = await User.countDocuments({
//         ...query,
//         created_at: { $lt: oneDayBeforeFrom }
//       });

//       // Count the number of users created within the "from" and "to" date range
//       const usersInDateRange = await User.countDocuments({
//         ...query,
//         created_at: {
//           $gte: oneDayBeforeFrom,
//           $lte: ondayAfterTo
//         }
//       });

//       // Determine if sales increased or decreased
//       const isSalesIncreased = currentUsersOnPlan > usersBeforeFrom;

//       // return {
//       //   planId: plan._id,
//       //   planName: plan.name,
//       //   isSalesIncreased,
//       //   sales: usersInDateRange,
//       // };
//       return {
//         amount: plan.price * usersInDateRange,
//       }
//     }));

//     const totalPayouts = plansData.reduce((curr, acc) => curr + acc.amount, 0);

//     res.status(200).json({
//       success: true,
//       totalPayouts,
//       currency: "USD"
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// const getTotalUnsubscriptions = async (req, res, next) => {
//   const { from, to } = req.query;

//   // to include the data of these from and to also
//   const oneDayBeforeFrom = new Date(from)
//   oneDayBeforeFrom.setDate(oneDayBeforeFrom.getDate() - 1);

//   const ondayAfterTo = new Date(to);
//   ondayAfterTo.setDate(ondayAfterTo.getDate() + 1);

//   try {
//     const users = await User.find({
//       'plan.isUnsubscribed': true,
//       'plan.planUpdatedDate': {
//         $gte: oneDayBeforeFrom,
//         $lte: ondayAfterTo
//       }
//     });
//     res.status(200).json({
//       success: true,
//       totalUnsubscriptions: users.length
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// // Controller to get the total number of users with a free plan subscription
// const getTotalFreePlanUsers = async (req, res, next) => {
//   try {
//     const { from, to } = req.query;

//     // Convert 'from' and 'to' to Unix timestamps if provided
//     // const createdFilter = {};
//     // // Convert dates to Unix timestamps
//     // if (from) {
//     //   createdFilter.gte = Number(from);
//     // }
//     // if (to) {
//     //   createdFilter.lte = Number(to);
//     // }

//     // let totalFreeSales = []
//     // // get the sales which is of free plan(amount is zero)
//     // const freePlan = await Plan.find()
//     // freePlan.forEach((plan) => {
//     //   if (plan.name === process.env.FREE_PLAN_NAME) {
//     //     plan.sales.forEach((sale) => {
//     //       totalFreeSales.push(sale)
//     //     })
//     //   }
//     // })

//     // Aggregate to join User and Plan collections


//     // to include the data of these from and to also
//     const oneDayBeforeFrom = new Date(from)
//     oneDayBeforeFrom.setDate(oneDayBeforeFrom.getDate() - 1);

//     const ondayAfterTo = new Date(to);
//     ondayAfterTo.setDate(ondayAfterTo.getDate() + 1);

//     const query = {
//       role: "customer",
//       email: {
//           $ne: "admincustomer@gmail.com"
//       },
//       'plan.isOnFreePlan': true,
//       created_at: {
//         $gte: oneDayBeforeFrom,
//         $lte: ondayAfterTo,
//       }
//     }

//     // Aggregate to join User and Plan collections and filter out free plan users
//     const freePlanUsersCount = await User.countDocuments(query)
//     res.status(200).json({
//       success: true,
//       // minus 1 to skip admin
//       totalFreePlanUsers: freePlanUsersCount,
//     });

//   } catch (error) {
//     next(error);
//   }
// };

// // Controller to get the total number of users with a free plan subscription
// const getTotalPaidPlanUsers = async (req, res, next) => {
//   try {
//     const { from, to } = req.query;

//     // Convert 'from' and 'to' to Unix timestamps if provided
//     // const createdFilter = {};
//     // if (from) {
//     //   createdFilter.gte = Number(from);
//     // }
//     // if (to) {
//     //   createdFilter.lte = Number(to);
//     // }

//     // let totalPaidSales = []
//     // // get the sales which is of free plan(amount is zero)
//     // const freePlan = await Plan.find()
//     // freePlan.forEach((plan) => {
//     //   if (plan.name !== process.env.FREE_PLAN_NAME) {
//     //     plan.sales.forEach((sale) => {
//     //       totalPaidSales.push(sale)
//     //     })
//     //   }
//     // })

//     // to include the data of these from and to also
//     const oneDayBeforeFrom = new Date(from)
//     oneDayBeforeFrom.setDate(oneDayBeforeFrom.getDate() - 1);

//     const ondayAfterTo = new Date(to);
//     ondayAfterTo.setDate(ondayAfterTo.getDate() + 1);

//     const query = {
//       role: "customer",
//       email: {
//           $ne: "admincustomer@gmail.com"
//       },
//       'plan.isOnFreePlan': { $ne: true },
//       created_at: {
//         $gte: oneDayBeforeFrom,
//         $lte: ondayAfterTo,
//       }
//     }

//     // Aggregate to join User and Plan collections and filter out free plan users
//     const paidPlanUsersCount = await User.countDocuments(query)

//     res.status(200).json({
//       success: true,
//       totalPaidPlanUsers: paidPlanUsersCount,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// // const preferredPlans = async (req, res, next) => {
// //   const { from, to } = req.query;

// //   try {
// //     // Convert dates to Unix timestamps
// //     const startTimestamp = Math.floor(new Date(from).getTime() / 1000);
// //     const endTimestamp = Math.floor(new Date(to).getTime() / 1000);

// //     // Initialize variables
// //     let salesByProduct = {};
// //     let hasMore = true;
// //     let lastSubscriptionId = undefined;

// //     while (hasMore) {
// //       // Retrieve subscriptions from Stripe
// //       const subscriptions = await stripe.subscriptions.list({
// //         limit: 100,
// //         created: {
// //           gte: startTimestamp,
// //           lte: endTimestamp,
// //         },
// //         starting_after: lastSubscriptionId,
// //       });

// //       // Aggregate sales by product
// //       subscriptions.data.forEach(subscription => {
// //         subscription.items.data.forEach(item => {
// //           const productId = item.price.product;
// //           const amount = item.price.unit_amount;
// //           const date = new Date(subscription.created * 1000).toISOString().split('T')[0]; // Date only

// //           if (!salesByProduct[productId]) {
// //             salesByProduct[productId] = {
// //               totalSales: 0,
// //               dates: {}
// //             };
// //           }

// //           // Accumulate total sales and track daily sales
// //           salesByProduct[productId].totalSales += amount;
// //           if (!salesByProduct[productId].dates[date]) {
// //             salesByProduct[productId].dates[date] = 0;
// //           }
// //           salesByProduct[productId].dates[date] += amount;
// //         });
// //       });

// //       hasMore = subscriptions.has_more;
// //       if (hasMore) {
// //         lastSubscriptionId = subscriptions.data[subscriptions.data.length - 1].id;
// //       }
// //     }

// //     // Analyze sales trends for each product
// //     const results = [];
// //     for (const [productId, salesData] of Object.entries(salesByProduct)) {
// //       const dates = Object.keys(salesData.dates).sort();
// //       const salesByDate = dates.map(date => salesData.dates[date]);

// //       let trend = 'stable';
// //       if (salesByDate.length > 1) {
// //         trend = salesByDate[0] < salesByDate[salesByDate.length - 1] ? 'up' : 'down';
// //       }
// //       const product = await stripe.products.retrieve(productId)
// //       results.push({
// //         name: product.name,
// //         created:product.created,
// //         totalSales: (salesData.totalSales / 100).toFixed(2),
// //         trend
// //       });
// //     }

// //     res.status(200).json(results);
// //   } catch (error) {
// //     next(error);
// //   }
// // };

// /**
//  * Controller function to get product sales and trends.
//  * @param {Object} req - Request object
//  * @param {Object} res - Response object
//  */
// const preferredPlans = async (req, res, next) => {
//   const { from, to } = req.query;
//   const fromDate = new Date(from);
//   const toDate = new Date(to);

//   // to include the data of these from and to also
//   const oneDayBeforeFrom = new Date(from)
//   oneDayBeforeFrom.setDate(oneDayBeforeFrom.getDate() - 1);

//   const ondayAfterTo = new Date(to);
//   ondayAfterTo.setDate(ondayAfterTo.getDate() + 1);

//   try {
//     const plans = await Plan.find({
//       stripePriceId: { $ne: null },
//       stripeProductId: { $ne: null },
//     });

//     const plansData = await Promise.all(plans.map(async (plan) => {
//       // Count the total number of users currently on the plan

//       const query = {
//         email: { $ne: "admincustomer@gmail.com" },
//         role: "customer",
//         'plan.plan': plan._id
//       }
//       const currentUsersOnPlan = await User.countDocuments(query);

//       // Count the number of users on the plan before the "from" date
//       const usersBeforeFrom = await User.countDocuments({
//         ...query,
//         created_at: { $lt: oneDayBeforeFrom }
//       });

//       // Count the number of users created within the "from" and "to" date range
//       const usersInDateRange = await User.countDocuments({
//         ...query,
//         created_at: {
//           $gte: oneDayBeforeFrom,
//           $lte: ondayAfterTo
//         }
//       });

//       // Determine if sales increased or decreased
//       const isSalesIncreased = currentUsersOnPlan > usersBeforeFrom;

//       return {
//         planId: plan._id,
//         planName: plan.name,
//         isSalesIncreased,
//         sales: usersInDateRange,
//       };
//     }));

//     res.status(200).json({
//       success: true,
//       data: plansData
//     });
//   } catch (error) {
//     next(error);
//   }
// };


// const getTotalSales = async (req, res, next) => {

//   const { from, to } = req.query;

//   const fromDate = new Date(from);
//   const toDate = new Date(to);
//   fromDate.setHours(0, 0, 0, 0); // Start of the day
//   toDate.setHours(23, 59, 59, 999); // End of the day

//   try {
//     let data = [];

//     for (let i = 0; fromDate < toDate; i++) {
//       const fromDat = new Date(fromDate).getDate();
//       fromDate.setDate(fromDat + 1)

//       let plansDataInDate = {};

//       // get those plans whose stripe product is created and they are active and not deleted
//       const plans = await Plan.find({ stripePriceId: { $ne: null }, stripeProductId: { $ne: null } });
//       await Promise.all(plans.map(async plan => {
//         const startOfDay = new Date(fromDate);
//         startOfDay.setUTCHours(0, 0, 0, 0);  // Start of the day (00:00:00)
//         const endOfDay = new Date(fromDate);
//         endOfDay.setUTCHours(23, 59, 59, 999);  // End of the day (23:59:59)

//         const query = {
//           email: { $ne: "admincustomer@gmail.com" },
//           role: "customer",
//           'plan.plan': plan._id,
//           'plan.planUpdatedDate': {
//             $gte: startOfDay,
//             $lte: endOfDay
//           }
//         }

//         const filtredSale = await User.countDocuments(query)
//         plansDataInDate = {
//           ...plansDataInDate,
//           [plan.name]: filtredSale
//         }
//       }))
//       data.push({
//         [new Date(fromDate).toISOString()]: plansDataInDate
//       })
//     }

//     const allPlans = await Plan.find();
//     const eachPlanTotalSales = await Promise.all(allPlans.map(async plan => {
//       const query = {
//         email: { $ne: "admincustomer@gmail.com" },
//         role: "customer",
//         'plan.plan': plan._id
//       }
//       const totalSales = await User.countDocuments(query)
//       return totalSales
//     }));

//     const allPlansTotalSales = eachPlanTotalSales.reduce((acc, curr) => acc + curr, 0);
//     res.status(200).json({
//       success: true,
//       result: {
//         totalSales: allPlansTotalSales,
//         graphData: data,
//       }
//     })
//   } catch (error) {
//     next(error);
//   }
// };

// //controller for to selling plans

// const topSellingPlans = async (req, res, next) => {
//   const { from, to } = req.query;
//   const fromDate = new Date(from);
//   const toDate = new Date(to);

//   // to include the data of these from and to also
//   const oneDayBeforeFrom = new Date(from)
//   oneDayBeforeFrom.setDate(oneDayBeforeFrom.getDate() - 1);

//   const ondayAfterTo = new Date(to);
//   ondayAfterTo.setDate(ondayAfterTo.getDate() + 1);

//   try {
//     const plans = await Plan.find({
//       stripePriceId: { $ne: null },
//       stripeProductId: { $ne: null },
//     });

//     const plansData = await Promise.all(plans.map(async (plan) => {
//       // Count the total number of users currently on the plan

//       const query = {
//         email: { $ne: "admincustomer@gmail.com" },
//         role: "customer",
//         'plan.plan': plan._id
//       }
//       const currentUsersOnPlan = await User.countDocuments(query);

//       // Count the number of users on the plan before the "from" date
//       const usersBeforeFrom = await User.countDocuments({
//         ...query,
//         created_at: { $lt: oneDayBeforeFrom }
//       });

//       // Count the number of users created within the "from" and "to" date range
//       const usersInDateRange = await User.countDocuments({
//         ...query,
//         created_at: {
//           $gte: oneDayBeforeFrom,
//           $lte: ondayAfterTo
//         }
//       });

//       // Determine if sales increased or decreased
//       const isSalesIncreased = currentUsersOnPlan > usersBeforeFrom;

//       // return {
//       //   planId: plan._id,
//       //   planName: plan.name,
//       //   isSalesIncreased,
//       //   sales: usersInDateRange,
//       // };
//       return {
//         name: plan.name,
//         isDeleted: plan.isDeleted,
//         _id: plan._id,
//         price: plan.price,
//         quantity: usersInDateRange,
//         amount: plan.price * usersInDateRange,
//       }
//     }));

//     res.status(200).json({
//       success: true,
//       result: plansData
//     });
//   } catch (error) {
//     next(error);
//   }
// }

// const getSubscriptionsContries = async (req, res, next) => {
//   try {

//     const query = {
//       role: "customer",
//       email: { $ne: "admincustomer@gmail.com" }
//     }
//     const usersLocation = await User.find(query).select("location");

//     res.status(200).json({
//       success: true,
//       countries: usersLocation,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// const testAPi = async (req, res, next) => {
//   try {
//     res.status(200).json({ success: true, message: 'API test passed' });
//   } catch (error) {
//     next(error);
//   }
// }

// export {
//   testAPi,
//   getTotalSales,
//   getTotalPayouts,
//   getTotalFreePlanUsers,
//   getTotalPaidPlanUsers,
//   preferredPlans,
//   topSellingPlans,
//   getSubscriptionsContries,
//   getTotalUnsubscriptions
// }













