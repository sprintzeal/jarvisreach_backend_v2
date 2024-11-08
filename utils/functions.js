import dns from "dns"
import GibberishDetective from "gibberish-detective";
import net from "net";
import nodemailer from "nodemailer";
import { validateEmail } from "../services/emailValidation.js";
import EmailValidator from "email-deep-validator";
import { verifyEmail } from "@devmehq/email-validator-js";
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
    console.log(email)
    try {

        // return { success: true, step: 6, reason: "Email Sent Successfully" }

        // Step 1: Syntax Check
        // Purpose: Validate the email address structure.
        // How: Use regex to match the general pattern of an email address.
        const emailSyntaxRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        const isValidSyntax = emailSyntaxRegex.test(email.toLowerCase());
        if (!isValidSyntax) {
            return { success: false, step: 1, reason: "Invalid Email Syntax" }
        }

        // // Step 2: Gibberish Check
        // // Purpose: Detect non-existent or fake email addresses.
        // const gibberish = GibberishDetective({ useCache: false });
        // const detectGibberish = gibberish.detect('test@gmail.com')
        // if (detectGibberish) {
        //     return { success: false, step: 2, reason: "Gibberish Email Address" }
        // }

        // Step 3: Domain Existence Check
        // This step involves checking if the domain of the email address exists by looking up its DNS records.
        const domain = email.split('@')[1];
        const isDomainExists = await new Promise((resolve, reject) => {
            dns.resolveMx(domain, (err, addresses) => {
                if (err || addresses.length === 0) {
                    resolve(false); // Domain does not exist or no MX records
                } else {
                    resolve(true); // Domain exists and has MX records
                }
            });
        });
        if (!isDomainExists) {
            return { success: false, step: 3, reason: "Domain Does Not Exist" }
        }

        // Step 4: MX Record Check
        // This step is about checking if the domain has valid MX records, which are used to route emails.

        const validatedMRecord = await new Promise((resolve, reject) => {
            dns.resolveMx(domain, (err, addresses) => {
                if (err || addresses.length === 0) {
                    resolve(false); // No MX record found
                } else {
                    resolve(true); // MX record found
                }
            });
        });
        if (!validatedMRecord) {
            return { success: false, step: 4, reason: "Invalid MX Record" }
        }

        // Step 5: Catch-All Domain Check
        // This step checks whether a domain is a "catch-all" domain, meaning it accepts any email, even if the specific address does not exist.
        // const testEmail = `nonexistent@${domain}`;
        // const smtpServer = await new Promise((resolve, reject) => {
        //     dns.resolveMx(domain, (err, addresses) => {
        //         if (err) {
        //             reject(err);
        //         } else {
        //             // Sort by priority (lower preference value has higher priority)
        //             addresses.sort((a, b) => a.priority - b.priority);
        //             resolve(addresses[0].exchange);
        //         }
        //     });
        // });

        // const isCatchAll = await new Promise((resolve, reject) => {
        //     const client = net.createConnection(25, smtpServer);
        //     let stage = 0;

        //     const timeout = setTimeout(() => {
        //         client.destroy();
        //         reject(new Error('SMTP connection timeout'));
        //     }, 10000); // 10 seconds timeout

        //     client.on('data', (data) => {
        //         const response = data.toString();

        //         if (stage === 0 && response.startsWith('220')) {
        //             client.write(`HELO hi\r\n`);
        //             stage++;
        //         } else if (stage === 1 && response.startsWith('250')) {
        //             client.write(`MAIL FROM: <no-reply@${domain}>\r\n`);
        //             stage++;
        //         } else if (stage === 2 && response.startsWith('250')) {
        //             client.write(`RCPT TO: <${testEmail}>\r\n`);
        //             stage++;
        //         } else if (stage === 3) {
        //             clearTimeout(timeout);
        //             if (response.startsWith('250')) {
        //                 resolve(true); // Catch-all domain
        //             } else {
        //                 resolve(false); // Not a catch-all domain
        //             }
        //             client.end();
        //         }
        //     });

        //     client.on('error', (err) => {
        //         clearTimeout(timeout);
        //         reject(err);
        //     });

        //     client.on('end', () => {
        //         clearTimeout(timeout);
        //     });
        // });
        // if (!isCatchAll) {
        //     return { step: 5, reason: "Not Catch-All Domain" }
        // }


        // // Step 6: SMTP Authentication
        // // Purpose: Validate the email by attempting to connect.
        // const emailExists = await validateEmail(email);

        // if (!emailExists.validators.smtp.valid) {
        //     return { success: false, step: 6, reason: "Email Not Found" }
        // }

        // if (emailExists.validators.smtp.valid) {
        //     return { success: true, step: 6, reason: "Email Found" }
        // }




        // Step 6: SMTP Authentication (lib 2)
        // Purpose: Validate the email by attempting to connect.

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
        "(lastname).(firstname)"
    ];

    const generatedEmails = patterns.map(pattern => {
        const emailPattern = pattern
            .replace("(firstname)", firstName.toLowerCase())
            .replace("(lastname)", lastName.toLowerCase())
            .replace("(f)", firstInitial)
            .replace("(l)", lastInitial);

        return `${emailPattern}@${domain}`;
    });

    // now verify the emails and once an email is verified we will stop and return it
    let finalizedEmail = null;

    for (const email of generatedEmails) {
        const verified = await sixStepsEmailVerification(email);
        if (verified.success && finalizedEmail === null) {
            finalizedEmail = email;
            break;
        }
    }
    if (finalizedEmail) {
        return {
            success: true,
            email: {
                email: finalizedEmail,
                validationStatus: 1,
                valid: true,
                type: "Work"
            }
        }
    } else {
        return {
            success: false,
        }
    }
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
    if(resarry.length === 1) {
        allNames = resarry
    } 
    else {
        allNames = resarry.map((val, index) => val.split(`${index + 1}. `)[1]);
    }
    companyNames = allNames;
    console.log(allNames)
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
