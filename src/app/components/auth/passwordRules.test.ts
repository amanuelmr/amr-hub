import { describe, expect, it } from "vitest";
import {
  isPasswordAcceptable,
  passwordRequirements,
  passwordScore,
  passwordStrengthLabel,
} from "./passwordRules";

describe("passwordRules", () => {
  it("only the length rule is required", () => {
    const required = passwordRequirements("").filter((rule) => rule.required);
    expect(required.map((rule) => rule.id)).toEqual(["length"]);
  });

  it("accepts 12–128 characters", () => {
    expect(isPasswordAcceptable("a".repeat(11))).toBe(false);
    expect(isPasswordAcceptable("a".repeat(12))).toBe(true);
    expect(isPasswordAcceptable("a".repeat(129))).toBe(false);
  });

  it("caps the score of short passwords", () => {
    expect(passwordScore("")).toBe(0);
    expect(passwordScore("a!b c")).toBeLessThanOrEqual(1);
    expect(passwordStrengthLabel("short")).toBe("Too short");
  });

  it("rates long varied passwords as very strong", () => {
    const password = "correct horse battery 9!";
    expect(passwordScore(password)).toBe(4);
    expect(passwordStrengthLabel(password)).toBe("Very strong");
    expect(passwordRequirements(password).every((rule) => rule.met)).toBe(true);
  });
});
