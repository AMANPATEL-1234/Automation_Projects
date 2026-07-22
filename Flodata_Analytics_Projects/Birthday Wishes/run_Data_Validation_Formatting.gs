function run_Data_Validation_Formatting() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Find the source sheet, trimming leading/trailing spaces from sheet names
  const sheets = ss.getSheets();
  let sourceSheet = null;
  for (const s of sheets) {
    if (s.getName().trim() === 'Google Form - Raw Data') {
      sourceSheet = s;
      break;
    }
  }
  
  if (!sourceSheet) {
    Logger.log("Error: Source sheet 'Google Form - Raw Data' not found.");
    return;
  }
  sourceSheet.getDataRange().setBorder(true, true, true, true, true, true, "#0a0a0a", SpreadsheetApp.BorderStyle.SOLID);
  const sourceData = sourceSheet.getDataRange().getDisplayValues();
  if (sourceData.length <= 1) {
    Logger.log("Info: Google Form - Raw Data is empty.");
    return;
  }
  
  const headers = sourceData[0];
  let nameColIndex = -1;
  let emailColIndex = -1;
  let empIdColIndex = -1;
  let statusColIndex = -1;
  let docDateColIndex = -1;
  let actDateColIndex = -1;
  
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toString().trim().toLowerCase().replace(/\s+/g, ' ');
    if (h.includes('name')) {
      nameColIndex = i;
    }
    if (h.includes('official email') || h.includes('official mail')) {
      emailColIndex = i;
    }
    if (h.includes('employee id') || h.includes('intern code') || h === 'emp id' || h.includes('employee_id')) {
      empIdColIndex = i;
    }
    if (h === 'status') {
      statusColIndex = i;
    }
    if (h.includes('documented') && (h.includes('birth') || h.includes('dob'))) {
      docDateColIndex = i;
    }
    if (h.includes('actual')) {
      actDateColIndex = i;
    }
  }
  
  // Fallbacks if headers are not found
  if (nameColIndex === -1) nameColIndex = 2; // Column C
  if (emailColIndex === -1) emailColIndex = 3; // Column D
  if (empIdColIndex === -1) empIdColIndex = 1; // Column B
  if (statusColIndex === -1) statusColIndex = 6; // Column G
  if (docDateColIndex === -1) docDateColIndex = 4; // Column E
  if (actDateColIndex === -1) actDateColIndex = 5; // Column F
  
  // Format documented and actual date columns to 'DD-MMM-YYYY' format in raw sheet and in-memory data
  const docDateValues = [];
  const actDateValues = [];
  for (let r = 1; r < sourceData.length; r++) {
    const row = sourceData[r];
    if (docDateColIndex !== -1) {
      const rawDoc = row[docDateColIndex];
      const formatted = rawDoc ? commonUtilityHelper('formatBirthdate', rawDoc) : "";
      row[docDateColIndex] = formatted;
      docDateValues.push([formatted]);
    }
    if (actDateColIndex !== -1) {
      const rawAct = row[actDateColIndex];
      const formatted = rawAct ? commonUtilityHelper('formatBirthdate', rawAct) : "";
      row[actDateColIndex] = formatted;
      actDateValues.push([formatted]);
    }
  }
  
  if (docDateColIndex !== -1 && docDateValues.length > 0) {
    const docRange = sourceSheet.getRange(2, docDateColIndex + 1, docDateValues.length, 1);
    docRange.setNumberFormat("@");
    docRange.setValues(docDateValues);
    docRange.setHorizontalAlignment("center");
  }
  if (actDateColIndex !== -1 && actDateValues.length > 0) {
    const actRange = sourceSheet.getRange(2, actDateColIndex + 1, actDateValues.length, 1);
    actRange.setNumberFormat("@");
    actRange.setValues(actDateValues);
    actRange.setHorizontalAlignment("center");
  }
  
  // Center-align Employee ID/Intern Code column
  if (empIdColIndex !== -1 && sourceData.length > 1) {
    sourceSheet.getRange(2, empIdColIndex + 1, sourceData.length - 1, 1).setHorizontalAlignment("center");
  }
  
  const spaceName = CHAT_CONFIG.SPACE_NAME;
  if (!spaceName || spaceName === 'spaces/YOUR_SPACE_ID_HERE') {
    Logger.log("Error: Target space name is not configured.");
    return;
  }
  
  // Duplicate detection using Employee ID and/or Official Mail ID on raw submissions
  const empIdCounts = {};
  const emailCounts = {};
  
  for (let r = 1; r < sourceData.length; r++) {
    const row = sourceData[r];
    const empId = empIdColIndex !== -1 ? row[empIdColIndex].toString().trim().toLowerCase() : "";
    const email = emailColIndex !== -1 ? row[emailColIndex].toString().trim().toLowerCase() : "";
    
    if (empId) {
      empIdCounts[empId] = (empIdCounts[empId] || 0) + 1;
    }
    if (email) {
      emailCounts[email] = (emailCounts[email] || 0) + 1;
    }
  }
  
  // Build and apply backgrounds to the source 'Google Form - Raw Data' sheet
  const sourceBackgrounds = [];
  for (let r = 1; r < sourceData.length; r++) {
    const bgRow = new Array(headers.length).fill(""); // empty string resets cell to default background
    const row = sourceData[r];
    const empId = empIdColIndex !== -1 ? row[empIdColIndex].toString().trim().toLowerCase() : "";
    const email = emailColIndex !== -1 ? row[emailColIndex].toString().trim().toLowerCase() : "";
    
    const isDuplicate = (empId && empIdCounts[empId] > 1) || (email && emailCounts[email] > 1);
    
    // Highlight entire duplicate row in yellow
    if (isDuplicate) {
      bgRow.fill("yellow");
    }
    
    // Validate Documented DOB (highlight only the cell if year < 1960)
    if (docDateColIndex !== -1) {
      const rawDocDob = sourceData[r][docDateColIndex];
      const formattedDocDob = commonUtilityHelper('formatBirthdate', rawDocDob);
      const docYear = commonUtilityHelper('parseYearFromFormattedDate', formattedDocDob);
      if (docYear !== null && docYear < 1960) {
        bgRow[docDateColIndex] = "yellow";
      }
    }
    
    // Validate Actual DOB (highlight only the cell if year < 1960)
    if (actDateColIndex !== -1) {
      const rawActDob = sourceData[r][actDateColIndex];
      const formattedActDob = commonUtilityHelper('formatBirthdate', rawActDob);
      const actYear = commonUtilityHelper('parseYearFromFormattedDate', formattedActDob);
      if (actYear !== null && actYear < 1960) {
        bgRow[actDateColIndex] = "yellow";
      }
    }
    
    sourceBackgrounds.push(bgRow);
  }
  
  if (sourceBackgrounds.length > 0) {
    sourceSheet.getRange(2, 1, sourceBackgrounds.length, headers.length).setBackgrounds(sourceBackgrounds);
  }
  
  const mismatches = [];
  
  for (let r = 1; r < sourceData.length; r++) {
    const row = sourceData[r];
    const statusVal = row[statusColIndex] ? row[statusColIndex].toString().trim() : "";
    
    // Only check active employees
    if (statusVal.toLowerCase() === 'active') {
      const name = row[nameColIndex] ? row[nameColIndex].toString().trim() : "Unknown";
      const email = row[emailColIndex] ? row[emailColIndex].toString().trim() : "";
      const empId = empIdColIndex !== -1 ? row[empIdColIndex].toString().trim() : "N/A";
      
      let isMember = false;
      const isValidEmail = email && email.includes('@') && email.lastIndexOf('.') > email.indexOf('@');
      
      if (isValidEmail) {
        try {
          const memberName = spaceName + "/members/" + email.toLowerCase();
          const membership = Chat.Spaces.Members.get(memberName);
          if (membership && membership.member && membership.member.name) {
            isMember = true;
          }
        } catch (err) {
          if (err.message.includes("Invalid membership state") || err.message.includes("not found")) {
            Logger.log(`Membership check: ${email} is not a member of the space.`);
          } else {
            Logger.log(`Membership check: Lookup failed for ${email}: ${err.message}`);
          }
        }
      } else {
        Logger.log(`Skipping membership check for ${name} due to invalid or missing email format: "${email}"`);
      }
      
      if (!isMember) {
        mismatches.push({ name, empId, email });
      }
    }
  }
  
  // 1. Send space email mismatch notification if mismatches exist
  if (mismatches.length > 0) {
    const recipient = 'aman.patel@flodataanalytics.com';
    const subject = 'Workspace Space Email Mismatch Alert';
    
    let body = 'Hello,\n\nThe system detected employee email addresses in the Google Form submissions that do not match the members of the Google Chat Space:\n\n';
    mismatches.forEach(item => {
      body += `- Name: ${item.name}, Employee ID: ${item.empId}, Email: ${item.email}\n`;
    });
    body += '\nPlease check if these users need to be added to the Google Chat space, or if their form emails are incorrect.\n\nRegards,\nBirthday Wishes System';
    
    try {
      MailApp.sendEmail(recipient, subject, body);
      Logger.log(`Email mismatch notification sent to ${recipient}`);
    } catch (e) {
      Logger.log(`Failed to send email mismatch notification: ${e.toString()}`);
    }
  } else {
    Logger.log("Info: All active employee emails match workspace members.");
  }
  
  // 2. Send duplicate submissions email alert if duplicates exist
  const duplicatesList = [];
  const reportedEmpIds = new Set();
  const reportedEmails = new Set();
  
  for (let r = 1; r < sourceData.length; r++) {
    const row = sourceData[r];
    const empId = empIdColIndex !== -1 ? row[empIdColIndex].toString().trim().toLowerCase() : "";
    const email = emailColIndex !== -1 ? row[emailColIndex].toString().trim().toLowerCase() : "";
    
    const isDupEmpId = empId && empIdCounts[empId] > 1;
    const isDupEmail = email && emailCounts[email] > 1;
    
    if (isDupEmpId || isDupEmail) {
      let alreadyReported = false;
      if (isDupEmpId && reportedEmpIds.has(empId)) {
        alreadyReported = true;
      }
      if (isDupEmail && reportedEmails.has(email)) {
        alreadyReported = true;
      }
      
      if (!alreadyReported) {
        if (empId) reportedEmpIds.add(empId);
        if (email) reportedEmails.add(email);
        
        const nameVal = nameColIndex !== -1 ? row[nameColIndex].toString().trim() : "Unknown";
        const empIdVal = empIdColIndex !== -1 ? row[empIdColIndex].toString().trim() : "N/A";
        duplicatesList.push({ name: nameVal, empId: empIdVal });
      }
    }
  }
  
  if (duplicatesList.length > 0) {
    const recipient = 'aman.patel@flodataanalytics.com';
    const subject = 'Duplicate Employee Submissions Detected';
    let body = 'Hello,\n\nThe sync process has detected duplicate employee submissions in the sheet. Below are the details:\n\n';
    duplicatesList.forEach(dup => {
      body += `- Name: ${dup.name}, Employee ID: ${dup.empId}\n`;
    });
    body += '\nRegards,\nBirthday Wishes System';
    
    try {
      MailApp.sendEmail(recipient, subject, body);
      Logger.log(`Duplicate notification email sent to ${recipient}`);
    } catch (e) {
      Logger.log(`Failed to send duplicate notification email: ${e.toString()}`);
    }
  }
  
  // Sync active employees to the Master sheet
  syncActiveEmployees();
}

// =========================================================================
// GOOGLE CHAT BIRTHDAY WISHES AUTOMATION CONFIGURATION
// =========================================================================
const CHAT_CONFIG = {
  SHEET_NAME: 'Active - Employee Master',
  get SPACE_NAME() {
    const prop = PropertiesService.getScriptProperties().getProperty('SPACE_ID') || 
                 PropertiesService.getScriptProperties().getProperty('SPACE_NAME');
    if (!prop) return '';
    const trimmed = prop.trim();
    return trimmed.startsWith('spaces/') ? trimmed : 'spaces/' + trimmed;
  }
};

function syncActiveEmployees() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Find the source sheet, trimming leading/trailing spaces from sheet names
  const sheets = ss.getSheets();
  let sourceSheet = null;
  for (const s of sheets) {
    if (s.getName().trim() === 'Google Form - Raw Data') {
      sourceSheet = s;
      break;
    }
  }
  
  if (!sourceSheet) {
    throw new Error("Source sheet 'Google Form - Raw Data' (with or without spaces) not found.");
  }
  
  const sourceData = sourceSheet.getDataRange().getDisplayValues();
  if (sourceData.length <= 1) {
    return; // Only headers or sheet is empty
  }
  
  const headers = sourceData[0];
  
  // Find column indices dynamically (case-insensitive)
  let statusColIndex = -1;
  let docDateColIndex = -1;
  let actDateColIndex = -1;
  let empIdColIndex = -1;
  let emailColIndex = -1;
  let nameColIndex = -1;
  
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toString().trim().toLowerCase();
    if (h === 'status') {
      statusColIndex = i;
    }
    if (h.includes('documented') && (h.includes('birth') || h.includes('dob'))) {
      docDateColIndex = i;
    }
    if (h.includes('actual')) {
      actDateColIndex = i;
    }
    if (h.includes('employee id') || h.includes('intern code') || h === 'emp id' || h.includes('employee_id')) {
      empIdColIndex = i;
    }
    if (h.includes('official mail') || h.includes('mail id') || h.includes('email') || h === 'mail') {
      emailColIndex = i;
    }
    if (h.includes('name')) {
      nameColIndex = i;
    }
  }
  
  // Fallbacks if headers are not found
  if (statusColIndex === -1) statusColIndex = 6; // Column G
  if (docDateColIndex === -1) docDateColIndex = 4; // Column E
  if (actDateColIndex === -1) actDateColIndex = 5; // Column F
  if (empIdColIndex === -1) empIdColIndex = 1; // Column B
  if (emailColIndex === -1) emailColIndex = 3; // Column D
  
  // Group active submissions by Employee ID (falling back to Official Mail ID if empty)
  let timestampColIndex = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toString().trim().toLowerCase();
    if (h.includes('timestamp') || h.includes('time')) {
      timestampColIndex = i;
    }
  }

  Logger.log(`[Sync Debug] Headers found: ${headers.join(', ')}`);
  Logger.log(`[Sync Debug] statusColIndex: ${statusColIndex}, docDateColIndex: ${docDateColIndex}, actDateColIndex: ${actDateColIndex}`);

  const activeGroups = [];
  for (let r = 1; r < sourceData.length; r++) {
    const row = sourceData[r];
    const statusVal = row[statusColIndex];
    Logger.log(`[Sync Debug] Row ${r + 1}: Name: ${row[nameColIndex]}, Status: "${statusVal}"`);
    if (statusVal && statusVal.toString().trim() === 'Active') {
      const empId = empIdColIndex !== -1 ? row[empIdColIndex].toString().trim().toLowerCase() : "";
      const email = emailColIndex !== -1 ? row[emailColIndex].toString().trim().toLowerCase() : "";
      const name = nameColIndex !== -1 ? row[nameColIndex].toString().trim() : "Unknown";
      
      if (!empId && !email) continue;
      
      const timestampVal = timestampColIndex !== -1 ? row[timestampColIndex] : null;
      const timestampDate = commonUtilityHelper('parseTimestampToDate', timestampVal);
      
      const rowItem = {
        row: row,
        email: email,
        name: name,
        timestamp: timestampDate,
        rowIndex: r
      };
      
      // Find all groups matching this row
      const matchingIndices = [];
      for (let g = 0; g < activeGroups.length; g++) {
        const group = activeGroups[g];
        const hasMatchingEmpId = empId && group.empIds.has(empId);
        const hasMatchingEmail = email && group.emails.has(email);
        
        if (hasMatchingEmpId || hasMatchingEmail) {
          matchingIndices.push(g);
        }
      }
      
      if (matchingIndices.length > 0) {
        // Merge all matching groups into the first matching group
        const targetGroup = activeGroups[matchingIndices[0]];
        if (empId) targetGroup.empIds.add(empId);
        if (email) targetGroup.emails.add(email);
        targetGroup.rows.push(rowItem);
        
        // Merge the other matching groups
        for (let idx = 1; idx < matchingIndices.length; idx++) {
          const groupToMerge = activeGroups[matchingIndices[idx]];
          groupToMerge.empIds.forEach(id => targetGroup.empIds.add(id));
          groupToMerge.emails.forEach(em => targetGroup.emails.add(em));
          targetGroup.rows = targetGroup.rows.concat(groupToMerge.rows);
        }
        
        // Remove the merged groups from activeGroups array (in reverse order)
        for (let idx = matchingIndices.length - 1; idx >= 1; idx--) {
          activeGroups.splice(matchingIndices[idx], 1);
        }
      } else {
        // No match, create new group
        activeGroups.push({
          empIds: new Set(empId ? [empId] : []),
          emails: new Set(email ? [email] : []),
          rows: [rowItem]
        });
      }
    }
  }

  const spaceName = CHAT_CONFIG.SPACE_NAME;
  Logger.log(`[Sync Debug] spaceName resolved to: "${spaceName}"`);
  Logger.log(`[Sync Debug] Grouped active groups count: ${activeGroups.length}`);
  const filteredRows = [];

  // Deduplicate: select only one row per active employee group
  for (let g = 0; g < activeGroups.length; g++) {
    const groupRows = activeGroups[g].rows;
    
    // Sort group rows by timestamp descending (newest first)
    groupRows.sort((a, b) => {
      const timeA = a.timestamp.getTime();
      const timeB = b.timestamp.getTime();
      if (timeA !== timeB) {
        return timeB - timeA; // newest first
      }
      return b.rowIndex - a.rowIndex; // newest first
    });
    
    let targetRowData = null;
    
    // Scan submissions from newest to oldest to find the first one that matches the space membership
    for (let i = 0; i < groupRows.length; i++) {
      const item = groupRows[i];
      const email = item.email;
      let isMember = false;
      
      const isValidEmail = email && email.includes('@') && email.lastIndexOf('.') > email.indexOf('@');
      
      if (isValidEmail && spaceName && spaceName !== 'spaces/YOUR_SPACE_ID_HERE') {
        try {
          const memberName = spaceName + "/members/" + email.toLowerCase();
          const membership = Chat.Spaces.Members.get(memberName);
          if (membership && membership.member && membership.member.name) {
            isMember = true;
            Logger.log(`[Sync Debug] Employee ${item.name} (${email}) IS a member of the space.`);
          }
        } catch (err) {
          Logger.log(`[Sync Debug] Employee ${item.name} (${email}) membership check failed: ${err.message}`);
        }
      }
      
      if (isMember) {
        targetRowData = item.row;
        break; // Found the newest submission that is in the space!
      }
    }
    
    if (targetRowData) {
      filteredRows.push(targetRowData);
      Logger.log(`[Sync Debug] Added employee ${groupRows[0].name} to filteredRows.`);
    } else {
      // None of the emails for this active employee are in the space
      const latestItem = groupRows[0];
      Logger.log(`Sync skip: Skipping employee ${latestItem.name} because none of their email addresses are present in the Google Chat workspace.`);
    }
  }
  
  Logger.log(`[Sync Debug] Total filteredRows to write: ${filteredRows.length}`);
  
  // Format the birthday columns in the filtered rows to 'DD-MMM-YYYY' and calculate Same/Different status
  const formattedRows = filteredRows.map(row => {
    const docDateFormatted = commonUtilityHelper('formatBirthdate', row[docDateColIndex]);
    const actDateFormatted = commonUtilityHelper('formatBirthdate', row[actDateColIndex]);
    
    // Compare the formatted dates to see if they are 'Same' or 'Different'
    const newStatus = (docDateFormatted === actDateFormatted) ? 'Same' : 'Different';
    
    return row.map((cellValue, colIndex) => {
      if (colIndex === statusColIndex) {
        return newStatus;
      }
      if (commonUtilityHelper('isBirthdayColumn', headers[colIndex])) {
        return commonUtilityHelper('formatBirthdate', cellValue);
      }
      return cellValue;
    });
  });
  
  const targetSheetName = 'Active - Employee Master';
  let targetSheet = ss.getSheetByName(targetSheetName);
  
  if (!targetSheet) {
    // Insert the new sheet right next to the source sheet
    const insertIndex = sourceSheet.getIndex();
    targetSheet = ss.insertSheet(targetSheetName, insertIndex);
  } else {
    // Clear all contents, formats, and borders from previous runs
    targetSheet.clear();
  }
  
  const outputData = [headers].concat(formattedRows);
  
  // Format the Employee ID column as plain text to preserve leading zeros
  if (empIdColIndex !== -1) {
    targetSheet.getRange(1, empIdColIndex + 1, outputData.length, 1).setNumberFormat("@");
  }

  // Write filtered data back to the target sheet
  const dataRange = targetSheet.getRange(1, 1, outputData.length, headers.length);
  dataRange.setValues(outputData);
  
  // Build background colors matrix: Header is #cfe2f3, rows with status 'Different' get #FFF2CC
  const backgrounds = [];
  backgrounds.push(new Array(headers.length).fill("#cfe2f3"));
  
  for (let r = 0; r < formattedRows.length; r++) {
    const row = formattedRows[r];
    const statusVal = row[statusColIndex];
    const rowBg = (statusVal === 'Different') ? "#FFF2CC" : "";
    backgrounds.push(new Array(headers.length).fill(rowBg));
  }
  
  dataRange.setBackgrounds(backgrounds);
  
  // Style the header row: bold, center-aligned
  targetSheet.getRange(1, 1, 1, headers.length)
             .setFontWeight("bold")
             .setHorizontalAlignment("center");
  
  // Apply borders to the entire data range
  dataRange.setBorder(true, true, true, true, true, true, "#cccccc", SpreadsheetApp.BorderStyle.SOLID);
  
  // Automatically adjust column widths to fit content
  targetSheet.autoResizeColumns(1, headers.length);
  
  // Center-align specific columns: Official Mail ID, Employee ID, Documented DOB, Actual DOB, Status
  if (formattedRows.length > 0) {
    const centerCols = [emailColIndex, empIdColIndex, docDateColIndex, actDateColIndex, statusColIndex];
    for (const colIdx of centerCols) {
      if (colIdx !== -1) {
        targetSheet.getRange(2, colIdx + 1, formattedRows.length, 1).setHorizontalAlignment("center");
      }
    }
  }
}

/**
 * Consolidated helper function that replaces:
 * - formatBirthdate
 * - parseYearFromFormattedDate
 * - isBirthdayColumn
 * - parseTimestampToDate
 */
function commonUtilityHelper(action, value) {
  if (action === 'formatBirthdate') {
    const dateVal = value;
    if (!dateVal) return "";
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const timeZone = ss.getSpreadsheetTimeZone();
    
    if (dateVal instanceof Date) {
      return Utilities.formatDate(dateVal, timeZone, "dd-MMM-yyyy");
    }
    
    const str = dateVal.toString().trim();
    if (!str) return "";
    
    const parts = str.split(/[-/]/);
    if (parts.length === 3) {
      const p1 = parts[0].trim();
      const p2 = parts[1].trim();
      const p3 = parts[2].trim();
      
      // Case 1: DD-MMM-YYYY or DD-Month-YYYY (e.g. 20-Feb-2000 or 20-February-2000)
      if (/^\d{1,2}$/.test(p1) && /^[a-zA-Z]+$/.test(p2) && /^\d{4}$/.test(p3)) {
        const day = p1.padStart(2, '0');
        const month = p2.substring(0, 3).charAt(0).toUpperCase() + p2.substring(1, 3).toLowerCase();
        const year = p3;
        return `${day}-${month}-${year}`;
      }
      
      // Case 2: DD/MM/YYYY or DD-MM-YYYY (e.g. 21/07/2000 -> 21-Jul-2000)
      if (/^\d{1,2}$/.test(p1) && /^\d{1,2}$/.test(p2) && /^\d{4}$/.test(p3)) {
        const day = p1.padStart(2, '0');
        const monthIndex = parseInt(p2, 10) - 1;
        const year = p3;
        if (monthIndex >= 0 && monthIndex < 12) {
          const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return `${day}-${MONTHS[monthIndex]}-${year}`;
        }
      }
      
      // Case 3: MMM-YYYY-DD or Month-YYYY-D (e.g. Apr-2000-16 or Jul-2026-6)
      if (/^[a-zA-Z]+$/.test(p1) && /^\d{4}$/.test(p2) && /^\d{1,2}$/.test(p3)) {
        const day = p3.padStart(2, '0');
        const month = p1.substring(0, 3).charAt(0).toUpperCase() + p1.substring(1, 3).toLowerCase();
        const year = p2;
        return `${day}-${month}-${year}`;
      }
    }
    
    // Fallback parser
    const parsedDate = Date.parse(str);
    if (!isNaN(parsedDate)) {
      return Utilities.formatDate(new Date(parsedDate), timeZone, "dd-MMM-yyyy");
    }
    
    return str;
  }
  
  if (action === 'parseYearFromFormattedDate') {
    const dateStr = value;
    if (!dateStr) return null;
    
    if (dateStr instanceof Date) {
      return dateStr.getFullYear();
    }
    
    const str = dateStr.toString().trim();
    const parts = str.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[2], 10);
      if (!isNaN(year)) {
        return year;
      }
    }
    const parsedDate = Date.parse(str);
    if (!isNaN(parsedDate)) {
      return new Date(parsedDate).getFullYear();
    }
    return null;
  }
  
  if (action === 'isBirthdayColumn') {
    const headerName = value;
    if (!headerName) return false;
    const name = headerName.toString().trim().toLowerCase();
    return name.includes('birthday') || 
           name.includes('birth') || 
           name.includes('dob');
  }
  
  if (action === 'parseTimestampToDate') {
    const val = value;
    if (!val) return new Date(0);
    if (val instanceof Date) return val;
    
    const str = val.toString().trim();
    
    // Match DD/MM/YYYY HH:mm:ss or DD-MM-YYYY HH:mm:ss
    const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM))?)?$/i);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 0-based month
      const year = parseInt(match[3], 10);
      
      let hours = match[4] ? parseInt(match[4], 10) : 0;
      const minutes = match[5] ? parseInt(match[5], 10) : 0;
      const seconds = match[6] ? parseInt(match[6], 10) : 0;
      
      const ampm = match[7];
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hours < 12) {
          hours += 12;
        } else if (ampm.toUpperCase() === 'AM' && hours === 12) {
          hours = 0;
        }
      }
      
      return new Date(year, month, day, hours, minutes, seconds);
    }
    
    const parsed = Date.parse(str);
    return isNaN(parsed) ? new Date(0) : new Date(parsed);
  }
  
  return null;
}


