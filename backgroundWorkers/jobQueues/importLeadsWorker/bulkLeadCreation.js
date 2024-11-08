import { parentPort, workerData } from 'worker_threads';
import User from '../../../models/userModel.js';
import Folder from '../../../models/folderModel.js';
import Lead from '../../../models/leadModel.js';
import connectDB from '../../../db.js';
import Team from '../../../models/teamModel.js';
import { isValidURL } from '../../../utils/functions.js';

try {

    // connect to db as this script is stand alone
    await connectDB();

    const adminCustomerEmail = "admincustomer@gmail.com"

    const adminCustomer = await User.findOne({ email: adminCustomerEmail });
    const adminCustomerTeam = await Team.findOne({ creator: adminCustomer._id });
    //    const converteddToJson = JSON.parse(workerData.jsonLeadsData)
    const jsonLeadsData = typeof workerData.jsonLeadsData === 'string'
        ? JSON.parse(workerData.jsonLeadsData)
        : workerData.jsonLeadsData;

    let folder = await Folder.findOne({ owner: adminCustomer._id });
    // now we have to format the raw data to meet our database schema
    let totalLeadsAdded = 0;
    let leadsLinkedInIds = [];
    let failedLeads = [];
    const formattedLeadsData = await Promise.all(jsonLeadsData.flat().map(async (rawLead, index) => {
        let linkedInId
        try {
            const profileLinkedinUrl = rawLead["Linkedin_Url"];

            // Extract the Linkedin_Id
            linkedInId = profileLinkedinUrl?.split('/in/')[1]?.split('/')[0] || rawLead["Linkedin_Id"]
            if (leadsLinkedInIds.includes(linkedInId)) {
                return null;
            }
            // work emails
            let workEmails = [];
            if (rawLead["Other_Email"]) {
                const otherMailColumnData = rawLead["Other_Email"]?.split(",") || [];
                workEmails = [...workEmails, ...otherMailColumnData]
            }
            if (rawLead["Work_Email"]) {
                const primaryMailColumnData = rawLead["Work_Email"]?.split(",") || [];
                workEmails = [...workEmails, ...primaryMailColumnData]
            }

            // avoid duplicatiosn of emails
            const filteredWorkEmails = Array.from(new Set(workEmails.map(workEmail => workEmail.trim())))
                .map(workEmail => ({
                    email: workEmail,
                    verified: true,
                    type: "Work",
                    validationStatus: 1,
                    valid: true,
                }));



            // personal emails
            let personalEmails = [];
            if (rawLead["Personal_Email"]) {
                const personalEmailColumnData = rawLead["Personal_Email"]?.split(",") || [];
                personalEmails = [...personalEmails, ...personalEmailColumnData]
            }
            personalEmails = personalEmails.map((personalEmail) => {
                return {
                    email: personalEmail,
                    verified: true,
                    type: "Direct",
                    validationStatus: 1,
                    valid: true,
                }
            })

            // work phones
            let workPhones = [];
            if (rawLead["Other_Number"]) {
                const workPhoneColumnData = String(rawLead["Other_Number"])?.split(",") || [];
                workPhones = [...workPhones, ...workPhoneColumnData]
            }
            if (rawLead["Work_Number"]) {
                const otherPhoneColumnData = String(rawLead["Work_Number"])?.split(",") || [];
                workPhones = [...workPhones, ...otherPhoneColumnData]
            }

            console.log(workPhones)

            // avoid duplicatiosn of phone numbers
            const filteredWorkPhones = Array.from(new Set(workPhones.map(workEmail => workEmail.trim())))
                .map(workEmail => ({
                    phone: workEmail,
                    verified: true,
                    type: "Work",
                    validationStatus: 1,
                    valid: true,
                }));

            // personal phones
            let personalPhones = [];
            if (rawLead["Personal_Numbers"]) {
                const stringifiedNumber = String(rawLead["Personal_Numbers"])
                const personalPhoneColumnData = stringifiedNumber?.split(",") || [];
                personalPhones = [...personalPhones, ...personalPhoneColumnData]
            }
            personalPhones = personalPhones.map((personalPhone) => {
                return {
                    phone: personalPhone,
                    type: "Direct",
                    country: "",
                }
            })

            let skills = [];
            if (rawLead["Skills"]) {
                const skillsArr = JSON.parse(rawLead["Skills"].replaceAll(`'`, `"`)) || [];
                skills = skillsArr.map(skill => {
                    return {
                        title: skill
                    }
                })
            }

            let locationNames = [];
            if (rawLead["Location_Names"]) {
                locationNames = rawLead["Location_Names"]?.split(",") || [];
            }

            let streetAddresses = [];
            if (rawLead["Street_Addresses"]) {
                if (rawLead["Street_Addresses"]) {
                    // Replace single quotes with double quotes and convert None to null
                    let formattedString = rawLead["Street_Addresses"]
                        .replaceAll(`'`, `"`).replace(/None/g, `null`);

                    // Parse the JSON string
                    streetAddresses = JSON.parse(formattedString) || [];
                }
            }

            let educations = [];
            if (rawLead["Education"]) {
                const formatedString = rawLead["Education"].replaceAll(`'`, `"`).replace(/None/g, `null`);
                const educationsArr = JSON.parse(formatedString) || [];
                educations = educationsArr.map(education => {
                    const educationData = {
                        school: {},
                    };
                    // Dynamically extract school details
                    if (education.school) {
                        Object.keys(education.school).forEach(key => {
                            educationData.school[`school_${key}`] = education.school[key];
                        });
                    }
                    educationData.uniName = education?.school?.name
                    // Extract all other fields from the education object
                    Object.keys(education).forEach(key => {
                        if (key !== 'school') {
                            educationData[key] = education[key];
                        }
                    });
                    return educationData;
                })
            }

            let profiles = [];

            if (rawLead["Profiles"]) {
                if (rawLead["Profiles"]) {
                    // Replace single quotes with double quotes and convert None to null
                    let formattedString = rawLead["Profiles"]
                        .replaceAll(`'`, `"`).replace(/None/g, `null`);

                    // Parse the JSON string
                    profiles = JSON.parse(formattedString) || [];
                }
            };

            let certifications = [];
            if (rawLead["Certifications"]) {
                if (rawLead["Certifications"]) {
                    // Replace single quotes with double quotes and convert None to null
                    let formattedString = rawLead["Certifications"]
                        .replaceAll(`'`, `"`).replace(/None/g, `null`);

                    // Parse the JSON string
                    certifications = JSON.parse(formattedString) || [];
                }
            }

            let allEmails = [
                ...personalEmails,
                ...filteredWorkEmails,
            ];

            allEmails = allEmails.map(emailObj => {
                return {
                    ...emailObj,
                    email: emailObj.email?.replace(/\s/g, '')
                }
            })

            const formated = {
                profile: {
                    name: rawLead['Full_Name'] || rawLead['Profile'],
                    // imageUrl: rawLead['Profile Image Url']
                },
                isImportedByAdmin: true,
                owner: adminCustomerTeam._id,
                folderId: folder._id,
                assignedTo: [],
                linkedInId: linkedInId,
                profileUrl: `https://www.linkedin.com/in/${linkedInId}`,
                name: rawLead["Full_Name"],
                firstName: rawLead["First_Name"],
                lastName: rawLead["Last_Name"],
                about: rawLead["About"],
                location: rawLead["Location_Name"],
                company: {
                    position: rawLead["Job_Title"],
                    company: rawLead["Job_Company_Name"],
                    imageSrc: isValidURL(rawLead["Company Logo Url"]) ? rawLead["Company Logo Url"] : undefined,
                    companySize: rawLead["Job_Company_Size"],
                    companyInstagramUrl: rawLead["Company Instagram Url"],
                    companyLocation: rawLead["Job_Company_Location_Name"]
                },
                currentPositions: [
                    {
                        position: rawLead["Job_Title"],
                        duration: rawLead["Inferred_Years_Experience"],
                        company: rawLead["Job_Company_Name"],
                        imageSrc: isValidURL(rawLead["Company Logo Url"]) ? rawLead["Company Logo Url"] : undefined,
                    }
                ],
                pastPositions: [
                    // {
                    //     position: rawLead["Past_Postion"],
                    //     duration: rawLead["Past_Position_Experience"],
                    // }
                ],
                skills: skills,
                educations: educations,
                // imageUrl: rawLead['Profile Image Url'],
                emails: allEmails,
                emailsStatus: "notSent",
                phones: [
                    ...personalPhones,
                    ...filteredWorkPhones,
                ],
                tags: [],
                notes: [],
                country: rawLead["Location_Country"],
                city: rawLead["Location_Locality"],
                state: rawLead["Location_Region"],
                updatedFromLinkedin: rawLead["Update From LinkedIn"] ? new Date(rawLead["Update From LinkedIn"]) : new Date(),
                created_at: rawLead["Created At"] ? new Date(rawLead["Created At"]) : new Date(),
                updated_at: rawLead["Updated Date"] ? new Date(rawLead["Updated Date"]) : new Date(),


                id: rawLead["Id"],
                gender: rawLead["Gender"],
                linkedinUserName: rawLead["Linkedin_Username"],
                profileFacebookUrl: rawLead["Facebook_Url"],
                facebookUserName: rawLead["Facebook_Username"],
                facebookId: rawLead["Facebook_Id"],
                industry: rawLead["Industry"],
                jobTitle: rawLead["Job_Title"],
                jobsTitleRolde: rawLead["Job_Title_Role"],
                jobTitleLevels: rawLead["Job_Title_Levels"],
                jobCompnayId: rawLead["Job_Company_Id"],
                jobCompanyName: rawLead["Job_Company_Name"],
                jobCompanyWebsite: rawLead["Job_Company_Website"],
                jobCompanySize: rawLead["Job_Company_Size"],
                jobCompanyFounded: rawLead["Job_Company_Founded"],
                jobCompanyIndustry: rawLead["Job_Company_Industry"],
                jobCompanyLinkedinUrl: rawLead["Job_Company_Linkedin_Url"],
                jobCompnayLinkedinId: rawLead["Job_Company_Linkedin_Id"],
                jobCompnanyFacebookUrl: rawLead["Job_Company_Facebook_Url"],
                jobCompanyTwitterUrl: rawLead["Job_Company_Twitter_Url"],
                jobCompanylocationName: rawLead["Job_Company_Location_Name"],
                jobCompanyLocationLocality: rawLead["Job_Company_Location_Locality"],
                jobCompanyLocationMetro: rawLead["Job_Company_Location_Metro"],
                jobCompanyLocationRegion: rawLead["Job_Company_Location_Region"],
                jobCompanyLocationGeo: rawLead["Job_Company_Location_Geo"],
                jobCompanyLocationCountry: rawLead["Job_Company_Location_Country"],
                jobCompanyLocationStreetAddress: rawLead["Job_Company_Location_Street_Address"],
                jobCompanyLocationExtendedAddress: rawLead["Job_Company_Location_Extended_Address"],
                jobCompanyLocationPostalCode: rawLead["Job_Company_Location_Postal_Code"],
                jobCompanyLocationContinent: rawLead["Job_Company_Location_Continent"],
                jobLastUpdated: rawLead["Job_Last_Updated"],
                jobStarted: rawLead["Job_Start_Date"],

                loationName: rawLead["Location_Name"],
                loationPostalCode: rawLead["Location_Postal_Code"],
                locationLocality: rawLead["Location_Locality"],
                locationMetro: rawLead["Location_Metro"],
                locationRegion: rawLead["Location_Region"],
                locationCountry: rawLead["Location_Country"],
                locationStreetAddress: rawLead["Location_Continent"],
                locationGeo: rawLead["Location_Geo"],
                locationLastUpdate: rawLead["Location_Last_Updated"],
                linkedinConnections: rawLead["Linkedin_Connections"],
                inferredSalary: rawLead["Inferred_Salary"],
                inferredYearsExperience: rawLead["Inferred_Years_Experience"],
                summery: rawLead["Summary"],
                emailStatus: rawLead["Email_Status"],
                interests: rawLead["Interests"],
                locationNames,
                regions: rawLead["Regions"],
                contries: rawLead["Countries"],
                profiles,
                certifications,
                languages: JSON.parse(rawLead["Languages"].replaceAll(`'`, `"`)),
                versionStatus: JSON.parse(rawLead["Version_Status"].replaceAll(`'`, `"`)),
                middleInitail: rawLead["Middle_Initial"],
                middleName: rawLead["Middle_Name"],
                birthYear: rawLead["Birth_Year"],
                birthDate: rawLead["Birth_Date"],
                twitterUrl: rawLead["Twitter_Url"],
                twitterUserName: rawLead["Twitter_Username"],
                gitHubUrl: rawLead["Github_Url"],
                gitHubUserName: rawLead["Github_Username"],
                locationAddressLine2: rawLead["Location_Address_Line_2"],
                jobTitleSubRole: rawLead["Job_Title_Sub_Role"],
                jobCompanyLocationAddressLine2: rawLead["Job_Company_Location_Address_Line_2"],
                profileInstagramUrl: rawLead["Profile Instagram Url"],
                companyYoutubeUrl: rawLead["Company Youtube Url"],
                allGroups: rawLead["All_Groups"],
                profileLanguages: rawLead["Profile_Languages"],
                recruitingActivity: rawLead["Recruiting_Activity"],
                seniority: rawLead["seniority"],
                networkRelationships: rawLead["Network_Relationships"],
            }

            // Upsert operation
            const result = await Lead.updateOne(
                { linkedInId: formated.linkedInId, owner: adminCustomerTeam._id },
                { $set: formated },
                { upsert: true }
            );

            // Collect lead ID for folder update
            const lead = await Lead.findOne({ linkedInId: formated.linkedInId, owner: adminCustomerTeam._id });
            if (lead && result.upsertedCount > 0) {
                folder.leads.push(lead._id);
                totalLeadsAdded++;
                leadsLinkedInIds.push(formated.linkedInId)
            }
        } catch (error) {
            failedLeads.push({
                name:rawLead["Full_Name"],
                linkedInId,
            })
        }
    }));

    const firstFifty = failedLeads.slice(0, 50).length

    const ulContent = `
                <ul>
                    ${failedLeads.slice(0, 50).map(lead => `<li>Name: <b>${lead.name}</b>, LinkedInID: <b>${lead.linkedInId}</b></li>`).join('')}
                </ul>
                `;

    parentPort.postMessage({ success: true, message: "Imports Completed", result: { totalLeadsAdded, ulContent, totalFailed: failedLeads.length, firstFifty } });

} catch (error) {
    parentPort.postMessage({ success: false, message: error.message });
}