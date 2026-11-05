import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  isBirthdayOn,
  isUnavailableOn,
  occursOn,
  pickRotationMember,
  toInstant,
  type Schedule,
} from "./occurrences";

const base: Schedule = { frequency: "DAILY", dayOfWeek: null, dayOfMonth: null, startDate: "2026-01-01" };

describe("occursOn", () => {
  it("never fires before the start date", () => {
    assert.equal(occursOn(base, "2025-12-31"), false);
    assert.equal(occursOn(base, "2026-01-01"), true);
  });

  it("fires a ONCE rule only on its start date", () => {
    const once: Schedule = { ...base, frequency: "ONCE" };
    assert.equal(occursOn(once, "2026-01-01"), true);
    assert.equal(occursOn(once, "2026-01-02"), false);
  });

  it("matches the weekday of a WEEKLY rule", () => {
    const mondays: Schedule = { ...base, frequency: "WEEKLY", dayOfWeek: 1 };
    assert.equal(occursOn(mondays, "2026-11-02"), true); // a Monday
    assert.equal(occursOn(mondays, "2026-11-03"), false);
  });

  it("uses the last day of months that are too short", () => {
    const day31: Schedule = { ...base, frequency: "MONTHLY", dayOfMonth: 31 };
    assert.equal(occursOn(day31, "2026-02-28"), true);
    assert.equal(occursOn(day31, "2026-02-27"), false);
    assert.equal(occursOn(day31, "2028-02-29"), true); // leap year
    assert.equal(occursOn(day31, "2028-02-28"), false);
    assert.equal(occursOn(day31, "2026-03-31"), true);
    assert.equal(occursOn(day31, "2026-04-30"), true);
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

describe("pickRotationMember", () => {
  const everyone = ["a", "b", "c"];

  it("picks the person at the position, wrapping around", () => {
    assert.equal(pickRotationMember(everyone, 1, () => true), "b");
    assert.equal(pickRotationMember(everyone, 4, () => true), "b");
  });

  it("skips an unavailable person", () => {
    assert.equal(pickRotationMember(everyone, 0, (id) => id !== "a"), "b");
    assert.equal(pickRotationMember(everyone, 2, (id) => id !== "c"), "a");
  });

  it("returns null when nobody is available", () => {
    assert.equal(pickRotationMember(everyone, 0, () => false), null);
    assert.equal(pickRotationMember([], 0, () => true), null);
  });
});

describe("isUnavailableOn", () => {
  it("includes both the first and the last day", () => {
    const periods = [{ from: "2026-12-01", to: "2026-12-14" }];
    assert.equal(isUnavailableOn(periods, "2026-11-30"), false);
    assert.equal(isUnavailableOn(periods, "2026-12-01"), true);
    assert.equal(isUnavailableOn(periods, "2026-12-14"), true);
    assert.equal(isUnavailableOn(periods, "2026-12-15"), false);
  });
});

describe("toInstant", () => {
  it("handles winter and summer time in Budapest", () => {
    assert.equal(toInstant("2026-01-15", "18:00", "Europe/Budapest").toISOString(), "2026-01-15T17:00:00.000Z");
    assert.equal(toInstant("2026-07-15", "18:00", "Europe/Budapest").toISOString(), "2026-07-15T16:00:00.000Z");
  });

  it("handles the days the clocks change", () => {
    assert.equal(toInstant("2026-03-29", "08:00", "Europe/Budapest").toISOString(), "2026-03-29T06:00:00.000Z");
    assert.equal(toInstant("2026-10-25", "08:00", "Europe/Budapest").toISOString(), "2026-10-25T07:00:00.000Z");
  });

  it("handles a midnight that falls on the previous UTC day", () => {
    assert.equal(toInstant("2026-11-05", "00:00", "Asia/Tokyo").toISOString(), "2026-11-04T15:00:00.000Z");
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  });
});
