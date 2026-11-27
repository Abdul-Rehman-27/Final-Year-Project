import { useEffect, useState } from "react";
import DataTable from "../common/DataTable.jsx";
import Modal from "../common/Modal.jsx";
import Badge from "../common/Badge.jsx";
import Alert from "../common/Alert.jsx";
import Button from "../common/Button.jsx";
import { Status, errorText } from "./DoctorCommon.jsx";
import { formatDate } from "../../utils/datetime.js";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { Link } from "react-router-dom";

export default function LabReportModal({ report, loading, error, onClose, onRetry }) {
  const { t, lang } = useLanguage();
  const [images, setImages] = useState([]);
  const [fileError, setFileError] = useState(null);
  useEffect(() => {
    let active = true;
    const urls = [];
    setImages([]); setFileError(null);
    if (report?.status === "ready") Promise.all((report.files || []).filter((file) => file.kind === "image").map(async (file) => {
      const blob = await doctorPortalService.getLabFile(report.id, file.id);
      const url = URL.createObjectURL(blob); if (active) urls.push(url); else URL.revokeObjectURL(url);
      return { ...file, url };
    })).then((items) => active && setImages(items)).catch((err) => active && setFileError(err));
    return () => { active = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [report]);
  const flagTone = { normal: "success", high: "warning", low: "warning" };
  return <Modal open={!!report || loading || !!error} title={report?.test_name || t("doctor.lab.detail")} onClose={onClose}>
    {loading ? <p className="text-ink-muted">{t("common.loading")}</p> : error ? <div className="space-y-3">{error.code === "NOT_FOUND" ? <><Alert>{t("doctor.common.pageUnavailable")}</Alert><Link to="/doctor/lab-tests" onClick={onClose} className="inline-block font-bold text-brand-700">← {t("doctor.common.back")}</Link></> : <><Alert>{errorText(t, error)}</Alert><Button fullWidth={false} onClick={onRetry}>{t("doctor.tryAgain")}</Button></>}</div> : report && <div className="space-y-4">
      <p className="font-bold" dir="ltr">{report.report_no}</p><p>{report.patient_name}</p><Status value={report.status} /><p className="text-ink-muted">{formatDate(report.created_at, lang)}</p>
      {report.notes && <p><b>{t("doctor.lab.notesLabel")}:</b> {report.notes}</p>}
      {report.status === "ready" && report.kind === "lab" && report.results?.length > 0 && <div><h3 className="mb-2 font-bold text-brand-700">{t("doctor.lab.results")}</h3><DataTable rows={report.results} rowKey="test" columns={[{header:t("doctor.lab.test"),render:(row)=><span>{row.test}</span>},{header:t("doctor.lab.result"),render:(row)=><span dir="ltr">{row.result} {row.unit}</span>},{header:t("doctor.lab.reference"),render:(row)=><span dir="ltr">{row.reference}</span>},{header:t("doctor.lab.flag"),render:(row)=><Badge tone={flagTone[row.flag]||"neutral"}>{t(`doctor.lab.flags.${row.flag}`)}</Badge>}]}/></div>}
      {report.status === "ready" && report.kind === "radiology" && <div className="space-y-3">{report.findings && <p><b>{t("doctor.lab.finding")}:</b> {report.findings}</p>}{report.impression && <p><b>{t("doctor.lab.impression")}:</b> {report.impression}</p>}</div>}
      {report.comments && <p><b>{t("doctor.lab.comments")}:</b> {report.comments}</p>}
      {fileError && <Alert>{errorText(t, fileError)}</Alert>}{images.map((file) => <figure key={file.id}><img className="max-h-72 w-full rounded-xl object-contain" src={file.url} alt={file.caption} /><figcaption className="mt-1 text-sm text-ink-muted">{file.caption}</figcaption></figure>)}
    </div>}
  </Modal>;
}
