import { useState } from "react";
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
import { APPOINTMENTS, DEPARTMENTS, DOCTORS_BY_DEPARTMENT, TIME_SLOTS } from "../../data/mockPatient.js";

const tones = { Confirmed: "success", Pending: "warning", Completed: "neutral", Cancelled: "danger" };
const statusKeys = { Confirmed: "confirmed", Pending: "pending", Completed: "completed", Cancelled: "cancelled" };

function replace(t, key, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));
}

export default function PatientAppointments() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("upcoming");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [doctor, setDoctor] = useState(DOCTORS_BY_DEPARTMENT[DEPARTMENTS[0]][0]);
  const [date, setDate] = useState("2026-11-27");
  const [slot, setSlot] = useState(TIME_SLOTS[0]);
  const [requestSent, setRequestSent] = useState(false);
  const upcoming = APPOINTMENTS.filter((appointment) => appointment.group === "upcoming");
  const past = APPOINTMENTS.filter((appointment) => appointment.group === "past");
  const rows = activeTab === "upcoming" ? [...upcoming, ...past] : past;
  const tabs = [{ id: "upcoming", label: t("patient.appointments.tabs.upcoming") }, { id: "history", label: t("patient.appointments.tabs.history") }];
  const onDepartmentChange = (event) => {
    const nextDepartment = event.target.value;
    setDepartment(nextDepartment);
    setDoctor(DOCTORS_BY_DEPARTMENT[nextDepartment][0]);
    setRequestSent(false);
  };
  const onConfirm = () => setRequestSent(true);

  return <>
    <PatientPageHeader title={t("patient.appointments.title")} subtitle={t("patient.appointments.subtitle")} />
    <div className="mb-[18px]"><PillTabs tabs={tabs} active={activeTab} onChange={setActiveTab} /></div>
    <div className="grid items-start gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)]">
      <PortalCard>
        <h2 className="text-[18px] font-bold">{t("patient.appointments.bookTitle")}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t("patient.appointments.bookSubtitle")}</p>
        <div className="mt-4">
          <PortalField id="appointment-department" label={t("patient.appointments.fields.department")} type="select" value={department} onChange={onDepartmentChange}>{DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}</PortalField>
          <PortalField id="appointment-doctor" label={t("patient.appointments.fields.doctor")} type="select" value={doctor} onChange={(event) => { setDoctor(event.target.value); setRequestSent(false); }}>{DOCTORS_BY_DEPARTMENT[department].map((item) => <option key={item}>{item}</option>)}</PortalField>
          <PortalField id="appointment-date" label={t("patient.appointments.fields.date")} type="date" value={date} onChange={(event) => { setDate(event.target.value); setRequestSent(false); }} />
        </div>
        <MicroLabel id="available-times">{t("patient.appointments.fields.availableTimes")}</MicroLabel>
        <div className="mt-2 flex gap-3" role="group" aria-labelledby="available-times">{TIME_SLOTS.map((time) => <Chip key={time} variant="slot" selected={slot === time} onClick={() => { setSlot(time); setRequestSent(false); }}>{time}</Chip>)}</div>
        <PortalButton fullWidth className="mt-[18px]" disabled={!slot} onClick={onConfirm}>{t("patient.appointments.confirmBooking")}</PortalButton>
        {requestSent && <p role="status" className="mt-3 text-sm text-brand-deep">{replace(t, "patient.appointments.requestSent", { doctor, date, time: slot })}</p>}
      </PortalCard>
      <PortalCard>
        <h2 className="text-[18px] font-bold">{activeTab === "upcoming" ? t("patient.appointments.upcomingVisits") : t("patient.appointments.historyTitle")}</h2>
        <div className="mt-1.5">{rows.map((appointment, index) => <AppointmentRow key={appointment.id} appointment={appointment} isPastStart={activeTab === "upcoming" && index === upcoming.length} isLast={index === rows.length - 1} t={t} />)}</div>
      </PortalCard>
    </div>
  </>;
}

function AppointmentRow({ appointment, isPastStart, isLast, t }) {
  const isPending = appointment.status === "Pending";
  const actions = appointment.status === "Confirmed" ? ["token", "edit", "cancel"] : appointment.status === "Pending" ? ["preview", "edit", "cancel"] : ["preview"];
  return <>{isPastStart && <MicroLabel className="mb-1 mt-[22px]">{t("patient.appointments.past")}</MicroLabel>}<div className={`flex flex-wrap items-center gap-x-3 gap-y-3 py-3.5 ${isLast ? "" : "border-b border-divider"}`}><div className="flex min-w-0 flex-1 items-center gap-3"><Avatar name={appointment.doctor} /><div className="min-w-0"><p className="truncate text-[15px] font-bold">{appointment.doctor}</p><p className="truncate text-sm text-ink-soft">{appointment.department} · {appointment.date} · {appointment.time}</p></div></div><div className={`flex flex-wrap items-center gap-3 ${isPending ? "basis-full" : ""}`}><PortalBadge tone={tones[appointment.status]}>{t(`patient.statuses.${statusKeys[appointment.status]}`)}</PortalBadge>{actions.map((action) => action === "token" ? <PortalButton key={action} as={Link} to="/patient/print/token" target="_blank" rel="noopener noreferrer">{t("patient.appointments.token")}</PortalButton> : <PortalButton key={action} variant="secondary" aria-label={replace(t, `patient.appointments.${action}Aria`, { doctor: appointment.doctor })}>{t(`patient.appointments.${action}`)}</PortalButton>)}</div></div></>;
}
