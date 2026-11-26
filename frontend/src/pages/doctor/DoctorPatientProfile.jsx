import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Alert from "../../components/common/Alert.jsx";
import Avatar from "../../components/common/Avatar.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import InfoGrid from "../../components/common/InfoGrid.jsx";
import Modal from "../../components/common/Modal.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { LoadState, Status, errorText } from "../../components/doctor/DoctorCommon.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { printPatientProfile } from "../../components/doctor/print/PrintDocuments.jsx";
import { fill } from "../../utils/format.js";
import { formatDate, formatShort } from "../../utils/datetime.js";

function appointmentVisitStatus(appointment) {
  if (["completed", "incomplete", "in_progress"].includes(appointment.visit_status)) return appointment.visit_status;
  return appointment.status;
}

export default function DoctorPatientProfile() {
  const { patientId } = useParams();
  const { t, lang } = useLanguage();
  const { hospital, profile: doctor } = useDoctorContext();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [selectedPrescription, setSelectedPrescription] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setPatient(null);
    doctorPortalService.getPatient(patientId)
      .then((result) => { if (active) setPatient(result); })
      .catch((requestError) => { if (active) setError(requestError); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [patientId, retry]);

  const retryLoad = () => setRetry((value) => value + 1);
  const age = patient?.age == null ? "—" : `${patient.age} ${t("doctor.appointment.yearsShort")}`;
  const genderKey = patient?.gender === "female" ? "female" : patient?.gender === "male" ? "male" : patient?.gender ? "other" : null;
  const gender = genderKey ? t(`doctor.gender.${genderKey}`) : "—";

  return <>
    <Link to="/doctor/patients" className="mb-2 inline-block font-bold text-brand-700">← {t("doctor.patients.title")}</Link>
    <PageHeader showLanguage title={t("doctor.patients.profile")} subtitle={t("doctor.patients.profileSubtitle")} />
    {error?.code === "NOT_FOUND" ? <div className="space-y-3"><Alert>{t("doctor.common.pageUnavailable")}</Alert><Link to="/doctor/patients" className="inline-block font-bold text-brand-700">← {t("doctor.common.back")}</Link></div> : <LoadState loading={loading} error={error} onRetry={retryLoad}>
      {patient && <>
        <Card className="mb-5 flex flex-wrap items-center gap-4 p-5">
          <Avatar name={patient.full_name} size="lg" />
          <div className="min-w-0 flex-1"><h2 className="text-2xl font-black">{patient.full_name}</h2><p className="text-ink-muted"><span dir="ltr">{age} · {gender}</span> · <span dir="ltr">{patient.email || "—"}</span></p></div>
          <Link to={`/doctor/patients/${patient.id}/summary`}><Button variant="secondary" fullWidth={false}>{t("doctor.patients.history")}</Button></Link>
          <Button fullWidth={false} onClick={() => printPatientProfile(patient, doctor, hospital)}>{t("doctor.patients.print")}</Button>
        </Card>
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
          <Card className="min-w-0 p-5">
            <h2 className="mb-3 text-xl font-black">{t("doctor.patients.prescriptions")}</h2>
            {patient.prescriptions?.length ? patient.prescriptions.map((prescription) => <div key={prescription.id} className="flex min-w-0 items-center gap-2 border-b border-line py-3 last:border-0">
              <div className="min-w-0 flex-1"><b dir="ltr">{prescription.rx_no}</b><p className="text-sm text-ink-muted"><span dir="ltr">{formatDate(prescription.issued_on, lang, hospital?.timezone)}</span> · {prescription.doctor_name}</p></div>
              <Status value={prescription.status} />
              <Button size="sm" variant="secondary" fullWidth={false} onClick={() => setSelectedPrescription(prescription)}>{t("doctor.common.view")}</Button>
            </div>) : <p className="text-ink-muted">{t("doctor.patients.noPrescriptions")}</p>}
          </Card>
          <Card className="min-w-0 p-5">
            <h2 className="mb-3 text-xl font-black">{t("doctor.patients.appointments")}</h2>
            {patient.appointments?.length ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">{patient.appointments.map((appointment) => <article key={appointment.id} className="min-w-0 rounded-2xl border border-line p-4">
              <div className="flex min-w-0 items-center gap-3"><Avatar name={appointment.doctor_name} /><div className="min-w-0"><b className="block truncate">{appointment.doctor_name}</b><p className="text-sm text-ink-muted">{appointment.department || t("doctor.common.notAvailable")} · <span dir="ltr">{formatShort(appointment.starts_at, lang, hospital?.timezone)}</span></p></div></div>
              <div className="mt-3"><Status value={appointmentVisitStatus(appointment)} /></div>
              {appointment.token_no && appointment.booking_no && <p className="mt-2 text-sm text-ink-muted" dir="ltr">{fill(t("doctor.patients.token"), { token: appointment.token_no, booking: appointment.booking_no })}</p>}
              {appointment.status === "pending" && <p className="mt-2 text-sm text-ink-muted">{t("doctor.patients.awaiting")}</p>}
            </article>)}</div> : <p className="text-ink-muted">{t("doctor.patients.noAppointments")}</p>}
          </Card>
        </div>
      </>}
    </LoadState>}
    <Modal open={!!selectedPrescription} title={selectedPrescription?.rx_no} onClose={() => setSelectedPrescription(null)}>
      {selectedPrescription && <div className="space-y-4"><Status value={selectedPrescription.status} /><p><span dir="ltr">{formatDate(selectedPrescription.issued_on, lang, hospital?.timezone)}</span> · {selectedPrescription.doctor_name}</p><InfoGrid cols={2} items={selectedPrescription.items?.map((item) => ({ label: item.medicine, value: `${item.dosage} · ${item.timing}` })) || []} /><p>{selectedPrescription.instructions}</p></div>}
    </Modal>
  </>;
}
