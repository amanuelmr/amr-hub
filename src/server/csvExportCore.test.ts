import { describe, expect, it } from "vitest";
import {
  escapeCsvField,
  exportFileName,
  htmlToPlainText,
  minutesToHours,
  toCsv,
} from "./csvExportCore";

describe("csv export helpers", () => {
  it("escapes fields per RFC 4180", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField('a "b", c')).toBe('"a ""b"", c"');
    expect(escapeCsvField("x\ny")).toBe('"x\ny"');
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(3)).toBe("3");
  });

  it("guards spreadsheet formulas", () => {
    expect(escapeCsvField("=HYPERLINK()")).toBe("'=HYPERLINK()");
    expect(escapeCsvField("@cmd")).toBe("'@cmd");
    expect(escapeCsvField("-5")).toBe("-5");
  });

  it("joins rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["1", "2"]])).toBe("a,b\r\n1,2\r\n");
  });

  it("converts rich text to plain text", () => {
    expect(htmlToPlainText("<p>Hello &amp; <strong>bye</strong></p><p>a<br>b</p>")).toBe(
      "Hello & bye\n\na\nb",
    );
  });

  it("formats hours and file names", () => {
    expect(minutesToHours(90)).toBe("1.5");
    expect(minutesToHours(null)).toBe("");
    expect(exportFileName("WEB", "csv", new Date("2026-10-16T10:00:00Z"))).toBe(
      "amr-hub-WEB-2026-10-16.csv",
    );
  });
});
