import { useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "../../components/common/Avatar.jsx";
import Badge from "../../components/common/Badge.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatCard from "../../components/common/StatCard.jsx";
import Tabs from "../../components/common/Tabs.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import useDoctorDashboard from "../../hooks/useDoctorDashboard.js";
import { fill } from "../../utils/format.js";
import { dayPart, formatDate, formatDay, formatShort, formatTime } from "../../utils/datetime.js";
import { LoadState, Status } from "../../components/doctor/DoctorCommon.jsx";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const appointmentStatuses = {
  in_progress: ["doctor.status.visit.in_progress", "success"],
  waiting: ["doctor.status.visit.waiting", "success"],
  holding: ["doctor.status.visit.not_arrived", "warning"],
  later: ["doctor.status.visit.not_arrived", "warning"],
  grace_expired: ["doctor.status.visit.not_arrived", "warning"],
  completed: ["doctor.status.visit.completed", "neutral"],
  incomplete: ["doctor.status.visit.incomplete", "danger"],
  pending: ["doctor.status.appt.pending", "warning"],
  confirmed: ["doctor.status.appt.confirmed", "success"],
  cancelled: ["doctor.status.appt.cancelled", "danger"],
};

function AppointmentBadge({ appointment }) {
  const { t } = useLanguage();
  const status = appointment.queue_state === "none" ? appointment.status : appointment.queue_state;
  const [key, tone] = appointmentStatuses[status] || ["doctor.status.appt.confirmed", "success"];
  return <Badge tone={tone}>{t(key)}</Badge>;
}

function shortDate(iso, lang, tz) {
  return formatDate(iso, lang, tz).split(" ").slice(0, 2).join(" ");
}

export default function DoctorDashboard() {
  const { t, lang } = useLanguage();
  const { profile, hospital } = useDoctorContext();
  const { data, loading, error, reload } = useDoctorDashboard();
  const [tab, setTab] = useState("today");
  const tz = hospital.timezone || "Asia/Karachi";
  const doctorName = (profile.full_name || "").replace(/^Dr\.?\s*/i, "").trim();
  const lastName = doctorName.split(/\s+/).filter(Boolean).at(-1) || doctorName;

  return (
    <LoadState loading={loading} error={error} onRetry={reload}>
      {data && (() => {
        const now = data.server_now;
        const todayRows = data.today || [];
        const upcomingRows = data.upcoming || [];
        const appointments = tab === "today" ? todayRows : upcomingRows;
        const stats = data.stats;
        const breakdown = stats.today_breakdown;

        return <>
          <PageHeader
            showLanguage
            title={fill(t(`doctor.dashboard.${dayPart(Date.parse(now), tz)}`), { name: lastName })}
            subtitle={fill(t("doctor.dashboard.subtitle"), { date: formatDay(now, lang, tz) })}
          />

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <StatCard value={stats.total_patients} label={t("doctor.dashboard.totalPatients")} />
            <StatCard
              value={stats.appointments_today}
              label={t("doctor.dashboard.appointmentsToday")}
              detail={fill(t("doctor.dashboard.breakdown"), {
                a: breakdown.in_progress,
                b: breakdown.waiting,
                c: breakdown.later,
              })}
            />
            <StatCard
              value={stats.in_queue_now}
              label={t("doctor.dashboard.inQueue")}
              detail={stats.next_waiting
                ? <bdi dir="ltr">{fill(t("doctor.dashboard.next"), {
                    token: stats.next_waiting.token_no,
                    patient: stats.next_waiting.patient_name,
                  })}</bdi>
                : t("doctor.dashboard.nobodyWaiting")}
            />
          </div>

          <div className="mb-6 grid gap-5 lg:grid-cols-[2fr_1fr]">
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-black">{t("doctor.dashboard.appointments")}</h2>
                <Tabs
                  variant="pill"
                  tabs={[
                    { id: "today", label: t("doctor.dashboard.today") },
                    { id: "upcoming", label: t("doctor.dashboard.upcoming") },
                  ]}
                  active={tab}
                  onChange={setTab}
                />
              </div>
              {appointments.length ? (
                <div>
                  {appointments.map((appointment) => (
                    <Link
                      key={appointment.id}
                      to={`/doctor/queue/${appointment.id}`}
                      className="flex items-center gap-3 border-b border-line py-3 last:border-0"
                    >
                      <Avatar name={appointment.patient_name} />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate">{appointment.patient_name}</b>
                        <small className="block truncate text-ink-muted">
                          <bdi dir="ltr">{tab === "today"
                            ? formatTime(appointment.starts_at, tz)
                            : formatShort(appointment.starts_at, lang, tz)}</bdi>
                          {" · "}{appointment.reason || "—"}
                        </small>
                      </span>
                      <AppointmentBadge appointment={appointment} />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-ink-muted">
                  {t(tab === "today" ? "doctor.dashboard.noToday" : "doctor.dashboard.noUpcoming")}
                </p>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-xl font-black">{t("doctor.dashboard.availability")}</h2>
                <Link to="/doctor/availability">
                  <Button size="sm" variant="secondary" fullWidth={false}>{t("doctor.dashboard.edit")}</Button>
                </Link>
              </div>
              <div>
                {(data.schedule || []).map((day) => (
                  <div key={day.weekday} className="flex items-center gap-2 border-b border-line py-2 last:border-0">
                    <b className="w-10 shrink-0">{t(`doctor.days.short.${WEEKDAYS[day.weekday]}`)}</b>
                    {day.is_active ? (
                      <>
                        <span className="min-w-0 flex-1"><bdi dir="ltr">{day.start_time} – {day.end_time}</bdi></span>
                        <span className="shrink-0 text-sm text-ink-muted"><bdi dir="ltr">{day.slot_minutes} {t("doctor.dashboard.minutes")}</bdi></span>
                      </>
                    ) : <span className="text-ink-muted">{t("doctor.availability.off")}</span>}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {[
              {
                title: "doctor.dashboard.recentTests",
                rows: data.recent_tests || [],
                empty: "doctor.dashboard.noTests",
                to: "/doctor/lab-tests",
                columns: [
                  { header: t("doctor.dashboard.test"), render: (row) => row.test_name },
                  { header: t("doctor.dashboard.patient"), render: (row) => row.patient_name },
                  { header: t("doctor.dashboard.date"), render: (row) => <bdi dir="ltr">{shortDate(row.created_at, lang, tz)}</bdi> },
                  { header: t("doctor.common.status"), render: (row) => <Status value={row.status} /> },
                ],
              },
              {
                title: "doctor.dashboard.recentRx",
                rows: data.recent_prescriptions || [],
                empty: "doctor.dashboard.noRx",
                to: "/doctor/prescriptions",
                columns: [
                  { header: t("doctor.dashboard.rx"), render: (row) => <bdi dir="ltr"><b>{row.rx_no}</b></bdi> },
                  { header: t("doctor.dashboard.patient"), render: (row) => row.patient_name },
                  { header: t("doctor.dashboard.date"), render: (row) => <bdi dir="ltr">{shortDate(row.issued_on, lang, tz)}</bdi> },
                  { header: t("doctor.common.status"), render: (row) => <Status value={row.status} /> },
                ],
              },
            ].map((section) => (
              <Card key={section.title} className="p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black">{t(section.title)}</h2>
                  <Link className="shrink-0 font-bold text-brand-700 underline" to={section.to}>{t("doctor.dashboard.viewAll")}</Link>
                </div>
                <DataTable dense columns={section.columns} rows={section.rows} emptyText={t(section.empty)} />
              </Card>
            ))}
          </div>
        </>;
      })()}
    </LoadState>
  );
}
