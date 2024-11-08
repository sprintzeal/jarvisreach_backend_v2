import express from "express";
import { cancleSubscription, checkout, createPackage, createPlan, customerBillingPortal, customerNewPaymentMethod, deletePlan, detachCustomerPaymentMethod, getAllPackages, getAllPackagesDetails, getCustomerInvoices, getCustomerPaymentMethods, getCustomerSubscriptionDetails, getMarketingPlans, getPlans, getUserFeaturesInfo, updateCustomerBillingAddress, updatePlan, upgradePlan } from "../controllers/plansController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post('/createNewPlan', createPlan);
router.get('/getPlans', protect, getPlans);
router.get('/marketing/getPlans', getMarketingPlans);
router.put('/updatePlan/:id', protect, updatePlan);
router.delete('/:id', protect, deletePlan);
router.post('/createPackage', createPackage);
router.get('/getAllPackages', getAllPackages);
router.get('/getAllPackagesDetails', protect, getAllPackagesDetails);
router.get('/checkout', protect, checkout);
router.get('/manage/billing', protect, customerBillingPortal);
router.post('/change/userplan', protect, upgradePlan);
router.post('/change/customer/paymentmethod', protect, customerNewPaymentMethod);
router.delete('/detach/customer/paymentmethod', protect, detachCustomerPaymentMethod);
router.get('/payments/methods', protect, getCustomerPaymentMethods);
router.get('/subscription/info', protect, getCustomerSubscriptionDetails);
router.get('/customer/invoices', protect, getCustomerInvoices);
router.post('/customer/billingaddress', protect, updateCustomerBillingAddress);
router.put('/customer/cancleSubscription', protect, cancleSubscription);
router.get('/featuresUsed/:id', protect, getUserFeaturesInfo);

export default router;