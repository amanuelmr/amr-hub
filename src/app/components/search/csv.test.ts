import { describe, expect, it } from "vitest";
import { escapeCsvCell, toCsv } from "./csv";

describe("csv", () => {
  it("leaves plain values alone", () => {
    expect(escapeCsvCell("AMR-1")).toBe("AMR-1");
    expect(escapeCsvCell(5)).toBe("5");
    expect(escapeCsvCell(null)).toBe("");
  });

  it("quotes commas, quotes, newlines and edge whitespace", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeCsvCell(" padded")).toBe('" padded"');
  });

  it("neutralizes formulas but keeps negative numbers", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
    expect(escapeCsvCell("-x")).toBe("'-x");
    expect(escapeCsvCell("-5")).toBe("-5");
  });

  it("joins rows with CRLF", () => {
    expect(toCsv(["Key", "Summary"], [["AMR-1", "Fix, now"]])).toBe(
      'Key,Summary\r\nAMR-1,"Fix, now"',
    );
  });
});
