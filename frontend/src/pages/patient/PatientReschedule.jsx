import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Chip from "../../components/patient/Chip.jsx";
import LoadState from "../../components/patient/LoadState.jsx";
import MicroLabel from "../../components/patient/MicroLabel.jsx";
import PatientPageHeader from "../../components/patient/PatientPageHeader.jsx";
import PortalButton from "../../components/patient/PortalButton.jsx";
import PortalCard from "../../components/patient/PortalCard.jsx";
import PortalField from "../../components/patient/PortalField.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useAsync } from "../../hooks/useAsync.js";
import { patientErrorKey, patientPortalService } from "../../services/patientPortalService.js";
import { localDateInput } from "../../utils/datetime.js";
import { appointmentView } from "../../utils/patientAdapters.js";

/** Edit / reschedule one upcoming appointment: change doctor, date and time. */
export default function PatientReschedule() {
  const { id } = useParams();
  const { lang } = useLanguage();
  const appts = useAsync(() => patientPortalService.listAppointments(), []);
  const raw = (appts.data?.items || []).find((a) => String(a.id) === String(id));
  const appt = raw ? appointmentView(raw, lang) : null;
  return <LoadState loading={appts.loading} error={appts.error} onRetry={appts.reload} hasData={!!appts.data}>{appt ? <RescheduleForm appt={appt} /> : <NotEditable />}</LoadState>;
}

function NotEditable() {
  const { t } = useLanguage();
  return <><PatientPageHeader title={t("patient.editAppt.title")} subtitle="" /><PortalCard><p className="text-[15px]">{t("patient.errors.NOT_FOUND")}</p><PortalButton as={Link} to="/patient/appointments" variant="secondary" className="mt-3">{t("patient.editAppt.back")}</PortalButton></PortalCard></>;
}

function RescheduleForm({ appt }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [departmentId, setDepartmentId] = useState("");
  const [doctorId, setDoctorId] = useState(String(appt.doctorId));
  const [date, setDate] = useState(() => localDateInput(Date.parse(appt.startsAt)));
  const [slot, setSlot] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const depts = useAsync(() => patientPortalService.listDepartments(), []);
  const doctors = useAsync(() => (departmentId ? patientPortalService.listDoctors(departmentId) : Promise.resolve([])), [departmentId]);
  const slots = useAsync(() => (doctorId && date ? patientPortalService.getSlots(doctorId, date, appt.id) : Promise.resolve({ slots: [] })), [doctorId, date]);
  const deptList = depts.data || [];
  const doctorList = doctors.data || [];
  const slotList = slots.data?.slots || [];

  useEffect(() => { if (!departmentId && deptList.length) setDepartmentId(String((deptList.find((d) => d.name === appt.department) || deptList[0]).id)); }, [deptList, departmentId]);
  useEffect(() => { if (doctors.data && !doctors.data.some((d) => String(d.id) === doctorId)) setDoctorId(doctors.data[0] ? String(doctors.data[0].id) : ""); }, [doctors.data]);
  useEffect(() => { if (slot && !slotList.includes(slot)) setSlot(""); }, [slots.data]);

  const save = async () => {
    setError(""); setBusy(true);
    try { await patientPortalService.rescheduleAppointment(appt.id, { doctor_id: Number(doctorId), date, time: slot }); navigate("/patient/appointments"); }
    catch (err) { setError(patientErrorKey(err)); slots.reload(); }
    finally { setBusy(false); }
  };
  const errorText = error ? (t(error) === error ? t("patient.errors.GENERIC") : t(error)) : "";

  return <>
    <PatientPageHeader title={t("patient.editAppt.title")} subtitle={t("patient.editAppt.current").replace("{doctor}", appt.doctor).replace("{date}", appt.date).replace("{time}", appt.time)} />
    <div className="max-w-[460px]"><PortalCard>
      <PortalField id="resched-department" label={t("patient.appointments.fields.department")} type="select" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setSlot(""); }}>{deptList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</PortalField>
      <PortalField id="resched-doctor" label={t("patient.appointments.fields.doctor")} type="select" value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setSlot(""); }}>{doctorList.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</PortalField>
      <PortalField id="resched-date" label={t("patient.appointments.fields.date")} type="date" min={localDateInput()} value={date} onChange={(e) => { setDate(e.target.value); setSlot(""); }} />
      <MicroLabel id="resched-times">{t("patient.appointments.fields.availableTimes")}</MicroLabel>
      <div className="mt-2 flex flex-wrap gap-3" role="group" aria-labelledby="resched-times">{slotList.map((time) => <Chip key={time} variant="slot" selected={slot === time} onClick={() => setSlot(time)}>{time}</Chip>)}</div>
      {!slots.loading && doctorId && slotList.length === 0 && <p className="mt-2 text-sm text-ink-soft">{t("patient.appointments.noSlots")}</p>}
      {errorText && <p role="alert" className="mt-3 text-sm text-red-700">{errorText}</p>}
      <div className="mt-[18px] flex flex-wrap gap-3"><PortalButton disabled={!slot || busy} onClick={save}>{t("patient.editAppt.save")}</PortalButton><PortalButton as={Link} to="/patient/appointments" variant="secondary">{t("patient.editAppt.back")}</PortalButton></div>
    </PortalCard></div>
  </>;
}
