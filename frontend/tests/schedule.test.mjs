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
