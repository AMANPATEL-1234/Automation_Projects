function active_inactive_Column() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Part 1: Ensure local 'Status' column exists & is populated
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
  
  const lastRow = sourceSheet.getLastRow();
  const lastCol = sourceSheet.getLastColumn();
  
  if (lastRow === 0 || lastCol === 0) {
    Logger.log("Info: Sheet is empty. Nothing to initialize.");
    return;
  }
  
  const headers = sourceSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let statusColIndex = -1;
  
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].toString().trim().toLowerCase() === 'status') {
      statusColIndex = i + 1; // 1-based index
      break;
    }
  }
  
  if (statusColIndex === -1) {
    // Column does not exist, create it at the end
    const newColIndex = lastCol + 1;
    statusColIndex = newColIndex; // update index for part 2
    
    // Copy format from the adjacent column (lastCol)
    sourceSheet.getRange(1, lastCol, lastRow, 1).copyTo(
      sourceSheet.getRange(1, newColIndex, lastRow, 1),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );
    
    // Set the header text
    sourceSheet.getRange(1, newColIndex).setValue("Status");
    
    if (lastRow > 1) {
      const activeValues = [];
      for (let r = 2; r <= lastRow; r++) {
        activeValues.push(["Active"]);
      }
      sourceSheet.getRange(2, newColIndex, activeValues.length, 1).setValues(activeValues);
      Logger.log(`Successfully created 'Status' column at Column ${newColIndex} with matched styling, and initialized ${activeValues.length} rows to 'Active'.`);
    } else {
      Logger.log(`Successfully created 'Status' column at Column ${newColIndex} with matched styling and no data rows.`);
    }
  } else {
    // Column already exists, check for empty rows and fill them with "Active"
    if (lastRow > 1) {
      const statusRange = sourceSheet.getRange(2, statusColIndex, lastRow - 1, 1);
      const values = statusRange.getValues();
      let updatedCount = 0;
      
      for (let i = 0; i < values.length; i++) {
        if (values[i][0].toString().trim() === "") {
          values[i][0] = "Active";
          updatedCount++;
        }
      }
      
      if (updatedCount > 0) {
        statusRange.setValues(values);
        Logger.log(`'Status' column already exists. Filled ${updatedCount} empty cells with 'Active'.`);
      } else {
        Logger.log("'Status' column already exists and all rows are populated.");
      }
    }
  }
  
  // ---------------------------------------------------------
  // Part 2: Fetch exit employees from external link and deactivate
  const prop = PropertiesService.getScriptProperties().getProperty('EXIT_SHEET_URL');
  if (!prop) {
    Logger.log("Info: Script property 'EXIT_SHEET_URL' or 'EXIT_SHEET_LINK' is not configured. Skipping exit employee deactivation.");
    return;
  }
  
  const exitUrl = prop.trim();
  let exitSs = null;
  try {
    if (exitUrl.startsWith('http')) {
      exitSs = SpreadsheetApp.openByUrl(exitUrl);
    } else {
      exitSs = SpreadsheetApp.openById(exitUrl);
    }
  } catch (err) {
    Logger.log(`Error: Failed to open external exit employees spreadsheet: ${err.message}`);
    return;
  }
  
  if (!exitSs) {
    Logger.log("Error: External exit employee spreadsheet could not be opened.");
    return;
  }
  
  // Get the 'Exit Employees - Data' sheet (fallback to first sheet)
  const exitSheets = exitSs.getSheets();
  let exitSheet = null;
  for (const s of exitSheets) {
    if (s.getName().trim() === 'Exit Employees - Data') {
      exitSheet = s;
      break;
    }
  }
  if (!exitSheet) {
    exitSheet = exitSheets[0];
  }
  
  const exitData = exitSheet.getDataRange().getValues();
  const exitEmails = new Set();
  const exitEmpIds = new Set();
  
  if (exitData.length > 1) {
    const exitHeaders = exitData[0];
    let exitEmailColIndex = -1;
    let exitEmpIdColIndex = -1;
    
    for (let i = 0; i < exitHeaders.length; i++) {
      const h = exitHeaders[i].toString().trim().toLowerCase().replace(/\s+/g, ' ');
      if (h.includes('official email') || h.includes('official mail')) {
        exitEmailColIndex = i;
      }
      if (h.includes('employee id') || h.includes('intern code') || h === 'emp id' || h.includes('employee_id')) {
        exitEmpIdColIndex = i;
      }
    }
    
    if (exitEmailColIndex === -1) exitEmailColIndex = 0; // Col A
    if (exitEmpIdColIndex === -1) exitEmpIdColIndex = 1; // Col B
    
    for (let r = 1; r < exitData.length; r++) {
      const row = exitData[r];
      const email = row[exitEmailColIndex] ? row[exitEmailColIndex].toString().trim().toLowerCase() : "";
      const empId = row[exitEmpIdColIndex] ? row[exitEmpIdColIndex].toString().trim().toLowerCase() : "";
      
      if (email) exitEmails.add(email);
      if (empId) exitEmpIds.add(empId);
    }
    Logger.log(`Loaded ${exitEmails.size} exit emails and ${exitEmpIds.size} exit employee IDs from external sheet.`);
  } else {
    Logger.log("Info: External exit employee sheet is empty or contains only headers. Proceeding with empty exit lists.");
  }
  
  // Load local values to match against
  const localData = sourceSheet.getDataRange().getValues();
  const localHeaders = localData[0];
  let localEmailColIndex = -1;
  let localEmpIdColIndex = -1;
  let localNameColIndex = -1;
  
  for (let i = 0; i < localHeaders.length; i++) {
    const h = localHeaders[i].toString().trim().toLowerCase().replace(/\s+/g, ' ');
    if (h.includes('name')) {
      localNameColIndex = i;
    }
    if (h.includes('official email') || h.includes('official mail')) {
      localEmailColIndex = i;
    }
    if (h.includes('employee id') || h.includes('intern code') || h === 'emp id' || h.includes('employee_id')) {
      localEmpIdColIndex = i;
    }
  }
  
  if (localEmailColIndex === -1 || localEmpIdColIndex === -1) {
    Logger.log("Error: Could not locate columns for Email or Employee ID in local sheet.");
    return;
  }
  
  const deactivatedEmployees = [];
  const deactivatedKeys = new Set();
  let updatedCount = 0;
  
  for (let r = 1; r < localData.length; r++) {
    const row = localData[r];
    const email = row[localEmailColIndex] ? row[localEmailColIndex].toString().trim().toLowerCase() : "";
    const empId = row[localEmpIdColIndex] ? row[localEmpIdColIndex].toString().trim().toLowerCase() : "";
    const statusVal = row[statusColIndex - 1] ? row[statusColIndex - 1].toString().trim() : "";
    
    const matchesEmail = email && exitEmails.has(email);
    const matchesEmpId = empId && exitEmpIds.has(empId);
    
    let currentStatus = statusVal;
    if (matchesEmail || matchesEmpId) {
      if (statusVal.toLowerCase() !== 'inactive') {
        // Update status in sheet to InActive
        sourceSheet.getRange(r + 1, statusColIndex).setValue("InActive");
        updatedCount++;
        currentStatus = "InActive";
        
        const name = localNameColIndex !== -1 && row[localNameColIndex] ? row[localNameColIndex].toString().trim() : "Unknown";
        const cleanEmail = row[localEmailColIndex] ? row[localEmailColIndex].toString().trim() : "";
        const cleanEmpId = row[localEmpIdColIndex] ? row[localEmpIdColIndex].toString().trim() : "";
        Logger.log(`Deactivated employee: ${name} (Email: ${cleanEmail}, ID: ${cleanEmpId})`);
      }
    } else {
      if (statusVal.toLowerCase() === 'inactive') {
        // Revert status in sheet to Active
        sourceSheet.getRange(r + 1, statusColIndex).setValue("Active");
        currentStatus = "Active";
        
        const name = localNameColIndex !== -1 && row[localNameColIndex] ? row[localNameColIndex].toString().trim() : "Unknown";
        const cleanEmail = row[localEmailColIndex] ? row[localEmailColIndex].toString().trim() : "";
        const cleanEmpId = row[localEmpIdColIndex] ? row[localEmpIdColIndex].toString().trim() : "";
        Logger.log(`Re-activated employee: ${name} (Email: ${cleanEmail}, ID: ${cleanEmpId})`);
      }
    }
    
    // Check if employee is currently inactive (newly or previously marked)
    if (currentStatus.toLowerCase() === 'inactive') {
      const name = localNameColIndex !== -1 && row[localNameColIndex] ? row[localNameColIndex].toString().trim() : "Unknown";
      const cleanEmail = row[localEmailColIndex] ? row[localEmailColIndex].toString().trim() : "";
      const cleanEmpId = row[localEmpIdColIndex] ? row[localEmpIdColIndex].toString().trim() : "";
      
      // Group key to ensure uniqueness (prioritize email for grouping)
      const uniqueKey = cleanEmail ? cleanEmail.toLowerCase() : (cleanEmpId ? cleanEmpId.toLowerCase() : "");
      if (uniqueKey) {
        if (!deactivatedKeys.has(uniqueKey)) {
          deactivatedKeys.add(uniqueKey);
          deactivatedEmployees.push({ name, email: cleanEmail, empId: cleanEmpId });
        } else if (cleanEmpId) {
          // If already added, but the existing entry has an empty ID, populate it
          const existing = deactivatedEmployees.find(emp => 
            (cleanEmail && emp.email.toLowerCase() === cleanEmail.toLowerCase()) || 
            (cleanEmpId && emp.empId.toLowerCase() === cleanEmpId.toLowerCase())
          );
          if (existing) {
            if (!existing.empId) {
              existing.empId = cleanEmpId;
            }
            if (name && name !== "Unknown" && (!existing.name || existing.name === "Unknown")) {
              existing.name = name;
            }
          }
        }
      }
    }
  }
  
  if (updatedCount > 0) {
    Logger.log(`Successfully updated status to 'InActive' for ${updatedCount} exit employees.`);
  } else {
    Logger.log("No new exit employees needed status updates to 'InActive'.");
  }
  
  // Send email alert for all unique inactive employees found
  if (deactivatedEmployees.length > 0) {
    const recipient = 'aman.patel@flodataanalytics.com';
    const subject = 'Employee Status InActive Alert - Birthday Sheet';
    
    let body = 'Hello,\n\nThe following employee(s) are currently marked as InActive in the "Google Form - Raw Data" sheet:\n\n';
    deactivatedEmployees.forEach(emp => {
      body += `- Name: ${emp.name}, Employee ID: ${emp.empId}, Email: ${emp.email}\n`;
    });
    body += '\nRegards,\nBirthday Wishes System';
    
    try {
      MailApp.sendEmail(recipient, subject, body);
      Logger.log(`Deactivation alert email sent to ${recipient} containing ${deactivatedEmployees.length} unique inactive employees.`);
    } catch (e) {
      Logger.log(`Failed to send deactivation alert email: ${e.toString()}`);
    }
  } else {
    Logger.log("Info: No inactive employees found in local sheet. No email sent.");
  }
}
