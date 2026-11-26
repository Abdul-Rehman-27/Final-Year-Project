import api from "./api.js";
import { loadSession } from "./session.js";
function wrap(err) { const code=err?.response?.data?.detail || (err?.request ? "NETWORK" : "GENERIC"); throw Object.assign(new Error(code),{code,status:err?.response?.status}); }
const live = {
  getProfile:()=>api.get("/doctor/profile").then(r=>r.data).catch(wrap), getHospitalInfo:()=>api.get("/doctor/hospital-info").then(r=>r.data).catch(wrap),
  getDashboard:()=>api.get("/doctor/dashboard").then(r=>r.data).catch(wrap), getQueue:()=>api.get("/doctor/queue").then(r=>r.data).catch(wrap), getAppointment:(id)=>api.get(`/doctor/appointments/${id}`).then(r=>r.data).catch(wrap),
  checkIn:(id)=>api.post(`/doctor/appointments/${id}/check-in`).then(r=>r.data).catch(wrap), setVisitStatus:(id,visit_status)=>api.patch(`/doctor/appointments/${id}/visit-status`,{visit_status}).then(r=>r.data).catch(wrap), createPrescription:(id,body)=>api.post(`/doctor/appointments/${id}/prescriptions`,body).then(r=>r.data).catch(wrap),
  listPrescriptions:(params={})=>api.get("/doctor/prescriptions",{params}).then(r=>r.data).catch(wrap), getPrescription:(id)=>api.get(`/doctor/prescriptions/${id}`).then(r=>r.data).catch(wrap), listPatients:(params={})=>api.get("/doctor/patients",{params}).then(r=>r.data).catch(wrap), getPatientOptions:()=>api.get("/doctor/patients/options").then(r=>r.data).catch(wrap), getPatient:(id)=>api.get(`/doctor/patients/${id}`).then(r=>r.data).catch(wrap),
  getSummaryBase:(id,appointment_id)=>api.get(`/doctor/patients/${id}/summary-base`,{params:{appointment_id}}).then(r=>r.data).catch(wrap), createSummary:(id,appointment_id)=>api.post(`/doctor/patients/${id}/summary`,null,{params:{appointment_id}}).then(r=>r.data).catch(wrap),
  getSchedule:()=>api.get("/doctor/schedule").then(r=>r.data).catch(wrap), putSchedule:(days)=>api.put("/doctor/schedule",{days}).then(r=>r.data).catch(wrap), saveSchedule:(days)=>api.put("/doctor/schedule",{days}).then(r=>r.data).catch(wrap), getLabTests:()=>api.get("/doctor/lab-tests").then(r=>r.data).catch(wrap), listLabReports:(params={})=>api.get("/doctor/lab-reports",{params}).then(r=>r.data).catch(wrap), createLabReport:(body)=>api.post("/doctor/lab-reports",body).then(r=>r.data).catch(wrap), getLabReport:(id)=>api.get(`/doctor/lab-reports/${id}`).then(r=>r.data).catch(wrap), getLabFile:(id,file_id)=>api.get(`/doctor/lab-reports/${id}/files/${file_id}`,{responseType:"blob"}).then(r=>r.data).catch(wrap),
};
const mock = import.meta.env.VITE_DOCTOR_API_MODE !== "live";
let mockApiPromise;
let mockUserId;
async function getMockApi(){
  const user=loadSession()?.user;
  if(!mockApiPromise || String(user?.id)!==String(mockUserId)){
    mockUserId=user?.id;
    mockApiPromise=import("../data/mockDoctorPortal.js").then(m=>m.createMockApi(user));
  }
  return mockApiPromise;
}
const methods=["getProfile","getHospitalInfo","getDashboard","getSchedule","putSchedule","saveSchedule","getQueue","getAppointment","checkIn","setVisitStatus"];
export const doctorPortalService=mock
  ? Object.fromEntries(methods.map(name=>[name,(...args)=>getMockApi().then(service=>service[name](...args))]))
  : Object.fromEntries(methods.map(name=>[name,live[name]]));
export function errorText(t,err){
  if(!err?.response && !err?.status) return t("auth.errors.network");
  const code=err?.code;
  if(code){const translated=t(`doctor.errors.${code}`);if(translated!==`doctor.errors.${code}`)return translated;}
  return t("auth.errors.generic");
}
