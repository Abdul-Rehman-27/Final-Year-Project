import test from "node:test";
import assert from "node:assert/strict";
import { fill } from "../src/utils/format.js";
import { formatShort, formatTime, mmss, dayPart } from "../src/utils/datetime.js";

test("fills named placeholders",()=>assert.equal(fill("Hello {name} · {count}",{name:"Ayesha",count:2}),"Hello Ayesha · 2"));
test("formats hospital time using Latin digits and nonnegative countdowns",()=>{
  assert.match(formatShort("2026-11-27T05:30:00Z","en","Asia/Karachi"),/Fri 27 Nov · 10:30/);
  assert.equal(formatTime("2026-11-27T05:30:00Z","Asia/Karachi"),"10:30");
  assert.equal(mmss(120000),"2:00");assert.equal(mmss(-1000),"0:00");
  assert.equal(dayPart(Date.parse("2026-11-27T05:30:00Z"),"Asia/Karachi"),"morning");
});
