import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader.jsx";
import Card from "../../components/common/Card.jsx";
import Input from "../../components/common/Input.jsx";
import Button from "../../components/common/Button.jsx";
import Avatar from "../../components/common/Avatar.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { LoadState } from "../../components/doctor/DoctorCommon.jsx";

const PAGE_SIZE = 25;
const locale = (lang) => lang === "ur" ? "ur-PK-u-nu-latn" : "en-GB";
function dateParts(iso, lang, timeZone, options) {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: timeZone || "Asia/Karachi", ...options }).formatToParts(new Date(iso));
}
function dateValue(parts, key) { return parts.find((part) => part.type === key)?.value || ""; }
function formatLastVisit(iso, lang, timeZone) {
  const parts = dateParts(iso, lang, timeZone, { day: "2-digit", month: "short" });
  return `${dateValue(parts, "day")} ${dateValue(parts, "month")}`;
}
function formatNextAppointment(iso, lang, timeZone) {
  const parts = dateParts(iso, lang, timeZone, { weekday: "short", day: "2-digit", month: "short" });
  return `${dateValue(parts, "weekday")} ${dateValue(parts, "day")} ${dateValue(parts, "month")}`;
}

export default function DoctorPatients() {
  const { t, lang } = useLanguage();
  const { hospital } = useDoctorContext();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => { setOffset(0); setRows([]); setTotal(0); }, [debouncedQuery]);

  useEffect(() => {
    let active = true;
    const append = offset > 0;
    setError(null);
    setLoading(!append);
    setLoadingMore(append);
    doctorPortalService.listPatients({ q: debouncedQuery, limit: PAGE_SIZE, offset })
      .then((result) => {
        if (!active) return;
        setRows((current) => append ? [...current, ...result.items] : result.items);
        setTotal(result.total);
      })
      .catch((requestError) => { if (active) setError(requestError); })
      .finally(() => { if (active) { setLoading(false); setLoadingMore(false); } });
    return () => { active = false; };
  }, [debouncedQuery, offset, retry]);

  const ageSex = (patient) => {
    const genderKey = patient.gender === "female" ? "femaleShort" : patient.gender === "male" ? "maleShort" : patient.gender ? "otherShort" : null;
    const age = patient.age == null ? "—" : `${patient.age} ${t("doctor.appointment.yearsShort")}`;
    return genderKey ? `${age} · ${t(`doctor.patients.gender.${genderKey}`)}` : age;
  };
  const columns = [
    { header: t("doctor.patients.patient"), render: (patient) => <span className="flex min-w-0 items-center gap-3"><Avatar name={patient.full_name} /><b className="truncate">{patient.full_name}</b></span> },
    { header: t("doctor.patients.ageSex"), render: (patient) => <span dir="ltr">{ageSex(patient)}</span> },
    { header: t("doctor.patients.lastVisit"), render: (patient) => patient.last_visit ? <span dir="ltr">{formatLastVisit(patient.last_visit, lang, hospital?.timezone)}</span> : "—" },
    { header: t("doctor.patients.activeRx"), render: (patient) => <span dir="ltr">{patient.active_rx_count}</span> },
    { header: t("doctor.patients.nextAppointment"), render: (patient) => patient.next_appointment ? <span dir="ltr">{formatNextAppointment(patient.next_appointment, lang, hospital?.timezone)}</span> : "—" },
    { header: "", render: () => <span className="whitespace-nowrap font-bold text-brand-700">{t("doctor.patients.view")}</span> },
  ];
  const retryList = () => setRetry((value) => value + 1);

  return <>
    <PageHeader showLanguage title={t("doctor.patients.title")} subtitle={t("doctor.patients.subtitle")} />
    <div className="mb-4 max-w-md">
      <Input id="patient-search" aria-label={t("doctor.patients.search")} placeholder={t("doctor.patients.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    <LoadState loading={loading} error={error} onRetry={retryList}>
      <Card className="min-w-0 p-3">
        <DataTable dense rows={rows} emptyText={t("doctor.patients.noPatients")} columns={columns} onRowClick={(patient) => navigate(`/doctor/patients/${patient.id}`)} />
        {rows.length < total && <div className="p-3"><Button fullWidth={false} variant="secondary" loading={loadingMore} onClick={() => setOffset(rows.length)}>{t("doctor.common.loadMore")}</Button></div>}
      </Card>
    </LoadState>
  </>;
}
