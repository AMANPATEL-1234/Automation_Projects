# Full-Time Employee Experience Letter Automation

## Project Overview

- **Purpose of the Automation**: Automatically generates professional **Relieving-cum-Experience Letters** for full-time employees directly from Google Docs.
- **Business Problem It Solves**: Eliminates manual copying of employee information from CRM/HR portals, resolves regional date and typography formatting challenges, removes human error in matching specific entity templates (FA vs. FAPL), and prevents duplicate file generation in Google Drive.
- **Overall Functionality**: The automation adds custom menus to Google Docs, displays interactive HTML dialogs to capture HR metadata input, queries Zoho People API using secure OAuth 2.0 to fetch employee profiles, performs multi-level validations, replicates the correct tab template layout and styling into a standalone file, and populates placeholders case-insensitively.

---

## Features

- **Custom Menu UI**: Embeds an **Employee Automation** menu directly into the Google Docs toolbar.
- **Interactive Forms**: Employs an HTML modal dialog [EmployeeDialog.html] that handles inputs, checks requirements, and displays processing feedback.
- **Zoho People API Integration**: Integrates Zoho OAuth 2.0 Refresh Token flow with region-based account domain mapping to retrieve active or inactive employee records.
- **Robust Record Parsing**: Handles complex Zoho JSON arrays, including nested ID key structures, to extract details like Name, DOJ, End Date, Designation, Department, Status, and Entity.
- **Multi-Level Validation**:
  - Checks dialog inputs before saving.
  - Ensures Script Properties are fully configured.
  - Verifies retrieved Zoho profiles contain all required fields.
  - Validates that the Start Date (DOJ) does not exceed the End Date.
  - Confirms template tabs contain all necessary placeholders before writing.
- **Dynamic Template Selection**: Inspects the employee's Zoho `Entity` (Company) field to dynamically target template tabs (either `FA - Full Time` or `FAPL - Full Time`).
- **Duplicate Document Warnings**: Detects if an experience letter for the employee already exists in Google Drive and alerts the user with a warning banner.

---

## Technologies Used

- **Google Apps Script (V8 Runtime)**
- **Google Docs API** (via standard `DocumentApp` service)
- **Google Drive API** (via standard `DriveApp` service)
- **HTML5 & Vanilla CSS** (featuring Google Fonts 'Inter' typography)
- **Zoho People API (OAuth 2.0)**
- **Google Apps Script Services**:
  - `PropertiesService` (for managing Script and User Properties)
  - `UrlFetchApp` (for HTTP request authentication and API requests)

---

## Project Structure

The project files are arranged as follows:

```
Employee_Automation/
├── EmployeeDialog.html
└── EmployeeMain.gs
```

---

## Prerequisites

1. **Active Google Doc Templates**: A Google Document that contains two template tabs named exactly `FA - Full Time` and `FAPL - Full Time`.
2. **Zoho People API Access**: An registered client application in Zoho Developer Console to generate Client Credentials and a Refresh Token.
3. **Google Apps Script Access**: Authorization to run script projects with document, spreadsheets, external requests, and drive OAuth scopes.

---

## Setup Instructions

### 1. Google Apps Script Setup
- Add [EmployeeMain.gs] and [EmployeeDialog.html] into your Google Apps Script project bound to the Google Document containing the templates.

### 2. Template Configuration
- Verify that your active Google Document contains two tabs titled exactly `FA - Full Time` and `FAPL - Full Time`.
- Ensure these tabs contain all the required placeholders (listed in the configuration section).

### 3. Script Properties Configuration
Navigate to the Google Apps Script project settings (Gear Icon) and define the following Script Properties under **Script Properties**:
- `CLIENT_ID`: Your Zoho API Client ID.
- `CLIENT_SECRET`: Your Zoho API Client Secret.
- `REFRESH_TOKEN`: Your Zoho API Refresh Token.

### 4. Enable OAuth Scopes
In your project configuration file [appsscript.json], ensure that the following OAuth scopes are enabled:
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/script.external_request`

---

## Configuration

### Script Properties (`PropertiesService.getScriptProperties()`)
| Key | Type | Description | Visibility |
| :--- | :--- | :--- | :--- |
| `CLIENT_ID` | String | Zoho API Client ID | Masked / Confidential |
| `CLIENT_SECRET` | String | Zoho API Client Secret | Masked / Confidential |
| `REFRESH_TOKEN` | String | Zoho API Refresh Token | Masked / Confidential |

### User Properties (`PropertiesService.getUserProperties()`)
| Key | Type | Description |
| :--- | :--- | :--- |
| `EMP_ID` | String | Entered Employee ID (e.g. `HRM78`). |
| `EMP_SENDING_DATE` | String | Formatted date string with suffix (e.g. `14th July 2026`). |
| `EMP_AUTHORITY` | String | Selected authorized signatory name. |
| `EMP_ROLES` | String | Entered roles, responsibilities, and achievements. |

### Configuration Constants
- **Zoho Accounts Regional Domain**: `https://accounts.zoho.in` (India)
- **Zoho People API Endpoint**: `https://people.zoho.in/api/forms/employee/getRecords`
- **Supported Template Tab Names**: `FA - Full Time`, `FAPL - Full Time`
- **Required Placeholders**:
  - `{{Employee Name}}`
  - `{{Employee ID}}`
  - `{{Start Date}}`
  - `{{End Date}}`
  - `{{Designation}}`
  - `{{Team/Department}}` or `{{Department}}`
  - `{{Date of Sending}}`
  - `{{Authorized Name}}`
  - `{{Key Responsibility/Achievement/Contribution}}` (also matches `{{Roles, Responsibilities & Contributions}}` and `{{Roles, Responsibilities and Contributions}}`)
  - `{{Company}}` (also matches `{{Company Name}}` and `{{Entity}}`)

---

## File Description

### 1. [EmployeeMain.gs]
- **Purpose**: Server-side engine handling the automation.
- **Responsibilities**:
  - Manages Script and User Properties initialization.
  - Authenticates and makes API requests to Zoho People.
  - Selects templates, creates standalone files in Google Drive, replicates layouts, and replaces placeholders.
  - Integrates with UI dialogs to coordinate execution.
- **Relationship**: Calls HTML files via `HtmlService`, communicates user selections with [EmployeeDialog.html], and modifies Google Document templates.

### 2. [EmployeeDialog.html]
- **Purpose**: Combined input form UI and success/warning dialog.
- **Responsibilities**:
  - Renders input text fields, select lists, and action buttons using Google's 'Inter' typography.
  - Implements client-side form validations.
  - Calls `saveEmployeeDetails` on the server using `google.script.run`.
  - Displays dynamic success feedback or duplicate warnings.
- **Relationship**: Created and evaluated by `openEmployeeFillDetailsDialog` and `showEmployeeCompletionDialog` inside [EmployeeMain.gs].

---

## Workflow

1. **Initialize Toolbar Menu**: Opening the Google Doc triggers `onOpen()`, creating the **Employee Automation** custom menu.
2. **Access Input Dialog**: User clicks **Employee FillDetails**. The script runs `openEmployeeFillDetailsDialog()`, opening the modal dialog [EmployeeDialog.html].
3. **Form Submission & Data Saving**:
   - The user inputs the Employee ID, Date of Sending, Authorized Name, and Roles/Responsibilities, then clicks **Save Details**.
   - The script validates inputs client-side, then runs `saveEmployeeDetails()`.
   - The date is converted (e.g. `2026-07-14` -> `14th July 2026`) and details are stored in User Properties.
4. **Trigger Document Generation**: User selects **Generate Completion Letter** from the custom menu.
5. **Data Gathering & Authorization**:
   - Stored User Properties are retrieved. If any are missing, the script throws an error.
   - The Zoho Access Token is refreshed using client credentials.
6. **Fetch Zoho Profile & Validate Data**:
   - Fetches the employee's details by ID. If not found, it throws an error.
   - Confirms Name, DOJ, Designation, Department, and Entity are not blank.
   - Validates that Start Date (DOJ) is not later than End Date.
7. **Template Mapping & Selection**:
   - Analyzes the company `Entity` from Zoho.
   - Selects template tab `FAPL - Full Time` (if entity contains FAPL/PRIVATE LIMITED) or `FA - Full Time` (if entity contains FA/FLODATA ANALYTICS).
8. **Document Generation**:
   - Validates template tab placeholders.
   - Checks Google Drive to see if a file titled `"Relieving-cum-Experience Letter - [Employee Name]"` already exists.
   - Creates a new Google Document in Google Drive with the target name.
   - Copies page margins, styles, headers, footers, and body from the template tab.
   - Performs case-insensitive placeholder replacements.
   - Saves and closes the file.
9. **Display Confirmation**:
   - Triggers a modal dialog showing success status.
   - Displays a warning banner if a duplicate file already exists in Google Drive.
   - Provides a link to open the generated Google Doc in a new tab.

---

## Logging and Error Handling

- **Interactive UI Banners**: HTML dialog forms validate inputs, showing an inline `#errorBanner` if fields are empty or if saving details fails.
- **Alert Messages**: Backend errors caught during orchestration are presented directly to the user in the Google Docs UI via `ui.alert()`.
- **API Error Tolerance**: Zoho API requests set `muteHttpExceptions: true` to handle HTTP error codes. The script parses response error payloads (e.g., "No records found") and throws readable error exceptions.
- **Runtime Logs**: `Logger.log()` records authentication steps, raw record outputs, data extractions, and trace blocks.

---

## Troubleshooting

- **"Missing Script Property" Error**: Script properties `CLIENT_ID`, `CLIENT_SECRET`, or `REFRESH_TOKEN` are missing. Add them in Project Settings -> Script Properties.
- **"Failed to refresh Zoho OAuth token" Error**: Re-check your Zoho Developer Console credentials. Ensure that the client configuration matches region `https://accounts.zoho.in`.
- **"Employee ID [ID] not found" Error**: Verify that the Employee ID input matches a profile registered in Zoho People.
- **"Required employee details are missing in Zoho" Error**: Update the target employee profile inside Zoho People to ensure the Name, DOJ, Designation, Department, and Entity (Company) fields are populated.
- **"Unsupported Entity" Error**: Occurs when the employee's Zoho Entity field does not contain `FA`, `FLODATA ANALYTICS`, `FAPL`, or `PRIVATE LIMITED`.
- **"Missing required placeholders" Error**: Check that the template tabs contain all required `{{placeholder}}` markers exactly as specified in the configuration section.
- **Duplicate Document Warnings**: If a document with the same name already exists in Google Drive, the script generates a new file anyway but displays a warnings advising you to clean up older files to prevent clutter.

---

## Conclusion

The **Full-Time Employee Experience Letter Automation** project connects Google Docs, Google Drive, and Zoho People. By managing token handshakes, checking properties, selecting layouts based on corporate entities, and performing programmatic placeholder replacements, it removes administrative friction from HR experience letter generation.
