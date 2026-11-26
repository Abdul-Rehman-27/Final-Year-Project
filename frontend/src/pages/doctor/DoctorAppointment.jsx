import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import Alert from "../../components/common/Alert.jsx";
import Avatar from "../../components/common/Avatar.jsx";
import Badge from "../../components/common/Badge.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import InfoGrid from "../../components/common/InfoGrid.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { Status, errorText, LoadState, useRequest } from "../../components/doctor/DoctorCommon.jsx";
import VisitStatusSelect from "../../components/doctor/VisitStatusSelect.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { formatShort, formatTime } from "../../utils/datetime.js";
import { fill } from "../../utils/format.js";

export default function DoctorAppointment() {
  const { appointmentId } = useParams();
  const { t, lang } = useLanguage();
  const { hospital } = useDoctorContext();
  const location = useLocation();
  const loadAppointment = () => doctorPortalService.getAppointment(appointmentId);
  const { data: appointment, loading, error, retry } = useRequest(loadAppointment, [appointmentId]);
  const [actionError, setActionError] = useState(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!appointment && error?.code === "NOT_FOUND") {
    return (
      <div className="space-y-3 pt-6">
        <Alert>{t("doctor.common.pageUnavailable")}</Alert>
        <Link to="/doctor/queue" className="inline-block font-bold text-brand-700">
          ← {t("doctor.appointment.queue")}
        </Link>
      </div>
    );
  }

  if (!appointment) {
    return <LoadState loading={loading} error={error} onRetry={retry}>{null}</LoadState>;
  }

  const setVisitStatus = async (visitStatus) => {
    setBusy(true);
    try {
      await doctorPortalService.setVisitStatus(appointment.id, visitStatus);
      setActionError(null);
      setConfirmComplete(false);
      retry();
    } catch (requestError) {
      setActionError(requestError);
      throw requestError;
    } finally {
      setBusy(false);
    }
  };

  const confirmMarkComplete = async () => {
    try {
      await setVisitStatus("completed");
    } catch {
      setConfirmComplete(false);
    }
  };

  const inProgress = appointment?.visit_status === "in_progress";
  const terminal = ["completed", "incomplete", "cancelled"].includes(appointment?.visit_status);
  const genderKey = appointment?.patient?.gender?.toLowerCase();
  const gender = ["male", "female", "other"].includes(genderKey)
    ? t(`doctor.gender.${genderKey}`)
    : (appointment?.patient?.gender || "—");
  const patientAge = appointment?.patient?.age == null
    ? "—"
    : `${appointment.patient.age} ${t("doctor.appointment.yearsShort")}`;

  return (
    <LoadState loading={loading} error={error} onRetry={retry}>
      <Link to="/doctor/queue" className="mb-2 inline-block font-bold text-brand-700">
        ← {t("doctor.appointment.queue")}
      </Link>

      {location.state?.success && (
        <div className="mb-4">
          <Alert type="success">{location.state.success}</Alert>
        </div>
      )}
      {actionError && (
        <div className="mb-4">
          <Alert>{errorText(t, actionError)}</Alert>
        </div>
      )}

      <PageHeader
        showLanguage
        title={t(inProgress ? "doctor.appointment.title" : "doctor.appointment.details")}
        subtitle={t("doctor.appointment.subtitle")}
      />

      <Card className="mb-5 space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={appointment.patient.full_name} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-black">{appointment.patient.full_name}</h2>
            <p className="text-ink-muted">{patientAge} · {gender}</p>
          </div>
          <Badge tone="success">
            <bdi dir="ltr">{fill(t("doctor.appointment.token"), { token: appointment.token_no || "—" })}</bdi>
          </Badge>
          {terminal ? (
            <Status value={appointment.visit_status} />
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-[.08em] text-ink-muted">
                {t("doctor.appointment.status")}
              </span>
              <VisitStatusSelect
                id={appointment.id}
                visitStatus={appointment.visit_status}
                canCall={appointment.can_call === true}
                onSetStatus={setVisitStatus}
                onError={setActionError}
              />
            </div>
          )}
        </div>

        <InfoGrid items={[
          { label: t("doctor.appointment.booking"), value: appointment.booking_no, dir: "ltr" },
          { label: t("doctor.appointment.scheduled"), value: formatShort(appointment.starts_at, lang, hospital.timezone) },
          { label: t("doctor.appointment.room"), value: appointment.room_label || "—" },
          { label: t("doctor.appointment.checkedIn"), value: appointment.checked_in_at ? formatTime(appointment.checked_in_at, hospital.timezone) : "—", dir: "ltr" },
          { label: t("doctor.appointment.called"), value: appointment.called_at ? formatTime(appointment.called_at, hospital.timezone) : "—", dir: "ltr" },
          { label: t("doctor.appointment.source"), value: t(appointment.source === "chatbot" ? "doctor.appointment.chatbot" : "doctor.appointment.portal") },
        ]} />

        <section>
          <p className="text-xs font-bold uppercase tracking-[.08em] text-brand-700">
            {t("doctor.appointment.reason")}
          </p>
          <p className={!appointment.reason ? "text-ink-muted" : undefined}>
            {appointment.reason || t("doctor.common.notProvided")}
          </p>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link to={`/doctor/queue/${appointment.id}/summary`}>
            <Button fullWidth={false}>{t("doctor.appointment.history")}</Button>
          </Link>
          {inProgress ? (
            <Link to={`/doctor/queue/${appointment.id}/prescription/new`}>
              <Button variant="secondary" fullWidth={false}>{t("doctor.appointment.writeRx")}</Button>
            </Link>
          ) : (
            <Button
              variant="secondary"
              fullWidth={false}
              disabled
              title={t("doctor.appointment.availableInProgress")}
            >
              {t("doctor.appointment.writeRx")}
            </Button>
          )}
          <Link to={`/doctor/lab-tests?patient=${appointment.patient.id}&appointment=${appointment.id}`}>
            <Button variant="secondary" fullWidth={false}>{t("doctor.appointment.requestTest")}</Button>
          </Link>
          {inProgress && (
            <Button
              className="ms-auto"
              variant="secondary"
              fullWidth={false}
              disabled={busy}
              onClick={() => setConfirmComplete(true)}
            >
              {t("doctor.appointment.markComplete")}
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-xl font-black">{t("doctor.appointment.prescriptions")}</h2>
          {appointment.prescriptions.length ? appointment.prescriptions.map((prescription) => (
            <div key={prescription.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
              <bdi dir="ltr" className="font-bold">{prescription.rx_no}</bdi>
              <Status value={prescription.status} />
              <Link to={`/doctor/prescriptions?rx=${prescription.id}`}>
                <Button size="sm" variant="secondary" fullWidth={false}>
                  {t("doctor.appointment.view")}
                </Button>
              </Link>
            </div>
          )) : (
            <p className="text-ink-muted">{t("doctor.appointment.noneRx")}</p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-xl font-black">{t("doctor.appointment.tests")}</h2>
          {appointment.lab_reports.length ? appointment.lab_reports.map((report) => (
            <div key={report.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
              <span>{report.test_name}</span>
              <Status value={report.status} />
            </div>
          )) : (
            <p className="text-ink-muted">{t("doctor.appointment.noneTests")}</p>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmComplete}
        title={t("doctor.queue.markComplete")}
        message={t("doctor.queue.irreversible")}
        confirmLabel={busy ? t("common.loading") : t("doctor.queue.confirm")}
        onConfirm={confirmMarkComplete}
        onClose={() => setConfirmComplete(false)}
      />
    </LoadState>
  );
}
