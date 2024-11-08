import nodemailer from 'nodemailer';

/**
 * Sends an email using Nodemailer with the provided SMTP settings.
 *
 * @param {Object} params - The parameters for sending the email.
 * @param {string} params.host - The SMTP server host.
 * @param {number} params.port - The port number used by the SMTP server.
 * @param {string} params.fromMail - The email address that appears in the "From" field.
 * @param {string} params.smtpUsername - The username for authenticating with the SMTP server.
 * @param {string} params.smtpPassword - The password for the SMTP server.
 * @param {string} params.to - The recipient email address or addresses.
 * @param {string} params.subject - The subject line of the email.
 * @param {string} params.body - The plain text body of the email.
 * 
 * @returns {Promise<Object>} A promise that resolves to an object indicating success or failure.
 * @returns {boolean} return.success - Indicates whether the email was sent successfully.
 * @returns {string} [return.message] - A success message if the email was sent successfully.
 * @returns {string} [return.error] - An error message if sending the email failed.
 * 
 * @throws {Error} Throws an error if the email could not be sent.
 */
export const sendMailService = async ({ host, port, fromMail, smtpUsername, smtpPassword, to, subject, body, attachments }) => {
    try {
        // Create a transporter object using the default SMTP transport
        let transporter = nodemailer.createTransport({
            host: host,
            port: port,
            secure: port === 465, // true for 465, false for other ports
            auth: {
                user: smtpUsername,
                pass: smtpPassword,
            },
        });

        // Send email with defined transport object
        await transporter.sendMail({
            from: fromMail, // sender address
            to: to, // list of receivers
            // to: "vaishnavi93d@gmail.com",
            subject: subject, // Subject line
            html: body,
            attachments: attachments ? attachments.map(file => ({
                filename: file.originalname,
                content: file.buffer,
                encoding: 'base64' // Ensure this is 'base64' for binary files
            })) : [], // Optional attachments
        });

        return {
            success: true,
            message: 'Email sent successfully',
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
        };
    }
}
