import EmailValidator from "email-deep-validator";
import { promptChatgpt } from "../services/openAI.js";
export function generateEmailsFromPattrens(patterns, personName) {

    const firstName = personName.split(" ")[0]?.toLowerCase() || "";
    const lastName = personName.split(" ")[1]?.toLowerCase() || "";
    return patterns.map(({ pattern, percentage }) => {
        const email = pattern
            .replace(/first_initial/, firstName?.charAt(0))
            .replace(/last_initial/, lastName?.charAt(0))
            .replace(/first/, firstName)
            .replace(/last/, lastName)
            .replace("'.'", ".")
            .replace(/\s+/g, '');
        return { email: sanitizeEmail(email), percentage };
    });
}


function sanitizeEmail(email) {
    // Define a regex pattern for allowed characters
    const allowedCharacters = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    // Remove unwanted characters
    email = email
        .replace(/"/g, "")          // Remove double quotes
        .replace(/'/g, "")          // Remove single quotes
        .replace(/\\/g, "")         // Remove backslashes
        .replace(/\//g, "")         // Remove slashes
        .replace(/:/g, "")          // Remove colons
        .replace(/;/g, "")          // Remove semicolons
        .replace(/&/g, "")          // Remove ampersands
        .replace(/(^,)|(,$)/g, "")  // Remove leading and trailing commas
        .replace(/,,+/g, ",")       // Replace multiple commas with a single comma
        .replace(/[^a-zA-Z0-9._@-]/g, ""); // Remove any remaining invalid characters

    // Check if the email matches the allowed pattern
    if (!allowedCharacters.test(email)) {
        throw new Error("Invalid email address format.");
    }

    // Separate local part and domain part
    const [localPart, domainPart] = email.split('@');

    // Check if the email has a domain part
    if (!domainPart) {
        throw new Error("Invalid email address format.");
    }

    // Remove special characters from the local part and domain part
    const sanitizedLocalPart = localPart.replace(/[^a-zA-Z0-9._-]/g, '');
    const sanitizedDomainPart = domainPart.replace(/[^a-zA-Z0-9.-]/g, '');

    // Combine the sanitized local part and domain part
    const sanitizedEmail = `${sanitizedLocalPart}@${sanitizedDomainPart}`;

    return sanitizedEmail;
}

export const sixStepsEmailVerification = async (email) => {

    try {

        const emailValidator = new EmailValidator();
        const { wellFormed, validDomain, validMailbox } = await emailValidator.verify(email);

        if (!validMailbox) {
            return { success: false, step: 6, reason: "Email Not Found" }
        }

        if (validMailbox) {
            return { success: true, step: 6, reason: "Email Found" }
        }

        // Step 6: SMTP Authentication (lib3)
        // Purpose: Validate the email by attempting to connect.

        // const { validSmtp } = await verifyEmail({ emailAddress: email, verifyMx: true, verifySmtp: true, timeout: 3000 });

        // if (!validSmtp) {
        //     return { success: false, step: 6, reason: "Email Not Found" }
        // }
        // if (validSmtp) {
        //     return { success: true, step: 6, reason: "Email Found" }
        // }


        // step 6 Combine 3 libs
        // const { validSmtp } = await verifyEmail({ emailAddress: email, verifyMx: true, verifySmtp: true, timeout: 3000 });

        // if (!emailExists.validators.smtp.valid && !validMailbox && !validSmtp) {
        //     return { success: false, step: 6, reason: "Email Not Found" }
        // }
        // if (emailExists.validators.smtp.valid || validMailbox || validSmtp) {
        //     return { success: true, step: 6, reason: "Email Found" }
        // }

    } catch (error) {
        throw new Error(error);
    }
}

export async function generateEmailFromSequenceAndVerify(personName, domain) {
    const firstName = personName.split(" ")[0]?.toLowerCase();
    const lastName = personName.split(" ")[1]?.toLowerCase();

    const firstInitial = firstName.charAt(0).toLowerCase();
    const lastInitial = lastName.charAt(0).toLowerCase();

    const patterns = [
        "(firstname).(lastname)",
        "(f).(lastname)",
        "(firstname)(lastname)",
        "(f)(lastname)",
        "(firstname)",
        "(lastname)",
        "(firstname)_(lastname)",
        "(lastname)(f)",
        "(lastname).(firstname)",
        "(lastname)_(firstname)",
        "(f)_(lastname)",
        "(lastname)(firstname)",
        "(f).(l)",
        "(firstname).(l)",
        "(l)(firstname)"
    ];

    const generatedEmails = patterns.map(pattern =>
        pattern
            .replace("(firstname)", firstName)
            .replace("(lastname)", lastName)
            .replace("(f)", firstInitial)
            .replace("(l)", lastInitial) + `@${domain}`
    );

    // Batch size for parallel execution
    const batchSize = 5;

    // Helper function to verify emails in a batch
    async function verifyBatch(emails) {
        const verificationResults = await Promise.all(
            emails.map(email => sixStepsEmailVerification(email))
        );
        // Find the first successful verification in the batch
        for (let i = 0; i < verificationResults.length; i++) {
            if (verificationResults[i].success) {
                return emails[i]; // Return the verified email
            }
        }
        return null;
    }

    // Process emails in batches
    for (let i = 0; i < generatedEmails.length; i += batchSize) {
        const batch = generatedEmails.slice(i, i + batchSize);
        const verifiedEmail = await verifyBatch(batch);
        if (verifiedEmail) {
            return {
                success: true,
                email: {
                    email: verifiedEmail,
                    validationStatus: 1,
                    valid: true,
                    type: "Work"
                }
            };
        }
    }

    // If no email is verified
    return { success: false };
}




/**
* Calculates the number of days between two ISO 8601 date strings.
* @param {string} startDateStr - The start date in ISO 8601 format.
* @param {string} endDateStr - The end date in ISO 8601 format.
* @returns {number} - The number of days between the two dates.
*/
export function calculateDaysBetween(startDateStr, endDateStr) {
    // Parse the date strings into Date objects
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    // Validate that the dates are valid
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error("Invalid date format.");
    }

    // Calculate the difference in milliseconds
    const differenceInMilliseconds = endDate - startDate;

    // Convert milliseconds to days
    const millisecondsInOneDay = 24 * 60 * 60 * 1000; // Number of milliseconds in one day
    const differenceInDays = Math.round(differenceInMilliseconds / millisecondsInOneDay);

    return differenceInDays;
}


/**
 * Extracts the company name from a LinkedIn headline.
 *
 * This function analyzes a given LinkedIn headline string and attempts to extract
 * the company name by using predefined keywords and patterns.
 *
 * @param {string} headline - The LinkedIn headline from which to extract the company name.
 * @returns {string} - The extracted company name, or a message indicating that the company name was not found.
 */
export async function extractCompanyName(leads) {
console.log("using GPT")
    const headLines = [];
    let companyNames = [];

    leads.map(lead => {
        headLines.push(lead.headline);
    });

    const infoPrompt = `Extract company names from these LinkedIn headLines. Return "no" if not found.\n${headLines.map((headline, index) => `${index + 1}. '${headline}'`).join('\n')}`;
    const resp = await promptChatgpt(infoPrompt);

    const resarry = resp.choices[0]?.message?.content?.split("\n");

    if (!resarry) {
        return leads
    }
    let allNames = [];
    if (resarry.length === 1) {
        allNames = resarry
    }
    else {
        allNames = resarry.map((val, index) => val.split(`${index + 1}. `)[1]);
    }
    companyNames = allNames;

    const leadsWithComapnyNames = leads.map((lead, index) => {
        return {
            ...lead,
            companyName: companyNames[index]
        }
    });

    const finalresult = leadsWithComapnyNames.map((lead, index) => {
        const { companyName, ...rest } = lead;

        if (companyName && companyName.toLowerCase() === "no") {
            return rest
        }
        else {
            return { ...rest, companyName }
        }
    })
    return finalresult
}


export function formatLeadData(lead, folderName, leadStatus) {
    const emails = lead.emails || [];
    const phones = lead.phones || [];
    const currentPosition = lead.currentPositions?.[0] || {};
    const pastPosition = lead.pastPositions?.[0] || {};
    const education = lead.educations?.[1] || {};
    const primaryEmail = emails.filter(email => email.type === "Direct").map(email => email.email);
    const workEmails = emails.filter(email => email.type === "Work").map(email => email.email);
    const profileImage = lead.imageUrl;
    const workPhones = phones.filter(phone => phone.type === "Work").map(phone => phone.phone);
    const directPhones = phones.filter(phone => phone.type === "Direct").map(phone => phone.phone);

    return {
        "Profile": lead?.profile?.name,
        "Folder Name": folderName,
        "LinkedIn ID": lead?.linkedInId,
        "Full Name": lead?.name,
        "First Name": lead?.firstName,
        "Last Name": lead?.lastName,
        "About": lead?.about,
        "Country": lead?.location,
        "City": lead?.city,
        "Company": lead?.company?.company,
        "Company Logo Url": lead?.company?.imageSrc,
        "Current Position": currentPosition?.position,
        "Current Position Experience": currentPosition?.duration,
        "Current Company Industry": lead?.company?.company,
        "Past Position": pastPosition?.position,
        "Past Position Experience": pastPosition?.duration,
        "Skills": lead?.skills?.map(skill => skill.headline).join(", "),
        "Education": education?.educationLevel,
        "Profile Image Url": profileImage,
        "Primary Work Email": workEmails.join(", "),
        "Personal Email": primaryEmail.join(", "),
        "Other Email": workEmails.join(", "),
        "Email Status": lead?.emailsStatus,
        "Work Phone": workPhones.join(","),
        "Personal Phone": directPhones.join(","),
        "Other Phone": workPhones.join(","),
        "Template": lead?.template,
        "Assigned Sequence Status": lead?.assignedSequences?.length > 0 ? "Yes" : "No",
        "Update From LinkedIn": new Date(lead?.updatedFromLinkedin).toLocaleDateString(),
        "Created At": new Date(lead?.created_at).toLocaleDateString(),
        "Updated Date": new Date(lead?.updated_at).toLocaleDateString(),
        "Lead Status": leadStatus || "",
        "Profile LinkedIn Url": `https://www.linkedin.com/in/${lead?.linkedInId}`,
        "Company Domain": lead?.company?.companySize,
        "Company Size": lead?.company?.companySize
    };
}


/**
 * Checks if any word from a company name is present in a given string.
 *
 * This function performs a case-insensitive comparison to determine whether
 * any word from the `companyName` is included in the `string`. It splits the
 * `companyName` into individual words and checks if each word appears in the
 * `string`.
 */
export function checkCompanyNameInString(string, companyName) {
    // Convert both strings to lowercase for a case-insensitive comparison
    const lowerStr = string.toLowerCase();
    const words = companyName.toLowerCase().split(' ');

    // Check if any word from companyName is included in str
    for (const word of words) {
        if (lowerStr.includes(word)) {
            return true;
        }
    }

    // Return false if no matching word is found
    return false;
}


export function isValidURL(string) {
    const urlPattern = /^(https?:\/\/)?(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?$/i;
    return urlPattern.test(string);
}
