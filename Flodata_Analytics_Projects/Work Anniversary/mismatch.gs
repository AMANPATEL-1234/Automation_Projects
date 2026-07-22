function deactivateExitEmployees() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const localSheetName = 'Employees Work Anniversary - FloData Analytics';
  const localSheet = ss.getSheetByName(localSheetName);
  
  if (!localSheet) {
    Logger.log("Error: Local sheet '" + localSheetName + "' not found.");
    return;
  }
  
  // Retrieve the external spreadsheet link from Script Properties
  const props = PropertiesService.getScriptProperties();
  const extUrl = props.getProperty('EXIT_SHEET_URL');
  const spaceIdProp = props.getProperty('SPACE_ID');
  const spaceName = spaceIdProp ? (spaceIdProp.trim().startsWith('spaces/') ? spaceIdProp.trim() : 'spaces/' + spaceIdProp.trim()) : '';
  
  if (!extUrl) {
    Logger.log("Error: External exit spreadsheet URL/link is not configured in Script Properties.");
    return;
  }
  
  // Open the external spreadsheet and locate the 'Exit Employees - Data' sheet
  let extSs;
  try {
    extSs = SpreadsheetApp.openByUrl(extUrl.trim());
  } catch (e) {
    Logger.log("Error: Failed to open external spreadsheet: " + e.toString());
    return;
  }
  
  let extSheet = null;
  const sheets = extSs.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sName = sheets[i].getName().trim().toLowerCase();
    if (sName === 'exit employees - data' || sName.includes('exit employees') || sName.includes('exit')) {
      extSheet = sheets[i];
      break;
    }
  }
  
  if (!extSheet && sheets.length > 0) {
    extSheet = sheets[0];
  }
  
  if (!extSheet) {
    Logger.log("Error: No sheets found in the external exit spreadsheet.");
    return;
  }
  
  const extData = extSheet.getDataRange().getValues();
  
  // Store matching exit composite keys (Employee ID + "|" + Official Email) in lower case
  const exitKeys = new Set();
  
  if (extData.length <= 1) {
    Logger.log("Info: No exit employee records found (only headers or empty sheet).");
  } else {
    // Locate columns in the external sheet dynamically (case-insensitive)
    const extHeaders = extData[0];
    let extEmpIdCol = -1;
    let extEmailCol = -1;
    
    for (let i = 0; i < extHeaders.length; i++) {
      const h = extHeaders[i].toString().trim().toLowerCase();
      if (h.includes('employee id') || h.includes('intern code') || h.includes('emp id')) {
        extEmpIdCol = i;
      }
      if (h.includes('mail') || h.includes('email')) {
        extEmailCol = i;
      }
    }
    
    if (extEmpIdCol === -1 || extEmailCol === -1) {
      Logger.log("Error: Could not locate Employee ID or Email columns in the external exit sheet.");
      return;
    }
    
    for (let r = 1; r < extData.length; r++) {
      const row = extData[r];
      const empId = row[extEmpIdCol] ? row[extEmpIdCol].toString().trim().toLowerCase() : "";
      const email = row[extEmailCol] ? row[extEmailCol].toString().trim().toLowerCase() : "";
      if (empId && email) {
        exitKeys.add(empId + "|" + email);
      }
    }
  }
  
  // Read local sheet data
  const localData = localSheet.getDataRange().getValues();
  if (localData.length <= 1) {
    Logger.log("Info: No local employee records found.");
    return;
  }
  
  const localHeaders = localData[0];
  let localEmpIdCol = -1;
  let localEmailCol = -1;
  let localStatusCol = -1;
  
  for (let i = 0; i < localHeaders.length; i++) {
    const h = localHeaders[i].toString().trim().toLowerCase();
    if (h.includes('employee id') || h.includes('intern code') || h.includes('emp id')) {
      localEmpIdCol = i;
    }
    if (h.includes('mail') || h.includes('email')) {
      localEmailCol = i;
    }
    if (h === 'status') {
      localStatusCol = i;
    }
  }
  
  if (localEmpIdCol === -1 || localEmailCol === -1 || localStatusCol === -1) {
    Logger.log("Error: Could not locate Employee ID, Email, or Status columns in the local sheet.");
    return;
  }
  
  // Scans local rows and maps statuses + backgrounds, checking for email mismatches in Google Chat
  const statusValues = [];
  const backgroundValues = [];
  const mismatches = [];
  const inactiveEmployees = [];
  
  for (let r = 1; r < localData.length; r++) {
    const row = localData[r];
    const rawLocalEmpId = row[localEmpIdCol] ? row[localEmpIdCol].toString().trim() : "";
    const rawLocalEmail = row[localEmailCol] ? row[localEmailCol].toString().trim() : "";
    
    const localEmpId = rawLocalEmpId.toLowerCase();
    const localEmail = rawLocalEmail.toLowerCase();
    
    const key = localEmpId + "|" + localEmail;
    const isExit = key && exitKeys.has(key);
    
    let currentStatus = 'Active';
    if (isExit) {
      currentStatus = 'InActive';
      statusValues.push(['InActive']);
      backgroundValues.push(new Array(localHeaders.length).fill('#FFB3B3'));
      inactiveEmployees.push({ empId: rawLocalEmpId, email: rawLocalEmail });
    } else {
      statusValues.push(['Active']);
      backgroundValues.push(new Array(localHeaders.length).fill('')); // Reset background color
    }
    
    if (currentStatus === 'Active') {
      let isMember = false;
      const isValidEmail = localEmail && localEmail.includes('@') && localEmail.lastIndexOf('.') > localEmail.indexOf('@');
      
      if (isValidEmail && spaceName) {
        try {
          const memberName = spaceName + "/members/" + localEmail;
          const membership = Chat.Spaces.Members.get(memberName);
          if (membership && membership.member && membership.member.name) {
            isMember = true;
          }
        } catch (err) {
          // not a member
        }
      }
      
      if (!isMember) {
        mismatches.push({ empId: rawLocalEmpId, email: rawLocalEmail });
      }
    }
  }
  
  // Update local sheet columns and background formatting
  if (statusValues.length > 0) {
    localSheet.getRange(2, localStatusCol + 1, statusValues.length, 1).setValues(statusValues);
    localSheet.getRange(2, 1, backgroundValues.length, localHeaders.length).setBackgrounds(backgroundValues);
    Logger.log("Successfully synchronized exit employee statuses and row color highlights.");
  }
  
  // Send email if any active employee email address does not match a space member
  if (mismatches.length > 0) {
    const recipient = 'himanshi.chauhan@flodataanalytics.com';
    const subject = 'Mismatch EmailID - Work Anniversary';
    
    let body = 'Hello,\n\nThe system detected employee email addresses in the Work Anniversary sheet that are missing or do not match the members of the Google Chat Space:\n\n';
    mismatches.forEach(item => {
      body += `Employee ID: ${item.empId || 'N/A'}, Official Email: ${item.email || 'N/A'}\n`;
    });
    body += '\nRegards,\nWork Anniversary Wishes System';
    
    try {
      MailApp.sendEmail(recipient, subject, body);
      Logger.log(`Email space mismatch alert sent to ${recipient} containing ${mismatches.length} entries.`);
    } catch (e) {
      Logger.log("Failed to send space email mismatch notification: " + e.toString());
    }
  }
  
  // Send email if any employee is InActive in the sheet
  if (inactiveEmployees.length > 0) {
    const recipient = 'aman.patel@flodataanalytics.com';
    const subject = 'InActive Employees - Work Anniversary';
    
    let body = 'Hello,\n\nThe system detected employee(s) who are InActive in the Work Anniversary sheet:\n\n';
    inactiveEmployees.forEach(item => {
      body += `Employee ID: ${item.empId || 'N/A'}, Official Email: ${item.email || 'N/A'}\n`;
    });
    body += '\nRegards,\nWork Anniversary Wishes System';
    
    try {
      MailApp.sendEmail(recipient, subject, body);
      Logger.log(`InActive employees alert sent to ${recipient} containing ${inactiveEmployees.length} entries.`);
    } catch (e) {
      Logger.log("Failed to send inactive email notification: " + e.toString());
    }
  }
}
