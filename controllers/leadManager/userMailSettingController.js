import UserMailSetting from "../../models/leadManager/userMailSetting.js";
import CustomError from "../../utils/CustomError.js";

// Get mail settings for a user
const getUserMailSettings = async (req, res, next) => {
    const userId = req.user._id;
    try {
        const settings = await UserMailSetting.findOne({ owner: userId });

        if (settings) {
            res.status(200).json(settings);
        } else {
            throw new CustomError("Settings not found", 404)
        }
    } catch (error) {
        next(error);
    }
}

// Create or update mail settings for a user
const createUserMailSetting = async (req, res, next) => {
    const { protocol, host, port, smtpUsername, smtpPassword, fromMail, fromName, status } = req.body;
    const owner = req.user._id;
    try {
        if (!protocol && !host && !port && !smtpUsername && !smtpPassword && !fromMail && !fromName && !status) {

        } else if (!protocol || !host || !port || !smtpUsername || !smtpPassword || !fromMail || !fromName || !status) {
            throw new Error("All fields are required")
        }
        if (!owner) throw new Error("User Not Found")
        // Check if the user already has mail settings

        // check user plan
        if (!req.user.plan.planFeatures.customSMTPEnabled) {
            throw new CustomError(`Custom SMTP settings are not allowed in ${req.user.plan.planName} plan`, 403);
        }

        let settings = await UserMailSetting.findOne({ owner });

        if (settings) {
            // Update existing settings
            settings.protocol = protocol;
            settings.host = host;
            settings.port = port;
            settings.smtpUsername = smtpUsername;
            settings.smtpPassword = smtpPassword;
            settings.fromMail = fromMail;
            settings.fromName = fromName;
            settings.status = status;

            await settings.save();
            res.status(200).json(settings);
        } else {
            // Create new settings
            settings = new UserMailSetting({
                owner,
                protocol,
                host,
                port,
                smtpUsername,
                smtpPassword,
                fromMail,
                fromName,
                status,
            });

            await settings.save();
            res.status(201).json(settings);
        }
    } catch (error) {
        next(error);
    }
};

// Delete mail settings for a user
const deleteUserMailSetting = async (req, res, next) => {
    const owner = req.user._id;

    try {
        const settings = await UserMailSetting.findOneAndDelete({ owner });

        if (settings) {
            res.status(200).json({ message: 'Settings deleted successfully' });
        } else {
            throw new Error("Settings not found")
        }
    } catch (error) {
        next(error);
    }
};

export {
    getUserMailSettings,
    createUserMailSetting,
    deleteUserMailSetting
}
