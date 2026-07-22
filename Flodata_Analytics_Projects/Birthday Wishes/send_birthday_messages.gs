function sendBirthdayWishes() {

  // Convert the DOB into DD-MMM format, such as 20-Feb
  function getBirthDayMonthStr(dobValue, timeZone) {
    if (!dobValue) return "";

    // When Google Sheets already provides a Date object
    if (dobValue instanceof Date && !isNaN(dobValue.getTime())) {
      return Utilities.formatDate(dobValue, timeZone, "dd-MMM");
    }

    const str = dobValue.toString().trim();
    if (!str) return "";

    const parts = str.split(/[-/]/);

    if (parts.length === 3) {
      const p1 = parts[0].trim();
      const p2 = parts[1].trim();
      const p3 = parts[2].trim();

      // Case 1: DD-MMM-YYYY
      // Example: 20-Feb-2000
      if (
        /^\d{1,2}$/.test(p1) &&
        /^[a-zA-Z]{3}$/.test(p2) &&
        /^\d{4}$/.test(p3)
      ) {
        const day = p1.padStart(2, "0");
        const month =
          p2.charAt(0).toUpperCase() +
          p2.slice(1).toLowerCase();

        return `${day}-${month}`;
      }

      // Case 2: MM/DD/YYYY or MM-DD-YYYY
      // Example: 4/12/2000 means 12-Apr
      if (
        /^\d{1,2}$/.test(p1) &&
        /^\d{1,2}$/.test(p2) &&
        /^\d{4}$/.test(p3)
      ) {
        const monthIndex = parseInt(p1, 10) - 1;
        const day = p2.padStart(2, "0");

        if (monthIndex >= 0 && monthIndex < 12) {
          const MONTHS = [
            "Jan", "Feb", "Mar", "Apr",
            "May", "Jun", "Jul", "Aug",
            "Sep", "Oct", "Nov", "Dec"
          ];

          return `${day}-${MONTHS[monthIndex]}`;
        }
      }

      // Case 3: MMM-YYYY-DD
      // Example: Apr-2000-16
      if (
        /^[a-zA-Z]+$/.test(p1) &&
        /^\d{4}$/.test(p2) &&
        /^\d{1,2}$/.test(p3)
      ) {
        const day = p3.padStart(2, "0");
        const shortMonth = p1.substring(0, 3);

        const month =
          shortMonth.charAt(0).toUpperCase() +
          shortMonth.slice(1).toLowerCase();

        return `${day}-${month}`;
      }
    }

    // Fallback date parser
    const parsedDate = Date.parse(str);

    if (!isNaN(parsedDate)) {
      return Utilities.formatDate(
        new Date(parsedDate),
        timeZone,
        "dd-MMM"
      );
    }

    return "";
  }

  // Safely convert timestamp values into Date objects
  function parseTimestamp(timestampValue) {
    if (
      timestampValue instanceof Date &&
      !isNaN(timestampValue.getTime())
    ) {
      return timestampValue;
    }

    if (!timestampValue) {
      return new Date(0);
    }

    const parsedTimestamp = new Date(timestampValue);

    if (!isNaN(parsedTimestamp.getTime())) {
      return parsedTimestamp;
    }

    return new Date(0);
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CHAT_CONFIG.SHEET_NAME);

    if (!sheet) {
      Logger.log(
        `Error: Sheet "${CHAT_CONFIG.SHEET_NAME}" not found.`
      );
      return;
    }

    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      Logger.log(
        "Info: No employee data found in the sheet."
      );
      return;
    }

    const headers = data[0];

    let nameColIndex = -1;
    let emailColIndex = -1;
    let dobColIndex = -1;
    let empIdColIndex = -1;
    let timestampColIndex = -1;
    let statusColIndex = -1;

    // Find columns dynamically
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i]
        .toString()
        .trim()
        .toLowerCase();

      if (
        h === "employee full name" ||
        h === "full name" ||
        h === "employee name" ||
        h === "name"
      ) {
        nameColIndex = i;
      }

      if (
        h.includes("official mail") ||
        h.includes("email") ||
        h.includes("mail id")
      ) {
        emailColIndex = i;
      }

      if (
        h.includes("actual") &&
        (
          h.includes("birth") ||
          h.includes("date") ||
          h.includes("dob")
        )
      ) {
        dobColIndex = i;
      }

      if (
        h.includes("employee id") ||
        h.includes("intern code") ||
        h === "emp id" ||
        h.includes("employee_id")
      ) {
        empIdColIndex = i;
      }

      if (
        h === "timestamp" ||
        h.includes("submission time")
      ) {
        timestampColIndex = i;
      }

      if (
        h === "status" ||
        h === "employee status"
      ) {
        statusColIndex = i;
      }
    }

    if (
      nameColIndex === -1 ||
      emailColIndex === -1 ||
      dobColIndex === -1
    ) {
      Logger.log(
        "Error: Could not find the Employee Full Name, Official Mail ID or Actual Date of Birth columns."
      );
      return;
    }

    const timeZone =
      ss.getSpreadsheetTimeZone() ||
      Session.getScriptTimeZone();

    const todayStr = Utilities.formatDate(
      new Date(),
      timeZone,
      "dd-MMM"
    );

    const birthdayEmployees = [];

    Logger.log(
      `Scanning records for today's date: ${todayStr} ` +
      `(TimeZone: ${timeZone})`
    );

    // Group all submissions by Employee ID or email
    const employeesMap = {};

    for (let r = 1; r < data.length; r++) {
      const row = data[r];

      // Skip inactive employees
      if (statusColIndex !== -1) {
        const statusValue = row[statusColIndex]
          ? row[statusColIndex]
              .toString()
              .trim()
              .toLowerCase()
          : "";

        if (statusValue === "inactive") {
          continue;
        }
      }

      const name = row[nameColIndex]
        ? row[nameColIndex].toString().trim()
        : "";

      const email = row[emailColIndex]
        ? row[emailColIndex].toString().trim()
        : "";

      const empId =
        empIdColIndex !== -1 && row[empIdColIndex]
          ? row[empIdColIndex].toString().trim()
          : "";

      const dobValue = row[dobColIndex];

      const timestampValue =
        timestampColIndex !== -1
          ? row[timestampColIndex]
          : null;

      const timestampDate =
        parseTimestamp(timestampValue);

      const groupKey = empId
        ? empId.toLowerCase()
        : email.toLowerCase();

      if (!groupKey) continue;

      if (!employeesMap[groupKey]) {
        employeesMap[groupKey] = [];
      }

      employeesMap[groupKey].push({
        name: name,
        email: email,
        dobValue: dobValue,
        timestamp: timestampDate,
        rowIndex: r
      });
    }

    const spaceName = CHAT_CONFIG.SPACE_NAME;

    // Process each employee
    for (const groupKey in employeesMap) {
      const rows = employeesMap[groupKey];

      // Newest submission first
      rows.sort((a, b) => {
        const timeA = a.timestamp.getTime();
        const timeB = b.timestamp.getTime();

        if (timeA !== timeB) {
          return timeB - timeA;
        }

        return b.rowIndex - a.rowIndex;
      });

      const newestSubmission = rows[0];

      const dobDayMonth = getBirthDayMonthStr(
        newestSubmission.dobValue,
        timeZone
      );

      if (dobDayMonth !== todayStr) {
        continue;
      }

      let targetSubmission = null;
      let targetUserId = null;

      // Check each email against Google Chat membership
      for (let i = 0; i < rows.length; i++) {
        const submission = rows[i];

        const email = submission.email
          ? submission.email.toString().trim()
          : "";

        const isValidEmail =
          email &&
          email.includes("@") &&
          email.lastIndexOf(".") >
            email.indexOf("@");

        if (!isValidEmail) {
          continue;
        }

        if (
          !spaceName ||
          spaceName === "spaces/YOUR_SPACE_ID_HERE"
        ) {
          continue;
        }

        try {
          const memberName =
            `${spaceName}/members/${email.toLowerCase()}`;

          const membership =
            Chat.Spaces.Members.get(memberName);

          if (
            membership &&
            membership.member &&
            membership.member.name
          ) {
            targetSubmission = submission;

            const userNameParts =
              membership.member.name.split("/");

            if (userNameParts.length >= 2) {
              targetUserId =
                userNameParts[userNameParts.length - 1];
            }

            break;
          }
        } catch (err) {
          Logger.log(
            `Membership lookup failed for ${email}: ` +
            `${err.message}`
          );
        }
      }

      if (targetSubmission) {
        birthdayEmployees.push({
          name: targetSubmission.name,
          email: targetSubmission.email,
          userId: targetUserId
        });

        Logger.log(
          `Added ${targetSubmission.name} ` +
          `(${targetSubmission.email}) for birthday wishes.`
        );
      } else {
        Logger.log(
          `Skipping employee group ${groupKey}: ` +
          `no matching Google Chat member was found.`
        );
      }
    }

    if (birthdayEmployees.length === 0) {
      Logger.log(
        "Info: No birthday employees found today who are members of the Google Chat space."
      );
      return;
    }

    if (
      !spaceName ||
      spaceName === "spaces/YOUR_SPACE_ID_HERE"
    ) {
      throw new Error(
        "Google Chat SPACE_NAME has not been configured in CHAT_CONFIG."
      );
    }

    // Create real Google Chat mentions
    const mentions = birthdayEmployees
      .map(function (employee) {
        if (employee.userId) {
          return `<users/${employee.userId}>`;
        }

        return `@${employee.name}`;
      })
      .join(" ");

    const messageText =
      `🎉 Happy Birthday ${mentions} 🎂🥳`;

    Logger.log(
      `${birthdayEmployees.length} birthday employee(s) ` +
      `detected. Sending message.`
    );

    const message = {
      text: messageText
    };

    Chat.Spaces.Messages.create(
      message,
      spaceName
    );

    Logger.log(
      "Successfully sent the birthday wishes message."
    );

  } catch (error) {
    Logger.log(
      `Critical Error in sendBirthdayWishes: ` +
      `${error.toString()}`
    );

    console.error(error);
  }
}
