import { useEffect, useState } from "react";

import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { printPatientProfile, printPrescription } from "../../components/doctor/print/PrintDocuments.jsx";

const DEV_DRAFT_PRESCRIPTION = {
  rx_no: "Draft",
  issued_on: "",
  duration_days: 14,
  patient: { name: "Urdu sample: عائشہ خان", age: 34, gender: "Female" },
  doctor: { name: "Sana Malik", department: "Cardiology" },
  items: [
    { medicine: "Amlodipine 5 mg", dosage: "1 tablet", timing: "Morning, after food" },
    { medicine: "Atorvastatin 10 mg", dosage: "1 tablet", timing: "Night" },
  ],
  instructions: "Take after food unless stated. Do not stop medicines without asking your doctor.",
};

export default function DoctorPrintDev() {
  const { t } = useLanguage();
  const { hospital, profile: doctor } = useDoctorContext();
  const [prescription, setPrescription] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  const [error, setError] = useState(null);
  const [patientError, setPatientError] = useState(null);

  useEffect(() => {
    let active = true;
    doctorPortalService.getPrescription(1042)
      .then((detail) => active && setPrescription(detail))
      .catch((reason) => active && setError(reason));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    doctorPortalService.getPatientOptions()
      .then((patients) => {
        if (!patients.length) throw new Error("No mock patient is available.");
        return doctorPortalService.getPatientProfile(patients[0].id);
      })
      .then((profile) => active && setPatientProfile(profile))
      .catch((reason) => active && setPatientError(reason));
    return () => { active = false; };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Development only</p>
        <h1 className="text-3xl font-black">Print preview checks</h1>
      </div>
      {error && <Alert>{error.message || "Could not load Rx-1042."}</Alert>}
      {patientError && <Alert>{patientError.message || "Could not load a patient profile."}</Alert>}
      <Card className="flex flex-wrap gap-3 p-5">
        <Button fullWidth={false} disabled={!prescription} onClick={() => printPrescription(prescription, hospital)}>
          Print Rx-1042
        </Button>
        <Button fullWidth={false} variant="secondary" onClick={() => printPrescription(DEV_DRAFT_PRESCRIPTION, hospital, { draft: true })}>
          Print draft prescription
        </Button>
        <Button fullWidth={false} disabled={!patientProfile} onClick={() => printPatientProfile(patientProfile, doctor, hospital)}>
          {t("doctor.printDev.patientProfile")}
        </Button>
      </Card>
    </div>
  );
}
