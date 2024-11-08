import {validate} from "deep-email-validator";

export const validateEmail = async (email) => {
    const otherTlds = [
        "int", "name", "pro", "coop", "aero", "museum", "jobs",
        "mobi", "travel", "cat", "asia", "tel", "club", "online",
        "site", "tech", "store", "app", "dev", "io", "co", "me", "tv",
        "br", "za", "mx", "fi", "ar", "cl", "pl", "my", "il", "tr", "sa", "xyz"];

   const result = await validate({
        email: email,
        sender: email,
        validateRegex: true,
        validateMx: true,
        validateTypo: true,
        validateDisposable: true,
        validateSMTP: true,
        additionalTopLevelDomains: otherTlds
      })

      return result;
}