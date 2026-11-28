import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader.jsx";
import Card from "../../components/common/Card.jsx";
import Button from "../../components/common/Button.jsx";
import Tabs from "../../components/common/Tabs.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import Alert from "../../components/common/Alert.jsx";
import LabRequestForm from "../../components/doctor/LabRequestForm.jsx";
import LabReportModal from "../../components/doctor/LabReportModal.jsx";
import { LoadState, Status, errorText } from "../../components/doctor/DoctorCommon.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { fill } from "../../utils/format.js";
import { formatDate } from "../../utils/datetime.js";

const PAGE_SIZE = 25;
function formatRequestedDate(iso, lang, timeZone) {
  const parts = new Intl.DateTimeFormat(lang === "ur" ? "ur-PK-u-nu-latn" : "en-GB", { timeZone: timeZone || "Asia/Karachi", day: "2-digit", month: "short" }).formatToParts(new Date(iso));
  return `${parts.find((part) => part.type === "day")?.value || ""} ${parts.find((part) => part.type === "month")?.value || ""}`;
}
export default function DoctorLabTests() {
  const { t, lang } = useLanguage();
  const { hospital } = useDoctorContext();
  const [params] = useSearchParams();
  const patientSelect = useRef(null), formRef = useRef(null);
  const [status, setStatus] = useState("all"), [reports, setReports] = useState([]), [total, setTotal] = useState(0), [offset, setOffset] = useState(0);
  const [tests, setTests] = useState([]), [patients, setPatients] = useState([]);
  const [patient, setPatient] = useState(params.get("patient") || ""), [test, setTest] = useState(""), [notes, setNotes] = useState("");
  const [linked, setLinked] = useState(null), [listLoading, setListLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [listError, setListError] = useState(null), [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(null), [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState(null), [detailRetry, setDetailRetry] = useState(0);
  const [error, setError] = useState(null), [success, setSuccess] = useState(""), [submitting, setSubmitting] = useState(false);

  const loadList = useCallback(async (append = false) => {
    setListError(null); setListLoading(!append); setLoadingMore(append);
    try {
      const result = await doctorPortalService.listLabReports({ status: status === "all" ? "" : status, limit: PAGE_SIZE, offset: append ? offset : 0 });
      setReports((current) => append ? [...current, ...result.items] : result.items); setTotal(result.total);
    } catch (err) { setListError(err); }
    finally { setListLoading(false); setLoadingMore(false); }
  }, [status, offset]);
  useEffect(() => { loadList(offset > 0); }, [loadList, retry]);
  useEffect(() => {
    let active = true;
    Promise.all([doctorPortalService.getLabTests(), doctorPortalService.getPatientOptions(), params.get("appointment") ? doctorPortalService.getAppointment(params.get("appointment")) : Promise.resolve(null)])
      .then(([catalogue, options, appointment]) => { if (!active) return; setTests(catalogue); setPatients(options); setLinked(appointment); if (appointment) setPatient(String(appointment.patient.id)); })
      .catch((err) => { if (active) setError(err); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!selected) { setDetailError(null); setDetailLoading(false); return undefined; }
    let active = true; setDetailLoading(true); setDetailError(null);
    doctorPortalService.getLabReport(selected.id).then((result) => active && setSelected(result)).catch((err) => active && setDetailError(err)).finally(() => active && setDetailLoading(false));
    return () => { active = false; };
  }, [selected?.id, detailRetry]);
  const chooseStatus = (value) => { setStatus(value); setOffset(0); setReports([]); };
  const resetForm = () => { setPatient(""); setTest(""); setNotes(""); };
  const submit = async () => {
    setSubmitting(true); setError(null); setSuccess("");
    try {
      const created = await doctorPortalService.createLabReport({ patient_id: Number(patient), test_id: Number(test), notes, ...(params.get("appointment") ? { appointment_id: params.get("appointment") } : {}) });
      setSuccess(fill(t("doctor.lab.success"), { name: created.patient_name })); resetForm(); setReports([]); setTotal(0); setOffset(0); setRetry((value) => value + 1);
    } catch (err) { setError(err); }
    finally { setSubmitting(false); }
  };
  const openReport = (row) => { setSelected({ id: row.id }); setDetailError(null); };
  const retryDetail = () => setDetailRetry((value) => value + 1);
  const retryList = () => setRetry((value) => value + 1);
  const rows = reports;
  return <>
    <PageHeader showLanguage title={t("doctor.lab.title")} subtitle={t("doctor.lab.subtitle")} actions={<Button fullWidth={false} onClick={() => { formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => patientSelect.current?.focus(), 0); }}>+ {t("doctor.lab.request")}</Button>} />
    {success && <div className="mb-4"><Alert type="success">{success}</Alert></div>}
    {error && <div className="mb-4"><Alert>{errorText(t, error)}</Alert></div>}
    <Tabs variant="pill" active={status} onChange={chooseStatus} tabs={["all", "requested", "scheduled", "ready"].map((id) => ({ id, label: t(`doctor.lab.tabs.${id}`) }))} />
    <LoadState loading={listLoading} error={listError} onRetry={retryList}>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[1.7fr_1fr]">
        <Card className="min-w-0 p-5"><h2 className="mb-3 text-xl font-black">{t("doctor.lab.requested")}</h2>
          <DataTable rows={rows} emptyText={t("doctor.lab.noReports")} columns={[
            { header: t("doctor.lab.test"), render: (row) => <b>{row.test_name}</b> }, { header: t("doctor.lab.patient"), render: (row) => row.patient_name },
            { header: t("doctor.lab.requestedDate"), render: (row) => formatRequestedDate(row.created_at, lang, hospital?.timezone) }, { header: t("doctor.lab.status"), render: (row) => <Status value={row.status} /> },
            { header: "", render: (row) => <Button size="sm" variant="secondary" fullWidth={false} onClick={() => openReport(row)}>{t("doctor.lab.view")}</Button> },
          ]} />
          {rows.length < total && <div className="mt-4"><Button variant="secondary" fullWidth={false} loading={loadingMore} onClick={() => setOffset(rows.length)}>{t("doctor.common.loadMore")}</Button></div>}
        </Card>
        <div ref={formRef} className="scroll-mt-5"><LabRequestForm t={t} patientSelect={patientSelect} patients={patients} tests={tests} patient={patient} setPatient={setPatient} test={test} setTest={setTest} notes={notes} setNotes={setNotes} linked={linked} onSubmit={submit} onCancel={resetForm} submitting={submitting} /></div>
      </div>
    </LoadState>
    <LabReportModal report={selected?.test_name ? selected : null} loading={detailLoading} error={detailError} onClose={() => { setSelected(null); setDetailError(null); }} onRetry={retryDetail} />
  </>;
}
