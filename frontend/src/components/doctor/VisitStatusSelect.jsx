import { useState } from "react";
import ConfirmDialog from "../common/ConfirmDialog.jsx";
import Select from "../common/Select.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";

export default function VisitStatusSelect({ id, visitStatus, canCall, onSetStatus, onError }) {
  const { t } = useLanguage();
  const [confirmStatus, setConfirmStatus] = useState(null);
  const selectId = `visit-status-${id}`;
  const current = visitStatus === "in_progress" ? "in_progress" : "scheduled";
  const options = current === "scheduled"
    ? [
        { value: "scheduled", label: t("doctor.status.visit.waiting"), disabled: true },
        { value: "in_progress", label: t("doctor.status.visit.in_progress"), disabled: !canCall },
        { value: "completed", label: t("doctor.queue.complete"), disabled: true },
        { value: "incomplete", label: t("doctor.status.visit.incomplete") },
      ]
    : [
        { value: "in_progress", label: t("doctor.status.visit.in_progress") },
        { value: "completed", label: t("doctor.queue.complete") },
        { value: "incomplete", label: t("doctor.status.visit.incomplete") },
      ];

  const change = async (event) => {
    const next = event.target.value;
    if (next === "completed" || next === "incomplete") {
      setConfirmStatus(next);
      return;
    }
    if (next !== "in_progress") return;
    try {
      await onSetStatus(next);
    } catch (error) {
      onError(error);
    }
  };

  const confirm = async () => {
    const next = confirmStatus;
    try {
      await onSetStatus(next);
      setConfirmStatus(null);
    } catch (error) {
      setConfirmStatus(null);
      onError(error);
    }
  };

  return (
    <>
      <div className="relative w-[168px]">
        <Select
          id={selectId}
          label=""
          aria-label={t("doctor.queue.changeStatus")}
          value={current}
          onChange={change}
          className="h-10 w-[168px] appearance-none rounded-xl border border-line bg-white ps-3 pe-9 text-sm font-semibold text-ink transition hover:border-brand-200 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
          ))}
        </Select>
        <svg className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <ConfirmDialog
        open={!!confirmStatus}
        title={t(confirmStatus === "completed" ? "doctor.queue.markComplete" : "doctor.queue.markIncomplete")}
        message={t("doctor.queue.irreversible")}
        confirmLabel={t("doctor.queue.confirm")}
        onConfirm={confirm}
        onClose={() => setConfirmStatus(null)}
      />
    </>
  );
}
