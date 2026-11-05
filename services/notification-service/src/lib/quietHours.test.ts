import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBirthdayOn } from "./dates";
import { isQuietTime } from "./quietHours";

describe("isQuietTime", () => {
  it("is never quiet when nothing is set", () => {
    assert.equal(isQuietTime(null, null, "12:00"), false);
    assert.equal(isQuietTime("10:00", null, "12:00"), false);
    assert.equal(isQuietTime("10:00", "10:00", "10:00"), false);
  });

  it("handles a window within one day", () => {
    assert.equal(isQuietTime("09:00", "17:00", "08:59"), false);
    assert.equal(isQuietTime("09:00", "17:00", "09:00"), true);
    assert.equal(isQuietTime("09:00", "17:00", "16:59"), true);
    assert.equal(isQuietTime("09:00", "17:00", "17:00"), false);
  });

  it("handles a window past midnight", () => {
    assert.equal(isQuietTime("22:00", "07:00", "21:59"), false);
    assert.equal(isQuietTime("22:00", "07:00", "23:30"), true);
    assert.equal(isQuietTime("22:00", "07:00", "00:00"), true);
    assert.equal(isQuietTime("22:00", "07:00", "06:59"), true);
    assert.equal(isQuietTime("22:00", "07:00", "07:00"), false);
  });
});

describe("isBirthdayOn", () => {
  it("ignores the birth year", () => {
    assert.equal(isBirthdayOn("1999-03-14", "2026-03-14"), true);
    assert.equal(isBirthdayOn("1999-03-14", "2026-03-15"), false);
  });

  it("moves 29 Feb to 28 Feb in non-leap years only", () => {
    assert.equal(isBirthdayOn("2000-02-29", "2026-02-28"), true);
    assert.equal(isBirthdayOn("2000-02-29", "2028-02-28"), false);
    assert.equal(isBirthdayOn("2000-02-29", "2028-02-29"), true);
  });
});
