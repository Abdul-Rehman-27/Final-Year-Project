import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { APPOINTMENTS, HOSPITAL, LAB_RESULTS, PATIENT } from "../../data/mockPatient.js";
import Avatar from "../../components/common/Avatar.jsx";
import Chip from "../../components/patient/Chip.jsx";
import MicroLabel from "../../components/patient/MicroLabel.jsx";
import PatientPageHeader from "../../components/patient/PatientPageHeader.jsx";
import PortalBadge from "../../components/patient/PortalBadge.jsx";
import PortalButton from "../../components/patient/PortalButton.jsx";
import PortalCard from "../../components/patient/PortalCard.jsx";

const badgeTone = { Confirmed: "success", Pending: "warning", Completed: "neutral", Ready: "success", Scheduled: "warning" };
const statusKey = { Confirmed: "confirmed", Pending: "pending", Completed: "completed", Ready: "ready", Scheduled: "scheduled" };

function todayText() {
  const today = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(today);
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(today);
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(today);
  return `${weekday}, ${day} ${month}`;
}

export default function PatientDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = (user?.full_name || PATIENT.name).trim().split(/\s+/)[0] || PATIENT.name;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("patient.greetings.morning") : hour < 18 ? t("patient.greetings.afternoon") : t("patient.greetings.evening");
  const nextAppointment = APPOINTMENTS.find((appointment) => appointment.status === "Confirmed");
  const readyCount = LAB_RESULTS.filter((result) => result.status === "Ready").length;
  const pendingCount = APPOINTMENTS.filter((appointment) => appointment.status === "Pending").length;
  const goToAssistant = (event) => { event.preventDefault(); navigate("/patient/assistant"); };
  const tokenText = t("patient.viewToken").replace("{token}", nextAppointment.token);
  const emergencyNote = t("patient.emergencyNote").replace("{number}", HOSPITAL.emergency);

  return (
    <>
      <PatientPageHeader title={`${greeting}, ${firstName}`} subtitle={`${todayText()} · ${t("patient.attention")}`} />

      <div className="grid gap-[18px] lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-[18px] bg-brand-700 p-[22px] text-white">
          <MicroLabel className="text-[#E6FAF6]">{t("patient.nextAppointment")}</MicroLabel>
          <h2 className="mb-1 mt-2 text-[30px] font-bold tracking-[-0.5px]">{nextAppointment.date} · {nextAppointment.time}</h2>
          <p className="text-[15px]">{nextAppointment.doctor} · {nextAppointment.department} · {nextAppointment.room}</p>
          <div className="mt-[22px] flex flex-wrap gap-3"><PortalButton as={Link} to="/patient/print/token" target="_blank" rel="noreferrer" variant="onTealLight">{tokenText}</PortalButton><PortalButton as={Link} to="/patient/appointments" variant="onTealOutline">{t("patient.reschedule")}</PortalButton></div>
        </section>
        <PortalCard>
          <MicroLabel>{t("patient.notFeelingWell")}</MicroLabel>
          <h3 className="mb-3 mt-2 text-[16px] font-bold">{t("patient.describeSymptoms")}</h3>
          <form onSubmit={goToAssistant}><input aria-label={t("patient.describeSymptoms")} placeholder={t("patient.symptomPlaceholder")} className="h-[46px] w-full rounded-xl border border-field px-3.5 text-[15px] text-ink outline-none focus:ring-2 focus:ring-brand-600" /></form>
          <div className="mt-3 flex flex-wrap gap-3"><Chip onClick={() => navigate("/patient/assistant")}>{t("patient.symptoms.chestPressure")}</Chip><Chip onClick={() => navigate("/patient/assistant")}>{t("patient.symptoms.fever")}</Chip><Chip onClick={() => navigate("/patient/assistant")}>{t("patient.symptoms.bookDoctor")}</Chip></div>
        </PortalCard>
      </div>

      <div className="my-[18px] grid gap-[18px] lg:grid-cols-3">
        <StatCard label={t("patient.stats.prescriptions")} number="1" detail={t("patient.stats.prescriptionDetail")} />
        <StatCard label={t("patient.stats.results")} number={readyCount} detail={t("patient.stats.resultsDetail")} />
        <StatCard label={t("patient.stats.awaiting")} number={pendingCount} detail={t("patient.stats.awaitingDetail")} />
      </div>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <PortalCard><ListHeader title={t("patient.recentAppointments")} to="/patient/appointments" viewAll={t("patient.viewAll")} />
          <div>{APPOINTMENTS.slice(0, 3).map((appointment, index) => <div key={`${appointment.doctor}-${appointment.date}`} className={`flex items-center justify-between gap-3 py-3.5 ${index < 2 ? "border-b border-divider" : ""}`}><div className="flex min-w-0 items-center gap-3"><Avatar name={appointment.doctor} /><div className="min-w-0"><p className="truncate font-bold">{appointment.doctor}</p><p className="truncate text-sm text-ink-soft">{appointment.department} · {appointment.date}</p></div></div><PortalBadge tone={badgeTone[appointment.status]}>{t(`patient.statuses.${statusKey[appointment.status]}`)}</PortalBadge></div>)}</div>
        </PortalCard>
        <PortalCard><ListHeader title={t("patient.labResults")} to="/patient/lab-reports" viewAll={t("patient.viewAll")} />
          <div>{LAB_RESULTS.map((result, index) => <div key={result.name} className={`flex items-center justify-between gap-3 py-3.5 ${index < LAB_RESULTS.length - 1 ? "border-b border-divider" : ""}`}><div className="min-w-0"><p className="font-bold">{result.name}</p><p className="truncate text-sm text-ink-soft">{result.meta}</p></div><PortalBadge tone={badgeTone[result.status]}>{t(`patient.statuses.${statusKey[result.status]}`)}</PortalBadge></div>)}</div>
        </PortalCard>
      </div>
      <p className="mt-5 text-[13px] text-ink-soft">{emergencyNote}</p>
    </>
  );
}

function StatCard({ label, number, detail }) {
  return <PortalCard><MicroLabel>{label}</MicroLabel><p className="mt-2 text-[34px] font-bold leading-[1.1] tracking-[-1px] text-brand-700">{number}</p><p className="mt-1.5 text-[13px] text-ink-soft">{detail}</p></PortalCard>;
}

function ListHeader({ title, to, viewAll }) {
  return <div className="flex items-center justify-between gap-3"><h2 className="text-[18px] font-bold">{title}</h2><Link to={to} className="text-sm font-bold text-ink-soft underline focus:outline-none focus:ring-2 focus:ring-brand-600">{viewAll}</Link></div>;
}
