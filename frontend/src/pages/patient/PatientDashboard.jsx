import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useAsync } from "../../hooks/useAsync.js";
import { patientPortalService } from "../../services/patientPortalService.js";
import { dashboardView } from "../../utils/patientAdapters.js";
import LoadState from "../../components/patient/LoadState.jsx";
import Avatar from "../../components/common/Avatar.jsx";
import Chip from "../../components/patient/Chip.jsx";
import MicroLabel from "../../components/patient/MicroLabel.jsx";
import PatientPageHeader from "../../components/patient/PatientPageHeader.jsx";
import PortalBadge from "../../components/patient/PortalBadge.jsx";
import PortalButton from "../../components/patient/PortalButton.jsx";
import PortalCard from "../../components/patient/PortalCard.jsx";

const replace = (text, values) => Object.entries(values).reduce((r, [k, v]) => r.replace(`{${k}}`, v), text);
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
  const { t, lang } = useLanguage();
  const { data, error, loading, reload } = useAsync(() => patientPortalService.getDashboard(), []);
  const view = data ? dashboardView(data, lang) : null;
  return <LoadState loading={loading} error={error} onRetry={reload} hasData={!!view}>{view && <DashboardBody view={view} />}</LoadState>;
}

function DashboardBody({ view }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fullName = (user?.full_name || view.patientName || "").trim();
  const firstName = fullName.split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("patient.greetings.morning") : hour < 18 ? t("patient.greetings.afternoon") : t("patient.greetings.evening");
  const nextAppointment = view.next;
  const { stats } = view;
  const goToAssistant = (event) => { event.preventDefault(); navigate("/patient/assistant"); };
  const tokenText = nextAppointment ? t("patient.viewToken").replace("{token}", nextAppointment.token || "") : "";
  const emergencyNote = t("patient.emergencyNote").replace("{number}", view.hospital.emergency);

  return (
    <>
      <PatientPageHeader title={`${greeting}, ${firstName}`} subtitle={`${todayText()} · ${t("patient.attention")}`} />

      <div className="grid gap-[18px] lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-[18px] bg-brand-700 p-[22px] text-white">
          <MicroLabel className="text-[#E6FAF6]">{t("patient.nextAppointment")}</MicroLabel>
          {nextAppointment ? <>
          <h2 className="mb-1 mt-2 text-[30px] font-bold tracking-[-0.5px]">{nextAppointment.date} · {nextAppointment.time}</h2>
          <p className="text-[15px]">{nextAppointment.doctor} · {nextAppointment.department} · {nextAppointment.room}</p>
          <div className="mt-[22px] flex flex-wrap gap-3"><PortalButton as={Link} to={`/patient/print/token?id=${nextAppointment.id}`} target="_blank" rel="noreferrer" variant="onTealLight">{tokenText}</PortalButton><PortalButton as={Link} to="/patient/appointments" variant="onTealOutline">{t("patient.reschedule")}</PortalButton></div></> : <>
          <h2 className="mb-1 mt-2 text-[24px] font-bold tracking-[-0.5px]">{t("patient.noNextAppointment")}</h2>
          <div className="mt-[22px] flex flex-wrap gap-3"><PortalButton as={Link} to="/patient/appointments" variant="onTealLight">{t("patient.bookNow")}</PortalButton></div></>}
        </section>
        <PortalCard>
          <MicroLabel>{t("patient.notFeelingWell")}</MicroLabel>
          <h3 className="mb-3 mt-2 text-[16px] font-bold">{t("patient.describeSymptoms")}</h3>
          <form onSubmit={goToAssistant}><input aria-label={t("patient.describeSymptoms")} placeholder={t("patient.symptomPlaceholder")} className="h-[46px] w-full rounded-xl border border-field px-3.5 text-[15px] text-ink outline-none focus:ring-2 focus:ring-brand-600" /></form>
          <div className="mt-3 flex flex-wrap gap-3"><Chip onClick={() => navigate("/patient/assistant")}>{t("patient.symptoms.chestPressure")}</Chip><Chip onClick={() => navigate("/patient/assistant")}>{t("patient.symptoms.fever")}</Chip><Chip onClick={() => navigate("/patient/assistant")}>{t("patient.symptoms.bookDoctor")}</Chip></div>
        </PortalCard>
      </div>

      <div className="my-[18px] grid gap-[18px] lg:grid-cols-3">
        <StatCard label={t("patient.stats.prescriptions")} number={stats.prescriptions} detail={stats.medicines.length ? replace(t("patient.stats.prescriptionDetail"), { medicines: stats.medicines.join(", ") }) : t("patient.stats.prescriptionNone")} />
        <StatCard label={t("patient.stats.results")} number={stats.ready} detail={stats.readyNames.length ? replace(t("patient.stats.resultsDetail"), { names: stats.readyNames.join(", ") }) : t("patient.stats.resultsNone")} />
        <StatCard label={t("patient.stats.awaiting")} number={stats.awaiting} detail={stats.nextAwaiting ? replace(t("patient.stats.awaitingDetail"), { doctor: stats.nextAwaiting.doctor, date: stats.nextAwaiting.date }) : t("patient.stats.awaitingNone")} />
      </div>

      <div className="grid gap-[18px] lg:grid-cols-2">
        <PortalCard><ListHeader title={t("patient.recentAppointments")} to="/patient/appointments" viewAll={t("patient.viewAll")} />
          <div>{view.recent.length === 0 && <p className="py-3.5 text-sm text-ink-soft">{t("patient.noAppointments")}</p>}{view.recent.map((appointment, index) => <div key={appointment.id} className={`flex items-center justify-between gap-3 py-3.5 ${index < view.recent.length - 1 ? "border-b border-divider" : ""}`}><div className="flex min-w-0 items-center gap-3"><Avatar name={appointment.doctor} /><div className="min-w-0"><p className="truncate font-bold">{appointment.doctor}</p><p className="truncate text-sm text-ink-soft">{appointment.department} · {appointment.date}</p></div></div><PortalBadge tone={badgeTone[appointment.status]}>{t(`patient.statuses.${statusKey[appointment.status]}`)}</PortalBadge></div>)}</div>
        </PortalCard>
        <PortalCard><ListHeader title={t("patient.labResults")} to="/patient/lab-reports" viewAll={t("patient.viewAll")} />
          <div>{view.labs.length === 0 && <p className="py-3.5 text-sm text-ink-soft">{t("patient.noLabResults")}</p>}{view.labs.map((result, index) => <div key={`${result.name}-${index}`} className={`flex items-center justify-between gap-3 py-3.5 ${index < view.labs.length - 1 ? "border-b border-divider" : ""}`}><div className="min-w-0"><p className="font-bold">{result.name}</p><p className="truncate text-sm text-ink-soft">{result.awaitingScheduling ? t("patient.labReports.awaitingScheduling") : result.meta}</p></div><PortalBadge tone={badgeTone[result.status]}>{t(`patient.statuses.${statusKey[result.status]}`)}</PortalBadge></div>)}</div>
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
