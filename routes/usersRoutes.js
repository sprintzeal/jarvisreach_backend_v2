import express from "express"
import {
    acceptTermsAndConditions,
    changeCustomerSMTPSettings,
    completeAppTour,
    completeTour,
    createCustomer,
    deleteCustomers,
    deleteUserAccount,
    deleteUserAccountWithoutPAssword,
    forgotPassword,
    getCustomers,
    getLoggedInUser,
    inviteCustomerToApp,
    loginWithGoogle,
    loginWithLinkedin,
    resetAccount,
    resetPassword,
    signIn,
    signOut,
    signUp,
    updateCustomer,
    updateCustomerByAdmin,
    updateUserEmail,
    updateUserPassword,
    verifyEmail
} from "../controllers/userController.js"
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router()

//authentication
router.post('/signup', signUp);
router.post('/signin', signIn);
router.post('/login-with-google', loginWithGoogle);
router.post('/login-with-linkedin', loginWithLinkedin);
router.get('/signout', signOut);
// email verificatioln
router.get('/:id/verify/:token', verifyEmail);
// forgot password routes
router.post('/sendEmail/forgotPassword', forgotPassword);
router.post('/resetPassword', resetPassword);

router.get('/userData', protect, getLoggedInUser);

router.get('/customers', getCustomers);

// create customer
router.post('/customers',protect, createCustomer);

// update user profile
router.put('/customers/update', protect, updateCustomer);

//update user email
router.put('/customers/update-email', protect, updateUserEmail);

//delete account
router.delete('/customers', protect, deleteUserAccount);

//delete account
router.delete('/customers/delete/:id', deleteUserAccountWithoutPAssword);

//delete customers
router.delete('/customers/delete/', deleteCustomers);

//reset account
router.put('/customers/reset-account', protect, resetAccount);

//reset user password
router.put('/customers/reset-password', protect, updateUserPassword);

// accept terms new user
router.put('/customers/acceptTerms', protect, acceptTermsAndConditions);

// user tour completion
router.put('/customers/completeTour', protect, completeTour);

// user App tour completion
router.put('/customers/completeAppTour', protect, completeAppTour);

// enable or disable the user mail settings
router.put('/customers/changeSMTP', protect, changeCustomerSMTPSettings);

// admin change the customer settings 
router.put('/customers/update/:id', protect, updateCustomerByAdmin);

// admin change the customer settings 
router.post('/customers/invite/:id', protect, inviteCustomerToApp);


export default router;

