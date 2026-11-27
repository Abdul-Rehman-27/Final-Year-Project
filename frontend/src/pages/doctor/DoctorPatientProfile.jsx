import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Alert from "../../components/common/Alert.jsx";
import Avatar from "../../components/common/Avatar.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Modal from "../../components/common/Modal.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import PrescriptionDetail from "../../components/doctor/PrescriptionDetail.jsx";
import { LoadState, Status } from "../../components/doctor/DoctorCommon.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { printPatientProfile } from "../../components/doctor/print/PrintDocuments.jsx";
import { formatDate, formatShort } from "../../utils/datetime.js";

function appointmentVisitStatus(appointment) {
  if (["completed", "incomplete", "in_progress"].includes(appointment.visit_status)) return appointment.visit_status;
  return appointment.status;
}

function appointmentFootnote(appointment, t) {
  if (appointment.status === "cancelled") return t("doctor.profile.cancelled");
  if (appointment.status === "completed" || appointment.visit_status === "completed") return t("doctor.profile.visitDone");
  if (appointment.status === "pending") return t("doctor.profile.awaiting");
  if (appointment.status === "confirmed") {
    return <>{t("doctor.profile.token")} <b dir="ltr">{appointment.token_no || "—"}</b> · <b dir="ltr">{appointment.booking_no || "—"}</b></>;
  }
  return null;
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
    setSelectedPrescription(null);
    doctorPortalService.getPatientProfile(patientId)
      .then((result) => { if (active) setPatient(result); })
      .catch((requestError) => { if (active) setError(requestError); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [patientId, retry]);

  const retryLoad = () => setRetry((value) => value + 1);
  const selectedDetail = useMemo(() => selectedPrescription && patient ? ({
    ...selectedPrescription,
    doctor: { name: selectedPrescription.doctor_name, department: null },
    patient: { name: patient.full_name, age: patient.age ?? null, gender: patient.gender ?? null },
    appointment: null,
  }) : null, [selectedPrescription, patient]);

  const genderKey = patient?.gender?.toLowerCase();
  const gender = genderKey && ["male", "female", "other"].includes(genderKey)
    ? t(`doctor.gender.${genderKey}`)
    : patient?.gender || "—";
  const age = patient?.age == null ? "—" : `${patient.age} ${t("doctor.appointment.yearsShort")}`;
  const summary = patient ? `/doctor/patients/${patient.id}/summary` : "/doctor/patients";

  return <>
    <Link to="/doctor/patients" className="mb-2 inline-block font-bold text-brand-700">
      <span dir="ltr" aria-hidden="true">← </span>{t("doctor.profile.backPatients")}
    </Link>
    <PageHeader showLanguage title={t("doctor.profile.title")} subtitle={t("doctor.profile.subtitle")} />

    {error?.code === "NOT_FOUND" ? (
      <div className="space-y-3"><Alert>{t("doctor.notFound")}</Alert><Link to="/doctor/patients" className="inline-block font-bold text-brand-700"><span dir="ltr" aria-hidden="true">← </span>{t("doctor.profile.backPatients")}</Link></div>
    ) : <LoadState loading={loading} error={error} onRetry={retryLoad}>
      {patient && <>
        <Card className="mb-5 flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <Avatar name={patient.full_name} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-black">{patient.full_name}</h2>
            <p className="break-words text-ink-muted"><span dir="ltr">{age} · {gender} · {patient.email || "—"}</span></p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Link to={summary}><Button variant="secondary" fullWidth={false}>{t("doctor.profile.history")}</Button></Link>
            <Button fullWidth={false} onClick={() => printPatientProfile(patient, doctor, hospital)}>{t("doctor.profile.print")}</Button>
          </div>
        </Card>

        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
          <Card className="min-w-0 p-5">
            <h2 className="mb-3 text-xl font-black">{t("doctor.profile.prescriptions")}</h2>
            {patient.prescriptions?.length ? patient.prescriptions.map((prescription) => <div key={prescription.id} className="flex min-w-0 items-center gap-2 border-b border-line py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <b dir="ltr">{prescription.rx_no}</b>
                <p className="break-words text-sm text-ink-muted"><span dir="ltr">{formatDate(prescription.issued_on, lang, hospital?.timezone)}</span> · {prescription.doctor_name}</p>
              </div>
              <Status value={prescription.status} />
              <Button size="sm" variant="secondary" fullWidth={false} onClick={() => setSelectedPrescription(prescription)}>{t("doctor.profile.view")}</Button>
            </div>) : <p className="text-ink-muted">{t("doctor.profile.noPrescriptions")}</p>}
          </Card>

          <Card className="min-w-0 p-5">
            <h2 className="mb-3 text-xl font-black">{t("doctor.profile.appointments")}</h2>
            {patient.appointments?.length ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">{patient.appointments.map((appointment) => {
              const footnote = appointmentFootnote(appointment, t);
              return <article key={appointment.id} className="min-w-0 rounded-2xl border border-line p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={appointment.doctor_name} />
                  <div className="min-w-0">
                    <b className="block truncate">{appointment.doctor_name}</b>
                    <p className="break-words text-sm text-ink-muted">{appointment.department || t("doctor.common.notAvailable")} · <span dir="ltr">{formatShort(appointment.starts_at, lang, hospital?.timezone)}</span></p>
                  </div>
                </div>
                <div className="mt-3"><Status value={appointmentVisitStatus(appointment)} /></div>
                {footnote && <p className="mt-2 break-words text-sm text-ink-muted" dir="auto">{footnote}</p>}
              </article>;
            })}</div> : <p className="text-ink-muted">{t("doctor.profile.noAppointments")}</p>}
          </Card>
        </div>
      </>}
    </LoadState>}

    <Modal open={!!selectedDetail} title={selectedDetail?.rx_no || t("doctor.profile.prescriptions")} onClose={() => setSelectedPrescription(null)}>
      {selectedDetail && <PrescriptionDetail detail={selectedDetail} showActions={false} durationText={`${selectedDetail.duration_days} ${t("doctor.profile.days")}`} />}
    </Modal>
  </>;
}
