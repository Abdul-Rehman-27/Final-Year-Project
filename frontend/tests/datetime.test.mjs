import test from "node:test";
import assert from "node:assert/strict";
import { formatShort, formatTime, formatDate, formatDay, mmss, dayPart } from "../src/utils/datetime.js";

const tz = "Asia/Karachi";
const iso = "2026-11-27T05:30:00Z";

test("formats date and time in both languages with Latin digits", () => {
  assert.equal(formatShort(iso, "en", tz), "Fri 27 Nov · 10:30");
  assert.equal(formatTime(iso, tz), "10:30");
  assert.equal(formatDate(iso, "en", tz), "27 Nov 2026");
  assert.equal(formatDay(iso, "en", tz), "Friday, 27 November");
  for (const lang of ["en", "ur"]) {
    for (const value of [formatShort(iso, lang, tz), formatDate(iso, lang, tz), formatDay(iso, lang, tz)]) {
      assert.match(value, /27/);
      assert.doesNotMatch(value, /[۰-۹]/);
    }
  }
});

test("formats countdowns and hospital day parts", () => {
  assert.equal(mmss(120000), "2:00");
  assert.equal(mmss(-500), "0:00");
  assert.equal(dayPart(Date.parse("2026-11-27T05:30:00Z"), tz), "morning");
  assert.equal(dayPart(Date.parse("2026-11-27T08:00:00Z"), tz), "afternoon");
  assert.equal(dayPart(Date.parse("2026-11-27T13:00:00Z"), tz), "evening");
});
