import { useEffect, useState } from "react";

import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { printPrescription } from "../../components/doctor/print/PrintDocuments.jsx";

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
  const { hospital } = useDoctorContext();
  const [prescription, setPrescription] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    doctorPortalService.getPrescription(1042)
      .then((detail) => active && setPrescription(detail))
      .catch((reason) => active && setError(reason));
    return () => { active = false; };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Development only</p>
        <h1 className="text-3xl font-black">Print preview checks</h1>
      </div>
      {error && <Alert>{error.message || "Could not load Rx-1042."}</Alert>}
      <Card className="flex flex-wrap gap-3 p-5">
        <Button fullWidth={false} disabled={!prescription} onClick={() => printPrescription(prescription, hospital)}>
          Print Rx-1042
        </Button>
        <Button fullWidth={false} variant="secondary" onClick={() => printPrescription(DEV_DRAFT_PRESCRIPTION, hospital, { draft: true })}>
          Print draft prescription
        </Button>
      </Card>
    </div>
  );
}
