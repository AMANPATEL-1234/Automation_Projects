const ZOHO_CONFIG = {
  TARGET_SHEET_NAME: 'Employees Work Anniversary - FloData Analytics',
  EXCLUDED_EMPLOYEE_IDS: ['HRM1', 'HRM2'],
  EXCLUDED_EMAILS: ['vaibhav@flodataanalytics.com', 'ujjwal@flodataanalytics.com']
};

// ********************************************
function syncZohoEmployees() {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('CLIENT_ID');
  const clientSecret = props.getProperty('CLIENT_SECRET');
  const refreshToken = props.getProperty('REFRESH_TOKEN');
  
  // Step 1: Refresh Access Token
  const accessToken = getZohoAccessToken(clientId, clientSecret, refreshToken);
  
  // Step 2: Fetch Active Employees via Zoho Forms API
  const employees = fetchActiveEmployees(accessToken);
  
  // Step 3: Write records to Google Sheet
  writeEmployeesToSheet(employees);
}

// ********************************************

function getZohoAccessToken(clientId, clientSecret, refreshToken) {
  const tokenUrl = 'https://accounts.zoho.in/oauth/v2/token';
  const options = {
    method: 'post',
    payload: {
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(tokenUrl, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  if (responseCode !== 200) {
    throw new Error(`Failed to refresh Zoho token (HTTP ${responseCode}): ${responseText}`);
  }
  
  const responseJson = JSON.parse(responseText);
  if (!responseJson.access_token) {
    throw new Error(`Failed to obtain access token from response: ${responseText}`);
  }
  
  return responseJson.access_token;
}

// ********************************************
function fetchActiveEmployees(accessToken) {
  const apiBaseUrl = 'https://people.zoho.in/api/forms/employee/getRecords';
  const allEmployees = [];
  let sIndex = 1;
  const limit = 200;
  let hasMore = true;
  
  // Construct search parameter string to query active employees only
  const searchParamsObj = {
    searchField: 'Employeestatus',
    searchOperator: 'Is',
    searchText: 'Active'
  };
  const searchParamsStr = JSON.stringify(searchParamsObj);
  while (hasMore) {
    const url = `${apiBaseUrl}?searchParams=${encodeURIComponent(searchParamsStr)}&sIndex=${sIndex}&limit=${limit}`;
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      throw new Error(`Failed to fetch employee records (HTTP ${responseCode}): ${responseText}`);
    }
    
    let records = [];
    try {
      const responseJson = JSON.parse(responseText);
      
      // Parse Zoho's response format: {"response": {"result": [{"recordId": [...]}]}}
      if (responseJson && responseJson.response && responseJson.response.result) {
        const result = responseJson.response.result;
        if (Array.isArray(result)) {
          result.forEach(item => {
            const keys = Object.keys(item);
            keys.forEach(key => {
              const recordData = item[key];
              if (Array.isArray(recordData) && recordData.length > 0) {
                records.push(recordData[0]);
              } else if (typeof recordData === 'object' && recordData !== null) {
                records.push(recordData);
              }
            });
          });
        }
      } else if (Array.isArray(responseJson)) {
        // Direct flat array format fallback
        records = responseJson;
      }
    } catch (e) {
      break;
    }
    
    if (records.length === 0) {
      hasMore = false;
    } else {
      allEmployees.push(...records);
      
      if (records.length < limit) {
        hasMore = false; 
      } else {
        sIndex += limit; 
      }
    }
  }
  
  return allEmployees;
}

// ********************************************
function mapEmployeeData(emp) {
  // 1. Employee ID
  let empId = emp['EmployeeID'] || '';
  empId = empId.toString().trim();
  
  // 2. Employee Name (FirstName + LastName)
  const firstName = emp['FirstName'] || '';
  const lastName = emp['LastName'] || '';
  const empName = `${firstName.toString().trim()} ${lastName.toString().trim()}`.trim();
  
  // 3. Official Email
  let email = emp['EmailID'] || '';
  email = email.toString().trim();
  
  // 4. Date of joining
  let doj = emp['Dateofjoining'] || '';
  doj = doj.toString().trim();
  return [empId, empName, email, doj, 'Active'];
}

// ********************************************
function writeEmployeesToSheet(employees) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = ZOHO_CONFIG.TARGET_SHEET_NAME;
  let sheet = ss.getSheetByName(sheetName);
  const headers = ['Employee ID', 'Employee Name', 'Official Email', 'Date of joining', 'Status'];
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  const excludedEmpIds = new Set(ZOHO_CONFIG.EXCLUDED_EMPLOYEE_IDS || []);
  const excludedEmails = new Set((ZOHO_CONFIG.EXCLUDED_EMAILS || []).map(email => email.toLowerCase()));

  const rows = employees
    .filter(emp => {
      const empId = emp['EmployeeID'] ? emp['EmployeeID'].toString().trim() : '';
      const email = emp['EmailID'] ? emp['EmailID'].toString().trim().toLowerCase() : '';
      return !excludedEmpIds.has(empId) && !excludedEmails.has(email);
    })
    .map(emp => mapEmployeeData(emp));
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  // Style headers: light blue background, bold font text (matching client sheet styling)
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#cfe2f3');
  headerRange.setHorizontalAlignment('left');
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sheet.autoResizeColumns(1, headers.length);
}
