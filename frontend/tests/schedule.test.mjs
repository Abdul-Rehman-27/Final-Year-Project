import test from "node:test";
import assert from "node:assert/strict";
import { expandWindow, validateDay } from "../src/utils/schedule.js";

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
});
