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
import { LAB_REPORTS } from "../../data/mockPatient.js";

const tones = { Ready: "success", Scheduled: "warning" };
const statusKeys = { Ready: "ready", Scheduled: "scheduled" };
const replace = (text, values) => Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, value), text);

export default function PatientLabReports() {
  const { t } = useLanguage();
  const [selectedId, setSelectedId] = useState("chest-xray");
  const selected = LAB_REPORTS.find((report) => report.id === selectedId);
  const columns = [{ key: "test", label: t("patient.labReports.table.test"), bold: true }, { key: "result", label: t("patient.labReports.table.result") }, { key: "reference", label: t("patient.labReports.table.reference") }];
  const cbc = LAB_REPORTS.find((report) => report.id === "cbc");
  const kind = selected.kind === "Radiology report" ? t("patient.labReports.radiologyReport") : t("patient.labReports.laboratoryReport");

  return <>
    <PatientPageHeader title={t("patient.labReports.title")} subtitle={t("patient.labReports.subtitle")} />
    <div className="mb-[18px] flex justify-end"><PortalButton onClick={() => {}}>{t("patient.labReports.bookTest")}</PortalButton></div>
    <div className="grid items-start gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)]">
      <PortalCard className="p-2.5">{LAB_REPORTS.map((report) => <PortalSelectRow key={report.id} title={report.name} subtitle={report.date} selected={report.id === selected.id} onSelect={() => setSelectedId(report.id)} badge={<PortalBadge tone={tones[report.status]}>{t(`patient.labReports.statuses.${statusKeys[report.status]}`)}</PortalBadge>} />)}</PortalCard>
      <PortalCard>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><MicroLabel>{kind} · {selected.fullDate}</MicroLabel><h2 className="mt-1 text-[24px] font-bold tracking-[-0.5px] text-ink">{selected.name}</h2></div><ReportActions report={selected} t={t} /></div>
        {selected.id === "chest-xray" && <ChestXrayDetails report={selected} cbc={cbc} columns={columns} t={t} />}
        {selected.id === "cbc" && <CbcDetails report={selected} columns={columns} t={t} />}
        {selected.id === "lipid" && <div className="mt-5 rounded-[14px] bg-surface p-4 text-[15px] text-ink">{replace(t("patient.labReports.scheduledMessage"), { date: selected.scheduledFor })}</div>}
      </PortalCard>
    </div>
  </>;
}

function ReportActions({ report, t }) {
  if (report.status === "Scheduled") return <PortalBadge tone="warning">{t("patient.labReports.statuses.scheduled")}</PortalBadge>;
  const basePath = `/patient/print/${report.pdf}`;
  return <div className="flex flex-wrap items-center gap-3"><PortalButton as={Link} to={`${basePath}?id=${report.id}&autoprint=1`} target="_blank" rel="noopener noreferrer" variant="secondary">{t("patient.labReports.print")}</PortalButton><PortalButton as={Link} to={`${basePath}?id=${report.id}`} target="_blank" rel="noopener noreferrer">{t("patient.labReports.downloadPdf")}</PortalButton></div>;
}

function ChestXrayDetails({ report, cbc, columns, t }) {
  return <><div className="my-5"><ReportImage alt={report.imageLabel} label={report.imageLabel} /></div><MicroLabel>{t("patient.labReports.doctorsFindings")}</MicroLabel><p className="mt-1.5 text-[15px] leading-[1.6] text-ink">{report.findings}</p><p className="mt-1.5 text-[13px] text-ink-soft">{replace(t("patient.labReports.reportedBy"), { doctor: report.reportedBy })}</p><div className="mt-[22px]"><MicroLabel>{t("patient.labReports.alsoReady")}</MicroLabel><div className="mt-1.5"><PortalTable columns={columns} rows={cbc.results.slice(0, 2)} /></div></div></>;
}

function CbcDetails({ report, columns, t }) {
  return <><div className="mt-5"><p className="text-[15px] text-ink">{report.summary}</p><p className="mt-1.5 text-[13px] text-ink-soft">{replace(t("patient.labReports.collected"), { date: report.collected })}</p></div><div className="mt-[22px]"><MicroLabel>{t("patient.labReports.results")}</MicroLabel><div className="mt-1.5"><PortalTable columns={columns} rows={report.results} /></div></div></>;
}
