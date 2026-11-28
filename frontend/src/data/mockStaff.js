// Sample data used until the backend staff API is ready.
export const INITIAL_STAFF = [
  { id: 1, departmentId: 1, phone: "03001234567", photo: "", fullName: "Dr. Sara Khan", email: "sara.khan@cityhospital.pk", role: "doctor", specialty: "Cardiology", fee: 2500, status: "active" },
  { id: 2, departmentId: 6, phone: "03111234567", photo: "", fullName: "Sana Ahmed", email: "sana.ahmed@cityhospital.pk", role: "receptionist", specialty: "", fee: "", status: "active" },
  { id: 3, departmentId: 2, phone: "03211234567", photo: "", fullName: "Dr. Ali Raza", email: "ali.raza@cityhospital.pk", role: "doctor", specialty: "Pediatrics", fee: 2000, status: "active" },
  { id: 4, departmentId: 4, phone: "03331234567", photo: "", fullName: "Imran Yusuf", email: "imran.yusuf@cityhospital.pk", role: "pharmacist", specialty: "", fee: "", status: "inactive" },
  { id: 5, departmentId: 5, phone: "03451234567", photo: "", fullName: "Nadia Hussain", email: "nadia.hussain@cityhospital.pk", role: "nurse", specialty: "", fee: "", status: "active" },
  { id: 6, departmentId: 1, phone: "03011234568", photo: "", fullName: "Dr. Imran Malik", email: "imran.malik@cityhospital.pk", role: "doctor", specialty: "Cardiology", fee: 3000, status: "active" },
  { id: 7, departmentId: 3, phone: "03121234568", photo: "", fullName: "Dr. Nida Farooq", email: "nida.farooq@cityhospital.pk", role: "doctor", specialty: "Dermatology", fee: 2500, status: "active" },
  { id: 8, departmentId: 7, phone: "03221234568", photo: "", fullName: "Hamza Raza", email: "admin@cityhospital.pk", role: "admin", specialty: "", fee: "", status: "active" },
];

// Not stored in the staff list yet (no patient/appointment modules)
export const MOCK_STATS = { patients: 1280, today: 73 };
