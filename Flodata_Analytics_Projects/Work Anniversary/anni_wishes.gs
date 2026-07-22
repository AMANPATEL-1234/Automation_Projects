function sendWorkAnniversaryWishes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'Employees Work Anniversary - FloData Analytics';
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    Logger.log("Error: Work Anniversary sheet '" + sheetName + "' not found.");
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    Logger.log("Info: No employee data found (only headers or empty sheet).");
    return;
  }
  
  const headers = data[0];
  let nameColIndex = -1;
  let emailColIndex = -1;
  let dojColIndex = -1;
  let statusColIndex = -1;
  
  // Find column indexes dynamically (case-insensitive)
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toString().trim().toLowerCase();
    if (h.includes('name')) {
      nameColIndex = i;
    }
    if (h.includes('mail') || h.includes('email')) {
      emailColIndex = i;
    }
    if (h.includes('joining') || h.includes('date of joining')) {
      dojColIndex = i;
    }
    if (h === 'status') {
      statusColIndex = i;
    }
  }
  
  if (nameColIndex === -1 || emailColIndex === -1 || dojColIndex === -1) {
    Logger.log("Error: Could not locate Name, Email, or Date of Joining columns.");
    return;
  }
  
  const props = PropertiesService.getScriptProperties();
  const rawSpaceId = props.getProperty('SPACE_ID'); 
  
  if (!rawSpaceId) {
    Logger.log("Error: Target Google Chat Space ID/Name is not configured in Script Properties.");
    return;
  }
  
  const spaceName = rawSpaceId.trim().startsWith('spaces/') ? rawSpaceId.trim() : 'spaces/' + rawSpaceId.trim();
  const timeZone = ss.getSpreadsheetTimeZone();
  const todayStr = Utilities.formatDate(new Date(), timeZone, "d-MMM"); // e.g. "26-Jul" or "7-Jul"
  const currentYear = parseInt(Utilities.formatDate(new Date(), timeZone, "yyyy"), 10);
  const anniversaryEmployees = [];
  
  Logger.log("Scanning anniversary records for today: " + todayStr + " (TimeZone: " + timeZone + ")...");
  
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const name = row[nameColIndex] ? row[nameColIndex].toString().trim() : "";
    const email = row[emailColIndex] ? row[emailColIndex].toString().trim() : "";
    const dojVal = row[dojColIndex];
    
    if (!email || !dojVal) continue;
    
    // Skip inactive employees
    if (statusColIndex !== -1) {
      const status = row[statusColIndex] ? row[statusColIndex].toString().trim().toLowerCase() : "";
      if (status === 'inactive') {
        continue;
      }
    }
    
    const dojStr = getAnniversaryDayMonthStr(dojVal, timeZone);
    if (dojStr && dojStr === todayStr) {
      let isMember = false;
      let userId = null;
      const isValidEmail = email && email.includes('@') && email.lastIndexOf('.') > email.indexOf('@');
      
      if (isValidEmail) {
        try {
          const memberName = spaceName + "/members/" + email.toLowerCase();
          const membership = Chat.Spaces.Members.get(memberName);
          if (membership && membership.member && membership.member.name) {
            isMember = true;
            const parts = membership.member.name.split('/');
            if (parts.length === 2) {
              userId = parts[1];
            }
          }
        } catch (err) {
          Logger.log("Membership check failed or user not in space: " + email + " - " + err.toString());
        }
      }
      
      if (isMember) {
        const joinYear = getAnniversaryYear(dojVal, timeZone);
        const completedYears = joinYear ? (currentYear - joinYear) : 0;
        if (completedYears > 0) {
          anniversaryEmployees.push({ name, email, userId, completedYears });
          Logger.log("Added matching anniversary employee: " + name + " (" + email + "), completed years: " + completedYears);
        } else {
          Logger.log("Skipping employee as they joined today or in the current year: " + name + " (" + email + ")");
        }
      }
    }
  }
  
  if (anniversaryEmployees.length === 0) {
    Logger.log("Info: No matching anniversary employees found today who are present in the target Google Chat Space. Exiting.");
    return;
  }
  
  // Send Work Anniversary wishes for each matched employee individually in the specified format
  for (let i = 0; i < anniversaryEmployees.length; i++) {
    const emp = anniversaryEmployees[i];
    const mention = emp.userId ? "<users/" + emp.userId + ">" : emp.name;
    const yearsText = emp.completedYears <= 1 ? "1 year" : emp.completedYears + " years";
    
    const messageText = "🎉 Happy Work Anniversary, " + mention + "!\n\n" +
      "Congratulations on completing " + yearsText + " with FloData. Wishing you continued success and many more milestones ahead! ✨🎊";
      
    const message = { text: messageText };
    try {
      Chat.Spaces.Messages.create(message, spaceName);
      Logger.log("Successfully sent work anniversary wishes for " + emp.name + " via Google Chat API.");
    } catch (err) {
      Logger.log("Error: Failed to post work anniversary message for " + emp.name + ": " + err.toString());
    }
  }
}

/**
 * Parses joining date values (from Date objects or strings like 26-July-2003 or 16-Jun-2026)
 * into a matching "d-MMM" string format (e.g. "26-Jul" or "16-Jun").
 */
function getAnniversaryDayMonthStr(dojValue, timeZone) {
  if (!dojValue) return "";
  if (dojValue instanceof Date) {
    const monthName = Utilities.formatDate(dojValue, timeZone, "MMM");
    const day = Utilities.formatDate(dojValue, timeZone, "d");
    return day + "-" + monthName;
  }
  
  const str = dojValue.toString().trim();
  if (!str) return "";
  
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    const p1 = parts[0].trim();
    const p2 = parts[1].trim();
    const p3 = parts[2].trim();
    
    // Case 1: D-Month-YYYY or DD-Month-YYYY (e.g. 16-Jun-2026 or 26-July-2003)
    if (/^\d{1,2}$/.test(p1) && /^[a-zA-Z]+$/.test(p2) && /^\d{4}$/.test(p3)) {
      const day = parseInt(p1, 10).toString();
      const month = p2.substring(0, 1).toUpperCase() + p2.substring(1, 3).toLowerCase();
      return day + "-" + month;
    }
    
    // Case 2: Month-D-YYYY or Month-DD-YYYY (e.g. Jun-16-2026 or July-26-2003)
    if (/^[a-zA-Z]+$/.test(p1) && /^\d{1,2}$/.test(p2) && /^\d{4}$/.test(p3)) {
      const day = parseInt(p2, 10).toString();
      const month = p1.substring(0, 1).toUpperCase() + p1.substring(1, 3).toLowerCase();
      return day + "-" + month;
    }
  }
  
  // Fallback parser
  const parsedDate = Date.parse(str);
  if (!isNaN(parsedDate)) {
    const dateObj = new Date(parsedDate);
    const monthName = Utilities.formatDate(dateObj, timeZone, "MMM");
    const day = Utilities.formatDate(dateObj, timeZone, "d");
    return day + "-" + monthName;
  }
  
  return str;
}

/**
 * Extracts the full four-digit year from a Date object or standard date string.
 */
function getAnniversaryYear(dojValue, timeZone) {
  if (!dojValue) return null;
  if (dojValue instanceof Date) {
    return dojValue.getFullYear();
  }
  const str = dojValue.toString().trim();
  if (!str) return null;
  
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    const p3 = parts[2].trim();
    if (/^\d{4}$/.test(p3)) {
      return parseInt(p3, 10);
    }
  }
  
  const parsedDate = Date.parse(str);
  if (!isNaN(parsedDate)) {
    return new Date(parsedDate).getFullYear();
  }
  return null;
}
