import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';

const dirName = path.resolve()

const sendEmailTemplate = async (email, subject, text, html, fromType) => {
    try {
        // Create a transporter object using the default SMTP transport
        let transporter = nodemailer.createTransport({
            host: "smtp.gmail.com", // e.g., smtp.gmail.com for Gmail
            port: 465,
            secure: true, // true for 465, false for other ports
            auth: {
                user: fromType === "noReply" ? process.env.JARVIS_NO_REPLY_EMAIL : process.env.JARVIS_SUPPORT_EMAIL,
                pass: fromType === "noReply" ? process.env.JARIVIS_NO_REPLY_PASSWORD : process.env.JARVIS_SUPPORT_PASSWORD,
            },
        });

        // Send email with defined transport object
        await transporter.sendMail({
            from: fromType === "noReply" ? process.env.JARVIS_NO_REPLY_EMAIL : process.env.JARVIS_SUPPORT_EMAIL,
            to: email, // list of receivers
            subject: subject, // Subject line
            text: text, // plain text body
            html: html
        });

        console.log("Email sent successfully");
    } catch (error) {
        console.error("Error sending email:", error);
    }
};


// Helper function to load and process a template
const loadTemplate = (templateName, replacements) => {
    const templatePath = path.join(dirName, '/data/emailTemplates', templateName);
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');

    // Replace placeholders with dynamic content
    for (const key in replacements) {
        const placeholder = `{{${key}}}`;
        htmlContent = htmlContent.replace(new RegExp(placeholder, 'g'), replacements[key]);
    }

    return htmlContent;
};

// email verification
export const signUpEmailVerification = (recipient, name, verificationLink) => {
    const htmlContent = loadTemplate('signupVerificationEmail.html', { name, verificationLink, });
    sendEmailTemplate(recipient, 'Verify Your Email Address', '', htmlContent, 'noReply')
};

//  forgot password
export const forgotPasswordEmail = (recipient, name, passwordChangeLink) => {
    const htmlContent = loadTemplate('forgotPassword.html', { name, passwordChangeLink });
    sendEmailTemplate(recipient, 'Forgot Password', '', htmlContent, 'noReply')
};

// cancel subscription
export const cancleSubscriptionEmail = (recipient, name) => {
    const htmlContent = loadTemplate('cancelSubscriptionMail.html', { name });
    sendEmailTemplate(recipient, 'Subscription Canceled', '', htmlContent, 'support')
};

// free credits used
export const freeCreditsUsedEmail = (recipient, name, freePlanCredits) => {
    const planUpgradeLink = `${process.env.APP_BASE_URL}/see-plan`;
    const helpSupportLink = `${process.env.MARKETING_SITE_BASE_URL}/help-center`;
    const htmlContent = loadTemplate('freeCreditsUsedMail.html', { name, freePlanCredits, planUpgradeLink, helpSupportLink });
    sendEmailTemplate(recipient, 'Your FREE Credits Have Been Fully Used', '', htmlContent, 'support')
};

// new user registration info
export const newUserRegistrationInfoEmail = (recipient, name, email, country, plan) => {
    const htmlContent = loadTemplate('newRegistrationUserInfo.html', { name, email, country, plan });
    sendEmailTemplate(recipient, 'New Registration User Info', '', htmlContent, 'noReply')
};

// email after verification of user email
export const afterVerificationEmail = (recipient, name, freePlanCredits) => {
    const planUpgradeLink = `${process.env.APP_BASE_URL}/see-plan`;
    const helpSupportLink = `${process.env.MARKETING_SITE_BASE_URL}/help-center`;
    const htmlContent = loadTemplate('welcomeOnboardAfterVerificationMail.html', { name, freePlanCredits, planUpgradeLink, helpSupportLink });
    sendEmailTemplate(recipient, 'Welcome Onboard', '', htmlContent, 'noReply')
};

// plan upgrade
export const planUpgradedEmail = (recipient, name) => {
    const htmlContent = loadTemplate('planUpgradeEmail.html', { name });
    sendEmailTemplate(recipient, 'Plan Upgrade Confirmation', '', htmlContent, 'support')
};

// user leads exported
export const leadsExportedEmail = (recipient, name, exportDownloadLink) => {
    const htmlContent = loadTemplate('exportingData.html', { name, exportDownloadLink });
    sendEmailTemplate(recipient, 'Contact Export Request', '', htmlContent, 'noReply')
};

// user leads exported
export const paymentFailedEmail = (recipient, name, cardNumber) => {
    const paymentMethodUpdateLink = `${process.env.APP_BASE_URL}/subscription?paymentMethod=true`;
    const helpSupportLink = `${process.env.MARKETING_SITE_BASE_URL}/help-center`;
    const htmlContent = loadTemplate('paymentFailed.html', { name, cardNumber, helpSupportLink, paymentMethodUpdateLink });
    sendEmailTemplate(recipient, 'Unable To Process Payment', '', htmlContent, 'support')
};

// user leads exported
export const paymentMethodUpdateEmail = (recipient, name, cardNumber, daysOverDue) => {
    const paymentMethodUpdateLink = `${process.env.APP_BASE_URL}/subscription?paymentMethod=true`;
    const helpSupportLink = `${process.env.MARKETING_SITE_BASE_URL}/help-center`;
    const htmlContent = loadTemplate('paymentDetailsUpdates.html', { name, cardNumber, helpSupportLink, paymentMethodUpdateLink, daysOverDue });
    sendEmailTemplate(recipient, 'Update your payment details', '', htmlContent, 'support')
};

// user leads exported
export const teamInviteEmail = (recipient, inviterName, name, invitationLink) => {
    const articleLink = `${process.env.MARKETING_SITE_BASE_URL}/help-center`;
    const htmlContent = loadTemplate('teamInvite.html', { name, inviterName, articleLink, invitationLink });
    sendEmailTemplate(recipient, 'Team Invited You', '', htmlContent, 'noReply')
};

// user leads exported
export const subscriptionConformation = (recipient, name) => {
    const invoicesSectionLink = `${process.env.APP_BASE_URL}/subscription?invoices=true`;
    const articleLink = `${process.env.MARKETING_SITE_BASE_URL}/help-center`;
    const htmlContent = loadTemplate('subscriptionConfirmation.html', { name, articleLink, invoicesSectionLink });
    sendEmailTemplate(recipient, 'Your new Jarvis Reach subscription is ready!', '', htmlContent, 'support')
};

// invite a customer to app
export const inviteCustomerToJarvis = (recipient, name, password, createdDate) => {
    const helpSupportLink = `${process.env.MARKETING_SITE_BASE_URL}/help-center`;
    const htmlContent = loadTemplate('invitiationToCustomer.html', { name, helpSupportLink, password, email: recipient, createdDate });
    sendEmailTemplate(recipient, 'Invitation To Join', '', htmlContent, 'support')
};

// new user registration info
export const importsCompletedEmail = (recipient, completionTime, leadsAdded, leadsFailed, failedLeadsList, firstFifty) => {
    const htmlContent = loadTemplate('importsCompletedEmail.html', { completionTime, leadsAdded, leadsFailed, failedLeadsList, firstFifty });
    sendEmailTemplate(recipient, 'Imports Completed', '', htmlContent, 'noReply')
};
