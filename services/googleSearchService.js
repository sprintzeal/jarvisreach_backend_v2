import { countryNames } from '../data/countryNames.js';
import { checkCompanyNameInString, generateEmailsFromPattrens } from '../utils/functions.js';

export async function getCompanySocialLinks(companyName, start = 1, num = 10) {
    let catagorizedLinks = [];

    try {
        // enhance the company name for queries
        const companyNameEncoded = encodeURIComponent(companyName);
        const query = `${companyNameEncoded} official site OR website OR Facebook OR Twitter OR Instagram OR YouTube`;
        const url = `https://www.googleapis.com/customsearch/v1?q=${query}&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`;
        const response = await fetch(url);
        const data = await response.json();
        let urls = [];
        if (data.items) {
            urls = data.items.map(i => i.link)
        }
        const words = companyName.toLowerCase().split(' ');

        const firstLetters = words.map(word => word[0]).join("");

        // Filter URLs that contain the company's name and common social media domains
        const companyUrls = urls.filter(url => {
            const lowerUrl = url.toLowerCase();
            return lowerUrl.includes(companyName.toLowerCase()) || lowerUrl.includes(firstLetters) ||
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
            // get the starting letters of the words of the companyName

            return (
                urlObj.pathname === '/' && !urlObj.search && (url.toLowerCase().includes(companyName.toLowerCase()) || url.toLowerCase().includes(firstLetters))
            );
        }

        const categories = {
            youtube: /youtube\.com\/channel/,
            facebook: /facebook\.com/,
            twitter: /twitter\.com/,
            instagram: /instagram\.com/,
            // linkedin: /linkedin\.com/
        };

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
        return {
            success: true,
            result: catagorizedLinks,
        }
    } catch (error) {
        throw new Error(error.message)
    }
}

export async function getEmailsService(companyName, personName, useQueryNumber = 1, start = 1, num = 10) {

    try {
        // enhance the company name for queries
        const companyNameEncoded = encodeURIComponent(companyName);

        let searchEmailUrl = null
        if (useQueryNumber === 1) {
            // with using  double qoutes the search become very specific
            searchEmailUrl = `https://www.googleapis.com/customsearch/v1?q="${companyNameEncoded}"%20company%20@email%20format%20at%20rocketreach&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`;
        }
        if (useQueryNumber === 2) {
            searchEmailUrl = `https://www.googleapis.com/customsearch/v1?q="${companyNameEncoded}"%20company%20@email%20format&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`;
        }
        if (useQueryNumber === 3) {
            searchEmailUrl = `https://www.googleapis.com/customsearch/v1?q=${companyNameEncoded}%20company%20@email%20format%20at%20rocketreach&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`            
        }
        if (useQueryNumber === 4) {
            searchEmailUrl = `https://www.googleapis.com/customsearch/v1?q=${companyNameEncoded}%20@email%20pattern%20at%20rocketreach&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`
        }
        console.log(searchEmailUrl)
        const response = await fetch(searchEmailUrl);
        const emailSearchResponse = await response.json();
        const emailSearchResponseItems = emailSearchResponse.items;

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
        const targetStringsForFirst = getMatches(check)(emailSearchResponseItems)

        // again check all the strings which includes the word "last"
        const check1 = val => typeof val == 'string' && val.includes('last')
        const targetStringsForLast = getMatches(check1)(emailSearchResponseItems)

        const targetStringsRaw = [...targetStringsForFirst, ...targetStringsForLast];

        // filter the unnecessry strings
        const targetStrings = targetStringsRaw.filter(t => {
            // return t.includes('@') && !t.includes("<b>") && checkCompanyNameInString(t, companyName) && !t.includes("[")
            return t.includes('@') && !t.includes("<b>") && !t.includes("[")
        });

        // now extract the emails pattren from the strings array
        function extractEmailPatterns(emailSearchResponseItems) {
            const emailPatternRegex = /(\d+(\.\d+)?%) ; ([^;]+)/g;
            const patternPercentageRegex = /(\d+(\.\d+)?%) ; ([^;]+)/;

            const extractedPatterns = [];

            emailSearchResponseItems.forEach(item => {
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
            result: { modifiedEmails, uniqueResults, targetStringsRaw },
            message: "Emails extracted successfully."
        }

    } catch (error) {
        console.log(error.message)
        return {
            success: false,
            error: error.message,
            message: "An error occurred while extracting emails."
        }
    }
}


export async function getPhoneNumbersService(companyName, start = 1, num = 10) {

    try {
        const companyNameEncoded = encodeURIComponent(companyName);

        const phoneQuery = `"${companyNameEncoded}" contact phone OR "support number" OR "customer service" OR "contact number"`;

        const searchPhoneUrl = `https://www.googleapis.com/customsearch/v1?q=${phoneQuery}&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`
        const phoneData = await fetch(searchPhoneUrl);
        const phoneResponse = (await phoneData.json()).items

        // Function to get all matches based on a predicate
        const getMatches = (pred) => (obj) =>
            obj == null
                ? []
                : Array.isArray(obj)
                    ? obj.flatMap(getMatches(pred))
                    : typeof obj == 'object'
                        ? Object.values(obj).flatMap(getMatches(pred))
                        : pred(obj)
                            ? obj
                            : []

        // Predicate function to check if a value is a phone number
        const isPhoneNumber = val => typeof val === 'string' && /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(val) && !val.includes("https://")
        const targetPhoneNumbers = getMatches(isPhoneNumber)(phoneResponse);

        const extractPhoneNumbers = (arr) => {
            // Define a regular expression to match various phone number formats
            const phoneNumberRegex = /(\+?\d{1,4}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;

            // Initialize an empty set to store unique phone numbers
            let phoneNumbers = []

            // Helper function to extract country name from a string
            const extractCountryName = (text, index) => {
                let foundCountries = [];
                if (text) {
                    for (const country of countryNames) {
                        if (text.toLowerCase().includes(country.toLowerCase())) {
                            foundCountries.push(country);
                        }
                    }
                }
                return foundCountries;
            };

            // Iterate over the array of strings
            arr.forEach(str => {
                // Find all matches in the current string
                const matches = str.match(phoneNumberRegex);
                if (matches) {
                    // Add matches to the set to ensure uniqueness
                    matches.forEach((match, index) => {
                        // Extract country name if present
                        const countries = extractCountryName(str);
                        if (match.length > 9) {
                            phoneNumbers.push({ phone: match, country: countries[index] || "", type: "Work" });
                        }
                    });
                }
            });

            // Now we will remove the duplicate phone numbers but we want to keep the numbers which has country
            let removedDuplicate = []

            phoneNumbers.forEach(number => {
                if (!removedDuplicate.some(item => item.phone === number.phone)) {
                    removedDuplicate.push(number)
                } else {
                    const index = removedDuplicate.findIndex(item => item.phone === number.phone)
                    // if the existing phon has no country then we want to replace with the one which has country
                    if (!removedDuplicate[index].country) {
                        removedDuplicate.splice(index, 1);
                        removedDuplicate.push(number);
                    }
                }
            })
            return removedDuplicate
        };

        const finalNumbers = extractPhoneNumbers(targetPhoneNumbers)

        return {
            success: true,
            result: finalNumbers,
            message: "Phone numbers extracted successfully."
        }

    } catch (error) {
        return {
            success: false,
            error: error.message,
            message: "An error occurred while extracting phone numbers."
        }
    }
}

export async function getCompanyInfoService(companyName, start = 1, num = 10) {

    try {
        const companyNameEncoded = encodeURIComponent(companyName);
        const infoQuery = `linkedin ${companyNameEncoded} company size and location and founded date`;
        const searchinfoUrl = `https://www.googleapis.com/customsearch/v1?q=${infoQuery}&start=${start}&num=${num}&key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID}`
        const phoneData = await fetch(searchinfoUrl);
        const infoResponse = (await phoneData.json()).items

        const targetCompanyObj = infoResponse[0]

        // Function to get all matches based on a predicate
        const getMatches = (pred) => (obj) =>
            obj == null
                ? []
                : Array.isArray(obj)
                    ? obj.flatMap(getMatches(pred))
                    : typeof obj == 'object'
                        ? Object.values(obj).flatMap(getMatches(pred))
                        : pred(obj)
                            ? obj
                            : []

        // Predicate function to check if a value is a phone number

        // && val.includes("employees")
        const isDataString = val => typeof val === 'string' && (val.includes("Company size") || val.includes("Headquarters") || val.includes("employ") || val.includes("Founded"))
        const targetinfo = getMatches(isDataString)(targetCompanyObj);

        function extractCompanyDetails(result) {
            // Initialize default values
            const companyDetails = {
                location: '',
                companySize: '',
                founded: ''
            };

            // Define regular expressions for extracting the information
            const locationRegex = /Headquarters?:\s*([\w\s,]+)\b/i;
            const companySizeRegex = /Company size:\s*([\w\s\-,+]+)/i;
            const foundedRegex = /Founded\s*:\s*([\d]{4})/i;

            // Iterate over each result item
            for (const entry of result) {
                // Extract location
                const locationMatch = entry.match(locationRegex);
                if (locationMatch) {
                    companyDetails.location = locationMatch[1].trim();
                }

                // Extract company size
                const companySizeMatch = entry.match(companySizeRegex);
                if (companySizeMatch) {
                    companyDetails.companySize = companySizeMatch[1].trim();
                }

                // Extract founding date
                const foundedMatch = entry.match(foundedRegex);
                if (foundedMatch) {
                    companyDetails.founded = foundedMatch[1].trim();
                }
            }

            // Return the company details object
            return companyDetails;
        }

        const companyDetails = extractCompanyDetails(targetinfo)

        return {
            success: true,
            result: companyDetails,
            message: "Phone numbers extracted successfully."
        }

    } catch (error) {
        return {
            success: false,
            error: error.message,
            message: "An error occurred while extracting phone numbers."
        }
    }
}