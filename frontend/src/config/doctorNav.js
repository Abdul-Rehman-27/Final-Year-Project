export const DOCTOR_NAV = [
  { to: "/doctor", labelKey: "doctor.nav.dashboard", end: true, matchPaths: ["/doctor/availability"], icon: "dashboard" },
  { to: "/doctor/queue", labelKey: "doctor.nav.queue", icon: "queue" },
  { to: "/doctor/prescriptions", labelKey: "doctor.nav.prescriptions", icon: "prescriptions" },
  { to: "/doctor/patients", labelKey: "doctor.nav.patients", icon: "patients" },
  { to: "/doctor/lab-tests", labelKey: "doctor.nav.labTests", icon: "lab" },
];
