/**
 * EmployeeConfig.gs
 * Handles configuration settings and loading credentials from Script Properties.
 */

// Global namespace or prefix to keep employee automation isolated
var EmployeeConfig = {
  /**
   * Retrieves a Script Property value.
   * @param {string} key The script property key.
   * @return {string} The property value.
   */
  getProperty: function(key) {
    var val = PropertiesService.getScriptProperties().getProperty(key);
    if (!val) {
      throw new Error("Missing Script Property: '" + key + "'. Please configure it in Project Settings.");
    }
    return val.trim();
  },
  
  /**
   * Gets OAuth credentials required for Zoho People authentication.
   * @return {object} Credentials object containing client_id, client_secret, and refresh_token.
   */
  getCredentials: function() {
    return {
      clientId: this.getProperty('CLIENT_ID'),
      clientSecret: this.getProperty('CLIENT_SECRET'),
      refreshToken: this.getProperty('REFRESH_TOKEN')
    };
  }
};

/**
 * EmployeeAuth.gs
 * Handles Zoho OAuth 2.0 authentication using Refresh Token flow.
 */

var EmployeeAuth = {
  // Supported Zoho regional account domains
  ZOHO_DOMAINS: [
    'https://accounts.zoho.in',     // India
  ],

  /**
   * Generates a new Zoho OAuth Access Token dynamically.
   * Cycles through domains to automatically match the correct Zoho region datacenter.
   * @return {object} Object containing accessToken and resolved peopleDomain.
   */
  getAccessToken: function() {
    var creds = EmployeeConfig.getCredentials();
    var lastError = null;

    for (var i = 0; i < this.ZOHO_DOMAINS.length; i++) {
      var accountsDomain = this.ZOHO_DOMAINS[i];
      var url = accountsDomain + '/oauth/v2/token';
      
      var payload = {
        'grant_type': 'refresh_token',
        'client_id': creds.clientId,
        'client_secret': creds.clientSecret,
        'refresh_token': creds.refreshToken
      };

      var options = {
        'method': 'post',
        'contentType': 'application/x-www-form-urlencoded',
        'payload': payload,
        'muteHttpExceptions': true
      };

      try {
        var response = UrlFetchApp.fetch(url, options);
        var responseCode = response.getResponseCode();
        var responseText = response.getContentText();
        
        if (responseCode === 200) {
          var json = JSON.parse(responseText);
          if (json.access_token) {
            // Map the accounts domain to the people API domain
            // e.g. https://accounts.zoho.in -> https://people.zoho.in
            var peopleDomain = accountsDomain.replace('accounts', 'people');
            
            Logger.log("Successfully authenticated via Zoho OAuth domain: " + accountsDomain);
            return {
              accessToken: json.access_token,
              peopleDomain: peopleDomain
            };
          } else {
            lastError = "Response missing access_token: " + responseText;
          }
        } else {
          var errJson = JSON.parse(responseText);
          lastError = "HTTP " + responseCode + " (" + (errJson.error || responseText) + ")";
        }
      } catch (e) {
        lastError = e.message;
      }
    }

    throw new Error("Failed to refresh Zoho OAuth token. Verify your Client ID, Client Secret, and Refresh Token. Last error: " + lastError);
  }
};

/**
 * EmployeeAPI.gs
 * Handles fetching, pagination, parsing, and extraction of records from Zoho People.
 */

var EmployeeAPI = {
  /**
   * Fetches all employee records (both active and inactive) from Zoho People.
   * @param {string} peopleDomain The Zoho People regional domain URL.
   * @param {string} accessToken The Zoho OAuth access token.
   * @return {array} Array of extracted employee objects.
   */
  fetchAllEmployees: function(peopleDomain, accessToken) {
    // Fetch all employee records where Employeestatus is not empty (retrieves all statuses: Active, Resigned, Terminated, Deceased, etc.)
    var allRawRecords = this.fetchRecords(peopleDomain, accessToken);
    Logger.log("Fetched total raw employee records: " + allRawRecords.length);
    
    if (allRawRecords.length > 0) {
      Logger.log("DEBUG - FIRST RAW ZOHO RECORD: " + JSON.stringify(allRawRecords[0]));
    }

    // Parse and extract the target fields
    var employees = [];
    var self = this;
    allRawRecords.forEach(function(rec) {
      try {
        var empDetails = self.extractEmployeeDetails(rec);
        employees.push(empDetails);
      } catch (err) {
        Logger.log("Error parsing record: " + err.message + ". Record content: " + JSON.stringify(rec));
      }
    });

    return employees;
  },

  /**
   * Helper to perform a paginated API fetch from Zoho People for all employees.
   */
  fetchRecords: function(peopleDomain, accessToken) {
    var allRecords = [];
    var sIndex = 1;
    var limit = 200;
    var hasMore = true;
    
    var url = peopleDomain + '/api/forms/employee/getRecords';
    
    while (hasMore) {
      // Query for all records where Employeestatus is not empty (includes all statuses)
      var searchParams = "{searchField:'Employeestatus',searchOperator:'Is_Not_Empty',searchText:''}";
      
      var urlWithParams = url + 
                '?sIndex=' + sIndex + 
                '&limit=' + limit + 
                '&searchParams=' + encodeURIComponent(searchParams);
      
      var options = {
        'method': 'get',
        'headers': {
          'Authorization': 'Zoho-oauthtoken ' + accessToken
        },
        'muteHttpExceptions': true
      };
      
      try {
        var response = UrlFetchApp.fetch(urlWithParams, options);
        var responseCode = response.getResponseCode();
        var responseText = response.getContentText();
        
        if (responseCode === 200) {
          var json = JSON.parse(responseText);
          
          // Verify if response contains errors
          if (json.response && json.response.errors) {
            var errMsg = json.response.errors.message || JSON.stringify(json.response.errors);
            if (errMsg.indexOf("No records found") !== -1) {
              hasMore = false;
              continue;
            }
            throw new Error("Zoho API error: " + errMsg);
          }
          
          var records = this.parseZohoRecords(json);
          if (records && records.length > 0) {
            allRecords = allRecords.concat(records);
            sIndex += limit;
            
            // If we fetched fewer than the limit, we hit the end of the records
            if (records.length < limit) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        } else {
          throw new Error("HTTP Status " + responseCode + ": " + responseText);
        }
      } catch (e) {
        Logger.log("Exception fetching employees using " + urlWithParams + ": " + e.message);
        hasMore = false;
        throw e;
      }
    }
    
    return allRecords;
  },

  /**
   * Robust parser that extracts record lists from Zoho People JSON formats.
   */
  parseZohoRecords: function(json) {
    if (!json || !json.response || !json.response.result) {
      return [];
    }
    
    var result = json.response.result;
    var records = [];
    
    if (Array.isArray(result)) {
      result.forEach(function(item) {
        if (typeof item === 'object' && item !== null) {
          var keys = Object.keys(item);
          var isNested = false;
          
          // Detect nested Zoho ID keyed array structure
          keys.forEach(function(key) {
            if (/^\d{15,22}$/.test(key) && Array.isArray(item[key])) {
              isNested = true;
            }
          });
          
          if (isNested) {
            keys.forEach(function(key) {
              var val = item[key];
              if (Array.isArray(val)) {
                val.forEach(function(rec) {
                  if (rec && typeof rec === 'object') {
                    records.push(rec);
                  }
                });
              }
            });
          } else {
            records.push(item);
          }
        }
      });
    }
    
    return records;
  },

  /**
   * Extracts clean, structured employee details from a raw record.
   */
  extractEmployeeDetails: function(record) {
    var details = {
      employeeId: '',
      employeeName: '',
      doj: '',
      endDate: '',
      designation: '',
      department: '',
      status: '',
      company: ''
    };
    
    // 1. Employee ID
    details.employeeId = this.getFieldValue(record, ['EmployeeID', 'employeeID', 'employeeId', 'Employee ID', 'EMPLOYEEID']);
    
    // 2. Employee Name
    var fullName = this.getFieldValue(record, ['Employee Name', 'Employee_Name', 'EmployeeName', 'Name']);
    if (fullName) {
      details.employeeName = fullName;
    } else {
      var firstName = this.getFieldValue(record, ['First_Name', 'First Name', 'FirstName', 'Firstname']);
      var lastName = this.getFieldValue(record, ['Last_Name', 'Last Name', 'LastName', 'Lastname']);
      details.employeeName = (firstName + ' ' + lastName).trim();
    }
    
    // 3. Start Date (DOJ)
    details.doj = this.getFieldValue(record, ['Dateofjoining', 'Date of joining', 'Date_of_joining', 'DOJ', 'DateofJoining', 'Date Of Joining']);
    
    // 4. End Date (if available)
    details.endDate = this.getFieldValue(record, ['Dateofexit', 'Date of exit', 'Date_of_exit', 'Dateofresignation', 'Date of resignation', 'last_working_day', 'Last Working Day', 'Date of Exit']);
    
    // 5. Designation (extract string or Name inside lookup object)
    var designationVal = record['Designation'] || record['designation'] || record['DESIGNATION'];
    if (designationVal) {
      if (typeof designationVal === 'object' && designationVal !== null) {
        details.designation = designationVal['name'] || designationVal['Name'] || JSON.stringify(designationVal);
      } else {
        details.designation = designationVal.toString().trim();
      }
    }
    
    // 6. Department (extract string or Name inside lookup object)
    var departmentVal = record['Department'] || record['department'] || record['DEPARTMENT'];
    if (departmentVal) {
      if (typeof departmentVal === 'object' && departmentVal !== null) {
        details.department = departmentVal['name'] || departmentVal['Name'] || JSON.stringify(departmentVal);
      } else {
        details.department = departmentVal.toString().trim();
      }
    }
    
    // 7. Status
    details.status = this.getFieldValue(record, ['Employeestatus', 'Employee_Status', 'Employee status', 'Status', 'status']);
    
    // 8. Company
    details.company = record['Entity'] || '';
    
    return details;
  },

  /**
   * Helper to resolve field keys case-insensitively with fallback mappings.
   */
  getFieldValue: function(record, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var key = candidates[i];
      if (record[key] !== undefined && record[key] !== null) {
        return record[key].toString().trim();
      }
      
      // Look case-insensitively or with spaces replaced by underscores
      var lowerKey = key.toLowerCase().replace(/\s+/g, '_');
      for (var recKey in record) {
        if (recKey.toLowerCase() === key.toLowerCase() || recKey.toLowerCase() === lowerKey) {
          return record[recKey].toString().trim();
        }
      }
    }
    return '';
  },
  
  /**
   * Fetches details for a single employee by their Employee ID from Zoho People.
   * @param {string} peopleDomain The Zoho People regional domain URL.
   * @param {string} accessToken The Zoho OAuth access token.
   * @param {string} employeeId The Employee ID (e.g. HRM78).
   * @return {object|null} Extracted employee details, or null if not found.
   */
  fetchEmployeeById: function(peopleDomain, accessToken, employeeId) {
    var url = peopleDomain + '/api/forms/employee/getRecords';
    var searchParams = "{searchField:'EmployeeID',searchOperator:'Is',searchText:'" + employeeId + "'}";
    
    var urlWithParams = url + 
              '?sIndex=1' + 
              '&limit=1' + 
              '&searchParams=' + encodeURIComponent(searchParams);
              
    var options = {
      'method': 'get',
      'headers': {
        'Authorization': 'Zoho-oauthtoken ' + accessToken
      },
      'muteHttpExceptions': true
    };
    
    try {
      var response = UrlFetchApp.fetch(urlWithParams, options);
      var responseCode = response.getResponseCode();
      var responseText = response.getContentText();
      
      if (responseCode === 200) {
        var json = JSON.parse(responseText);
        
        // Verify if response contains errors
        if (json.response && json.response.errors) {
          var errMsg = json.response.errors.message || JSON.stringify(json.response.errors);
          if (errMsg.indexOf("No records found") !== -1) {
            return null;
          }
          throw new Error("Zoho API error: " + errMsg);
        }
        
        var records = this.parseZohoRecords(json);
        if (records && records.length > 0) {
          Logger.log("DEBUG - RAW ZOHO SINGLE RECORD FOR ID: " + JSON.stringify(records[0]));
          return this.extractEmployeeDetails(records[0]);
        }
        return null;
      } else {
        throw new Error("HTTP Status " + responseCode + ": " + responseText);
      }
    } catch (e) {
      Logger.log("Exception fetching employee by ID " + employeeId + " using " + urlWithParams + ": " + e.message);
      throw e;
    }
  }
};

/**
 * EmployeeMain.gs
 */
function onOpen() {
  var ui = DocumentApp.getUi();
  
  // 1. Intern Automation menu (preserved)
  ui.createMenu('Intern Automation')
    .addItem('Fill Details', 'openFillDetailsDialog')
    .addItem('Generate Completion Letter', 'promptAndGenerateLetter')
    .addToUi();

  // 2. Employee Automation menu
  ui.createMenu('Employee Automation')
    .addItem('Employee FillDetails', 'openEmployeeFillDetailsDialog')
    .addItem('Generate Completion Letter', 'generateEmployeeCompletionLetter')
    .addToUi();
}

/**
 * Opens the Employee FillDetails dialog modal.
 */
function openEmployeeFillDetailsDialog() {
  var ui = DocumentApp.getUi();
  var props = PropertiesService.getUserProperties();
  
  // Inner helper to get today's date in YYYY-MM-DD
  function getTodayYYYYMMDD() {
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var dd = String(today.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }
  
  var template = HtmlService.createTemplateFromFile('EmployeeDialog');
  template.employeeId = '';
  template.defaultDate = getTodayYYYYMMDD();
  template.authority = '';
  template.roles = '';
  
  var htmlOutput = template.evaluate()
      .setWidth(400)
      .setHeight(360)
      .setTitle('Employee Fill Details');
      
  ui.showModalDialog(htmlOutput, 'Employee Fill Details');
}

/**
 * Saves input details from the Employee dialog form into script User Properties.
 */
function saveEmployeeDetails(employeeId, dateStr, authority, roles) {
  var props = PropertiesService.getUserProperties();
  
  // Inner helper to format YYYY-MM-DD to "14th July 2026"
  function formatEmployeeDateWithSuffix(dStr) {
    if (!dStr) return '';
    var parts = dStr.split('-');
    if (parts.length !== 3) return dStr;
    
    var year = parseInt(parts[0], 10);
    var monthIdx = parseInt(parts[1], 10) - 1;
    var day = parseInt(parts[2], 10);
    
    var date = new Date(year, monthIdx, day);
    if (isNaN(date.getTime())) return dStr;
    
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
  
  props.setProperty('EMP_ID', employeeId.trim());
  props.setProperty('EMP_SENDING_DATE_RAW', dateStr.trim());
  
  var formattedDate = formatEmployeeDateWithSuffix(dateStr.trim());
  props.setProperty('EMP_SENDING_DATE', formattedDate);
  
  props.setProperty('EMP_AUTHORITY', authority.trim());
  props.setProperty('EMP_ROLES', roles.trim());
}

/**
 * Orchestrates fetching from Zoho People by ID and generating the Completion Letter document.
 */
function generateEmployeeCompletionLetter() {
  var ui = DocumentApp.getUi();
  
  // Helper: Parses Zoho date string (e.g. "14-Jul-2026") into Date object
  function parseZohoDate(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    
    var parts = dateStr.split('-');
    if (parts.length === 3) {
      var day = parseInt(parts[0], 10);
      var monthStr = parts[1].toLowerCase();
      var year = parseInt(parts[2], 10);
      
      var months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      var monthIdx = -1;
      for (var i = 0; i < months.length; i++) {
        if (monthStr.indexOf(months[i]) === 0) {
          monthIdx = i;
          break;
        }
      }
      if (monthIdx !== -1) {
        return new Date(year, monthIdx, day);
      }
    }
    return null;
  }

  // Helper: Formats a Date cell value to "dd MMMM yyyy"
  function formatEmployeeDateValue(dateVal) {
    if (!dateVal) return '';
    var date = new Date(dateVal);
    if (isNaN(date.getTime())) {
      var parsed = parseZohoDate(dateVal.toString());
      if (parsed && !isNaN(parsed.getTime())) {
        date = parsed;
      } else {
        return dateVal.toString().trim();
      }
    }
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd MMMM yyyy');
  }

  // Helper: Clones template layout, validates placeholders, duplicates document, replaces placeholders
  function duplicateEmployeeTemplateAndFill(entityTemplate, name, doj, dateOfEnding, designation, department, sendingDate, authority, roles, employeeId, rawEntity) {
    var doc = DocumentApp.getActiveDocument();
    
    // Find source template tab
    var sourceTab = null;
    var tabs = doc.getTabs();
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getTitle() === entityTemplate) {
        sourceTab = tabs[i];
        break;
      }
    }
    
    if (!sourceTab) {
      throw new Error("Template tab '" + entityTemplate + "' was not found in the Google Doc.");
    }
    
    var sourceDocTab = sourceTab.asDocumentTab();
    var sourceBody = sourceDocTab.getBody();
    var sourceHeader = sourceDocTab.getHeader();
    var sourceFooter = sourceDocTab.getFooter();
    
    // Validate placeholders in template tab
    var sourceText = sourceBody.getText();
    if (sourceHeader) sourceText += "\n" + sourceHeader.getText();
    if (sourceFooter) sourceText += "\n" + sourceFooter.getText();
    
    var requiredPlaceholders = [
      { key: '{{Employee Name}}', pattern: /\{\{\s*Employee Name\s*\}\}/ },
      { key: '{{Employee ID}}', pattern: /\{\{\s*Employee ID\s*\}\}/ },
      { key: '{{Start Date}}', pattern: /\{\{\s*Start Date\s*\}\}/ },
      { key: '{{End Date}}', pattern: /\{\{\s*End Date\s*\}\}/ },
      { key: '{{Designation}}', pattern: /\{\{\s*Designation\s*\}\}/ },
      { key: '{{Team/Department}}', pattern: /\{\{\s*(Team\/)?Department\s*\}\}/ },
      { key: '{{Date of Sending}}', pattern: /\{\{\s*Date of Sending\s*\}\}/ },
      { key: '{{Authorized Name}}', pattern: /\{\{\s*Authorized Name\s*\}\}/ },
      { key: '{{Key Responsibility/Achievement/Contribution}}', pattern: /\{\{\s*Key Responsibility\/Achievement\/Contribution\s*\}\}/ }
    ];
    
    var missing = [];
    requiredPlaceholders.forEach(function(item) {
      if (!item.pattern.test(sourceText)) {
        missing.push(item.key);
      }
    });
    
    if (missing.length > 0) {
      throw new Error("Missing required placeholders in template tab '" + entityTemplate + "': " + missing.join(', '));
    }
    
    // Check if duplicate document already exists in Google Drive
    var newDocTitle = "Relieving-cum-Experience Letter - " + name;
    var duplicateExists = false;
    try {
      var files = DriveApp.getFilesByName(newDocTitle);
      if (files.hasNext()) {
        duplicateExists = true;
      }
    } catch (e) {}
    
    // Create new standalone document
    var newDoc = DocumentApp.create(newDocTitle);
    var destBody = newDoc.getBody();
    
    // Copy margins and layout
    try {
      destBody.setMarginTop(sourceBody.getMarginTop());
      destBody.setMarginBottom(sourceBody.getMarginBottom());
      destBody.setMarginLeft(sourceBody.getMarginLeft());
      destBody.setMarginRight(sourceBody.getMarginRight());
      destBody.setPageHeight(sourceBody.getPageHeight());
      destBody.setPageWidth(sourceBody.getPageWidth());
    } catch (e) {}
    
    try {
      destBody.setAttributes(sourceBody.getAttributes());
    } catch (e) {}
    
    // Copy Header
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
      if (destHeader.getNumChildren() > numChildren) {
        var firstChild = destHeader.getChild(0);
        if (firstChild.getType() === DocumentApp.ElementType.PARAGRAPH && firstChild.asParagraph().getText() === "") {
          destHeader.removeChild(firstChild);
        }
      }
    }
    
    // Copy Footer
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
      if (destFooter.getNumChildren() > numChildren) {
        var firstChild = destFooter.getChild(0);
        if (firstChild.getType() === DocumentApp.ElementType.PARAGRAPH && firstChild.asParagraph().getText() === "") {
          destFooter.removeChild(firstChild);
        }
      }
    }
    
    // Copy Body elements
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
    
    if (destBody.getNumChildren() > numBodyChildren) {
      var firstChild = destBody.getChild(0);
      if (firstChild.getType() === DocumentApp.ElementType.PARAGRAPH && firstChild.asParagraph().getText() === "") {
        destBody.removeChild(firstChild);
      }
    }
    
    // Format dates
    var formattedDoj = formatEmployeeDateValue(doj);
    var hasEndDate = (dateOfEnding && dateOfEnding !== 'N/A' && dateOfEnding !== '');
    var formattedEndDate = hasEndDate ? formatEmployeeDateValue(dateOfEnding) : '';
    
    // Replacements
    var replacements = [
      { pattern: '\\{\\{\\s*Employee Name\\s*\\}\\}', value: name },
      { pattern: '\\{\\{\\s*Start Date\\s*\\}\\}', value: formattedDoj },
      { pattern: '\\{\\{\\s*Designation\\s*\\}\\}', value: designation },
      { pattern: '\\{\\{\\s*Department\\s*\\}\\}', value: department },
      { pattern: '\\{\\{\\s*Team/Department\\s*\\}\\}', value: department },
      { pattern: '\\{\\{\\s*Date of Sending\\s*\\}\\}', value: sendingDate },
      { pattern: '\\{\\{\\s*Authorized Name\\s*\\}\\}', value: authority },
      { pattern: '\\{\\{\\s*Roles,\\s*Responsibilities\\s*&\\s*Contributions\\s*\\}\\}', value: roles },
      { pattern: '\\{\\{\\s*Roles,\\s*Responsibilities\\s*and\\s*Contributions\\s*\\}\\}', value: roles },
      { pattern: '\\{\\{\\s*Key Responsibility/Achievement/Contribution\\s*\\}\\}', value: roles },
      { pattern: '\\{\\{\\s*Employee ID\\s*\\}\\}', value: employeeId },
      { pattern: '\\{\\{\\s*Company\\s*\\}\\}', value: rawEntity },
      { pattern: '\\{\\{\\s*Company Name\\s*\\}\\}', value: rawEntity },
      { pattern: '\\{\\{\\s*Entity\\s*\\}\\}', value: rawEntity }
    ];
    
    if (hasEndDate) {
      replacements.push({ pattern: '\\{\\{\\s*End Date\\s*\\}\\}', value: formattedEndDate });
    }
    
    var destHeaderObj = newDoc.getHeader();
    var destFooterObj = newDoc.getFooter();
    
    replacements.forEach(function(item) {
      destBody.replaceText(item.pattern, item.value);
      if (destHeaderObj) destHeaderObj.replaceText(item.pattern, item.value);
      if (destFooterObj) destFooterObj.replaceText(item.pattern, item.value);
    });
    
    newDoc.saveAndClose();
    
    return {
      title: newDocTitle,
      url: newDoc.getUrl(),
      duplicateExists: duplicateExists
    };
  }

  // Helper: Opens success dialog
  function showEmployeeCompletionDialog(name, docUrl, duplicateExists) {
    var template = HtmlService.createTemplateFromFile('EmployeeDialog');
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

  try {
    // 1. Retrieve stored details from User Properties
    var props = PropertiesService.getUserProperties();
    var employeeId = (props.getProperty('EMP_ID') || '').trim();
    var sendingDate = (props.getProperty('EMP_SENDING_DATE') || '').trim();
    var authority = (props.getProperty('EMP_AUTHORITY') || '').trim();
    var roles = (props.getProperty('EMP_ROLES') || '').trim();
    
    var missingFields = [];
    if (employeeId === '') missingFields.push("Employee ID is missing.");
    if (sendingDate === '') missingFields.push("Date of Sending is missing.");
    if (authority === '') missingFields.push("Authorized Name is missing.");
    if (roles === '') missingFields.push("Roles, Responsibilities & Contributions is missing.");
    
    if (missingFields.length > 0) {
      throw new Error("Missing required values:\n- " + missingFields.join('\n- '));
    }
    
    // 2. Fetch employee details from Zoho People
    Logger.log("Refreshing Zoho OAuth Access Token...");
    var authInfo = EmployeeAuth.getAccessToken();
    Logger.log("Fetching details from Zoho People for Employee ID: " + employeeId);
    var emp = EmployeeAPI.fetchEmployeeById(authInfo.peopleDomain, authInfo.accessToken, employeeId);
    Logger.log("DEBUG - FETCHED EMPLOYEE OBJECT: " + JSON.stringify(emp));
    
    if (!emp) {
      throw new Error("Employee ID '" + employeeId + "' not found in Zoho People.");
    }
    
    // Validate that required fields fetched from Zoho are not empty
    var missingZohoFields = [];
    if (!emp.employeeName || emp.employeeName.trim() === '') missingZohoFields.push("Employee Name");
    if (!emp.doj || emp.doj.trim() === '') missingZohoFields.push("Start Date (DOJ)");
    if (!emp.designation || emp.designation.trim() === '') missingZohoFields.push("Designation");
    if (!emp.department || emp.department.trim() === '') missingZohoFields.push("Department");
    if (!emp.company || emp.company.trim() === '') missingZohoFields.push("Entity (Company)");
    
    if (missingZohoFields.length > 0) {
      throw new Error("Required employee details are missing in Zoho for this Employee ID:\n- " + missingZohoFields.join('\n- '));
    }
    
    // 3. Date Validation: DOJ must never be greater than End Date
    if (emp.endDate && emp.endDate.trim() !== '' && emp.endDate !== 'N/A') {
      var startDateObj = parseZohoDate(emp.doj);
      var endDateObj = parseZohoDate(emp.endDate);
      if (startDateObj && endDateObj && !isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
        if (startDateObj.getTime() > endDateObj.getTime()) {
          throw new Error("Invalid duration. Start Date cannot be later than End Date.");
        }
      }
    }
    
    // 4. Template Selection
    var entityName = emp.company.trim();
    var templateTabName = '';
    var entityUpper = entityName.toUpperCase();
    if (entityUpper.indexOf('FAPL') !== -1 || entityUpper.indexOf('PRIVATE LIMITED') !== -1) {
      templateTabName = 'FAPL - Full Time';
    } else if (entityUpper.indexOf('FA') !== -1 || entityUpper.indexOf('FLODATA ANALYTICS') !== -1) {
      templateTabName = 'FA - Full Time';
    } else {
      throw new Error("Unsupported Entity: '" + entityName + "'. Only 'FA - Full Time' and 'FAPL - Full Time' templates are supported.");
    }
    
    // 5. Generate document
    var result = duplicateEmployeeTemplateAndFill(
      templateTabName, 
      emp.employeeName, 
      emp.doj, 
      emp.endDate, 
      emp.designation, 
      emp.department, 
      sendingDate, 
      authority, 
      roles,
      emp.employeeId,
      entityName
    );
    
    // 6. Show completion success popup
    showEmployeeCompletionDialog(emp.employeeName, result.url, result.duplicateExists);
    
  } catch (err) {
    ui.alert('Error', err.message, ui.ButtonSet.OK);
  }
}
