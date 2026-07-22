# Intern Experience Letter Automation

## Project Overview

The **Intern Experience Letter Automation** project is a Google Apps Script-based solution designed to automate the generation of professional internship completion letters. It acts as a container-bound script within a Google Document that serves as the layout template. 

By pulling intern records from a designated Google Sheet, validating dates and properties, and matching document placeholder fields, this script eliminates manual formatting errors and accelerates the HR administrative process. It generates customized standalone Google Documents for interns, complete with cloned formatting (margins, page setups, headers, and footers) from specific template tabs.

## Features

- **Dynamic Form Input**: An interactive HTML/CSS modal dialog directly within the Google Doc UI that allows administrators to input the Intern Code, date of sending, and select the authorized signatory.
- **Dynamic Data Retrieval**: Automatically retrieves the source Google Sheet using a spreadsheet URL stored in Script Properties and performs a search for the intern's details based on their unique Intern Code.
- **Multi-Entity Template Selection**: Support for separate template structures based on the entity field in the Google Sheet (supports `FAPL` and `FA` entities mapped to document tabs).
- **Faithful Document Cloning**: Automatically creates a new standalone Google Document, duplicating not just the body text, but also page dimensions, margins, styles, headers, and footers from the source tab.
- **Robust Placeholder Verification**: Pre-checks the template tab for the presence of all 7 required placeholder tags prior to document generation to ensure completeness.
- **Intelligent Date Formatting**:
  - Automatically formats the Date of Joining (Start Date) and Date of Ending into `dd MMMM yyyy` (e.g., `21 July 2026`).
  - Automatically formats the Date of Sending with ordinal day suffixes into `dd{suffix} MMMM yyyy` (e.g., `21st July 2026`).
- **Duplicate Name Check**: Performs a check in the user's Google Drive for any existing document with the same name and alerts the administrator through the UI if a potential duplicate is detected.
- **Detailed Validations & Error Reporting**: Validates form inputs, spreadsheet structures, column headers, date logic (ensuring Start Date is not later than End Date), and template properties, presenting comprehensive validation feedback in the UI.

## Technologies Used

- **Google Apps Script (V8 Runtime)**: Coordinates the document generation flow, reads sheet data, manages properties, and evaluates HTML templates.
- **Google Sheets API / SpreadsheetApp**: Reads intern details and headers from a mapped spreadsheet.
- **Google Docs API / DocumentApp**: Manages active templates, clones structures/layouts, and performs placeholder replacements.
- **Google Drive API / DriveApp**: Searches for duplicate documents and handles standalone file creation.
- **HTML5 & CSS3**: Renders modern, responsive dialogs and confirmation screens using the Google Fonts 'Inter' typography.
- **JavaScript (Client & Server side)**: Validates input fields and manages communication between the dialog client and the Google Apps Script backend.

## Project Structure

This project consists of the following root files:

```text
InternDocAutomation/
├── appsscript.json        # Apps Script project configuration and OAuth scopes
├── InternMain.gs          # Main script logic containing all core execution functions
└── InternDialog.html      # Unified HTML template for the entry form and success dialogs
```

## Prerequisites

To configure and execute this automation, you must have:
1. A Google Spreadsheet containing intern records.
2. A Google Document containing at least two tabs named `FAPL` and `FA` representing the layout templates.
3. Access to Google Drive to create, search, and edit documents.
4. Appropriate permissions to execute the Google Apps Script container-bound to the template Google Document.

## Setup Instructions

### 1. Google Sheets Configuration
The source spreadsheet must contain intern data starting from the first sheet tab. It must contain, at a minimum, the following column headers (case-insensitive and trimmed):
- `entity` (must contain `FAPL` or `FA` to map to templates)
- `name` (the intern's full name)
- `doj` (Date of Joining / Start Date)
- `date of ending` (End Date)
- `designation` (the intern's job role)
- `department` (the department assigned)
- `intern code` (unique identifier, e.g., `INT1025`)

### 2. Google Docs Template Configuration
The active Google Document hosting the script must have tabs configured with titles corresponding to the entities:
- A tab named **FAPL**
- A tab named **FA**

Both template tabs must contain the following 7 required placeholders in their text (including body, header, or footer):
- `{{Employee Name}}`
- `{{Start Date}}`
- `{{End Date}}`
- `{{Designation}}`
- `{{Department}}`
- `{{Date of Sending}}`
- `{{Authorized Name}}`

### 3. Script Properties Configuration
The script relies on a Script Property to define the source spreadsheet.
1. Open the Apps Script editor from your Google Document (`Extensions > Apps Script`).
2. Go to **Project Settings** (gear icon).
3. Scroll down to **Script Properties** and add:
   - **Property**: `SHEET_URL`
   - **Value**: The full URL (or ID) of your Google Spreadsheet containing the intern records.
4. Click **Save script properties**.

### 4. Permissions and Authorization
Upon running the script for the first time, you must authorize it to access the following Google scopes specified in `appsscript.json`:
- View and manage your Google Docs documents (`https://www.googleapis.com/auth/documents`)
- View and manage your Google Sheets spreadsheets (`https://www.googleapis.com/auth/spreadsheets`)
- View and manage files in your Google Drive (`https://www.googleapis.com/auth/drive`)
- Connect to external services (`https://www.googleapis.com/auth/script.external_request`)

## Configuration

### Script Properties (Global Configuration)
- **`SHEET_URL`**: The spreadsheet URL containing the intern database.

### User Properties (Temporary State)
- **`INTERN_CODE`**: Stores the trimmed Intern Code submitted via the modal form.
- **`SENDING_DATE`**: Stores the sending date string (`YYYY-MM-DD`) submitted via the modal form.
- **`AUTHORITY`**: Stores the selected authorized signatory name submitted via the modal form.

## File Description

### 1. `appsscript.json`
- **Purpose**: Defines project metadata and manifest properties.
- **Responsibilities**: Sets the time zone (`Asia/Kolkata`), enables Stackdriver exception logging, specifies the `V8` runtime, and declares explicit OAuth scopes required for documents, spreadsheets, drive, and external requests.

### 2. `InternMain.gs`
- **Purpose**: Orchestrates all server-side operations.
- **Responsibilities**:
  - Manages Script/User properties.
  - Controls dialog opening and success screens.
  - Establishes connections with Google Sheets, fetches raw data, and maps fields.
  - Implements document copy logic, layout transfer, date parsing, text placeholders replacement, and document status checks.
- **Important Functions**: `openFillDetailsDialog()`, `saveDetails()`, `promptAndGenerateLetter()`, `duplicateTemplateAndFill()`.

### 3. `InternDialog.html`
- **Purpose**: Provides a unified user interface for inputs and results.
- **Responsibilities**:
  - Displays a clean input form requesting the Intern Code, date of sending, and authorized signatory name.
  - Formats layout elements using a responsive CSS framework with the modern 'Inter' font.
  - Implements client-side validation checking that inputs are not empty before submitting.
  - Communicates asynchronously with the backend via `google.script.run` commands.
  - Serves as the success modal to notify user of successful generation and display duplicate warnings.

---

## Workflow

```text
Step 1: Admin triggers openFillDetailsDialog() 
        ↓
Step 2: Modal displays the entry form (InternDialog.html)
        ↓
Step 3: User fills fields (Intern Code, Date of Sending, Signatory) and clicks "Save Details"
        ↓
Step 4: Form client-side scripts validate inputs, call saveDetails() to write User Properties, and close modal
        ↓
Step 5: Admin runs promptAndGenerateLetter()
        ↓
Step 6: Script extracts and validates User Properties, retrieves sheet ID, and connects to the sheet
        ↓
Step 7: Script queries intern record row by Intern Code and validates column fields
        ↓
Step 8: Script validates that Start Date (DOJ) is before End Date and template entity matches 'FAPL' or 'FA'
        ↓
Step 9: Script opens template Doc, locates FAPL/FA tab, and verifies required placeholders are present
        ↓
Step 10: Script creates a new Google Doc, duplicates layout configurations (header, footer, body, margins)
         ↓
Step 11: Script formats dates, substitutes placeholders with active data, and commits changes (saveAndClose)
         ↓
Step 12: Script triggers showCompletionDialog() displaying a direct document link and warning if same-name file exists
```

---

## Logging and Error Handling

- **Inline Error Banner**: The modal dialog displays client-side validation errors (e.g. missing inputs) directly inside a red banner (`#errorBanner`) without closing.
- **Fail-Safe Layout Duplication**: Page dimensions, page margins, and attributes are copied inside try-catch blocks. If structural exceptions arise (e.g., unsupported margin sizes), the script fails silently and continues generating the document layout.
- **Template Verification**: Before cloning, the script scans the text body, headers, and footers of the template tab. If any of the 7 placeholders are missing, it terminates execution and alerts the user of the exact missing placeholders.
- **Global Error Pop-ups**: Server-side script exceptions in `promptAndGenerateLetter` are caught and shown via `DocumentApp.getUi().alert('Error', err.message, ui.ButtonSet.OK)`.
- **Exception Logging**: Stackdriver logging is activated (`"exceptionLogging": "STACKDRIVER"` in `appsscript.json`) to capture system-level execution errors.

---

## Troubleshooting

### 1. `Script Property 'SHEET_URL' is missing`
* **Cause**: The global configuration `SHEET_URL` property has not been defined in Apps Script Project Settings.
* **Solution**: Add the `SHEET_URL` property in Project Settings.

### 2. `Invalid 'SHEET_URL' format. Could not extract Google Spreadsheet ID.`
* **Cause**: The string set in `SHEET_URL` is empty, corrupted, or does not represent a standard Google Spreadsheet URL/ID.
* **Solution**: Copy the exact URL directly from your web browser address bar when viewing your sheet and re-paste it into the script property.

### 3. `Could not access the Google Sheet. Please check...`
* **Cause**: The executing user does not have permission to view the spreadsheet linked via `SHEET_URL`, or the sheet ID is incorrect.
* **Solution**: Ensure your Google account is granted shared access (at least View permissions) to the spreadsheet.

### 4. `The Google Sheet is empty or only contains headers`
* **Cause**: Spreadsheet does not contain data below row 1.
* **Solution**: Check that the sheet has valid intern records populated starting from row 2.

### 5. `Missing required columns in Google Sheet`
* **Cause**: One or more required headers (`entity`, `name`, `doj`, `date of ending`, `designation`, `department`, `intern code`) are missing or misspelled in Row 1.
* **Solution**: Verify spelling, ensure all lower-case words match, and remove trailing spaces.

### 6. `Intern Code '...' not found`
* **Cause**: The Intern Code inputted does not match any code in the `intern code` column in the Google Sheet.
* **Solution**: Verify spelling and casing of the Intern Code (e.g. `INT1025`).

### 7. `Missing required values: ...`
* **Cause**: Form properties were cleared, or some cells (e.g., start date, end date) are empty in the sheet for the requested intern.
* **Solution**: Ensure all cell values for the intern are populated.

### 8. `Invalid internship duration. Start Date cannot be later than End Date.`
* **Cause**: The `doj` column date is chronologically after the `date of ending` column date.
* **Solution**: Correct the dates in the source spreadsheet.

### 9. `Unsupported Entity: ... Only 'FAPL' and 'FA' templates are supported.`
* **Cause**: The `entity` value in the sheet is something other than `FAPL` or `FA`.
* **Solution**: Correct the entity cell in the sheet.

### 10. `Template tab '...' was not found in the Google Doc`
* **Cause**: The Google Document does not contain a tab with the name `FAPL` or `FA`.
* **Solution**: Add a tab inside the active Google Doc template and name it exactly `FAPL` or `FA`.

### 11. `Missing required placeholders in template tab ...`
* **Cause**: The template tab is missing one of the 7 placeholder tags.
* **Solution**: Check your template tab and ensure the spelling is exactly as required (e.g. `{{Employee Name}}` or `{{Start Date}}`).

---

## Conclusion

The **Intern Experience Letter Automation** project provides a highly customized solution for generating internship completion letters directly from template tabs. By integrating validations at every execution step, it ensures that all generated documents comply with organizational standards and template consistency rules.
