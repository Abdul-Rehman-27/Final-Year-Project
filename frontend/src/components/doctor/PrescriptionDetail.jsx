import Button from "../common/Button.jsx";
import Card from "../common/Card.jsx";
import DataTable from "../common/DataTable.jsx";
import InfoGrid from "../common/InfoGrid.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { formatShort } from "../../utils/datetime.js";
import { Status } from "./DoctorCommon.jsx";

function ageSex(patient, t) {
  const value = patient?.gender?.toLowerCase();
  const gender = ["male", "female", "other"].includes(value)
    ? t(`doctor.gender.${value}`)
    : patient?.gender || "—";
  const age = patient?.age == null ? "—" : `${patient.age} ${t("doctor.appointment.yearsShort")}`;
  return `${age} · ${gender}`;
}

export default function PrescriptionDetail({ detail, onPrint, showActions = true, durationText }) {
  const { t, lang } = useLanguage();
  const { hospital } = useDoctorContext();
  const appointment = detail.appointment;
  const patient = detail.patient || { name: detail.patient_name };

  return (
    <Card className="space-y-5 p-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-widest text-ink-muted">{t("doctor.prescriptions.prescription")}</p>
          <h2 className="text-2xl font-black" dir="ltr">{detail.rx_no}</h2>
        </div>
        <Status value={detail.status} />
        {showActions && (
          <div className="ms-auto flex flex-wrap gap-2">
            <Button variant="secondary" fullWidth={false} onClick={() => onPrint?.(detail)}>{t("doctor.common.print")}</Button>
            <Button fullWidth={false} onClick={() => onPrint?.(detail)}>{t("doctor.common.download")}</Button>
          </div>
        )}
      </header>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-brand-700">{t("doctor.prescriptions.appointment")}</h3>
        <InfoGrid cols={4} items={[
          { label: t("doctor.prescriptions.booking"), value: appointment?.booking_no || "—", dir: "ltr" },
          { label: t("doctor.prescriptions.date"), value: appointment?.starts_at ? formatShort(appointment.starts_at, lang, hospital?.timezone) : "—" },
          { label: t("doctor.prescriptions.token"), value: appointment?.token_no || "—", dir: "ltr" },
          { label: t("doctor.prescriptions.room"), value: appointment?.room_label || "—" },
        ]} />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-brand-700">{t("doctor.prescriptions.patient")}</h3>
        <InfoGrid cols={4} items={[
          { label: t("doctor.prescriptions.name"), value: patient.name || detail.patient_name || "—" },
          { label: t("doctor.prescriptions.ageSex"), value: ageSex(patient, t) },
          { label: t("doctor.prescriptions.duration"), value: durationText || `${detail.duration_days} days`, dir: "ltr" },
          { label: t("doctor.prescriptions.status"), value: <Status value={detail.status} /> },
        ]} />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-brand-700">{t("doctor.prescriptions.medicines")}</h3>
        <DataTable
          dense
          columns={[
            { header: t("doctor.rx.medicine"), render: (row) => <b>{row.medicine}</b> },
            { header: t("doctor.rx.dosage"), render: (row) => row.dosage },
            { header: t("doctor.rx.timing"), render: (row) => row.timing },
          ]}
          rows={detail.items || []}
          emptyText="—"
        />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-brand-700">{t("doctor.prescriptions.instructions")}</h3>
        <p className="whitespace-pre-line">{detail.instructions || "—"}</p>
      </section>
    </Card>
  );
}
