# Birthday Wishes Automation

## Project Overview
This project is a Google Apps Script automation designed to manage employee data, validate details, synchronize records, and send automated birthday wishes to a Google Chat Space. The solution reads employee birthdates from a Google Form spreadsheet, ensures status tracking (Active/InActive) against an external exit sheet, performs email validation against members of a Google Chat space, and automatically posts celebratory birthday messages with dynamic user mentions on the day of their birthday.

---

## Features
- **Dynamic Header Mapping**: Automatically detects column indices for employee names, emails, dates of birth (actual and documented), Employee IDs, timestamps, and status fields to prevent failures if column orders change.
- **Employee Status Syncing**:
  - Automatically creates and initializes a `Status` column in the `'Google Form - Raw Data'` sheet.
  - Connects to the external exit spreadsheet via `EXIT_SHEET_URL` to identify deactivated employees, changing their status in the `'Google Form - Raw Data'` sheet to `InActive`.
  - Reverts status back to `Active` if the employee is no longer present on the exit list.
  - Sends email notifications listing all unique inactive employees to a designated recipient.
- **Data Formatting & Validation**:
  - Standardizes actual and documented date formats to `'DD-MMM-YYYY'` (e.g., `21-Jul-2026`).
  - Highlights duplicate form submissions in yellow based on duplicate Employee IDs or Official Mail IDs.
  - Highlights individual birthday cells in yellow if the submission contains a birth year before `1960`.
- **Google Chat Membership Verification**:
  - Validates active employee emails against the membership list of the configured Google Chat Space.
  - Sends email notifications highlighting emails that do not match the Chat Space membership.
- **Active Employee Synchronization**:
  - Filters and copies the newest active submissions to the `'Active - Employee Master'` sheet, ensuring that only active employees who are members of the Google Chat space are synced.
  - Formats Employee ID columns as text (`@`) to preserve leading zeros.
  - Compares Documented DOB and Actual DOB, setting status to `'Same'` or `'Different'` and highlighting mismatches in light yellow (`#FFF2CC`).
- **Automated Birthday Notifications**:
  - Daily scanning of the `'Active - Employee Master'` sheet.
  - Resolves birthday matches on the current date using the spreadsheet/script timezone.
  - Dynamically fetches user membership IDs in the Chat space to format clickable user mentions (`<users/userId>`), falling back to text mentions (`@Name`) if needed.
  - Sends automated messages to the configured Google Chat Space.

---

## Technologies Used
- **Google Apps Script** (V8 Runtime)
- **Google Sheets Service** (`SpreadsheetApp`, `Sheet`)
- **Google Chat Advanced Service** (`Chat` API v1)
- **Google Mail Service** (`MailApp` for alert notifications)
- **Properties Service** (`PropertiesService` for reading environment variables)

---

## Project Structure
The project is organized in a single folder containing the following files:
```
Birthday Wishes/
├── appsscript.json
├── active_inactive_Status.gs
├── run_Data_Validation_Formatting.gs
└── send_birthday_messages.gs
```

---

## Prerequisites
1. **Google Sheets Setup**:
   - A Google Spreadsheet with a raw data sheet named exactly `'Google Form - Raw Data'`.
   - The raw data sheet must contain headers matching:
     - Employee Name (e.g., `"Employee Full Name"`, `"Full Name"`, `"Employee Name"`, or `"Name"`)
     - Official Email (e.g., containing `"official email"`, `"official mail"`, `"email"`, or `"mail id"`)
     - Employee ID (e.g., containing `"employee id"`, `"intern code"`, `"emp id"`, or `"employee_id"`)
     - Documented DOB (e.g., containing `"documented"` and either `"birth"` or `"dob"`)
     - Actual DOB (e.g., containing `"actual"`)
     - Timestamp (e.g., `"Timestamp"` or containing `"submission time"`)
   - An external Google Spreadsheet containing exit employee data with a sheet named `'Exit Employees - Data'` (or falls back to the first sheet). It must contain:
     - Email (e.g., containing `"official email"` or `"official mail"`, fallback to Column A)
     - Employee ID (e.g., containing `"employee id"`, `"intern code"`, `"emp id"`, or `"employee_id"`, fallback to Column B)
2. **Advanced Chat Service**: The Google Apps Script project must have the **Google Chat API** (`v1`) enabled.
3. **Permissions**: Authorized OAuth scopes for Spreadsheets, Script external requests, ScriptApp, Chat message creation, Chat membership reading, and MailApp.

---

## Setup Instructions
1. Create a Google Apps Script project and paste the source files (`active_inactive_Status.gs`, `run_Data_Validation_Formatting.gs`, `send_birthday_messages.gs`, and `appsscript.json`) into the script editor.
2. In the Google Apps Script project editor, add the **Google Chat API** under the "Services" panel.
3. Define the following script properties in the script settings:
   - `SPACE_ID` (or `SPACE_NAME`): The ID of the target Google Chat Space.
   - `EXIT_SHEET_URL`: The full URL or Spreadsheet ID of the external exit employee spreadsheet.
4. Set up the automation triggers in the Google Apps Script Console:
   - Schedule `active_inactive_Column()` to maintain employee statuses.
   - Schedule `run_Data_Validation_Formatting()` to format data and sync records.
   - Schedule `sendBirthdayWishes()` to run daily (e.g., early morning) to scan and send birthday wishes.

---

## Configuration
The following configuration properties and script constants are defined in the project:

### Constants
| Name | Source File | Description | Value |
| :--- | :--- | :--- | :--- |
| `CHAT_CONFIG.SHEET_NAME` | `run_Data_Validation_Formatting.gs` | Target sheet name for synchronized active employees. | `'Active - Employee Master'` |
| `CHAT_CONFIG.SPACE_NAME` | `run_Data_Validation_Formatting.gs` | Getter resolving the space ID from script properties (prefixed with `spaces/`). | Dynamic |

### Script Properties
- **`SPACE_ID` / `SPACE_NAME`**: The identifier of the Google Chat space where messages are sent.
- **`EXIT_SHEET_URL`**: The URL or ID of the spreadsheet containing the list of resigned or inactive employees.

### Email Recipient
- Alert emails for inactive employees, duplicate submissions, and email mismatches are sent to: **`aman.patel@flodataanalytics.com`**

---

## File Description

### [appsscript.json]
- **Purpose**: Defines configuration metadata for the Apps Script project.
- **Responsibilities**:
  - Sets the default timezone to `"Asia/Kolkata"`.
  - Declares the dependency on the advanced Google Chat service (`chat`, version `v1`).
  - Sets the runtime version to `V8`.
  - Configures the required OAuth scopes for sheets, mail, external requests, and Chat actions.

### [active_inactive_Status.gs]
- **Purpose**: Manages employee active/inactive statuses by referencing the external exit employee list.
- **Responsibilities**:
  - Creates the `"Status"` column in `'Google Form - Raw Data'` if it is missing, initializing rows as `"Active"`.
  - Re-fills empty cells in the `"Status"` column with `"Active"`.
  - Extracts email/ID values from the external spreadsheet using `EXIT_SHEET_URL`.
  - Matches local employees against the exit employee lists, marking matches as `"InActive"` and non-matches as `"Active"`.
  - Sends a summary email containing all unique inactive employees to `Email Address`.

### [run_Data_Validation_Formatting.gs]
- **Purpose**: Handles `'Google Form - Raw Data'` data sanitization, duplicate detection, Chat Space validation, and synchronization to the `'Active - Employee Master'` sheet.
- **Responsibilities**:
  - Highlights duplicate submissions and birth years older than `1960` in yellow.
  - Matches `'Google Form - Raw Data'` emails with Google Chat Space members, listing non-members as mismatches.
  - Emails space mismatches and duplicate submission alerts to `Email Address`.
  - Coordinates the deduplication and synchronization of active members to the `'Active - Employee Master'` sheet, formatting columns, writing border lines, and applying cell backgrounds based on DOB mismatches.

### [send_birthday_messages.gs]
- **Purpose**: Evaluates today's birthdays and sends announcements to Google Chat.
- **Responsibilities**:
  - Reads synchronized data from `'Active - Employee Master'`.
  - Converts dates into a comparable string (`"dd-MMM"`).
  - Determines if any employee's birthday matches today's date.
  - Attempts to resolve members' ID in the Google Chat space.
  - Constructs and posts the final birthday message with mentions to the space.

---

## Workflow
1. **Status Initialization & Exit Matching**:
   The script verifies the status column in the `'Google Form - Raw Data'` sheet, ensures new records default to `"Active"`, and evaluates active records against the external exit employee spreadsheet (`EXIT_SHEET_URL`). Matched exit employees are flagged as `"InActive"` in the `'Google Form - Raw Data'` sheet, and an alert list is emailed.
2. **Sanitization & Verification**:
   The script formats dates to `'DD-MMM-YYYY'`, aligns text columns, marks duplicates, and performs Chat membership lookups on the `'Google Form - Raw Data'` sheet. Alerts are dispatched to the admin for any duplicate profiles or space mismatches.
3. **'Active - Employee Master' Sync**:
   Active submissions are grouped and deduplicated. The newest record belonging to a Chat Space member is synced to the `"Active - Employee Master"` sheet. Status fields are marked as `'Same'` or `'Different'` depending on whether documented and actual birth dates match.
4. **Wishes Delivery**:
   A daily trigger launches the birthday check. If an employee's birthdate matches today's day/month string, the script resolves their ID from the Chat Space members list and posts a celebratory message.

---

## Logging and Error Handling
- **Stackdriver Integration**: The project reports syntax errors, unhandled exceptions, and runtime issues to Stackdriver.
- **Runtime Logs**: `Logger.log()` handles informational updates, such as logging the current scanned date, timezone info, update summaries, and skipped records.
- **Catch Blocks**:
  - Membership checks utilize `try-catch` structures to catch and log instances where user memberships are not found or invalid.
  - Critical failures in the sending process catch the error object, log it, and print to the console using `console.error()`.
- **Property Validation**: Throws explicit runtime errors if the target space name or ID is not set.

---

## Troubleshooting
- **Sheet name error**: Ensure that the raw form sheet is named exactly `"Google Form - Raw Data"` (case-sensitive) and that the `"Active - Employee Master"` sheet exists or can be created next to it.
- **Missing or blank status values**: Run `active_inactive_Column()` to automatically configure the `"Status"` column in the `"Google Form - Raw Data"` sheet and populate it with default values.
- **Exit Sheet Lookup failures**: Confirm that the external spreadsheet is accessible by the execution user and that the script property `EXIT_SHEET_URL` contains the correct URL or Spreadsheet ID.
- **Unformatted User Mentions in Chat**: Ensure that the user's email address listed in the sheet matches their official workspace email exactly. If they are not added to the Google Chat space, they will fall back to a text mention.

---

## Conclusion
This system ensures accurate data collection, automatic status auditing, and reliable notification delivery, keeping teams connected and engaged by celebrating employee birthdays directly inside Google Chat.
