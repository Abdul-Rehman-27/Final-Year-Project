import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import Alert from "../../components/common/Alert.jsx";
import Avatar from "../../components/common/Avatar.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Input from "../../components/common/Input.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import PrescriptionDetail from "../../components/doctor/PrescriptionDetail.jsx";
import { errorText, LoadState, Status } from "../../components/doctor/DoctorCommon.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { printPrescription } from "../../components/doctor/print/PrintDocuments.jsx";
import { doctorPortalService } from "../../services/doctorPortalService.js";
import { formatDate } from "../../utils/datetime.js";

const PAGE_SIZE = 25;

export default function DoctorPrescriptions() {
  const { t, lang } = useLanguage();
  const { hospital } = useDoctorContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("rx");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState(null);
  const [listRetry, setListRetry] = useState(0);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailRetry, setDetailRetry] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const clearSelectedId = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("rx");
      return next;
    }, { replace: true });
  };

  const resetListing = () => {
    setRows([]);
    setTotal(0);
    setOffset(0);
    setListLoading(true);
    setListError(null);
  };

  useEffect(() => {
    let active = true;
    const append = offset > 0;
    setListError(null);
    setListLoading(!append);
    setLoadingMore(append);
    if (!append) {
      setRows([]);
      setTotal(0);
    }

    doctorPortalService.listPrescriptions({
      q: debouncedQuery,
      from,
      to,
      limit: PAGE_SIZE,
      offset,
    })
      .then((result) => {
        if (!active) return;
        setRows((current) => append ? [...current, ...result.items] : result.items);
        setTotal(result.total);
      })
      .catch((requestError) => { if (active) setListError(requestError); })
      .finally(() => {
        if (active) {
          setListLoading(false);
          setLoadingMore(false);
        }
      });

    return () => { active = false; };
  }, [debouncedQuery, from, to, offset, listRetry]);

  useEffect(() => {
    if (!selectedId && !listLoading && rows.length > 0) {
      setSearchParams((current) => {
        if (current.get("rx")) return current;
        const next = new URLSearchParams(current);
        next.set("rx", String(rows[0].id));
        return next;
      }, { replace: true });
    }
  }, [selectedId, listLoading, rows, setSearchParams]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return undefined;
    }

    let active = true;
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    doctorPortalService.getPrescription(selectedId)
      .then((result) => { if (active) setDetail(result); })
      .catch((requestError) => { if (active) setDetailError(requestError); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId, detailRetry]);

  const selectPrescription = (id) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("rx", String(id));
      return next;
    });
  };

  const changeDate = (setter) => (event) => {
    setter(event.target.value);
    resetListing();
    clearSelectedId();
  };

  const clearFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setFrom("");
    setTo("");
    resetListing();
    clearSelectedId();
  };

  const retryList = () => {
    setOffset(0);
    setListRetry((value) => value + 1);
  };
  const print = (prescription) => printPrescription(prescription, hospital);

  return (
    <>
      <PageHeader showLanguage title={t("doctor.prescriptions.title")} subtitle={t("doctor.prescriptions.subtitle")} />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-[340px]">
          <Input
            id="rx-search"
            aria-label={t("doctor.prescriptions.search")}
            placeholder={t("doctor.prescriptions.search")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
                resetListing();
              clearSelectedId();
            }}
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
          <span>{t("doctor.common.from")}</span>
          <input type="date" aria-label={t("doctor.common.from")} value={from} onChange={changeDate(setFrom)} className="rounded-xl border border-line bg-white p-3 text-ink" />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
          <span>{t("doctor.common.to")}</span>
          <input type="date" aria-label={t("doctor.common.to")} value={to} onChange={changeDate(setTo)} className="rounded-xl border border-line bg-white p-3 text-ink" />
        </label>
        <Button variant="secondary" fullWidth={false} onClick={clearFilters}>{t("doctor.common.clear")}</Button>
      </div>

      <LoadState loading={listLoading} error={listError} onRetry={retryList}>
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
          <Card className="min-w-0 space-y-2 p-3">
            {rows.length ? rows.map((row) => {
              const selected = String(row.id) === selectedId;
              return (
                <button
                  key={row.id}
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => selectPrescription(row.id)}
                  className={`flex w-full min-w-0 items-center gap-3 rounded-xl p-3 text-start ${selected ? "bg-brand-tint" : "hover:bg-brand-50"}`}
                >
                  <Avatar name={row.patient_name} />
                  <span className="min-w-0 flex-1">
                    <b className="block" dir="ltr">{row.rx_no}</b>
                    <small className="block text-ink-muted">{row.patient_name} · {formatDate(row.issued_on, lang, hospital?.timezone)}</small>
                  </span>
                  <Status value={row.status} />
                </button>
              );
            }) : (
              <p className="p-5 text-ink-muted">{t("doctor.prescriptions.noResults")}</p>
            )}
            {rows.length < total && (
              <Button variant="secondary" fullWidth={false} loading={loadingMore} onClick={() => setOffset(rows.length)}>
                {t("doctor.prescriptions.loadMore")}
              </Button>
            )}
          </Card>

          {selectedId && (
            detailLoading ? (
              <Card className="p-5 text-ink-muted">{t("common.loading")}</Card>
            ) : detailError?.code === "NOT_FOUND" ? (
              <Card className="space-y-3 p-5">
                <Alert>{t("doctor.common.pageUnavailable")}</Alert>
                <Link to="/doctor/prescriptions" className="font-bold text-brand-700">← {t("doctor.prescriptions.title")}</Link>
              </Card>
            ) : detailError ? (
              <Card className="space-y-3 p-5">
                <Alert>{errorText(t, detailError)}</Alert>
                <Button fullWidth={false} onClick={() => setDetailRetry((value) => value + 1)}>{t("doctor.tryAgain")}</Button>
              </Card>
            ) : detail ? (
              <PrescriptionDetail detail={detail} onPrint={print} />
            ) : null
          )}
        </div>
      </LoadState>
    </>
  );
}
