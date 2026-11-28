import test from "node:test";
import assert from "node:assert/strict";
import { buildQueue, createMockApi } from "../src/data/mockDoctorPortal.js";

const now=Date.now();const at=(minutes)=>new Date(now+minutes*60000).toISOString();
const row=(id,offset,{visit="scheduled",check=null,call=null}={})=>({id,status:"confirmed",visit_status:visit,starts_at:at(offset),checked_in_at:check==null?null:at(check),called_at:call==null?null:at(call),completed_at:visit==="completed"||visit==="incomplete"?at(offset+1):null,patient_name:`Patient ${id}`,token_no:`A-${id}`});
test("classifies all queue states and counts visible and expected items",()=>{
  const records=[row(1,-10,{visit:"completed"}),row(2,-8,{visit:"incomplete"}),row(3,-6,{visit:"in_progress",check:-8,call:-5}),row(4,-3,{check:-1}),row(5,-2,{check:-1}),row(6,10),row(7,-20)];
  const q=buildQueue(records,now,5),states=Object.fromEntries(q.items.map(x=>[x.id,x.queue_state]));
  assert.deepEqual(states,{3:"in_progress",5:"waiting",4:"waiting",1:"completed",2:"incomplete"});
  assert.deepEqual(q.expected.map(x=>x.id),[7,6]);
  assert.equal(q.counts.all,5);assert.equal(q.counts.waiting,2);assert.equal(q.counts.in_progress,1);
});
test("expires exactly at grace boundary and orders in-grace check-ins ahead of later arrivals",()=>{
  const q=buildQueue([row(1,-5),row(2,-4,{check:0}),row(3,-8,{check:-2}),row(4,-20,{check:1})],now,5);
  assert.equal(q.expected.find(x=>x.id===1).expected_state,"grace_expired");
  assert.equal(q.items.find(x=>x.id===2).position,1);
  assert.equal(q.items.find(x=>x.id===3).position,2);
  assert.equal(q.items.find(x=>x.id===4).position,3);
});
test("reports in-progress, grace-held, and not-next call blockers",()=>{
  const q=buildQueue([row(1,-20,{visit:"in_progress",check:-25,call:-18}),row(2,-10,{check:-9}),row(3,-5),row(4,10,{check:-1}),row(5,30,{check:0})],now,5);
  assert.equal(q.items.find(x=>x.id===4).call_blocked_reason,"in_progress");
  const free=buildQueue([row(1,-4),row(2,10,{check:-1}),row(3,30,{check:0})],now,5);
  assert.equal(free.items.find(x=>x.id===2).call_blocked_reason,"held");
  assert.equal(free.items.find(x=>x.id===3).call_blocked_reason,"held");
  const noHold=buildQueue([row(1,-10,{check:-9}),row(2,10,{check:0}),row(3,30,{check:1})],now,5);
  assert.equal(noHold.items.find(x=>x.id===1).can_call,true);
  assert.equal(noHold.items.find(x=>x.id===2).call_blocked_reason,"not_next");
});
test("mock queue endpoints expose contract shapes and enforce visit transitions",async()=>{
  const api=createMockApi({id:91,full_name:"Test Doctor"});
  const initial=await api.getQueue();
  assert.equal(initial.items.length,6);
  assert.equal(initial.counts.all,6);
  assert.deepEqual(initial.items.map(x=>x.queue_state),["in_progress","holding","waiting","waiting","completed","incomplete"]);
  assert.equal(initial.items.find(x=>x.id===5).call_blocked_reason,"in_progress");
  await assert.rejects(api.setVisitStatus(5,"in_progress"),e=>e.code==="ALREADY_IN_PROGRESS"&&e.status===409);
  const detail=await api.setVisitStatus(3,"completed");
  assert.equal(detail.visit_status,"completed");
  assert.equal(detail.patient.full_name,"Bilal Ahmed");
  await assert.rejects(api.setVisitStatus(5,"in_progress"),e=>e.code==="QUEUE_HELD"&&e.status===409);
  const updated=await api.getQueue();
  assert.equal(updated.items.find(x=>x.id===3).queue_state,"completed");
  assert.equal(updated.items.find(x=>x.id===5).call_blocked_reason,"held");
  const checked=await api.checkIn(4);
  assert.equal(checked.queue_state,"waiting");
  await assert.rejects(api.checkIn(4),e=>e.code==="ALREADY_CHECKED_IN"&&e.status===409);
});
