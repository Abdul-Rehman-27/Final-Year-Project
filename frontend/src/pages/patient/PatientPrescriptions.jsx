import { useState } from "react";
import { Link } from "react-router-dom";
import PatientPageHeader from "../../components/patient/PatientPageHeader.jsx";
import PillTabs from "../../components/patient/PillTabs.jsx";
import PortalBadge from "../../components/patient/PortalBadge.jsx";
import PortalButton from "../../components/patient/PortalButton.jsx";
import PortalCard from "../../components/patient/PortalCard.jsx";
import MicroLabel from "../../components/patient/MicroLabel.jsx";
import PortalSelectRow from "../../components/patient/PortalSelectRow.jsx";
import PortalTable from "../../components/patient/PortalTable.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import LoadState from "../../components/patient/LoadState.jsx";
import { useAsync } from "../../hooks/useAsync.js";
import { patientPortalService } from "../../services/patientPortalService.js";
import { prescriptionView } from "../../utils/patientAdapters.js";

const badgeTones = { Active: "success", Completed: "neutral", Cancelled: "danger" };
const statusKeys = { Active: "active", Completed: "completed", Cancelled: "cancelled" };

export default function PatientPrescriptions() {
  const { lang } = useLanguage();
  const { data, error, loading, reload } = useAsync(() => patientPortalService.listPrescriptions(), []);
  const all = (data?.items || []).map((rx) => prescriptionView(rx, lang));
  return <LoadState loading={loading} error={error} onRetry={reload} hasData={!!data}><PrescriptionsBody all={all} /></LoadState>;
}

function PrescriptionsBody({ all }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("current");
  const [selectedId, setSelectedId] = useState(null);
  const list = activeTab === "current" ? all.filter((rx) => rx.status === "Active") : all.filter((rx) => rx.status !== "Active");
  const selected = list.find((rx) => rx.apiId === selectedId) || list[0] || null;
  const tabs = [{ id: "current", label: t("patient.prescriptions.tabs.current") }, { id: "history", label: t("patient.prescriptions.tabs.history") }];
  const columns = [{ key: "name", label: t("patient.prescriptions.table.medicine"), bold: true }, { key: "dosage", label: t("patient.prescriptions.table.dosage") }, { key: "timing", label: t("patient.prescriptions.table.timing") }];
  const details = selected ? [["doctor", selected.doctor], ["patient", selected.patient], ["duration", selected.duration], ["givenOn", selected.givenOn]] : [];

  return <>
    <PatientPageHeader title={t("patient.prescriptions.title")} subtitle={t("patient.prescriptions.subtitle")} />
    <div className="mb-[18px]"><PillTabs tabs={tabs} active={activeTab} onChange={(id) => { setActiveTab(id); setSelectedId(null); }} /></div>
    {!selected ? <PortalCard><p className="text-[15px] text-ink-soft">{t("patient.prescriptions.empty")}</p></PortalCard> :
    <div className="grid items-start gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)]">
      <PortalCard className="p-2.5">{list.map((prescription) => <PortalSelectRow key={prescription.apiId} title={prescription.id} subtitle={prescription.doctor} selected={prescription.apiId === selected.apiId} onSelect={() => setSelectedId(prescription.apiId)} badge={<PortalBadge tone={badgeTones[prescription.status]}>{t(`patient.prescriptions.statuses.${statusKeys[prescription.status]}`)}</PortalBadge>} />)}</PortalCard>
      <PortalCard>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><MicroLabel>{t("patient.prescriptions.prescription")}</MicroLabel><p className="mt-1 text-[24px] font-bold tracking-[-0.5px] text-ink">{selected.id}</p></div><div className="flex items-center gap-3"><PortalBadge tone={badgeTones[selected.status]}>{t(`patient.prescriptions.statuses.${statusKeys[selected.status]}`)}</PortalBadge><PortalButton as={Link} to={`/patient/print/prescription?id=${selected.apiId}&autoprint=1`} target="_blank" rel="noopener noreferrer" variant="secondary">{t("patient.prescriptions.print")}</PortalButton><PortalButton as={Link} to={`/patient/print/prescription?id=${selected.apiId}`} target="_blank" rel="noopener noreferrer">{t("patient.prescriptions.downloadPdf")}</PortalButton></div></div>
        <div className="my-[22px] grid grid-cols-2 gap-[18px] rounded-[14px] bg-surface p-4 lg:grid-cols-4">{details.map(([label, value]) => <div key={label}><p className="text-[13px] text-ink-soft">{t(`patient.prescriptions.labels.${label}`)}</p><p className="font-bold text-ink">{value}</p></div>)}</div>
        <PortalTable columns={columns} rows={selected.medicines} />
        <p className="mt-4 text-[13px] text-ink-soft">{selected.note}</p>
      </PortalCard>
    </div>}
  </>;
}
