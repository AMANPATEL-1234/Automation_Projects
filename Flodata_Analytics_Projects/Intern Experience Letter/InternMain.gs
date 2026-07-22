/**
 * Retrieves the SHEET_URL from Script Properties, validates it, and extracts the Sheet ID.
 * @return {string} The spreadsheet ID.
 */
function getSheetId() {
  var sheetUrl = PropertiesService.getScriptProperties().getProperty('SHEET_URL');
  if (!sheetUrl) {
    throw new Error("Script Property 'SHEET_URL' is missing. Please set it in the script properties configuration.");
  }
  
  var sheetId = extractSpreadsheetId(sheetUrl);
  if (!sheetId) {
    throw new Error("Invalid 'SHEET_URL' format. Could not extract Google Spreadsheet ID.");
  }
  
  return sheetId;
}

/**
 * Extracts spreadsheet ID from a Google Sheet URL or ID string.
 * @param {string} urlOrId The URL or ID of the Google Sheet.
 * @return {string|null} The extracted ID, or null if invalid.
 */
function extractSpreadsheetId(urlOrId) {
  if (!urlOrId) return null;
  
  // Match standard Google Spreadsheet URL pattern
  var match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  
  // If it's already a clean ID string (no slashes, long enough)
  var trimmed = urlOrId.trim();
  if (trimmed.length >= 25 && !trimmed.includes('/')) {
    return trimmed;
  }
  
  return null;
}

/**
 * DocumentService.gs
 * Handles document creation, layout cloning, placeholder verification, and text replacement.
 */

/**
 * Duplicates the specified template tab, renames it, and populates the placeholders.
 * @return {object} Object containing the generated document title and URL.
 */
function duplicateTemplateAndFill(entity, name, doj, dateOfEnding, designation, department, sendingDate, authority) {
  var doc = DocumentApp.getActiveDocument();
  
  // 1. Locate the source template tab
  var sourceTab = null;
  var tabs = doc.getTabs();
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].getTitle() === entity) {
      sourceTab = tabs[i];
      break;
    }
  }
  
  if (!sourceTab) {
    throw new Error("Template tab '" + entity + "' was not found in the Google Doc.");
  }
  
  var sourceDocTab = sourceTab.asDocumentTab();
  var sourceBody = sourceDocTab.getBody();
  var sourceHeader = sourceDocTab.getHeader();
  var sourceFooter = sourceDocTab.getFooter();
  
  // 2. Validate core placeholders in source tab before copying
  var sourceText = sourceBody.getText();
  if (sourceHeader) {
    sourceText += "\n" + sourceHeader.getText();
  }
  if (sourceFooter) {
    sourceText += "\n" + sourceFooter.getText();
  }
  
  // Validate that all 7 required placeholders exist in the source template tab (resilient to spaces inside brackets)
  var requiredPlaceholders = [
    { key: '{{Employee Name}}', pattern: /\{\{\s*Employee Name\s*\}\}/ },
    { key: '{{Start Date}}', pattern: /\{\{\s*Start Date\s*\}\}/ },
    { key: '{{End Date}}', pattern: /\{\{\s*End Date\s*\}\}/ },
    { key: '{{Designation}}', pattern: /\{\{\s*Designation\s*\}\}/ },
    { key: '{{Department}}', pattern: /\{\{\s*Department\s*\}\}/ },
    { key: '{{Date of Sending}}', pattern: /\{\{\s*Date of Sending\s*\}\}/ },
    { key: '{{Authorized Name}}', pattern: /\{\{\s*Authorized Name\s*\}\}/ }
  ];
  var missing = [];
  requiredPlaceholders.forEach(function(item) {
    if (!item.pattern.test(sourceText)) {
      missing.push(item.key);
    }
  });
  
  if (missing.length > 0) {
    throw new Error("Missing required placeholders in template tab '" + entity + "': " + missing.join(', '));
  }
  
  // 3. Check if a document with the same name already exists in Google Drive
  var newDocTitle = "Internship Completion Letter - " + name;
  var duplicateExists = false;
  try {
    var files = DriveApp.getFilesByName(newDocTitle);
    if (files.hasNext()) {
      duplicateExists = true;
    }
  } catch (e) {
    // Non-blocking catch
  }
  
  // Create a brand new standalone Google Document
  var newDoc = DocumentApp.create(newDocTitle);
  var destBody = newDoc.getBody();
  
  // 4. Duplicate content and layout from source to destination
  // Copy margins & page dimensions
  try {
    destBody.setMarginTop(sourceBody.getMarginTop());
    destBody.setMarginBottom(sourceBody.getMarginBottom());
    destBody.setMarginLeft(sourceBody.getMarginLeft());
    destBody.setMarginRight(sourceBody.getMarginRight());
    destBody.setPageHeight(sourceBody.getPageHeight());
    destBody.setPageWidth(sourceBody.getPageWidth());
  } catch (e) {
    // Non-blocking catch
  }
  
  // Copy body attributes
  try {
    destBody.setAttributes(sourceBody.getAttributes());
  } catch (e) {
    // Non-blocking catch
  }
  
  // Copy header (if exists)
  if (sourceHeader) {
    var destHeader = newDoc.addHeader();
    var numChildren = sourceHeader.getNumChildren();
    for (var i = 0; i < numChildren; i++) {
      var child = sourceHeader.getChild(i).copy();
      var type = child.getType();
      if (type === DocumentApp.ElementType.PARAGRAPH) {
        destHeader.appendParagraph(child);
      } else if (type === DocumentApp.ElementType.TABLE) {
        destHeader.appendTable(child);
      } else if (type === DocumentApp.ElementType.LIST_ITEM) {
        destHeader.appendListItem(child);
      }
    }
    // Remove default empty paragraph in newly created header
    if (destHeader.getNumChildren() > numChildren) {
      var firstChild = destHeader.getChild(0);
      if (firstChild.getType() === DocumentApp.ElementType.PARAGRAPH && firstChild.asParagraph().getText() === "") {
        destHeader.removeChild(firstChild);
      }
    }
  }
  
  // Copy footer (if exists)
  if (sourceFooter) {
    var destFooter = newDoc.addFooter();
    var numChildren = sourceFooter.getNumChildren();
    for (var i = 0; i < numChildren; i++) {
      var child = sourceFooter.getChild(i).copy();
      var type = child.getType();
      if (type === DocumentApp.ElementType.PARAGRAPH) {
        destFooter.appendParagraph(child);
      } else if (type === DocumentApp.ElementType.TABLE) {
        destFooter.appendTable(child);
      } else if (type === DocumentApp.ElementType.LIST_ITEM) {
        destFooter.appendListItem(child);
      }
    }
    // Remove default empty paragraph in newly created footer
    if (destFooter.getNumChildren() > numChildren) {
      var firstChild = destFooter.getChild(0);
      if (firstChild.getType() === DocumentApp.ElementType.PARAGRAPH && firstChild.asParagraph().getText() === "") {
        destFooter.removeChild(firstChild);
      }
    }
  }
  
  // Copy body elements
  var numBodyChildren = sourceBody.getNumChildren();
  for (var i = 0; i < numBodyChildren; i++) {
    var child = sourceBody.getChild(i).copy();
    var type = child.getType();
    if (type === DocumentApp.ElementType.PARAGRAPH) {
      destBody.appendParagraph(child);
    } else if (type === DocumentApp.ElementType.TABLE) {
      destBody.appendTable(child);
    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      destBody.appendListItem(child);
    } else if (type === DocumentApp.ElementType.PAGE_BREAK) {
      destBody.appendPageBreak();
    }
  }
  
  // Remove default empty paragraph in newly created body
  if (destBody.getNumChildren() > numBodyChildren) {
    var firstChild = destBody.getChild(0);
    if (firstChild.getType() === DocumentApp.ElementType.PARAGRAPH && firstChild.asParagraph().getText() === "") {
      destBody.removeChild(firstChild);
    }
  }
  
  // 5. Format dates
  var formattedDoj = formatDateValue(doj);
  var formattedEndDate = formatDateValue(dateOfEnding);
  var formattedSendingDate = formatDateWithSuffix(sendingDate);
  
  // 6. Perform placeholder replacements
  var replacements = [
    { pattern: '\\{\\{\\s*Employee Name\\s*\\}\\}', value: name },
    { pattern: '\\{\\{\\s*Start Date\\s*\\}\\}', value: formattedDoj },
    { pattern: '\\{\\{\\s*End Date\\s*\\}\\}', value: formattedEndDate },
    { pattern: '\\{\\{\\s*Designation\\s*\\}\\}', value: designation },
    { pattern: '\\{\\{\\s*Department\\s*\\}\\}', value: department },
    { pattern: '\\{\\{\\s*Date of Sending\\s*\\}\\}', value: formattedSendingDate },
    { pattern: '\\{\\{\\s*Authorized Name\\s*\\}\\}', value: authority }
  ];
  
  var destHeaderObj = newDoc.getHeader();
  var destFooterObj = newDoc.getFooter();
  
  replacements.forEach(function(item) {
    destBody.replaceText(item.pattern, item.value);
    if (destHeaderObj) destHeaderObj.replaceText(item.pattern, item.value);
    if (destFooterObj) destFooterObj.replaceText(item.pattern, item.value);
  });
  
  // Save and close the new document to commit changes
  newDoc.saveAndClose();
  
  return {
    title: newDocTitle,
    url: newDoc.getUrl(),
    duplicateExists: duplicateExists
  };
}

/**
 * Formats a given Date cell value into "dd MMMM yyyy" format.
 * Falls back to string representation if parsing fails.
 */
function formatDateValue(dateVal) {
  if (!dateVal) return '';
  var date = new Date(dateVal);
  if (isNaN(date.getTime())) {
    return dateVal.toString().trim();
  }
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd MMMM yyyy');
}

/**
 * Formats a YYYY-MM-DD date string into "dd{suffix} MMMM yyyy" (e.g. 14th July 2026).
 */
function formatDateWithSuffix(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  var year = parseInt(parts[0], 10);
  var monthIdx = parseInt(parts[1], 10) - 1;
  var day = parseInt(parts[2], 10);
  
  var date = new Date(year, monthIdx, day);
  if (isNaN(date.getTime())) return dateStr;
  
  var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var month = months[monthIdx];
  
  var suffix = "th";
  if (day < 11 || day > 13) {
    switch (day % 10) {
      case 1: suffix = "st"; break;
      case 2: suffix = "nd"; break;
      case 3: suffix = "rd"; break;
    }
  }
  
  return day + suffix + " " + month + " " + year;
}

/**
 * Main.gs
 * Handles user interactions, fetches intern data from Google Sheet, and triggers letter generation.
 */

/**
 * Opens the FillDetails dialog form modal.
 * Forces a fresh empty state on every open.
 */
function openFillDetailsDialog() {
  var ui = DocumentApp.getUi();
  
  // Calculate today's date in YYYY-MM-DD format as the default date
  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, '0');
  var dd = String(today.getDate()).padStart(2, '0');
  var todayStr = yyyy + '-' + mm + '-' + dd;
  
  // Set up the HTML template using fresh empty/default values (no persistence pre-population on load)
  var template = HtmlService.createTemplateFromFile('InternDialog');
  template.internCode = '';
  template.defaultDate = todayStr;
  template.authority = '';
  
  var htmlOutput = template.evaluate()
      .setWidth(400)
      .setHeight(320)
      .setTitle('Fill Details');
      
  ui.showModalDialog(htmlOutput, 'Fill Details');
}

/**
 * Saves input details from the dialog form into script User Properties.
 * This is called from the HTML client-side script in Dialog.html.
 */
function saveDetails(internCode, sendingDate, authority) {
  var props = PropertiesService.getUserProperties();
  props.setProperty('INTERN_CODE', internCode.trim());
  props.setProperty('SENDING_DATE', sendingDate.trim());
  props.setProperty('AUTHORITY', authority.trim());
}

/**
 * Main entry point for generating the letter using the saved details.
 */
function promptAndGenerateLetter() {
  var ui = DocumentApp.getUi();
  
  try {
    // 1. Retrieve stored details from User Properties (defaulting to empty strings for strict checking)
    var props = PropertiesService.getUserProperties();
    var internCode = (props.getProperty('INTERN_CODE') || '').trim();
    var sendingDate = (props.getProperty('SENDING_DATE') || '').trim();
    var authority = (props.getProperty('AUTHORITY') || '').trim();
    
    var missingFields = [];
    if (internCode === '') missingFields.push("Intern Code is missing.");
    if (sendingDate === '') missingFields.push("Date of Sending is missing.");
    if (authority === '') missingFields.push("Authorized Name is missing.");
    
    // If the critical Intern Code is missing, we cannot lookup the spreadsheet. Stop and present missing fields.
    if (internCode === '') {
      throw new Error("Missing required values:\n- " + missingFields.join('\n- '));
    }
    
    // 2. Retrieve spreadsheet details
    var sheetId = getSheetId();
    var ss;
    try {
      ss = SpreadsheetApp.openById(sheetId);
    } catch (e) {
      throw new Error("Could not access the Google Sheet. Please check the SHEET_URL property and confirm share permissions.");
    }
    
    var sheet = ss.getSheets()[0];
    if (!sheet) {
      throw new Error("The spreadsheet does not contain any tabs.");
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      throw new Error("The Google Sheet is empty or only contains headers.");
    }
    
    // 3. Parse headers and column mapping dynamically
    var lastColumn = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    var colMap = {};
    for (var i = 0; i < headers.length; i++) {
      var colName = headers[i].toString().trim().toLowerCase();
      colMap[colName] = i;
    }
    
    // Validate required headers exist
    var requiredCols = ['entity', 'name', 'doj', 'date of ending', 'designation', 'department', 'intern code'];
    var missingCols = [];
    requiredCols.forEach(function(col) {
      if (colMap[col] === undefined) {
        missingCols.push(col);
      }
    });
    
    if (missingCols.length > 0) {
      throw new Error("Missing required columns in Google Sheet: " + missingCols.join(', '));
    }
    
    // 4. Retrieve sheet data and match code
    var data = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
    var matchRow = null;
    for (var r = 0; r < data.length; r++) {
      var codeVal = data[r][colMap['intern code']];
      if (codeVal && codeVal.toString().trim() === internCode) {
        matchRow = data[r];
        break;
      }
    }
    
    if (!matchRow) {
      throw new Error("Intern Code '" + internCode + "' not found in the Google Sheet.");
    }
    
    // 5. Read values, validate non-emptiness, and accumulate missing fields
    var entity = matchRow[colMap['entity']] ? matchRow[colMap['entity']].toString().trim() : '';
    var name = matchRow[colMap['name']] ? matchRow[colMap['name']].toString().trim() : '';
    var doj = matchRow[colMap['doj']];
    var dateOfEnding = matchRow[colMap['date of ending']];
    var designation = matchRow[colMap['designation']] ? matchRow[colMap['designation']].toString().trim() : '';
    var department = matchRow[colMap['department']] ? matchRow[colMap['department']].toString().trim() : '';
    
    // Perform thorough check for missing fields
    if (sendingDate === '') missingFields.push("Date of Sending is missing.");
    if (authority === '') missingFields.push("Authorized Name is missing.");
    if (name === '') missingFields.push("Employee Name is missing.");
    if (!doj || doj.toString().trim() === '') missingFields.push("Start Date is missing.");
    if (!dateOfEnding || dateOfEnding.toString().trim() === '') missingFields.push("End Date is missing.");
    if (designation === '') missingFields.push("Designation is missing.");
    if (department === '') missingFields.push("Department is missing.");
    
    // Stop execution and throw error with all missing fields
    if (missingFields.length > 0) {
      throw new Error("Missing required values:\n- " + missingFields.join('\n- '));
    }
    
    // 6. Validate internship dates (DOJ must never be greater than Date of Ending)
    var startDateObj = new Date(doj);
    var endDateObj = new Date(dateOfEnding);
    if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
      if (startDateObj.getTime() > endDateObj.getTime()) {
        throw new Error("Invalid internship duration. Start Date cannot be later than End Date.");
      }
    }
    
    // 7. Validate entity logic
    if (entity !== 'FAPL' && entity !== 'FA') {
      throw new Error("Unsupported Entity: '" + entity + "'. Only 'FAPL' and 'FA' templates are supported.");
    }
    
    // 7. Duplicate tab and replace placeholders
    var result = duplicateTemplateAndFill(entity, name, doj, dateOfEnding, designation, department, sendingDate, authority);
    
    // Show modal dialog to open the newly generated standalone document, passing duplicate status
    showCompletionDialog(name, result.url, result.duplicateExists);
    
  } catch (err) {
    ui.alert('Error', err.message, ui.ButtonSet.OK);
  }
}

/**
 * Renders and opens the success dialog containing a link to the generated document.
 */
function showCompletionDialog(name, docUrl, duplicateExists) {
  var template = HtmlService.createTemplateFromFile('InternDialog');
  template.name = name;
  template.docUrl = docUrl;
  template.duplicateExists = duplicateExists;
  
  var height = duplicateExists ? 250 : 170;
  var htmlOutput = template.evaluate()
      .setWidth(420)
      .setHeight(height)
      .setTitle('Document Generated');
      
  DocumentApp.getUi().showModalDialog(htmlOutput, 'Document Generated');
}
