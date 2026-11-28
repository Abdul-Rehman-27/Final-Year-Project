import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import InfoGrid from "../../components/common/InfoGrid.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import MedicineRowsEditor from "../../components/doctor/MedicineRowsEditor.jsx";
import { LoadState, SectionLabel, errorText, useRequest } from "../../components/doctor/DoctorCommon.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { printPrescription } from "../../components/doctor/print/PrintDocuments.jsx";
import { formatDate } from "../../utils/datetime.js";
import { fill } from "../../utils/format.js";

const emptyMedicine = (id) => ({ id, medicine: "", dosage: "", timing: "" });

export default function DoctorWritePrescription() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { profile, hospital } = useDoctorContext();
  const loadAppointment = () => doctorPortalService.getAppointment(appointmentId);
  const { data: appointment, loading, error, retry } = useRequest(loadAppointment, [appointmentId]);
  const [rows, setRows] = useState([emptyMedicine(1)]);
  const [duration, setDuration] = useState("14");
  const [instructions, setInstructions] = useState(() => t("doctor.rx.defaultInstructions"));
  const [rowErrors, setRowErrors] = useState({});
  const [durationError, setDurationError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [busy, setBusy] = useState(false);
  const nextRowId = useRef(2);

  useEffect(() => {
    if (appointment && appointment.visit_status !== "in_progress") {
      navigate(`/doctor/queue/${appointment.id}`, {
        replace: true,
        state: { error: { code: "VISIT_NOT_IN_PROGRESS" } },
      });
    }
  }, [appointment, navigate]);

  if (error?.code === "NOT_FOUND") {
    return (
      <div className="space-y-4 pt-6">
        <Alert>{t("doctor.common.pageUnavailable")}</Alert>
        <Link to="/doctor/queue" className="font-bold text-brand-700">← {t("doctor.appointment.queue")}</Link>
      </div>
    );
  }
  if (!appointment || appointment.visit_status !== "in_progress") {
    return <LoadState loading={loading || Boolean(appointment)} error={error} onRetry={retry}>{null}</LoadState>;
  }

  const changeRow = (index, field, value) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
    setRowErrors((current) => {
      if (!current[index]?.[field]) return current;
      const next = { ...current, [index]: { ...current[index], [field]: null } };
      return next;
    });
    setFormError(null);
    setServerError(null);
  };

  const addRow = () => {
    if (rows.length < 10) {
      setRows((current) => [...current, emptyMedicine(nextRowId.current++)]);
      setFormError(null);
    }
  };

  const removeRow = (index) => {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
    setRowErrors((current) => {
      const next = {};
      Object.entries(current).forEach(([rowIndex, errors]) => {
        const numericIndex = Number(rowIndex);
        if (numericIndex < index) next[numericIndex] = errors;
        if (numericIndex > index) next[numericIndex - 1] = errors;
      });
      return next;
    });
    setFormError(null);
  };

  const validate = () => {
    const errorsByIndex = {};
    const filledRows = rows.filter((row) => row.medicine.trim() || row.dosage.trim() || row.timing.trim());
    filledRows.forEach((row) => {
      const index = rows.findIndex((item) => item.id === row.id);
      const errors = {};
      ["medicine", "dosage", "timing"].forEach((field) => {
        const max = field === "medicine" ? 100 : field === "dosage" ? 60 : 80;
        if (!row[field].trim() || row[field].length > max) errors[field] = "doctor.rx.required";
      });
      if (Object.keys(errors).length) errorsByIndex[index] = errors;
    });
    const numericDuration = Number(duration);
    const invalidDuration = !Number.isInteger(numericDuration) || numericDuration < 1 || numericDuration > 365;
    setRowErrors(errorsByIndex);
    setDurationError(invalidDuration ? "doctor.rx.invalidDuration" : null);
    setFormError(filledRows.length ? null : "doctor.rx.noMedicines");
    setServerError(null);
    return filledRows.length > 0 && Object.keys(errorsByIndex).length === 0 && !invalidDuration
      ? filledRows
      : null;
  };

  const save = async (event) => {
    event.preventDefault();
    const items = validate();
    if (!items) return;
    setBusy(true);
    try {
      const result = await doctorPortalService.createPrescription(appointment.id, {
        items: items.map(({ medicine, dosage, timing }) => ({ medicine: medicine.trim(), dosage: dosage.trim(), timing: timing.trim() })),
        duration_days: Number(duration),
        instructions: instructions.trim(),
      });
      navigate(`/doctor/queue/${appointment.id}`, {
        state: { success: { key: "doctor.rx.saved", values: { rx: result.rx_no } } },
      });
    } catch (requestError) {
      setServerError(requestError);
    } finally {
      setBusy(false);
    }
  };

  const preview = () => {
    const items = rows
      .filter((row) => row.medicine.trim() || row.dosage.trim() || row.timing.trim())
      .map(({ medicine, dosage, timing }) => ({ medicine, dosage, timing }));
    printPrescription({
      rx_no: "Draft",
      issued_on: new Date().toISOString().slice(0, 10),
      duration_days: Number(duration) || 14,
      patient: {
        name: appointment.patient.full_name,
        age: appointment.patient.age,
        gender: appointment.patient.gender,
      },
      doctor: { name: doctorName.replace(/^Dr\.\s/i, ""), department: profile.department },
      appointment: {
        id: appointment.id,
        booking_no: appointment.booking_no,
        starts_at: appointment.starts_at,
        token_no: appointment.token_no,
        room_label: appointment.room_label,
      },
      items,
      instructions,
    }, hospital, { draft: true });
  };

  const genderKey = appointment.patient.gender?.toLowerCase();
  const gender = ["male", "female", "other"].includes(genderKey)
    ? t(`doctor.gender.${genderKey}`)
    : appointment.patient.gender || "—";
  const doctorName = /^dr\.?\s/i.test(profile.full_name || "") ? profile.full_name : `Dr. ${profile.full_name}`;
  const ageSex = `${appointment.patient.age == null ? "—" : `${appointment.patient.age} ${t("doctor.appointment.yearsShort")}`} · ${gender}`;
  const subtitle = fill(t("doctor.rx.subtitle"), {
    token: appointment.token_no || "—",
    patient: appointment.patient.full_name,
  });

  return (
    <>
      <PageHeader showLanguage title={t("doctor.rx.title")} subtitle={subtitle} />
      {(serverError || formError) && (
        <div className="mb-4">
          <Alert>{serverError ? errorText(t, serverError) : t(formError)}</Alert>
        </div>
      )}
      <Card className="space-y-6 p-5">
        <InfoGrid items={[
          { label: t("doctor.rx.number"), value: t("doctor.rx.assigned") },
          { label: t("doctor.rx.issued"), value: formatDate(new Date(), lang, hospital.timezone) },
          { label: t("doctor.rx.appointment"), value: <bdi dir="ltr">{appointment.booking_no} · {appointment.token_no || "—"}</bdi> },
          { label: t("doctor.rx.patient"), value: appointment.patient.full_name },
          { label: t("doctor.rx.ageSex"), value: ageSex },
          { label: t("doctor.rx.doctor"), value: `${doctorName} · ${profile.department || "—"}` },
        ]} />

        <form onSubmit={save} noValidate>
          <section>
            <SectionLabel>{t("doctor.rx.medicines")}</SectionLabel>
            <MedicineRowsEditor
              rows={rows}
              onChange={changeRow}
              onAdd={addRow}
              onRemove={removeRow}
              errors={rowErrors}
              t={t}
            />
          </section>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[.08em] text-ink-muted">{t("doctor.rx.duration")}</span>
              <input
                type="number"
                min="1"
                max="365"
                step="1"
                value={duration}
                aria-invalid={Boolean(durationError)}
                aria-describedby={durationError ? "prescription-duration-error" : undefined}
                onChange={(event) => { setDuration(event.target.value); setDurationError(null); setServerError(null); }}
                className={`w-full rounded-xl border bg-white px-4 py-3.5 text-base text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 ${durationError ? "border-red-500" : "border-line"}`}
              />
              {durationError && <span id="prescription-duration-error" role="alert" className="mt-1 block text-xs font-semibold text-red-700">{t(durationError)}</span>}
            </label>
          </div>

          <label className="mt-6 block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[.08em] text-ink-muted">{t("doctor.rx.instructions")}</span>
            <textarea
              rows={4}
              maxLength={1000}
              value={instructions}
              onChange={(event) => { setInstructions(event.target.value); setServerError(null); }}
              className="block w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Link to={`/doctor/queue/${appointment.id}`}>
              <Button type="button" variant="secondary" fullWidth={false}>{t("doctor.common.cancel")}</Button>
            </Link>
            <Button type="button" variant="secondary" fullWidth={false} onClick={preview}>{t("doctor.rx.preview")}</Button>
            <Button type="submit" fullWidth={false} loading={busy}>{t("doctor.rx.save")}</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
