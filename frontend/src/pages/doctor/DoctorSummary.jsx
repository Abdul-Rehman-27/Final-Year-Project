import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import SummaryCard from "../../components/doctor/SummaryCard.jsx";
import { LoadState } from "../../components/doctor/DoctorCommon.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { formatShort } from "../../utils/datetime.js";
import { fill } from "../../utils/format.js";
import "./doctor-summary-print.css";

const NOT_DOCUMENTED = "Not documented in the provided records";
const MORE_FIELDS = [
  ["patient_overview", "patientOverview"],
  ["medical_history", "medicalHistory"],
  ["surgical_history", "surgicalHistory"],
  ["family_history", "familyHistory"],
  ["social_history", "socialHistory"],
  ["assessment_and_plan", "assessmentPlan"],
];

function formatDayMonth(iso, lang, timeZone, includeWeekday = false) {
  const parts = new Intl.DateTimeFormat(lang === "ur" ? "ur-PK-u-nu-latn" : "en-GB", {
    timeZone: timeZone || "Asia/Karachi",
    ...(includeWeekday ? { weekday: "short" } : {}),
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(iso));
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${includeWeekday ? `${value("weekday")} ` : ""}${value("day")} ${value("month")}`;
}

function statusLabel(status, t) {
  const key = `doctor.status.appt.${status}`;
  return t(key) === key ? status : t(key);
}

function fieldContent(value, t) {
  if (!value || value === NOT_DOCUMENTED) {
    return <span className="text-ink-muted">{t("doctor.summary.noData")}</span>;
  }
  return <p className="whitespace-pre-line">{value}</p>;
}

export default function DoctorSummary() {
  const { appointmentId, patientId: routePatientId } = useParams();
  const queueRoute = Boolean(appointmentId);
  const { t, lang } = useLanguage();
  const { hospital } = useDoctorContext();
  const [appointment, setAppointment] = useState(null);
  const [base, setBase] = useState(null);
  const [summary, setSummary] = useState(null);
  const [pageError, setPageError] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const requestSummary = useCallback(async (targetPatientId, targetAppointmentId, isCurrent = () => true) => {
    if (isCurrent()) {
      setSummary(null);
      setSummaryError(null);
      setSummaryLoading(true);
    }
    try {
      const result = await doctorPortalService.createSummary(targetPatientId, targetAppointmentId);
      if (isCurrent()) setSummary(result);
    } catch (error) {
      if (isCurrent()) setSummaryError(error);
    } finally {
      if (isCurrent()) setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setPageLoading(true);
    setPageError(null);
    setAppointment(null);
    setBase(null);
    setSummary(null);
    setSummaryError(null);
    setSummaryLoading(true);

    const load = async () => {
      try {
        let linkedAppointment = null;
        if (queueRoute) {
          linkedAppointment = await doctorPortalService.getAppointment(appointmentId);
          if (!active) return;
          setAppointment(linkedAppointment);
        }

        const targetPatientId = queueRoute ? linkedAppointment?.patient?.id : routePatientId;
        if (!targetPatientId) {
          throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND", status: 404 });
        }

        const targetAppointmentId = queueRoute ? appointmentId : undefined;
        const summaryRequest = requestSummary(targetPatientId, targetAppointmentId, () => active);
        const summaryBase = await doctorPortalService.getSummaryBase(targetPatientId, targetAppointmentId);
        if (!active) return;
        setBase(summaryBase);
        setPageLoading(false);
        await summaryRequest;
      } catch (error) {
        if (active) {
          setPageError(error);
          setPageLoading(false);
          setSummaryLoading(false);
        }
      }
    };

    load();
    return () => { active = false; };
  }, [appointmentId, loadAttempt, queueRoute, requestSummary, routePatientId]);

  const retrySummary = () => {
    const targetPatientId = queueRoute ? appointment?.patient?.id : routePatientId;
    if (targetPatientId) requestSummary(targetPatientId, queueRoute ? appointmentId : undefined);
  };
  const retryPage = () => setLoadAttempt((attempt) => attempt + 1);

  if (pageError?.code === "NOT_FOUND") {
    return (
      <div className="space-y-3 pt-6">
        <Alert>{t("doctor.common.pageUnavailable")}</Alert>
        <Link
          to={queueRoute ? "/doctor/queue" : "/doctor/patients"}
          className="inline-block font-bold text-brand-700"
        >
          ← {queueRoute
            ? fill(t("doctor.summary.crumbAppointment"), { token: appointment?.token_no || "" })
            : t("doctor.summary.crumbProfile")}
        </Link>
      </div>
    );
  }
  if (pageLoading || pageError) {
    return <LoadState loading={pageLoading} error={pageError} onRetry={retryPage}>{null}</LoadState>;
  }
  if (!base) return null;

  const snapshot = base.snapshot;
  const targetPatient = appointment?.patient;
  const genderValue = snapshot.gender || targetPatient?.gender || "—";
  const genderKey = genderValue.toLowerCase();
  const gender = ["male", "female", "other"].includes(genderKey)
    ? t(`doctor.gender.${genderKey}`)
    : genderValue;
  const age = snapshot.age == null ? "—" : `${snapshot.age} ${t("doctor.summary.yearsShort")}`;
  const titleSubtitle = fill(t("doctor.summary.subtitle"), {
    name: snapshot.name,
    age,
    gender,
  });
  const summaryValue = (key) => summary?.fields?.[key] || NOT_DOCUMENTED;
  const complaint = summaryValue("chief_complaint");
  const complaintItems = complaint.split(/[\n;]/).map((item) => item.trim()).filter(Boolean);
  const complaintIsList = /[\n;]/.test(complaint) && complaintItems.length > 1;
  const allergyValue = summaryValue("allergies");
  const allergyNotRecorded = allergyValue.startsWith("Not documented");
  const crumbs = queueRoute
    ? fill(t("doctor.summary.crumbAppointment"), { token: appointment?.token_no || "—" })
    : t("doctor.summary.crumbProfile");
  const backTo = queueRoute ? `/doctor/queue/${appointmentId}` : `/doctor/patients/${routePatientId}`;
  const lastVisit = snapshot.last_visit;
  const hospitalName = hospital?.name || t("brand");

  return (
    <div className="doctor-summary-page">
      <header className="doctor-summary-print-header" aria-hidden="true">
        <div className="doctor-summary-print-brand">
          <span className="doctor-summary-print-mark">+</span>
          <strong>{hospitalName}</strong>
        </div>
        <div className="doctor-summary-print-contact">
          <p>{hospital?.address || "[HOSPITAL ADDRESS]"}</p>
          <p>{hospital?.phone || "[PHONE]"}</p>
          <p>{hospital?.email || "[EMAIL]"}</p>
        </div>
      </header>

      <Link to={backTo} className="doctor-summary-screen-only mb-2 inline-block font-bold text-brand-700">
        ← {crumbs}
      </Link>
      <PageHeader showLanguage title={t("doctor.summary.title")} subtitle={titleSubtitle} />

      {summary && (
        <div className="doctor-summary-screen-notice mb-5">
          <div className="rounded-xl border border-dashed border-brand-600 bg-brand-50 px-4 py-3 font-semibold text-brand-800">
            {fill(t("doctor.summary.auto"), {
              date: formatShort(summary.created_at, lang, hospital?.timezone),
            })}
          </div>
        </div>
      )}

      <div className="doctor-summary-grid grid gap-5 lg:grid-cols-3">
        <SummaryCard title={t("doctor.summary.snapshot")}>
          <p className="text-xl font-black">{snapshot.name}</p>
          <p className="text-ink-muted">{age} · {gender}</p>
          <p className="mt-4">
            {lastVisit
              ? fill(t("doctor.summary.lastVisit"), {
                  date: formatDayMonth(lastVisit.starts_at, lang, hospital?.timezone, true),
                  department: lastVisit.department || "—",
                })
              : t("doctor.summary.noPrevious")}
          </p>
        </SummaryCard>

        {summaryError ? (
          <div className="doctor-summary-ai-error lg:col-span-2">
            <Alert>{t("doctor.summary.failure")}</Alert>
            <Button className="mt-3" fullWidth={false} onClick={retrySummary}>
              {t("doctor.tryAgain")}
            </Button>
          </div>
        ) : summaryLoading ? (
          ["complaint", "allergies", "medicines", "results"].map((key) => (
            <SummaryCard key={key} title={t(`doctor.summary.${key}`)}>
              <p className="animate-pulse text-ink-muted">{t("doctor.summary.preparing")}</p>
            </SummaryCard>
          ))
        ) : (
          <>
            <SummaryCard title={t("doctor.summary.complaint")}>
              {complaintIsList ? (
                <ul className="divide-y divide-line">
                  {complaintItems.map((item, index) => (
                    <li key={`${index}-${item}`} className="py-2 first:pt-0 last:pb-0">{item}</li>
                  ))}
                </ul>
              ) : fieldContent(complaint, t)}
            </SummaryCard>

            <SummaryCard title={t("doctor.summary.allergies")} warning>
              {allergyNotRecorded ? (
                <>
                  <p className="font-bold">{t("doctor.common.notRecorded")}</p>
                  <p className="mt-1 text-ink-muted">{t("doctor.common.askPatient")}</p>
                </>
              ) : fieldContent(allergyValue, t)}
            </SummaryCard>

            <SummaryCard title={t("doctor.summary.medicines")}>
              {fieldContent(summaryValue("medications"), t)}
            </SummaryCard>
            <SummaryCard title={t("doctor.summary.results")}>
              {fieldContent(summaryValue("vitals_and_results"), t)}
            </SummaryCard>
          </>
        )}

        <SummaryCard title={t("doctor.summary.past")}>
          {base.past_appointments.length ? (
            <ul className="divide-y divide-line">
              {base.past_appointments.map((item, index) => (
                <li key={`${item.starts_at}-${index}`} className="py-2 first:pt-0 last:pb-0">
                  {fill(t("doctor.summary.pastAppointment"), {
                    doctor: item.doctor_name,
                    department: item.department || "—",
                    date: formatDayMonth(item.starts_at, lang, hospital?.timezone),
                    status: statusLabel(item.status, t),
                  })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-muted">{t("doctor.summary.noPrevious")}</p>
          )}
        </SummaryCard>
      </div>

      {summary && (
        <details className="doctor-summary-more mt-5 rounded-2xl border border-line bg-white p-5">
          <summary className="cursor-pointer font-bold">{t("doctor.summary.more")}</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {MORE_FIELDS.map(([key, label]) => (
              <section key={key}>
                <h3 className="text-xs font-bold uppercase tracking-[.08em] text-brand-700">
                  {t(`doctor.summary.${label}`)}
                </h3>
                <div className="mt-1 whitespace-pre-line">
                  {fieldContent(summaryValue(key), t)}
                </div>
              </section>
            ))}
          </div>
        </details>
      )}

      <div className="doctor-summary-screen-only mt-5 flex flex-wrap gap-3">
        <Link to={backTo}>
          <Button variant="secondary" fullWidth={false}>← {t(queueRoute ? "doctor.summary.backAppointment" : "doctor.summary.backProfile")}</Button>
        </Link>
        {queueRoute && (appointment?.visit_status === "in_progress" ? (
          <Link to={`/doctor/queue/${appointmentId}/prescription/new`}>
            <Button fullWidth={false}>{t("doctor.summary.writeRx")}</Button>
          </Link>
        ) : (
          <Button fullWidth={false} disabled>{t("doctor.summary.writeRx")}</Button>
        ))}
        <Button className="ms-auto" variant="secondary" fullWidth={false} onClick={() => window.print()}>
          {t("doctor.summary.print")}
        </Button>
      </div>
    </div>
  );
}
