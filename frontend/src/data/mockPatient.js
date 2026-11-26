export const HOSPITAL = { emergency: "[EMERGENCY NUMBER]", address: "[HOSPITAL ADDRESS]", contact: "[PHONE] · [EMAIL]", hours: "Open 24 hours" };

export const PATIENT = { name: "Ayesha Khan", age: 34 };

export const TOKEN_SLIP = { token: "A-07", bookingNo: "APT-2040", status: "Confirmed", patient: "Ayesha Khan · 34 y", doctor: "Dr. Sana Malik", department: "Cardiology", when: "Thu 27 Nov · 10:30", room: "Floor 2 · Room 12" };

export const APPOINTMENTS = [
  { id: 1, group: "upcoming", doctor: "Dr. Sana Malik", department: "Cardiology", date: "Thu 27 Nov", time: "10:30", status: "Confirmed", token: "A-07", room: "Floor 2, Room 12" },
  { id: 2, group: "upcoming", doctor: "Dr. Imran Qureshi", department: "General Medicine", date: "Mon 1 Dec", time: "4:00 PM", status: "Pending" },
  { id: 3, group: "past", doctor: "Dr. Hina Raza", department: "Dermatology", date: "Tue 4 Nov", time: "11:00", status: "Completed" },
  { id: 4, group: "past", doctor: "Dr. Omar Sheikh", department: "Orthopedics", date: "Fri 24 Oct", time: "9:30", status: "Cancelled" },
];

export const DEPARTMENTS = ["Cardiology", "General Medicine", "Dermatology", "Orthopedics"];
export const DOCTORS_BY_DEPARTMENT = { Cardiology: ["Dr. Sana Malik"], "General Medicine": ["Dr. Imran Qureshi"], Dermatology: ["Dr. Hina Raza"], Orthopedics: ["Dr. Omar Sheikh"] };
export const TIME_SLOTS = ["10:30", "11:15", "12:00"];

export const PRESCRIPTIONS = [
  { id: "Rx-1042", doctor: "Dr. Sana Malik", department: "Cardiology", age: 34, sex: "Female", status: "Active", duration: "14 days", givenOn: "12 Nov 2026", patient: "Ayesha Khan · 34 y", medicines: [{ name: "Amlodipine 5 mg", dosage: "1 tablet", timing: "Morning, after food" }, { name: "Atorvastatin 10 mg", dosage: "1 tablet", timing: "Night" }], note: "Take after food unless stated. Do not stop medicines without asking your doctor. Review after 14 days or sooner if you feel dizzy or unwell." },
  { id: "Rx-0987", doctor: "Dr. Imran Qureshi", department: "General Medicine", age: 34, sex: "Female", status: "Completed", duration: "5 days", givenOn: "4 Nov 2026", patient: "Ayesha Khan · 34 y", medicines: [{ name: "Paracetamol 500 mg", dosage: "1 tablet", timing: "Every 8 hours, after food" }], note: "Take after food unless stated." },
];

export const LAB_REPORTS = [
  { id: "chest-xray", name: "Chest X-ray", date: "24 Nov", fullDate: "24 Nov 2026", status: "Ready", kind: "Radiology report", reportNo: "RAD-0412", age: 34, sex: "Female", study: "Chest X-ray, PA and lateral", performed: "24 Nov 2026 · 8:40 AM", referredBy: "Dr. Sana Malik", reportedBy: "Dr. Omar Sheikh, Radiologist", technique: "Standard PA and lateral chest radiographs, taken upright with full inspiration.", findings: "Lungs are clear. Heart size is normal. No pleural effusion. Bony structures are intact.", impression: "No acute cardiopulmonary findings.", radiologist: { name: "Dr. Omar Sheikh", role: "Radiologist" }, images: [{ src: null, label: "PA view image", caption: "Figure 1 · Frontal (PA) view" }, { src: null, label: "Lateral view image", caption: "Figure 2 · Lateral view" }], imageLabel: "X-ray image preview", pdf: "radiology-report" },
  { id: "cbc", name: "Complete blood count", date: "22 Nov", fullDate: "22 Nov 2026", status: "Ready", kind: "Laboratory report", reportNo: "LAB-2211", age: 34, sex: "Female", referredBy: "Dr. Sana Malik", collected: "22 Nov 2026 · 9:10 AM", summary: "All values are within the reference range.", comments: "All values are within the reference range. Results should be read together with your clinical history.", pathologist: null, reviewedBy: "Dr. Sana Malik", pdf: "lab-report", results: [{ test: "Hemoglobin", result: "13.2 g/dL", reference: "12.0 – 15.5", flag: "Normal" }, { test: "WBC", result: "6.8 ×10³/µL", reference: "4.0 – 11.0", flag: "Normal" }, { test: "Platelets", result: "245 ×10³/µL", reference: "150 – 450", flag: "Normal" }, { test: "RBC", result: "4.6 ×10⁶/µL", reference: "4.0 – 5.2", flag: "Normal" }] },
  { id: "lipid", name: "Lipid profile", date: "28 Nov", fullDate: "28 Nov 2026", status: "Scheduled", kind: "Laboratory report", scheduledFor: "28 Nov · 9:00 AM" },
];

export const LAB_RESULTS = [
  { name: "Chest X-ray", meta: "24 Nov · Dr. Omar Sheikh", status: "Ready" },
  { name: "Complete blood count", meta: "22 Nov · All values normal", status: "Ready" },
  { name: "Lipid profile", meta: "28 Nov · 9:00 AM", status: "Scheduled" },
];
