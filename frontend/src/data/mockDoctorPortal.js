import { loadSession } from "../services/session.js";
import { validateDay } from "../utils/schedule.js";

const TZ="Asia/Karachi", now=Date.now(), iso=(offset)=>new Date(now+offset*60000).toISOString();
const doctor=()=>{const u=loadSession().user||{id:1,full_name:"Doctor",role:"doctor"}; return {id:u.id,full_name:u.full_name||"Doctor",department:"Cardiology",specialty:"Cardiologist"};};
const people=["Ayesha Khan","Bilal Ahmed","Kamran Ali","Mariam Siddiqui","Sidra Aslam","Usman Tariq","Zainab Iqbal"].map((full_name,i)=>({id:i+1,full_name,age:[34,52,60,45,28,39,31][i],gender:i===0||i===3||i===4||i===6?"female":"male",email:full_name.toLowerCase().replace(" ",".")+"@example.com"}));
const appts=[
  [-85,2,"completed",-90,-84,"Annual review"],[-70,4,"incomplete",-75,null,"Headache follow-up"],[-33,1,"in_progress",-40,-22,"Hypertension review"],[-3,6,"scheduled",null,null,"Follow-up"],[12,0,"scheduled",-6,null,"Chest pressure on stairs"],[27,3,"scheduled",-8,null,"Follow-up"],[57,5,"scheduled",null,null,"New visit"]
].map(([offset,p,visit_status,check,call,reason],i)=>({id:i+1,booking_no:`APT-${2040+i}`,patient_id:people[p].id,patient_name:people[p].full_name,patient_age:people[p].age,starts_at:iso(offset),checked_in_at:check==null?null:iso(check),called_at:call==null?null:iso(call),completed_at:visit_status==="completed"||visit_status==="incomplete"?iso(offset+5):null,status:"confirmed",visit_status,queue_state:"none",token_no:`A-${String(i+1).padStart(2,"0")}`,reason,source:"portal",room_label:"Floor 2 · Room 12"}));
appts.push({id:8,booking_no:"APT-2048",patient_id:people[0].id,patient_name:people[0].full_name,patient_age:people[0].age,starts_at:iso(2*1440),checked_in_at:null,called_at:null,completed_at:null,status:"pending",visit_status:"scheduled",queue_state:"none",token_no:null,reason:"Follow-up",source:"portal",room_label:"Floor 2 · Room 12"});
let schedule=[0,1,2,3,4,5,6].map(weekday=>({weekday,is_active:weekday===0||weekday===3,start_time:weekday===0?"14:00":weekday===3?"10:30":null,end_time:weekday===0?"17:00":weekday===3?"12:45":null,slot_minutes:weekday===3?45:15,room_label:weekday===0||weekday===3?"Floor 2 · Room 12":""}));
const rx=[{id:1042,rx_no:"Rx-1042",patient_id:1,patient_name:people[0].full_name,issued_on:new Date(now-12*86400000).toISOString().slice(0,10),duration_days:14,status:"active",items:[{medicine:"Amlodipine 5 mg",dosage:"1 tablet",timing:"Morning, after food"},{medicine:"Atorvastatin 10 mg",dosage:"1 tablet",timing:"Night"}],instructions:"Take after food unless stated. Do not stop medicines without asking your doctor. Review after 14 days or sooner if you feel dizzy or unwell."},{id:1041,appointment_id:3,rx_no:"Rx-1041",patient_id:2,patient_name:people[1].full_name,issued_on:new Date(now-14*86400000).toISOString().slice(0,10),duration_days:30,status:"active",items:[],instructions:""},{id:1038,rx_no:"Rx-1038",patient_id:3,patient_name:people[2].full_name,issued_on:new Date(now-25*86400000).toISOString().slice(0,10),duration_days:14,status:"completed",items:[],instructions:""},{id:1030,rx_no:"Rx-1030",patient_id:4,patient_name:people[4].full_name,issued_on:new Date(now-35*86400000).toISOString().slice(0,10),duration_days:14,status:"cancelled",items:[],instructions:""}];
let reports=[{id:1,appointment_id:3,report_no:"LAB-1001",test_name:"Complete blood count",kind:"lab",patient_id:2,patient_name:people[1].full_name,status:"ready",created_at:iso(-5*1440),scheduled_for:null,notes:"",results:[{test:"Hemoglobin",result:"13.2",unit:"g/dL",reference:"12.0–15.5",flag:"normal"},{test:"WBC",result:"6.8",unit:"×10³/µL",reference:"4.0–11.0",flag:"normal"},{test:"Platelets",result:"245",unit:"×10³/µL",reference:"150–450",flag:"normal"},{test:"RBC",result:"4.6",unit:"×10⁶/µL",reference:"4.0–5.2",flag:"normal"}],comments:"All values are within the reference range. Results should be read together with your clinical history.",files:[]},{id:2,appointment_id:3,report_no:"RAD-1001",test_name:"Chest X-ray",kind:"radiology",patient_id:2,patient_name:people[1].full_name,status:"ready",created_at:iso(-3*1440),scheduled_for:null,notes:"",results:[],findings:"Lungs are clear. Heart size is normal. No pleural effusion. Bony structures are intact.",impression:"No acute cardiopulmonary findings.",comments:"",reported_by_name:"Dr. Omar Sheikh",files:[]},{id:3,report_no:"LAB-1002",test_name:"Lipid profile",kind:"lab",patient_id:1,patient_name:people[0].full_name,status:"scheduled",created_at:iso(-1*1440),scheduled_for:iso(1440),notes:"",results:[],files:[]},{id:4,report_no:"LAB-1003",test_name:"Liver function",kind:"lab",patient_id:2,patient_name:people[1].full_name,status:"in_progress",created_at:iso(-2*1440),scheduled_for:null,notes:"",results:[],files:[]},{id:5,report_no:"LAB-1004",test_name:"ECG",kind:"lab",patient_id:3,patient_name:people[2].full_name,status:"cancelled",created_at:iso(-9*1440),scheduled_for:null,notes:"",results:[],files:[]}];
const labTests=["Complete blood count","Lipid profile","Blood sugar","Liver function","Chest X-ray","ECG"].map((name,i)=>({id:i+1,name,kind:i===4?"radiology":"lab",prep_note:i===1?"Fasting is usually required — follow the lab's instructions.":""}));
const error=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});}; const delay=()=>new Promise(r=>setTimeout(r,150+Math.random()*200)); const clone=x=>JSON.parse(JSON.stringify(x));
const nowMs=()=>Date.now();
function buildQueue(appointments,nowMs,graceMinutes=5,tz=TZ){
 const today=(d)=>new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(d)); const day=today(nowMs);
 const rows=appointments.filter(a=>["confirmed","completed"].includes(a.status)&&today(a.starts_at)===day).map(a=>{const start=Date.parse(a.starts_at), checked=a.checked_in_at?Date.parse(a.checked_in_at):null, grace=start+graceMinutes*60000; let state;
   if(a.visit_status==="completed")state="completed"; else if(a.visit_status==="incomplete")state="incomplete"; else if(a.visit_status==="in_progress")state="in_progress"; else if(checked!=null)state="waiting"; else if(nowMs<start)state="later"; else if(nowMs<grace)state="holding"; else state="grace_expired";
   const effective=checked!=null&&checked>grace?checked:start; return {...a,queue_state:state,grace_ends_at:state==="holding"?new Date(grace).toISOString():null,_effective:effective}; });
 const inProgress=rows.filter(x=>x.queue_state==="in_progress").sort((a,b)=>Date.parse(a.called_at||0)-Date.parse(b.called_at||0)); const waiting=rows.filter(x=>x.queue_state==="waiting").sort((a,b)=>a._effective-b._effective||Date.parse(a.checked_in_at)-Date.parse(b.checked_in_at)||a.id-b.id); const holding=rows.filter(x=>x.queue_state==="holding");
 const blocked=(w)=>holding.find(h=>Date.parse(h.starts_at)<=w._effective); const positioned=[...inProgress,...waiting]; positioned.forEach((x,i)=>x.position=i+1);
 const qrows=rows.map(x=>{const b=blocked(x), ix=waiting.indexOf(x), reason=x.queue_state==="waiting"?(inProgress.length?"in_progress":b?"held":ix!==0?"not_next":null):null;return {...x,effective_time:new Date(x._effective).toISOString(),position:x.position??null,can_call:x.queue_state==="waiting"&&ix===0&&!b&&!inProgress.length,call_blocked_reason:reason,blocked_by_name:b?.patient_name||null};});
 const expected=rows.filter(x=>["holding","later","grace_expired"].includes(x.queue_state)).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).map(({id,patient_name,starts_at,grace_ends_at,queue_state})=>({id,patient_name,starts_at,grace_ends_at,expected_state:queue_state==="grace_expired"?"grace_expired":queue_state}));
 const active=[...qrows.filter(x=>x.queue_state==="in_progress"),...qrows.filter(x=>x.queue_state==="waiting"||x.queue_state==="holding").sort((a,b)=>{const aTime=a.queue_state==="holding"?Date.parse(a.starts_at):a._effective,bTime=b.queue_state==="holding"?Date.parse(b.starts_at):b._effective;return aTime-bTime||a.id-b.id;}),...qrows.filter(x=>["completed","incomplete"].includes(x.queue_state)).sort((a,b)=>Date.parse(a.completed_at||0)-Date.parse(b.completed_at||0))].map(({_effective,...x})=>x);
 const counts={all:active.length,waiting:waiting.length,in_progress:inProgress.length,completed:rows.filter(x=>x.queue_state==="completed").length,incomplete:rows.filter(x=>x.queue_state==="incomplete").length}; return {entries:qrows.map(({_effective,...x})=>x),items:active,expected,counts};
}
function appointmentRow(a,entry){return {id:a.id,starts_at:a.starts_at,patient_id:a.patient_id,patient_name:a.patient_name,patient_age:a.patient_age??null,reason:a.reason??null,status:a.status,visit_status:a.visit_status,queue_state:entry?.queue_state??a.queue_state,token_no:a.token_no??null};}
function queueItem(a,entry){return {...appointmentRow(a,entry),position:entry?.position??null,checked_in_at:a.checked_in_at??null,called_at:a.called_at??null,completed_at:a.completed_at??null,grace_ends_at:entry?.grace_ends_at??null,can_call:entry?.can_call??false,call_blocked_reason:entry?.call_blocked_reason??null,blocked_by_name:entry?.blocked_by_name??null};}
function findAppointment(id){const a=appts.find(x=>String(x.id)===String(id));if(!a)error("NOT_FOUND",404);return a;}
function isToday(isoDate,now=Date.now(),tz=TZ){const key=(value)=>new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));return key(isoDate)===key(now);}
function effectivePrescriptionStatus(item, now=Date.now()){
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
 const expiry=new Date(item.issued_on+"T00:00:00Z");
 expiry.setUTCDate(expiry.getUTCDate()+Number(item.duration_days||0));
 return item.status==="active"&&new Date(today+"T00:00:00Z")>expiry?"completed":item.status;
}
function appointmentDetail(id){
 const a=findAppointment(id),patient=people.find(p=>p.id===a.patient_id),now=Date.now(),entry=buildQueue(appts,now,5,TZ).entries.find(x=>String(x.id)===String(a.id));
 return {id:a.id,booking_no:a.booking_no,token_no:a.token_no??null,starts_at:a.starts_at,checked_in_at:a.checked_in_at??null,called_at:a.called_at??null,completed_at:a.completed_at??null,status:a.status,visit_status:a.visit_status,queue_state:entry?.queue_state||"none",reason:a.reason??null,source:a.source||"portal",room_label:a.room_label||"",can_call:entry?.can_call??false,patient:{id:patient.id,full_name:patient.full_name,age:patient.age??null,gender:patient.gender??null},prescriptions:rx.filter(item=>String(item.appointment_id)===String(a.id)).map(item=>({id:item.id,rx_no:item.rx_no,patient_id:item.patient_id,patient_name:item.patient_name,issued_on:item.issued_on,duration_days:item.duration_days,status:effectivePrescriptionStatus(item)})),lab_reports:reports.filter(item=>String(item.appointment_id)===String(a.id)).map(({id,report_no,test_name,kind,patient_id,patient_name,status,created_at,scheduled_for})=>({id,report_no,test_name,kind,patient_id,patient_name,status,created_at,scheduled_for}))};
}
function hasDoctorRelationship(patientId){return appts.some(a=>String(a.patient_id)===String(patientId)&&["confirmed","completed"].includes(a.status));}
function patientProfile(id){const p=people.find(x=>String(x.id)===String(id));if(!p||!hasDoctorRelationship(p.id))error("NOT_FOUND",404);return {...p,prescriptions:rx.filter(r=>r.patient_id===p.id).map(r=>({...r,doctor_name:doctor().full_name})),appointments:appts.filter(a=>a.patient_id===p.id).map(a=>({id:a.id,starts_at:a.starts_at,doctor_name:doctor().full_name,department:doctor().department,status:a.status,visit_status:a.visit_status,token_no:a.token_no,booking_no:a.booking_no}))};}
export { buildQueue, appointmentRow, queueItem, delay, nowMs };
export function reject(code,status=409){throw Object.assign(new Error(code),{code,status});}
export function createMockApi(user){
 const service={...mockDoctorPortalService};
 service.getProfile=async()=>{await delay();return {id:user?.id,full_name:user?.full_name||"Doctor",department:"Cardiology",specialty:"Cardiologist"};};
 return service;
}
export const mockDoctorPortalService={
 async getProfile(){await delay();return doctor();}, async getHospitalInfo(){await delay();return {name:"CityHospital",address:"",phone:"",email:"",open_hours:"Open 24 hours",timezone:TZ,grace_minutes:5};},
 async getDashboard(){
   await delay();
   if(typeof localStorage!=="undefined"&&localStorage.getItem("ch_mock_dashboard_fail")==="1")error("DASHBOARD_UNAVAILABLE",503);
   const current=Date.now(),server_now=new Date(current).toISOString(),q=buildQueue(appts,current,5,TZ);
   const dayKey=(value)=>new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
   const todayDate=dayKey(current),entries=new Map(q.entries.map(entry=>[String(entry.id),entry]));
   const today=appts.filter(a=>dayKey(a.starts_at)===todayDate&&a.status!=="cancelled").sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).map(a=>{
     const entry=entries.get(String(a.id));
     return {id:a.id,starts_at:a.starts_at,patient_id:a.patient_id,patient_name:a.patient_name,patient_age:a.patient_age,reason:a.reason,status:a.status,visit_status:a.visit_status,queue_state:entry?.queue_state||"none",token_no:a.token_no};
   });
   const future=appts.filter(a=>["pending","confirmed"].includes(a.status)&&dayKey(a.starts_at)>todayDate).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).slice(0,10);
   const upcoming=future.map(a=>({id:a.id,starts_at:a.starts_at,patient_id:a.patient_id,patient_name:a.patient_name,patient_age:a.patient_age,reason:a.reason,status:a.status,visit_status:a.visit_status,queue_state:"none",token_no:a.token_no}));
   const terminal=new Set(["completed","incomplete"]),inProgress=q.entries.filter(x=>x.queue_state==="in_progress").length,waiting=q.entries.filter(x=>x.queue_state==="waiting").length;
   const next=q.entries.filter(x=>x.queue_state==="waiting").sort((a,b)=>a.position-b.position)[0];
   const patientsWithAppointments=new Set(appts.filter(a=>["confirmed","completed"].includes(a.status)).map(a=>a.patient_id));
   return {server_now,stats:{total_patients:patientsWithAppointments.size,appointments_today:today.length,in_queue_now:inProgress+waiting,today_breakdown:{in_progress:inProgress,waiting,later:today.filter(a=>!terminal.has(a.visit_status)&&!['in_progress','waiting'].includes(a.queue_state)).length},next_waiting:next?{token_no:next.token_no,patient_name:next.patient_name}:null},today,upcoming,schedule:clone(schedule),recent_tests:clone([...reports].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,3).map(({id,report_no,test_name,kind,patient_id,patient_name,status,created_at,scheduled_for})=>({id,report_no,test_name,kind,patient_id,patient_name,status,created_at,scheduled_for}))),recent_prescriptions:clone([...rx].sort((a,b)=>Date.parse(b.created_at||b.issued_on)-Date.parse(a.created_at||a.issued_on)).slice(0,3).map(({id,rx_no,patient_id,patient_name,issued_on,duration_days,status})=>({id,rx_no,patient_id,patient_name,issued_on,duration_days,status})))};
 },
 async getQueue(){await delay();const current=Date.now(),queue=buildQueue(appts,current,5,TZ);return {server_now:new Date(current).toISOString(),grace_minutes:5,counts:queue.counts,items:queue.items.map(item=>queueItem(findAppointment(item.id),item)),expected:queue.expected};},
 async getAppointment(id){await delay();return appointmentDetail(id);},
 async checkIn(id){await delay();const a=findAppointment(id),current=Date.now();if(!isToday(a.starts_at,current,TZ))error("NOT_TODAY");if(a.checked_in_at)error("ALREADY_CHECKED_IN");if(a.status!=="confirmed"||a.visit_status!=="scheduled")error("INVALID_TRANSITION");a.checked_in_at=new Date(current).toISOString();const q=buildQueue(appts,current,5,TZ);return queueItem(a,q.entries.find(item=>String(item.id)===String(a.id)));},
 async setVisitStatus(id,visit_status){await delay();const a=findAppointment(id),current=Date.now();if(!isToday(a.starts_at,current,TZ))error("NOT_TODAY");if(!a.checked_in_at)error("NOT_CHECKED_IN");if(!["in_progress","completed","incomplete"].includes(visit_status))error("INVALID_TRANSITION");const q=buildQueue(appts,current,5,TZ),entry=q.entries.find(x=>String(x.id)===String(a.id));if(a.visit_status==="scheduled"){if(visit_status==="in_progress"&&!entry?.can_call)error(entry?.call_blocked_reason==="in_progress"?"ALREADY_IN_PROGRESS":entry?.call_blocked_reason==="held"?"QUEUE_HELD":"NOT_NEXT");if(!["in_progress","incomplete"].includes(visit_status))error("INVALID_TRANSITION");}else if(a.visit_status==="in_progress"){if(!["completed","incomplete"].includes(visit_status))error("INVALID_TRANSITION");}else error("INVALID_TRANSITION");a.visit_status=visit_status;if(visit_status==="in_progress")a.called_at=new Date(current).toISOString();if(visit_status==="completed"||visit_status==="incomplete"){a.completed_at=new Date(current).toISOString();if(visit_status==="completed")a.status="completed";}return appointmentDetail(id);},
 async listPrescriptions(params={}){await delay();let rows=rx.filter(x=>(!params.q||x.patient_name.toLowerCase().includes(params.q.toLowerCase()))&&(!params.from||x.issued_on>=params.from)&&(!params.to||x.issued_on<=params.to));return {items:clone(rows.slice(params.offset||0,(params.offset||0)+(params.limit||25))).map(x=>({...x,status:effectivePrescriptionStatus(x)})),total:rows.length};},
 async getPrescription(id){
   await delay();
   const item=rx.find(r=>String(r.id)===String(id));
   if(!item)error("NOT_FOUND",404);
   const person=people.find(p=>p.id===item.patient_id);
   if(!person)error("NOT_FOUND",404);
   const linked=item.appointment_id==null?null:appts.find(a=>String(a.id)===String(item.appointment_id));
   if(item.appointment_id!=null&&(!linked||linked.patient_id!==item.patient_id))error("NOT_FOUND",404);
   return {...clone(item),status:effectivePrescriptionStatus(item),doctor:{name:doctor().full_name,department:doctor().department||null},patient:{name:person.full_name,age:person.age??null,gender:person.gender??null},appointment:linked?{id:linked.id,booking_no:linked.booking_no,starts_at:linked.starts_at,token_no:linked.token_no??null,room_label:linked.room_label||""}:null};
 },
 async listPatients(params={}){await delay();const rows=people.filter(p=>!params.q||p.full_name.toLowerCase().includes(params.q.toLowerCase())).map(p=>({id:p.id,full_name:p.full_name,age:p.age,gender:p.gender,last_visit:appts.find(a=>a.patient_id===p.id)?.starts_at||null,active_rx_count:rx.filter(r=>r.patient_id===p.id&&r.status==="active").length,next_appointment:null}));return {items:rows.slice(params.offset||0,(params.offset||0)+(params.limit||25)),total:rows.length};}, async getPatientOptions(){await delay();return people.map(({id,full_name,age})=>({id,full_name,age}));}, async getPatient(id){await delay();return patientProfile(id);},
 async getSummaryBase(id,appointment_id){
   await delay();
   const p=people.find(x=>String(x.id)===String(id));
   if(!p||!hasDoctorRelationship(p.id))error("NOT_FOUND",404);
   const linked=appointment_id?findAppointment(appointment_id):null;
   if(linked&&linked.patient_id!==p.id)error("NOT_FOUND",404);
   const records=appts.filter(a=>a.patient_id===p.id);
   const last=records.filter(a=>a.visit_status==="completed").sort((a,b)=>Date.parse(b.starts_at)-Date.parse(a.starts_at))[0];
   const past=records.filter(a=>String(a.id)!==String(appointment_id)).sort((a,b)=>Date.parse(b.starts_at)-Date.parse(a.starts_at)).slice(0,3);
   return {snapshot:{name:p.full_name,age:p.age??null,gender:p.gender??null,last_visit:last?{starts_at:last.starts_at,department:last.department||doctor().department}:null},past_appointments:past.map(a=>({doctor_name:a.doctor_name||doctor().full_name,department:a.department||doctor().department,starts_at:a.starts_at,status:a.status}))};
 },
 async createSummary(id,appointment_id){
   await new Promise(resolve=>setTimeout(resolve,1200));
   const p=people.find(x=>String(x.id)===String(id));
   if(!p||!hasDoctorRelationship(p.id))error("NOT_FOUND",404);
   const a=appointment_id?findAppointment(appointment_id):null;
   if(a&&a.patient_id!==p.id)error("NOT_FOUND",404);
   if(typeof localStorage!=="undefined"&&localStorage.getItem("ch_mock_summary_fail")==="1")error("SUMMARY_UNAVAILABLE",503);
   const fallback="Not documented in the provided records";
   const medications=rx.filter(x=>x.patient_id===p.id&&effectivePrescriptionStatus(x)==="active").flatMap(x=>x.items).map(x=>x.medicine+" "+String.fromCharCode(183)+" "+x.dosage+" "+String.fromCharCode(183)+" "+x.timing).join("\n");
   const results=reports.filter(x=>x.patient_id===p.id&&x.status==="ready").map(x=>x.test_name).join("\n");
   return {id:Date.now(),created_at:new Date().toISOString(),cached:false,fields:{patient_overview:p.full_name+", "+p.age+" y",chief_complaint:a?.reason||fallback,medical_history:fallback,surgical_history:fallback,medications:medications||fallback,allergies:fallback,family_history:fallback,social_history:fallback,vitals_and_results:results||fallback,assessment_and_plan:fallback}};
 },
 async getSchedule(){await delay();return {days:clone(schedule)};},
 async putSchedule(days){
   await delay();
   const weekdays=Array.isArray(days)?days.map(day=>day?.weekday):[];
   if(!Array.isArray(days)||days.length!==7||days.some(day=>typeof day?.is_active!=="boolean")||weekdays.some(day=>!Number.isInteger(day)||day<0||day>6)||new Set(weekdays).size!==7||[0,1,2,3,4,5,6].some(day=>!weekdays.includes(day)))error("SCHEDULE_INVALID",422);
   if(days.some(day=>day.is_active&&validateDay(day)))error("SCHEDULE_INVALID",422);
   schedule=days.slice().sort((a,b)=>a.weekday-b.weekday).map(day=>day.is_active
     ? {weekday:day.weekday,is_active:true,start_time:day.start_time,end_time:day.end_time,slot_minutes:Number(day.slot_minutes),room_label:day.room_label}
     : {weekday:day.weekday,is_active:false,start_time:null,end_time:null,slot_minutes:15,room_label:""});
   return {days:clone(schedule)};
 },
 async saveSchedule(days){return this.putSchedule(days);},
 async getLabTests(){await delay();return clone(labTests);}, async listLabReports(params={}){await delay();const rows=reports.filter(x=>!params.status||x.status===params.status);return {items:clone(rows.slice(params.offset||0,(params.offset||0)+(params.limit||25))),total:rows.length};}, async createLabReport(body){await delay();if(!people.some(p=>p.id===Number(body.patient_id)))error("NOT_FOUND",404);const test=labTests.find(x=>x.id===Number(body.test_id));if(!test)error("NOT_FOUND",404);const appointment=body.appointment_id?findAppointment(body.appointment_id):null;if(appointment&&appointment.patient_id!==Number(body.patient_id))error("NOT_FOUND",404);const item={id:Date.now(),appointment_id:appointment?.id,report_no:`${test.kind==="lab"?"LAB":"RAD"}-${1000+reports.length}`,test_name:test.name,kind:test.kind,patient_id:Number(body.patient_id),patient_name:people[Number(body.patient_id)-1].full_name,status:"requested",created_at:new Date().toISOString(),scheduled_for:null,notes:body.notes||"",results:[],files:[]};reports.unshift(item);return clone(item);}, async getLabReport(id){await delay();const x=reports.find(r=>String(r.id)===String(id));if(!x)error("NOT_FOUND",404);return clone(x);}, async getLabFile(){await delay();error("NOT_FOUND",404);},
 async createPrescription(id,body){
   await delay();
   const a=findAppointment(id);
   if(a.doctor_id!=null&&String(a.doctor_id)!==String(doctor().id))error("NOT_FOUND",404);
   if(a.visit_status!=="in_progress")error("VISIT_NOT_IN_PROGRESS");
   const items=body?.items;
   const validItems=Array.isArray(items)&&items.length>=1&&items.length<=10&&items.every(item=>item&&typeof item.medicine==="string"&&item.medicine.trim().length>0&&item.medicine.length<=100&&typeof item.dosage==="string"&&item.dosage.trim().length>0&&item.dosage.length<=60&&typeof item.timing==="string"&&item.timing.trim().length>0&&item.timing.length<=80);
   const duration=Number(body?.duration_days),instructions=body?.instructions??"";
   if(!validItems||!Number.isInteger(duration)||duration<1||duration>365||typeof instructions!=="string"||instructions.length>1000)error("VALIDATION_ERROR",422);
   const n=Math.max(1000,...rx.map(x=>Number(x.id)))+1;
   const person=people.find(x=>x.id===a.patient_id);
   const todayParts=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
   const datePart=(type)=>todayParts.find(part=>part.type===type)?.value||"";
   const issued_on=`${datePart("year")}-${datePart("month")}-${datePart("day")}`;
   const record={id:n,rx_no:`Rx-${n}`,patient_id:person.id,patient_name:person.full_name,issued_on,duration_days:duration,status:"active",items:items.map(item=>({...item})),instructions,appointment_id:a.id};
   rx.unshift(record);
   return {...clone(record),doctor:{name:doctor().full_name,department:doctor().department||null},patient:{name:person.full_name,age:person.age??null,gender:person.gender??null},appointment:{id:a.id,booking_no:a.booking_no,starts_at:a.starts_at,token_no:a.token_no??null,room_label:a.room_label||""}};
 }
};
