import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "../../components/common/Avatar.jsx";
import Chip from "../../components/patient/Chip.jsx";
import MicroLabel from "../../components/patient/MicroLabel.jsx";
import PatientPageHeader from "../../components/patient/PatientPageHeader.jsx";
import PillTabs from "../../components/patient/PillTabs.jsx";
import PortalBadge from "../../components/patient/PortalBadge.jsx";
import PortalButton from "../../components/patient/PortalButton.jsx";
import PortalCard from "../../components/patient/PortalCard.jsx";
import PortalField from "../../components/patient/PortalField.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import ActionNeeded from "../../components/patient/ActionNeeded.jsx";
import LoadState from "../../components/patient/LoadState.jsx";
import { useAsync } from "../../hooks/useAsync.js";
import { patientErrorKey, patientPortalService } from "../../services/patientPortalService.js";
import { localDateInput } from "../../utils/datetime.js";
import { appointmentView } from "../../utils/patientAdapters.js";

const tones = { Confirmed: "success", Pending: "warning", Completed: "neutral", Cancelled: "danger" };
const statusKeys = { Confirmed: "confirmed", Pending: "pending", Completed: "completed", Cancelled: "cancelled" };

function replace(t, key, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));
}

export default function PatientAppointments() {
  const { t, lang } = useLanguage();
  const [activeTab, setActiveTab] = useState("upcoming");
  const [departmentId, setDepartmentId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(() => localDateInput());
  const [slot, setSlot] = useState("");
  const [sent, setSent] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const appts = useAsync(() => patientPortalService.listAppointments(), []);
  const depts = useAsync(() => patientPortalService.listDepartments(), []);
  const doctors = useAsync(() => (departmentId ? patientPortalService.listDoctors(departmentId) : Promise.resolve([])), [departmentId]);
  const slots = useAsync(() => (doctorId && date ? patientPortalService.getSlots(doctorId, date) : Promise.resolve({ slots: [] })), [doctorId, date]);
  const deptList = depts.data || [];
  const doctorList = doctors.data || [];
  const slotList = slots.data?.slots || [];
  const rowsAll = (appts.data?.items || []).map((a) => appointmentView(a, lang));
  const upcoming = rowsAll.filter((appointment) => appointment.group === "upcoming");
  const past = rowsAll.filter((appointment) => appointment.group === "past");
  const rows = activeTab === "upcoming" ? [...upcoming, ...past] : past;
  const tabs = [{ id: "upcoming", label: t("patient.appointments.tabs.upcoming") }, { id: "history", label: t("patient.appointments.tabs.history") }];

  useEffect(() => { if (!departmentId && deptList.length) setDepartmentId(String(deptList[0].id)); }, [deptList, departmentId]);
  useEffect(() => { setDoctorId(doctorList.length ? String(doctorList[0].id) : ""); setSlot(""); }, [doctors.data]);
  useEffect(() => { if (slot && !slotList.includes(slot)) setSlot(""); }, [slots.data]);

  const clear = () => { setSent(null); setActionError(""); };
  const doctorName = doctorList.find((d) => String(d.id) === doctorId)?.full_name || "";
  const onConfirm = async () => {
    clear(); setBusy(true);
    try { await patientPortalService.bookAppointment({ doctor_id: Number(doctorId), date, time: slot }); setSent({ doctor: doctorName, date, time: slot }); setSlot(""); appts.reload(); slots.reload(); }
    catch (err) { setActionError(patientErrorKey(err)); slots.reload(); }
    finally { setBusy(false); }
  };
  const onCancel = async (appointment) => {
    if (!window.confirm(replace(t, "patient.appointments.cancelConfirm", { doctor: appointment.doctor }))) return;
    clear();
    try { await patientPortalService.cancelAppointment(appointment.id); appts.reload(); slots.reload(); }
    catch (err) { setActionError(patientErrorKey(err)); }
  };
  const errorText = actionError ? (t(actionError) === actionError ? t("patient.errors.GENERIC") : t(actionError)) : "";

  return <>
    <PatientPageHeader title={t("patient.appointments.title")} subtitle={t("patient.appointments.subtitle")} />
    <div className="mb-[18px]"><PillTabs tabs={tabs} active={activeTab} onChange={setActiveTab} /></div>
    <ActionNeeded onChanged={() => { appts.reload(); slots.reload(); }} />
    <div className="grid items-start gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)]">
      <PortalCard>
        <h2 className="text-[18px] font-bold">{t("patient.appointments.bookTitle")}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t("patient.appointments.bookSubtitle")}</p>
        <div className="mt-4">
          <PortalField id="appointment-department" label={t("patient.appointments.fields.department")} type="select" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); clear(); }}>{deptList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</PortalField>
          <PortalField id="appointment-doctor" label={t("patient.appointments.fields.doctor")} type="select" value={doctorId} onChange={(event) => { setDoctorId(event.target.value); setSlot(""); clear(); }}>{doctorList.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</PortalField>
          <PortalField id="appointment-date" label={t("patient.appointments.fields.date")} type="date" min={localDateInput()} value={date} onChange={(event) => { setDate(event.target.value); setSlot(""); clear(); }} />
        </div>
        <MicroLabel id="available-times">{t("patient.appointments.fields.availableTimes")}</MicroLabel>
        <div className="mt-2 flex flex-wrap gap-3" role="group" aria-labelledby="available-times">{slotList.map((time) => <Chip key={time} variant="slot" selected={slot === time} onClick={() => { setSlot(time); clear(); }}>{time}</Chip>)}</div>
        {!slots.loading && doctorId && slotList.length === 0 && <p className="mt-2 text-sm text-ink-soft">{t("patient.appointments.noSlots")}</p>}
        <PortalButton fullWidth className="mt-[18px]" disabled={!slot || busy} onClick={onConfirm}>{t("patient.appointments.confirmBooking")}</PortalButton>
        {sent && <p role="status" className="mt-3 text-sm text-brand-deep">{replace(t, "patient.appointments.requestSent", sent)}</p>}
        {errorText && <p role="alert" className="mt-3 text-sm text-red-700">{errorText}</p>}
      </PortalCard>
      <PortalCard>
        <h2 className="text-[18px] font-bold">{activeTab === "upcoming" ? t("patient.appointments.upcomingVisits") : t("patient.appointments.historyTitle")}</h2>
        <LoadState loading={appts.loading} error={appts.error} onRetry={appts.reload} hasData={!!appts.data}>
          <div className="mt-1.5">{rows.length === 0 && <p className="py-3.5 text-sm text-ink-soft">{t("patient.noAppointments")}</p>}{rows.map((appointment, index) => <AppointmentRow key={appointment.id} appointment={appointment} isPastStart={activeTab === "upcoming" && index === upcoming.length && past.length > 0} isLast={index === rows.length - 1} onCancel={onCancel} t={t} />)}</div>
        </LoadState>
      </PortalCard>
    </div>
  </>;
}

function AppointmentRow({ appointment, isPastStart, isLast, onCancel, t }) {
  const [showDetails, setShowDetails] = useState(false); // CHANGED: Preview now opens an inline details panel
  const isPending = appointment.status === "Pending";
  const base = appointment.status === "Confirmed" ? ["token"] : ["preview"];
  const actions = appointment.status === "Completed" || appointment.status === "Cancelled" ? base : [...base, ...(appointment.canEdit ? ["edit"] : []), ...(appointment.canCancel ? ["cancel"] : [])];
  return <>{isPastStart && <MicroLabel className="mb-1 mt-[22px]">{t("patient.appointments.past")}</MicroLabel>}<div className={`flex flex-wrap items-center gap-x-3 gap-y-3 py-3.5 ${isLast ? "" : "border-b border-divider"}`}><div className="flex min-w-0 flex-1 items-center gap-3"><Avatar name={appointment.doctor} /><div className="min-w-0"><p className="truncate text-[15px] font-bold">{appointment.doctor}</p><p className="truncate text-sm text-ink-soft">{appointment.department} · {appointment.date} · {appointment.time}</p></div></div><div className={`flex flex-wrap items-center gap-3 ${isPending ? "basis-full" : ""}`}><PortalBadge tone={tones[appointment.status]}>{t(`patient.statuses.${statusKeys[appointment.status]}`)}</PortalBadge>{actions.map((action) => action === "token" ? <PortalButton key={action} as={Link} to={`/patient/print/token?id=${appointment.id}`} target="_blank" rel="noopener noreferrer">{t("patient.appointments.token")}</PortalButton> : action === "edit" ? <PortalButton key={action} as={Link} to={`/patient/appointments/${appointment.id}/edit`} variant="secondary" aria-label={replace(t, "patient.appointments.editAria", { doctor: appointment.doctor })}>{t("patient.appointments.edit")}</PortalButton> : <PortalButton key={action} variant="secondary" aria-label={replace(t, `patient.appointments.${action}Aria`, { doctor: appointment.doctor })} onClick={action === "cancel" ? () => onCancel(appointment) : () => setShowDetails((open) => !open)}>{action === "preview" && showDetails ? t("patient.appointments.hidePreview") : t(`patient.appointments.${action}`)}</PortalButton>)}</div>{showDetails && <AppointmentDetails appointment={appointment} t={t} />}</div></>;
}

/** NEW: inline preview shown when the patient clicks "Preview" (pending / non-token appointments). */
function AppointmentDetails({ appointment, t }) {
  const rows = [["booking", appointment.bookingNo], ["doctor", appointment.doctor], ["department", appointment.department], ["dateTime", `${appointment.date} · ${appointment.time}`], ["status", t(`patient.statuses.${statusKeys[appointment.status]}`)], ["room", appointment.room], ["token", appointment.token]].filter(([, value]) => value);
  return <div className="basis-full rounded-[10px] bg-surface p-4"><dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{rows.map(([key, value]) => <div key={key}><dt className="text-[11px] font-bold uppercase tracking-[1px] text-ink-soft">{t(`patient.appointments.details.${key}`)}</dt><dd className="mt-0.5 text-[14px] font-bold">{value}</dd></div>)}</dl>{appointment.status === "Pending" && <p className="mt-3 text-sm text-ink-soft">{t("patient.appointments.details.awaiting")}</p>}</div>;
}
