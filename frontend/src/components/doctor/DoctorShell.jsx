import { useEffect, useState } from "react";
import DashboardLayout from "../layout/DashboardLayout.jsx";
import Alert from "../common/Alert.jsx";
import Button from "../common/Button.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { DoctorContext } from "../../context/DoctorContext.jsx";
import { DOCTOR_NAV } from "../../config/doctorNav.js";
import { doctorPortalService } from "../../services/doctorPortalService.js";

export default function DoctorShell() {
  const { user }=useAuth(); const {t}=useLanguage(); const [profile,setProfile]=useState(null); const [hospital,setHospital]=useState(null); const [error,setError]=useState(false); const [retry,setRetry]=useState(0);
  useEffect(()=>{let active=true; setError(false); Promise.all([doctorPortalService.getProfile(),doctorPortalService.getHospitalInfo()]).then(([p,h])=>{if(active){setProfile(p);setHospital(h);}}).catch(()=>active&&setError(true)); return ()=>{active=false};},[retry]);
  if(!profile||!hospital) return <div className="min-h-screen bg-surface p-8">{error ? <div className="max-w-xl space-y-3"><Alert>{t("doctor.loadError")}</Alert><Button fullWidth={false} onClick={()=>setRetry(x=>x+1)}>{t("doctor.tryAgain")}</Button></div> : t("common.loading")}</div>;
  return <DoctorContext.Provider value={{profile,hospital}}><DashboardLayout variant="portal" navItems={DOCTOR_NAV} portalLabel={t("doctor.portalLabel")} userCard={{name:profile.full_name||user?.full_name,subtitle:profile.department||""}} />{import.meta.env.VITE_DOCTOR_API_MODE !== "live" && <div className="fixed bottom-3 start-3 z-30 rounded-full border border-brand-200 bg-white/90 px-3 py-1 text-xs font-semibold text-ink-muted shadow">{t("doctor.mockChip")}</div>}</DoctorContext.Provider>;
}
