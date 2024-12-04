import EmailValidator from "email-deep-validator";
import Company from "../models/companyModel.js";
import Lead from "../models/leadModel.js";
import User from "../models/userModel.js";
import { getCompanyInfoService, getEmailsService, getPhoneNumbersService } from "../services/googleSearchService.js";
import CustomError from "../utils/CustomError.js";
import { checkCompanyNameInString, extractCompanyName, generateEmailFromSequenceAndVerify, generateEmailsFromPattrens, sixStepsEmailVerification } from "../utils/functions.js";
import dns from "dns"

const getCompaniesInfo = async (req, res, next) => {

	const { companyName, personName, directEmail, linkedinUserId, companyPage, num = 10, start = 1, } = req.body;
	// remove the last "/"
	const companyLinkedinUrl = companyPage?.replace(/\/$/, '');

	const query = `${companyName} official site OR website OR Facebook OR Twitter OR Instagram OR YouTube`;
	var url = `https://www.googleapis.com/customsearch/v1?q=${query}&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`;

	try {

		if (!companyName || !companyLinkedinUrl || !personName) {
			return res.status(200).json({
				"success": true,
				"result": {
					"emails": [],
					"links": [],
					"linkedinUrl": "",
					"phones": [],
					"location": "",
					"companySize": "",
					"founded": ""
				}
			})
		}

		let existingEmails = [];
		let existingPhones = [];

		if (linkedinUserId) {
			const adminCustomerEmail = process.env.ADMIN_CUSTOMER_ACCOUNT_EMAIL || "admincustomer@gmail.com"
			// we have to check if the admin customer has already this lead and it contain emails
			const adminCustomerData = await User.aggregate([
				{ $match: { email: adminCustomerEmail } },
				{
					$lookup: {
						from: "teams",
						localField: "_id",
						foreignField: "creator",
						as: "adminCustomerTeam",
					},
				},
				{ $unwind: "$adminCustomerTeam" },
				{
					$lookup: {
						from: "leads",
						let: { teamId: "$adminCustomerTeam._id" },
						pipeline: [
							{ $match: { $expr: { $and: [{ $eq: ["$linkedInId", linkedinUserId] }, { $eq: ["$owner", "$$teamId"] }] } } },
						],
						as: "adminCreatedLead",
					},
				},
				{ $unwind: { path: "$adminCreatedLead", preserveNullAndEmptyArrays: true } },
				{
					$project: {
						existingEmails: "$adminCreatedLead.emails",
						existingPhones: "$adminCreatedLead.phones",
					},
				},
			]);

			if (adminCustomerData.length) {
				existingEmails = adminCustomerData[0].existingEmails || [];
				existingPhones = adminCustomerData[0].existingPhones || [];
			}

			// const adminCustomer = await User.findOne({ email: adminCustomerEmail });
			// if (adminCustomer) {
			// 	const adminCustomerTeam = await Team.findOne({ creator: adminCustomer._id });
			// 	if (adminCustomerTeam) {
			// 		const adminCreatedLead = await Lead.findOne({ linkedInId: linkedinUserId, owner: adminCustomerTeam._id });
			// 		if (adminCreatedLead) {
			// 			existingEmails = adminCreatedLead.emails;
			// 			existingPhones = adminCreatedLead.phones;
			// 		}
			// 	}
			// }

			//if not then we have to check if this leads exists anywhere (not the admin customer one )and has emails
			if (existingEmails.length === 0) {
				// we need that lead from our databse where email is more then all other same leads
				const existingLead = (await Lead.aggregate([
					{ $match: { linkedInId: linkedinUserId } }, // Filter by LinkedIn ID
					{
						$addFields: {
							emailCount: { $size: "$emails" } // Calculate the number of emails
						}
					},
					{ $sort: { emailCount: -1 } }, // Sort by the number of emails (descending)
					{ $limit: 1 } // Return the first result
				]))[0];


				if (existingLead && existingLead.emails?.length > 0) {
					existingEmails = existingLead.emails
				}
			}

			//if not then we have to check if this leads exists anywhere (not the admin customer one )and has phones
			if (existingPhones.length === 0) {
				// we need that lead from our databse where phones is more then all other same leads
				const existingLead = (await Lead.aggregate([
					{ $match: { linkedInId: linkedinUserId } }, // Filter by LinkedIn ID
					{
						$addFields: {
							phoneCount: { $size: "$phones" } // Calculate the number of phones
						}
					},
					{ $sort: { phoneCount: -1 } }, // Sort by the number of phones (descending)
					{ $limit: 1 } // Return the first result
				]))[0];


				if (existingLead && existingLead.phones?.length > 0) {
					existingPhones = existingLead.phones
				}
			}

			// ist we have to check this company date in our database 
			// if yes then we will return the data else we will fetch new data from google API and save in database

			// validate and verifiy emails
			const emailValidator = new EmailValidator();
			const validatedExistingEmails = await Promise.all(existingEmails.map(async emailObj => {
				// remove if any spaces in email	
				const email = emailObj.email.replace(/\s/g, '');
				const { wellFormed, validDomain, validMailbox } = await emailValidator.verify(email);
				if (validMailbox) {
					return emailObj
				} else {
					undefined
				}
			}))
			existingEmails = validatedExistingEmails.filter(email => email !== undefined);
		}

		const company = await Company.findOne({ linkedinUrl: companyLinkedinUrl }).lean();

		if (company) {
			let finalizedEmails = []

			if (existingEmails.length > 0) {
				finalizedEmails = existingEmails
			} else {
				const emails = generateEmailsFromPattrens(company.emailPattrens, personName);
				const modifiedEmails = emails.map(e => {
					const percentNumber = parseFloat(e.percentage.split('%')[0]);
					return {
						...e,
						validationStatus: percentNumber > 95 ? 1 : percentNumber > 85 ? 2 : 3,
						valid: percentNumber > 85 ? true : false,
						type: "Work"
					}
				})

				// emails verification of emails generated from pattren 
				const verifiedEmailsFromPattern = await Promise.all(modifiedEmails.map(async emailObj => {
					const verified = await sixStepsEmailVerification(emailObj.email);
					if (verified.success) {
						return {
							...emailObj,
							validationStatus: 1,
							valid: true,
							type: "Work"
						}
					}
				}));

				const filteredVerifiedEmails = verifiedEmailsFromPattern.filter(emailObj => emailObj !== undefined);

				if (filteredVerifiedEmails.length > 0) {
					finalizedEmails = filteredVerifiedEmails;
				} else {

					const companyUrl = company.links.filter(link => link.type === "official")[0]?.link
					if (companyUrl) {
						// here we will generate emails from sequences and verify them
						// get the domain from companyUrl
						const companyTLDArray = new URL(companyUrl).host.split(".")
						const companyDomain = companyTLDArray[companyTLDArray.length - 2] + "." + companyTLDArray[companyTLDArray.length - 1];
						// here we will generate emails from sequences and verify them
						// get the domain from companyUrl

						const generated = await generateEmailFromSequenceAndVerify(personName, companyDomain);
						if (generated.success) {
							finalizedEmails.push(generated.email)
						}
						// is there are no verifiedemails from the generated patterns then we will work on sequences
					}

				}
			}
			// we have to skip the email that is already extracted by the extension
			// 
			finalizedEmails = finalizedEmails.filter(e => e.email !== directEmail)

			if (existingPhones.length === 0) {
				existingPhones = company.phones
			}

			const companyData = {
				emails: finalizedEmails,
				links: company.links,
				linkedinUrl: company.linkedinUrl,
				phones: existingPhones || [],
				location: company.location || "",
				companySize: company.companySize || "",
				founded: company.founded || "",
			}
			return res.status(200).json({ success: true, result: companyData });
		}
		else {
			const response = await fetch(url);
			const data = await response.json();

			if (data.items) {
				const urls = data.items.map(i => i.link);

				// Filter URLs that contain the company's name and common social media domains
				const companyUrls = urls.filter(url => {
					const lowerUrl = url.toLowerCase();
					return lowerUrl.includes(companyName.toLowerCase()) ||
						lowerUrl.includes('facebook.com') ||
						lowerUrl.includes('twitter.com') ||
						lowerUrl.includes('linkedin.com') ||
						lowerUrl.includes('instagram.com') ||
						lowerUrl.includes('youtube.com');
				});

				// we have to catagorize and separate the company links and its social platforms links

				// Function to determine if a URL is a likely main company page
				function isMainCompanyPage(url) {
					const urlObj = new URL(url);
					// Check if the URL is the homepage or has a clean structure
					return (
						urlObj.pathname === '/' && !urlObj.search && url.toLowerCase().includes(companyName.toLowerCase())
					);
				}

				const categories = {
					youtube: /youtube\.com\/channel/,
					facebook: /facebook\.com/,
					twitter: /twitter\.com/,
					instagram: /instagram\.com/,
					// linkedin: /linkedin\.com/
				};

				let catagorizedLinks = [];

				companyUrls.forEach(url => {

					// Determine type based on matching patterns
					let type = 'unknown';
					if (isMainCompanyPage(url)) {
						type = 'official';
					} else if (categories.youtube.test(url)) {
						type = 'youtube';
					} else if (categories.facebook.test(url)) {
						type = 'facebook';
					} else if (categories.twitter.test(url) && url.toLowerCase().includes(companyName.toLowerCase())) {
						type = 'twitter';
					} else if (categories.instagram.test(url)) {
						type = 'instagram';
					}
					// else if (categories.linkedin.test(url)) {
					// 	type = 'linkedin';
					// }

					if (type !== 'unknown') {
						// we only need one instance on the above catagories (official, twitter etc)
						// if there are multiple instances with type "official" we need only the shortest link
						// we have to check if there is already a instance with type "official" if so check if the length of existing instance if greater then replace with current
						const existingLink = catagorizedLinks.filter(link => link.type === type);
						// replace the existing official link with the current one if the current one is shorter then existing
						if (existingLink.length > 0 && existingLink[0].link.length > url.length) {
							existingLink[0].link = url;
						}
						// do nothing if the existing is shorter or equal
						if (existingLink.length > 0 && existingLink[0].link.length <= url.length) {
							existingLink[0].link = existingLink[0].link;
						}
						else {
							catagorizedLinks.push({ link: url, type });
						}
					}

				})

				if (companyLinkedinUrl) {
					catagorizedLinks.push({ link: companyLinkedinUrl, type: "linkedin" });
				}

				///////////--------------------   now we have to find out the work emails --------------------------------////////////////////////

				// we will use google search for email service one if not emails founs then we will use google again and then 
				// we will verify the email in not verified then we will use out sequence of emails pattrens function

				let emails = [];
				let finalizedEmails = []
				if (existingEmails.length > 0) {
					// if this lead is added already
					finalizedEmails = existingEmails
				} else {
					// first we have to generate and verify email from pattrens else we have to search google
					const companyUrl = catagorizedLinks.filter(link => link.type === "official")[0]?.link;
					let emailFromPattren = null;
					if (companyUrl) {
						const companyTLDArray = new URL(companyUrl).host.split(".");
						const companyDomain = companyTLDArray[companyTLDArray.length - 2] + "." + companyTLDArray[companyTLDArray.length - 1];
						// here we will generate emails from sequences and verify them
						// get the domain from companyUrl
						const generated = await generateEmailFromSequenceAndVerify(personName, companyDomain);
						if (generated.success) {
							emailFromPattren = generated.email;	
						}
					}
					if (emailFromPattren) {
						finalizedEmails.push(emailFromPattren)
					} else {
						// now we have to search google for email pattrens
						const queryAttempts = [1, 2, 3, 4]; // List of query numbers to try
						for (const attempt of queryAttempts) {
							emails = await getEmailsService(companyName.toLowerCase(), personName, attempt);
							// check is there is no issue with google search api (credists end or other restriction)
							if (emails.result?.modifiedEmails && emails.result?.modifiedEmails.length > 0) {
								break; // Exit the loop if emails are found
							}
						}

						const modifiedEmails = emails.result?.modifiedEmails || [];

						// emails verification of emails generated from pattren 
						const verifiedEmailsFromPattern = await Promise.all(modifiedEmails.map(async emailObj => {
							const verified = await sixStepsEmailVerification(emailObj.email)
							if (verified.success) {
								return {
									...emailObj,
									validationStatus: 1,
									valid: true,
									type: "Work"
								}
							}
							return undefined;
						}));
						const filteredVerifiedEmails = verifiedEmailsFromPattern.filter(emailObj => emailObj !== undefined);
						finalizedEmails = filteredVerifiedEmails;
					}
				}


				// get the Work phone numbers by using google Search service
				if (existingPhones.length === 0) {
					const phoneNumbers = await getPhoneNumbersService(companyName);
					existingPhones = phoneNumbers.success ? phoneNumbers.result : []
				}


				// get the other details of a linkedin company 
				const companyInfo = await getCompanyInfoService(companyName);

				let companyDetails = {
					location: '',
					companySize: '',
					founded: ''
				};

				if (companyInfo.success) {
					companyDetails = {
						location: companyInfo.result.location,
						companySize: companyInfo.result.companySize,
						founded: companyInfo.result.founded
					}
				}

				const companyData = {
					emails: finalizedEmails || [],
					links: catagorizedLinks,
					linkedinUrl: companyLinkedinUrl,
					phones: existingPhones,
					...companyDetails,
				}

				const emailsPattrens = emails.result?.uniqueResults || [];
				if (emailsPattrens.length > 0) {//store this company info in database so net time for this company we dont run the searches
					await Company.create({
						emailPattrens: emailsPattrens,
						phones: existingPhones,
						links: catagorizedLinks,
						linkedinUrl: companyLinkedinUrl,
						location: companyDetails.location,
						companySize: companyDetails.companySize,
						founded: companyDetails.founded,
					})
				}

				res.status(200).json({ success: true, result: companyData })

			} else {
				res.status(200).json({ success: true, result: data, message: "No items found in the response." })
			}
		}


	} catch (error) {
		next(error);
	}
}

// api for email verifucation
const emailVerification = async (req, res, next) => {
	const email = req.body.email;
	const user = req.user;
	try {
		if (!email) {
			throw new Error("Email is required.")
		}

		// check user plan
		if (!user.plan.planFeatures.realtimeEmailVerify) {
			throw new CustomError(`Real time Email verification is not allowed in ${user.plan.planName} plan`, 403);
		}

		// Step 1: Syntax Check
		// Purpose: Validate the email address structure.
		// How: Use regex to match the general pattern of an email address.
		const emailSyntaxRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
		const isValidSyntax = emailSyntaxRegex.test(email.toLowerCase());
		if (!isValidSyntax) {
			return res.status(200).json({ success: true, result: { step: 1, valid: false, reason: "Invalid Email Syntax" } })
		}

		// // Step 2: Gibberish Check
		// // Purpose: Detect non-existent or fake email addresses.
		// const gibberish = GibberishDetective({ useCache: false });
		// const detectGibberish = gibberish.detect(email)
		// if (detectGibberish) {
		// 	return res.status(200).json({ success: true, result: { step: 2, valid: false, reason: "Gibberish Email Address" } })
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
			return res.status(200).json({ success: true, result: { step: 3, valid: false, reason: "Domain Does Not Exist" } })
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
			return res.status(200).json({ success: true, result: { step: 4, valid: false, reason: "Invalid MX Record" } })
		}

		// Step 6: SMTP Authentication
		// Purpose: Validate the email by attempting to connect.
		const emailValidator = new EmailValidator();
		const { wellFormed, validDomain, validMailbox } = await emailValidator.verify(email);

		if (!validMailbox) {
			return res.status(200).json({ success: true, result: { step: 6, valid: false, reason: "Email Not Found", email, domain, validMailbox } })
		}

		if (validMailbox) {
			return res.status(200).json({ success: true, result: { step: 6, valid: true, reason: "Email Found and is verified.", validMailbox } })
		}

	} catch (error) {
		next(error);
	}
};

const testdata = async (req, res, next) => {
	const { companyName, companyPage, personName, num = 10, start = 1 } = req.body;

	try {
		const verified = await sixStepsEmailVerification(companyName);
		res.status(200).json({ success: true, data: verified });

	} catch (error) {
		next(error);
	}
};

const extractPattrens = async (req, res, next) => {
	const { companyName, personName, num = 10, start = 1, } = req.body;

	try {

		const searchGoogle = async (company, useQueryNumber = 1) => {
			const companyNameEncoded = encodeURIComponent(companyName);
			let searchEmailUrl = null
			if (useQueryNumber === 1) {
				searchEmailUrl = `https://www.googleapis.com/customsearch/v1?q="${companyNameEncoded}"%20company%20@email%20format%20at%20rocketreach&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`;
			}
			if (useQueryNumber === 2) {
				searchEmailUrl = `https://www.googleapis.com/customsearch/v1?q="${companyNameEncoded}"%20company%20@email%20format&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`;
			}
			if (useQueryNumber === 3) {
				searchEmailUrl = `https://www.googleapis.com/customsearch/v1?q="${companyNameEncoded}"%20@email%20pattern%20at%20rocketreach&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`
			}
			if (useQueryNumber === 4) {
				searchEmailUrl = `https://www.googleapis.com/customsearch/v1?q="${companyNameEncoded}"%20@email%20pattern&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`
			}
			const response = await fetch(searchEmailUrl);
			const emailSearchResponse = (await response.json()).items;

			// Recursive function to find the matching string in deep arry/objects. we want to find the string that possibly includes the email format
			const getMatches = (pred) => (obj) =>
				obj == null ?
					[]
					: Array.isArray(obj)
						? obj.flatMap(getMatches(pred))
						: typeof obj == 'object'
							? Object.values(obj).flatMap(getMatches(pred))
							: pred(obj)
								? obj
								: []

			// extract all the strings which includes the word "first"
			const check = val => typeof val == 'string' && val.includes('first')
			const targetStringsForFirst = getMatches(check)(emailSearchResponse)

			// again check all the strings which includes the word "last"
			const check1 = val => typeof val == 'string' && val.includes('last')
			const targetStringsForLast = getMatches(check1)(emailSearchResponse)

			const targetStringsRaw = [...targetStringsForFirst, ...targetStringsForLast];

			// filter the unnecessry strings
			const targetStrings = targetStringsRaw.filter(t => {
				return t.includes('@') && !t.includes("<b>") && checkCompanyNameInString(t, company) && !t.includes("[")
			});

			// now extract the emails pattren from the strings array
			function extractEmailPatterns(emailSearchResponse) {
				const emailPatternRegex = /(\d+(\.\d+)?%) ; ([^;]+)/g;
				const patternPercentageRegex = /(\d+(\.\d+)?%) ; ([^;]+)/;

				const extractedPatterns = [];

				emailSearchResponse.forEach(item => {
					let match;
					while ((match = emailPatternRegex.exec(item)) !== null) {
						const percentage = match[1];
						const pattern = match[3].trim();
						extractedPatterns.push({ pattern, percentage });
					}

					// Check for single pattern case
					const singlePatternMatch = item.match(/1\.\s*([^@]+@[^ ]+)\s*\((\d+(\.\d+)?%)\)/);
					if (singlePatternMatch) {
						const pattern = singlePatternMatch[1].trim();
						const percentage = singlePatternMatch[2];
						extractedPatterns.push({ pattern, percentage });
					}
				});

				return extractedPatterns;
			}

			const emailPattrensWithPercentage = extractEmailPatterns(targetStrings)

			function removeDuplicates(array) {
				const uniquePatterns = new Set();
				return array.filter(item => {
					if (uniquePatterns.has(item.pattern)) {
						return false;
					} else {
						uniquePatterns.add(item.pattern);
						return true;
					}
				});
			}

			const uniqueResults = removeDuplicates(emailPattrensWithPercentage);

			const emails = generateEmailsFromPattrens(uniqueResults, personName);

			const modifiedEmails = emails.map(e => {
				const percentNumber = parseFloat(e.percentage.split('%')[0]);
				return {
					...e,
					validationStatus: percentNumber > 95 ? 1 : percentNumber > 85 ? 2 : 3,
					valid: percentNumber > 75 ? true : false,
					type: "Work"
				}
			})

			return {
				success: true,
				result: { uniqueResults, modifiedEmails, targetStringsRaw, emailSearchResponse },
				message: "Emails extracted successfully."
			}
		}
		let emails = []
		let qa = 0;
		const queryAttempts = [1, 2, 3, 4]; // List of query numbers to try
		for (const attempt of queryAttempts) {
			qa = qa + 1;
			emails = await searchGoogle(companyName.toLowerCase(), attempt);
			if (emails.result?.modifiedEmails && emails.result?.modifiedEmails.length > 0) {
				break; // Exit the loop if emails are found
			}
		}




		const modifiedEmails = emails.result?.modifiedEmails || [];

		// emails verification of emails generated from pattren 
		const verifiedEmailsFromPattern = await Promise.all(modifiedEmails.map(async emailObj => {
			const verified = await sixStepsEmailVerification(emailObj.email)
			if (verified.success) {
				return {
					...emailObj,
					validationStatus: 1,
					valid: true,
					type: "Work"
				}
			}
			return undefined;
		}));
		const filteredVerifiedEmails = verifiedEmailsFromPattern.filter(emailObj => emailObj !== undefined);

		res.status(200).json({ qa, filteredVerifiedEmails, emails, })
	} catch (error) {
		next(error);
	}
};


export {
	getCompaniesInfo,
	emailVerification,
	testdata,
	extractPattrens
}