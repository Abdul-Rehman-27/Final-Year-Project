import test from "node:test";
import assert from "node:assert/strict";
import { expandWindow, validateDay } from "../src/utils/schedule.js";
import { mockDoctorPortalService } from "../src/data/mockDoctorPortal.js";

test("expands the requested slot windows and drops incomplete tails",()=>{
  assert.deepEqual(expandWindow("10:30","12:45",45),["10:30","11:15","12:00"]);
  assert.deepEqual(expandWindow("09:00","10:00",30),["09:00","09:30"]);
  assert.deepEqual(expandWindow("09:00","10:10",30),["09:00","09:30"]);
});
test("validates active days and skips inactive days",()=>{
  const base={weekday:0,is_active:true,start_time:"09:00",end_time:"10:00",slot_minutes:30,room_label:"Room 1"};
  assert.equal(validateDay(base),null);
  assert.equal(validateDay({...base,end_time:"08:00"}),"doctor.availability.endAfterStart");
  assert.equal(validateDay({...base,start_time:"09:45"}),"doctor.availability.slotDoesNotFit");
  assert.equal(validateDay({...base,is_active:false,start_time:null,end_time:null}),null);
  assert.equal(validateDay({...base,end_time:"09:30",slot_minutes:45}),"doctor.availability.slotDoesNotFit");
  assert.equal(validateDay({...base,room_label:"R".repeat(41)}),"doctor.availability.roomTooLong");
  assert.equal(validateDay({...base,start_time:"25:00"}),"doctor.availability.endAfterStart");
});

test("mock schedule saves replace all seven days and reject invalid schedules",async()=>{
  const original=await mockDoctorPortalService.getSchedule();
  const edited=original.days.map((day)=>day.weekday===1
    ? {...day,is_active:true,start_time:"09:00",end_time:"10:00",slot_minutes:30,room_label:"Floor 2 · Room 12"}
    : day);
  const saved=await mockDoctorPortalService.putSchedule(edited);
  assert.equal(saved.days[1].is_active,true);
  assert.deepEqual(saved.days[1],{weekday:1,is_active:true,start_time:"09:00",end_time:"10:00",slot_minutes:30,room_label:"Floor 2 · Room 12"});
  const stored=await mockDoctorPortalService.getSchedule();
  assert.deepEqual(stored.days,saved.days);
  const dashboard=await mockDoctorPortalService.getDashboard();
  assert.deepEqual(dashboard.schedule,saved.days);
  await assert.rejects(mockDoctorPortalService.putSchedule(edited.slice(1)),(err)=>err.code==="SCHEDULE_INVALID"&&err.status===422);
  await assert.rejects(mockDoctorPortalService.putSchedule(edited.map((day,index)=>index===1?{...day,end_time:"08:00"}:day)),(err)=>err.code==="SCHEDULE_INVALID"&&err.status===422);
  await mockDoctorPortalService.putSchedule(original.days);
});

import { daySessions, withSessions, validateSessionsDay, dayHasErrors, sessionSlots } from "../src/utils/schedule.js";

const s1 = { start_time: "09:00", end_time: "13:00", slot_minutes: 15, room_label: "Room 101" };
const s2 = { start_time: "14:00", end_time: "17:00", slot_minutes: 30, room_label: "Room 205" };
const day = (sessions, breaks = []) => withSessions({ weekday: 0 }, sessions, breaks);

test("daySessions falls back to the legacy single window", () => {
  assert.deepEqual(daySessions({ is_active: true, start_time: "09:00", end_time: "12:00", slot_minutes: 30, room_label: "R" }), [{ start_time: "09:00", end_time: "12:00", slot_minutes: 30, room_label: "R" }]);
  assert.deepEqual(daySessions({ is_active: false }), []);
});

test("withSessions keeps legacy fields equal to the first session", () => {
  const d = day([s1, s2]);
  assert.equal(d.is_active, true); assert.equal(d.start_time, "09:00"); assert.equal(d.room_label, "Room 101");
  const off = day([]);
  assert.equal(off.is_active, false); assert.equal(off.start_time, null); assert.deepEqual(off.breaks, []);
});

test("two valid sessions with a break inside one are valid", () => {
  assert.equal(dayHasErrors(day([s1, s2], [{ start_time: "10:00", end_time: "10:30" }])), false);
});

test("overlapping sessions, bad range, slot that does not fit are flagged", () => {
  assert.equal(validateSessionsDay(day([s1, { ...s2, start_time: "12:00" }])).sessions[1], "doctor.availability.sessionsOverlap");
  assert.equal(validateSessionsDay(day([{ ...s1, end_time: "09:00" }])).sessions[0], "doctor.availability.endAfterStart");
  assert.equal(validateSessionsDay(day([{ ...s1, end_time: "09:10" }])).sessions[0], "doctor.availability.slotDoesNotFit");
  assert.equal(validateSessionsDay(day([{ ...s1, room_label: "x".repeat(41) }])).sessions[0], "doctor.availability.roomTooLong");
});

test("breaks must lie inside a session and not overlap", () => {
  assert.equal(validateSessionsDay(day([s1, s2], [{ start_time: "13:00", end_time: "14:00" }])).breaks[0], "doctor.availability.breakOutside");
  const r = validateSessionsDay(day([s1], [{ start_time: "10:00", end_time: "11:00" }, { start_time: "10:30", end_time: "11:30" }]));
  assert.equal(r.breaks[1], "doctor.availability.breaksOverlap");
});

test("sessionSlots skips slots touching a break", () => {
  const slots = sessionSlots({ start_time: "09:00", end_time: "11:00", slot_minutes: 30, room_label: "" }, [{ start_time: "09:45", end_time: "10:15" }]);
  assert.deepEqual(slots, ["09:00", "10:30"]);
});

import { monthGrid, shiftMonth, daysInMonth, dayKind } from "../src/utils/calendar.js";

test("month grid starts on Monday and pads to full weeks", () => {
  const weeks = monthGrid("2026-12");            // 1 Dec 2026 is a Tuesday
  assert.equal(weeks[0][0], null); assert.equal(weeks[0][1], "2026-12-01");
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks.flat().filter(Boolean).length, 31);
});
test("shiftMonth crosses years and daysInMonth handles leap years", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01"); assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(daysInMonth("2028-02"), 29);
});
test("dayKind maps sources", () => {
  assert.equal(dayKind({ source: "leave" }), "off"); assert.equal(dayKind({ source: "custom_hours", is_working: true }), "modified");
  assert.equal(dayKind({ source: "extra_session", is_working: true }), "extra"); assert.equal(dayKind({ source: "template", is_working: true }), "normal");
  assert.equal(dayKind({ source: "template", is_working: false }), "closed");
});
