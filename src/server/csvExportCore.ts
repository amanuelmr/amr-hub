/** Pure CSV writing helpers (RFC 4180 output with spreadsheet formula guarding). */

/**
 * Prefixes values a spreadsheet would execute as a formula with an apostrophe
 * (CSV injection guard). The importer strips it again on the way back in.
 */
export function guardFormula(value: string) {
  return /^[=+@\t\r]/.test(value) ? `'${value}` : value;
}

export function escapeCsvField(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = guardFormula(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serializes rows to CSV with CRLF line endings (as RFC 4180 specifies). */
export function toCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n") + "\r\n";
}

/** Rich-text HTML → readable plain text for CSV cells. */
export function htmlToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|blockquote|pre)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function minutesToHours(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "";
  return String(Math.round((minutes / 60) * 100) / 100);
}

export function exportFileName(scope: string, extension: "csv" | "json", now = new Date()) {
  const safeScope = scope.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "export";
  return `amr-hub-${safeScope}-${now.toISOString().slice(0, 10)}.${extension}`;
}
