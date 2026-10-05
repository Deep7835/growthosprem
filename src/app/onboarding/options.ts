// Choices for onboarding (OB-02). India first; currency follows the country.

export const COUNTRIES = [
  { code: "IN", name: "India", timezone: "Asia/Kolkata" },
  { code: "AE", name: "United Arab Emirates", timezone: "Asia/Dubai" },
  { code: "SG", name: "Singapore", timezone: "Asia/Singapore" },
  { code: "GB", name: "United Kingdom", timezone: "Europe/London" },
  { code: "US", name: "United States", timezone: "America/New_York" },
  { code: "CA", name: "Canada", timezone: "America/Toronto" },
  { code: "AU", name: "Australia", timezone: "Australia/Sydney" },
  { code: "OTHER", name: "Somewhere else", timezone: "UTC" },
] as const;

export const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "UTC",
] as const;

export const SPACE_COLORS = ["#F2A93B", "#7FC8A9", "#9DB7F5", "#F28B82", "#C4A7E7", "#E9E4D8"] as const;
