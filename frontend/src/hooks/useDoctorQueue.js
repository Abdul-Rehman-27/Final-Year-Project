import { useCallback, useEffect, useRef, useState } from "react";
import { doctorPortalService } from "../services/doctorPortalService.js";
export default function useDoctorQueue() {
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null),[serverOffset,setServerOffset]=useState(0), timer=useRef(null);
  const refresh=useCallback(async()=>{try{const result=await doctorPortalService.getQueue();setData(result);setServerOffset(Date.parse(result.server_now)-Date.now());setError(null);return result;}catch(e){setError(e);throw e;}finally{setLoading(false);}},[]);
  useEffect(()=>{let active=true;const load=async()=>{try{const result=await doctorPortalService.getQueue();if(active){setData(result);setServerOffset(Date.parse(result.server_now)-Date.now());setError(null);}}catch(e){if(active)setError(e);}finally{if(active)setLoading(false);}};const tick=()=>{clearTimeout(timer.current);if(document.visibilityState==="visible"){load().finally(()=>{timer.current=setTimeout(tick,10000);});}else timer.current=setTimeout(tick,10000);};load().finally(()=>{timer.current=setTimeout(tick,10000);});const vis=()=>{if(document.visibilityState==="visible")load();};document.addEventListener("visibilitychange",vis);return()=>{active=false;clearTimeout(timer.current);document.removeEventListener("visibilitychange",vis);};},[]);
  const action=useCallback(async(fn,...args)=>{try{const value=await fn(...args);await refresh();return value;}catch(e){await refresh().catch(()=>{});throw e;}},[refresh]);
  return {data,loading,error,serverOffset,refresh,checkIn:(id)=>action(doctorPortalService.checkIn,id),setVisitStatus:(id,status)=>action(doctorPortalService.setVisitStatus,id,status)};
}
