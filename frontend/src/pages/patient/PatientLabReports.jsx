import { useState } from "react";
import { Link } from "react-router-dom";
import MicroLabel from "../../components/patient/MicroLabel.jsx";
import PatientPageHeader from "../../components/patient/PatientPageHeader.jsx";
import PortalBadge from "../../components/patient/PortalBadge.jsx";
import PortalButton from "../../components/patient/PortalButton.jsx";
import PortalCard from "../../components/patient/PortalCard.jsx";
import PortalSelectRow from "../../components/patient/PortalSelectRow.jsx";
import PortalTable from "../../components/patient/PortalTable.jsx";
import ReportImage from "../../components/patient/ReportImage.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import LoadState from "../../components/patient/LoadState.jsx";
import { useAsync } from "../../hooks/useAsync.js";
import { useReportImages } from "../../hooks/useReportImages.js";
import { patientPortalService } from "../../services/patientPortalService.js";
import { labDetailView, labRowView } from "../../utils/patientAdapters.js";

const tones = { Ready: "success", Scheduled: "warning" };
const statusKeys = { Ready: "ready", Scheduled: "scheduled" };
const replace = (text, values) => Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, value), text);

export default function PatientLabReports() {
  const { lang } = useLanguage();
  const { data, error, loading, reload } = useAsync(() => patientPortalService.listLabReports(), []);
  const rows = (data?.items || []).map((r) => labRowView(r, lang));
  return <LoadState loading={loading} error={error} onRetry={reload} hasData={!!data}><LabBody rows={rows} /></LoadState>;
}

function LabBody({ rows }) {
  const { t, lang } = useLanguage();
  const [selectedId, setSelectedId] = useState(null);
  const selectedRow = rows.find((r) => r.id === selectedId) || rows[0] || null;
  const detail = useAsync(() => (selectedRow && selectedRow.rawStatus === "ready" ? patientPortalService.getLabReport(selectedRow.id) : Promise.resolve(null)), [selectedRow?.id, selectedRow?.rawStatus]);
  const report = detail.data ? labDetailView(detail.data, lang) : null;
  const otherReady = rows.find((r) => r.rawStatus === "ready" && !r.isRadiology && r.id !== selectedRow?.id);
  const other = useAsync(() => (report?.isRadiology && otherReady ? patientPortalService.getLabReport(otherReady.id) : Promise.resolve(null)), [report?.id, otherReady?.id]);
  const otherView = other.data ? labDetailView(other.data, lang) : null;
  const images = useReportImages(selectedRow?.id, report?.files);
  const columns = [{ key: "test", label: t("patient.labReports.table.test"), bold: true }, { key: "result", label: t("patient.labReports.table.result") }, { key: "reference", label: t("patient.labReports.table.reference") }];
  const kind = selectedRow ? (selectedRow.isRadiology ? t("patient.labReports.radiologyReport") : t("patient.labReports.laboratoryReport")) : "";

  return <>
    <PatientPageHeader title={t("patient.labReports.title")} subtitle={t("patient.labReports.subtitle")} />
    <div className="mb-[18px] flex justify-end"><PortalButton onClick={() => {}}>{t("patient.labReports.bookTest")}</PortalButton></div>
    {!selectedRow ? <PortalCard><p className="text-[15px] text-ink-soft">{t("patient.noLabResults")}</p></PortalCard> :
    <div className="grid items-start gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)]">
      <PortalCard className="p-2.5">{rows.map((row) => <PortalSelectRow key={row.id} title={row.name} subtitle={row.date} selected={row.id === selectedRow.id} onSelect={() => setSelectedId(row.id)} badge={<PortalBadge tone={tones[row.status]}>{t(`patient.labReports.statuses.${statusKeys[row.status]}`)}</PortalBadge>} />)}</PortalCard>
      <PortalCard>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><MicroLabel>{kind} · {selectedRow.fullDate}</MicroLabel><h2 className="mt-1 text-[24px] font-bold tracking-[-0.5px] text-ink">{selectedRow.name}</h2></div><ReportActions report={selectedRow} t={t} /></div>
        {selectedRow.status === "Scheduled" && <div className="mt-5 rounded-[14px] bg-surface p-4 text-[15px] text-ink">{selectedRow.scheduledFor ? replace(t("patient.labReports.scheduledMessage"), { date: selectedRow.scheduledFor }) : t("patient.labReports.awaitingSchedulingMessage")}</div>}
        {selectedRow.status === "Ready" && <LoadState loading={detail.loading} error={detail.error} onRetry={detail.reload} hasData={!!report}>{report && (report.isRadiology ? <RadiologyDetails report={report} images={images} other={otherView} columns={columns} t={t} /> : <LabDetails report={report} columns={columns} t={t} />)}</LoadState>}
      </PortalCard>
    </div>}
  </>;
}

function ReportActions({ report, t }) {
  if (report.status === "Scheduled") return <PortalBadge tone="warning">{t("patient.labReports.statuses.scheduled")}</PortalBadge>;
  const basePath = `/patient/print/${report.isRadiology ? "radiology-report" : "lab-report"}`;
  return <div className="flex flex-wrap items-center gap-3"><PortalButton as={Link} to={`${basePath}?id=${report.id}&autoprint=1`} target="_blank" rel="noopener noreferrer" variant="secondary">{t("patient.labReports.print")}</PortalButton><PortalButton as={Link} to={`${basePath}?id=${report.id}`} target="_blank" rel="noopener noreferrer">{t("patient.labReports.downloadPdf")}</PortalButton></div>;
}

function RadiologyDetails({ report, images, other, columns, t }) {
  return <>{images.length > 0 ? <div className="my-5 grid gap-3">{images.map((image) => <ReportImage key={image.id} src={image.src} alt={image.caption} label={image.caption} />)}</div> : <div className="my-5"><ReportImage alt={report.name} label={report.name} /></div>}<MicroLabel>{t("patient.labReports.doctorsFindings")}</MicroLabel><p className="mt-1.5 text-[15px] leading-[1.6] text-ink">{report.findings}</p>{report.impression && <p className="mt-1.5 text-[15px] font-bold text-ink">{report.impression}</p>}{report.reportedBy && <p className="mt-1.5 text-[13px] text-ink-soft">{replace(t("patient.labReports.reportedBy"), { doctor: report.reportedBy })}</p>}{other && other.results.length > 0 && <div className="mt-[22px]"><MicroLabel>{replace(t("patient.labReports.alsoReady"), { name: other.name })}</MicroLabel><div className="mt-1.5"><PortalTable columns={columns} rows={other.results.slice(0, 2)} /></div></div>}</>;
}

function LabDetails({ report, columns, t }) {
  return <><div className="mt-5"><p className="text-[15px] text-ink">{report.summary}</p>{report.collected && <p className="mt-1.5 text-[13px] text-ink-soft">{replace(t("patient.labReports.collected"), { date: report.collected })}</p>}</div><div className="mt-[22px]"><MicroLabel>{t("patient.labReports.results")}</MicroLabel><div className="mt-1.5"><PortalTable columns={columns} rows={report.results} /></div></div></>;
}
