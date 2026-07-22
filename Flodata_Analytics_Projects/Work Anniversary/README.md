# Work Anniversary Automation

## Project Overview
The **Work Anniversary Automation** project is a Google Apps Script application designed to automate the tracking, verification, and celebration of employee work anniversaries at FloData. It synchronizes active employee records from Zoho People into a central Google Sheet, handles status updates by cross-referencing an external exit employees sheet, verifies employee presence within Google Chat, alerts administrators of email or membership mismatches, and broadcasts automated, personalized work anniversary congratulations directly to a target Google Chat Space.

---

## Features
*   **Zoho People Synchronization**: Fetches active employee data (Employee ID, Name, Email, and Joining Date) from Zoho People via the Zoho Forms API, applying exclusion rules, and populating a local spreadsheet.
*   **Exclusion Filtering**: Automatically filters out specific employee IDs and email addresses from synchronization to keep tracking focused on standard personnel.
*   **Active/Inactive Status Validation**: Compares local employee rosters against an external Exit Employees spreadsheet. If an employee is found in the exit sheet, their status is changed to `InActive`, and their row is highlighted in light red.
*   **Google Chat Membership Check**: Verifies whether active employees have joined the target Google Chat Space.
*   **Discrepancy Alerts via Email**: Sends automated alerts to administrative personnel when:
    1.  An active employee is missing or has a mismatch in the Google Chat Space (`Mismatch EmailID - Work Anniversary`).
    2.  An employee is marked as inactive based on exit data (`InActive Employees - Work Anniversary`).
*   **Automated Anniversary Wishes**: Computes completed years of service, checks for active status, resolves the employee's Google Chat user ID for tagging/mentioning, and posts a customized work anniversary message to the Google Chat space.

---

## Technologies Used
*   **Google Apps Script**: The core execution platform for scripts, triggers, and APIs.
*   **Google Sheets (SpreadsheetApp)**: Handles local data storage, formats tables, and applies color highlights to records.
*   **Google Chat Advanced Service (v1)**: Retrieves space membership details and posts messages to the target workspace.
*   **Zoho People Forms API**: Retrieves active employee profiles.
*   **UrlFetchApp**: Handles authentication with Zoho Accounts and requests employee data.
*   **MailApp**: Sends administrative alert emails.
*   **PropertiesService**: Stores Zoho credentials, external sheet URLs, and target Chat Space IDs.

---

## Project Structure
```
├── appsscript.json                      # Configuration manifest (Timezone, OAuth Scopes, Advanced Services)
├── Employee_status_active_Inactive.gs   # Verification of exits, Google Chat membership, and email alerts
├── send_anniversary_wishes.gs           # Date parsing, anniversary matching, and Chat message broadcasting
└── zoho_sync_data.gs                    # Zoho People API connection, token retrieval, and data synchronization
```

---

## Prerequisites
*   A Google Apps Script project.
*   A Google Spreadsheet containing a sheet named `Employees Work Anniversary - FloData Analytics`.
*   An external Google Spreadsheet containing exited employee records (with a sheet name containing `exit employees` or `exit`).
*   A Google Chat Space with the **Google Chat API** (v1) enabled under Apps Script **Advanced Services**.
*   A registered Zoho Accounts OAuth client configured for the `people.zoho.in` domain.
*   Administrative email access to send system status notifications via `MailApp`.

---

## Setup Instructions

### 1. Spreadsheet Setup
*   Ensure the local spreadsheet contains a tab named exactly `Employees Work Anniversary - FloData Analytics`. If not present, the synchronization script will create it automatically.
*   Maintain an external exit spreadsheet with a tab containing the term `exit employees` or `exit` in its name.

### 2. Advanced Service Configuration
In the Google Apps Script editor:
*   Add the **Google Chat API** (v1) service.
*   Ensure the `appsscript.json` includes the necessary scopes:
    *   `https://www.googleapis.com/auth/spreadsheets`
    *   `https://www.googleapis.com/auth/script.external_request`
    *   `https://www.googleapis.com/auth/script.send_mail`
    *   `https://www.googleapis.com/auth/chat.memberships.readonly`
    *   `https://www.googleapis.com/auth/chat.messages.create`

### 3. Script Properties Setup
Define the following settings in your Apps Script **Project Settings -> Script Properties**:
*   `CLIENT_ID`: Zoho API Client ID.
*   `CLIENT_SECRET`: Zoho API Client Secret.
*   `REFRESH_TOKEN`: Zoho API Refresh Token.
*   `EXIT_SHEET_URL`: The URL of the external spreadsheet where employee exits are tracked.
*   `SPACE_ID`: The target Google Chat Space ID (e.g. `spaces/XXXXXX`).

### 4. Triggers Configuration
Configure time-driven triggers in the Google Apps Script project for the following entry-point functions:
*   `syncZohoEmployees`: Runs to refresh employee records from Zoho.
*   `Employee_status_active_Inactive`: Runs to synchronize status, apply styling, and send admin email notifications.
*   `sendWorkAnniversaryWishes`: Runs daily to scan for work anniversaries and send messages.

---

## Configuration

### Script Properties
| Property Key | Description | Example / Masked Value |
| :--- | :--- | :--- |
| `CLIENT_ID` | Zoho OAuth2 Client ID | `[REDACTED_CLIENT_ID]` |
| `CLIENT_SECRET` | Zoho OAuth2 Client Secret | `[REDACTED_CLIENT_SECRET]` |
| `REFRESH_TOKEN` | Zoho OAuth2 Refresh Token | `[REDACTED_REFRESH_TOKEN]` |
| `EXIT_SHEET_URL` | URL of the Google Sheet tracking exited employees | `https://docs.google.com/spreadsheets/d/[REDACTED_SHEET_ID]/edit` |
| `SPACE_ID` | The ID of the target Google Chat space | `spaces/[REDACTED_SPACE_ID]` |

---

## Function Overview

### File: `zoho_sync_data.gs`

#### `syncZohoEmployees()`
*   **Purpose**: Orchestrates the Zoho-to-Sheets synchronization.
*   **Parameters**: None.
*   **Return Value**: None.
*   **Process**: Loads credentials from Script Properties, fetches a fresh token, retrieves the active Zoho employee list, and writes it to the local sheet.

#### `getZohoAccessToken(clientId, clientSecret, refreshToken)`
*   **Purpose**: Retrieves a new Zoho OAuth2 access token.
*   **Parameters**:
    *   `clientId` (String)
    *   `clientSecret` (String)
    *   `refreshToken` (String)
*   **Return Value**: String (Access Token).
*   **Process**: Performs a POST request to `https://accounts.zoho.in/oauth/v2/token`. If the response is not 200 or the token is missing, throws an error.

#### `fetchActiveEmployees(accessToken)`
*   **Purpose**: Queries Zoho People for all active employee profiles.
*   **Parameters**:
    *   `accessToken` (String)
*   **Return Value**: Array of record objects.
*   **Process**: Fetches records in batches of 200 using the Zoho Forms API with filter `Employeestatus = Active`. Parses Zoho's standard response object array and returns the consolidated list.

#### `mapEmployeeData(emp)`
*   **Purpose**: Converts a Zoho employee object into a standard row format.
*   **Parameters**:
    *   `emp` (Object)
*   **Return Value**: Array: `[EmployeeID, EmployeeName, EmailID, Dateofjoining, 'Active']`.
*   **Process**: Combines first and last names, trims fields, and maps key fields to a flat array.

#### `writeEmployeesToSheet(employees)`
*   **Purpose**: Overwrites the spreadsheet with Zoho's updated active employee records.
*   **Parameters**:
    *   `employees` (Array)
*   **Return Value**: None.
*   **Process**: Clears the target sheet, filters out records with excluded IDs or emails, sets headers with a bold font and blue background (`#cfe2f3`), writes the rows, and resizes columns.

---

### File: `Employee_status_active_Inactive.gs`

#### `Employee_status_active_Inactive()`
*   **Purpose**: Compares local employee statuses against exit sheets, formats columns, verifies Chat space membership, and sends alerts.
*   **Parameters**: None.
*   **Return Value**: None.
*   **Process**: Opens the exit sheet via `EXIT_SHEET_URL`, extracts exit keys (`ID|Email`), dynamically detects columns in the local sheet, sets matching exited employees to `InActive` (row background color `#FFB3B3`), validates Chat space membership for active users, and emails mismatch lists and inactive reports.

---

### File: `send_anniversary_wishes.gs`

#### `sendWorkAnniversaryWishes()`
*   **Purpose**: Finds today's work anniversaries and sends celebratory messages.
*   **Parameters**: None.
*   **Return Value**: None.
*   **Process**: Scans the sheet, identifies active employees whose joining date (day and month) matches today, checks if completed years is greater than 0, fetches their Chat user ID, constructs a congratulatory message (using user ID tags or name), and posts it to the space.

#### `getAnniversaryDayMonthStr(dojValue, timeZone)`
*   **Purpose**: Standardizes various Date and string formats into a `"d-MMM"` string.
*   **Parameters**:
    *   `dojValue` (Date or String)
    *   `timeZone` (String)
*   **Return Value**: String (e.g. `"26-Jul"`).
*   **Process**: Parses string components formatted with hyphens or slashes (e.g. `D-Month-YYYY` or `Month-D-YYYY`), and falls back to `Date.parse()` if formatting differs.

#### `getAnniversaryYear(dojValue, timeZone)`
*   **Purpose**: Extracts the year of joining from dates or date strings.
*   **Parameters**:
    *   `dojValue` (Date or String)
    *   `timeZone` (String)
*   **Return Value**: Integer (e.g. `2018`) or `null`.
*   **Process**: Resolves the four-digit year from the input value by mapping component strings or using the `getFullYear()` method of parsed date objects.

---

## Workflow

```
┌────────────────────────────────────────────────────────┐
│               1. Zoho Synchronization                  │
│  - Refreshes Zoho access token.                        │
│  - Fetches active employee data from Zoho People.      │
│  - Excludes hardcoded employee IDs/emails.             │
│  - Overwrites local sheet with active employee records.│
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│         2. Status & Chat Verification                  │
│  - Opens external exit sheet and builds exit keys.     │
│  - Marks matched employees "InActive" and colors rows  │
│    light red (#FFB3B3).                                │
│  - Verifies "Active" employees in Google Chat space.   │
│  - Emails mismatch and inactive lists to administrator.│
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│              3. Celebration Broadcasting               │
│  - Checks active employee joining dates against today. │
│  - Verifies completed years of service is > 0.         │
│  - Obtains employee's Chat ID for mention markup.      │
│  - Sends work anniversary message to Google Chat Space.│
└────────────────────────────────────────────────────────┘
```

---

## Logging and Error Handling
*   **Stackdriver Integration**: Configured in project settings (`EXCEPTION_LOGGING: STACKDRIVER`) to capture unhandled exceptions.
*   **API Response Checks**: The code checks HTTP status codes during Zoho People API requests and Zoho OAuth requests. If not `200`, it throws an error containing the status code and text response.
*   **Graceful Operations**:
    *   External spreadsheet connections are wrapped in `try-catch` structures; loading failures are logged to Apps Script execution logs without breaking execution.
    *   Google Chat Space membership queries are wrapped in `try-catch` blocks. Failures to locate specific members are logged, and the script defaults to using the employee's plain text name instead of throwing an exception.
    *   Administrative emails and Chat posting functions run inside separate `try-catch` scopes.

---

## Troubleshooting
*   **Missing Spreadsheet Headers**: If the script logs `Error: Could not locate Name, Email, or Date of Joining columns` or `Employee ID, Email, or Status columns`, confirm that your spreadsheets contain headers resembling `Name`, `Email`, `Date of joining`, or `Status`.
*   **Zoho Access Denied**: If synchronization triggers a `Failed to refresh Zoho token` error, verify that the `CLIENT_ID`, `CLIENT_SECRET`, and `REFRESH_TOKEN` script properties are correctly set and active.
*   **Google Chat Post Failures**: If wishes fail to post, ensure the Chat advanced service is active, the Apps Script project manifest contains Chat scopes, and the `SPACE_ID` matches your space name.

---

## Conclusion
The **Work Anniversary Automation** system connects Zoho People, Google Sheets, Google Mail, and Google Chat to automate employee verification and celebration workflows. It removes manual oversight by identifying exited users, flagging workspace accounts needing registration, and keeping employee milestones celebrated.
