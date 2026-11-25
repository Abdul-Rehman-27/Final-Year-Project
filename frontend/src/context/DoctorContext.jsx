import { createContext, useContext } from "react";
export const DoctorContext = createContext(null);
export function useDoctorContext() { const value=useContext(DoctorContext); if (!value) throw new Error("DoctorContext is unavailable"); return value; }
