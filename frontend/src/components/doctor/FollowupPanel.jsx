import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "../common/Alert.jsx";
import Badge from "../common/Badge.jsx";
import Button from "../common/Button.jsx";
import Card from "../common/Card.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { doctorPortalService as api } from "../../services/doctorPortalService.js";
import { formatShort, localDateInput } from "../../utils/datetime.js";
import { errorText } from "./DoctorCommon.jsx";

const INPUT = "w-full rounded-xl border border-line bg-white p-2";
const TONE = { pending: "warning", accepted: "success", declined: "danger" };

/** Follow-up block on the doctor appointment screen: recommend (patient answers), schedule directly (patient agreed), and the status list. */
export default function FollowupPanel({ appointment, timezone }) {
  const { t, lang } = useLanguage();
  const [mode, setMode] = useState(null);                 // null | "recommend" | "direct"
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [free, setFree] = useState(null);
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.listFollowupRecommendations({ appointment_id: appointment.id }).then((d) => setItems(d.items)).catch(() => setItems([])), [appointment.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setFree(null); setTime("");
    if (!date) return undefined;
    let live = true;
    api.getScheduleDay(date).then((d) => { if (live) setFree(d.slots.filter((s) => !s.booked_appointment_id).map((s) => s.time)); }).catch(() => { if (live) setFree([]); });
    return () => { live = false; };
  }, [date]);

  const reset = () => { setMode(null); setDate(""); setTime(""); setNote(""); setAgreed(false); };
  const run = async (fn, okKey) => {
    setBusy(true);
    try { await fn(); setMsg({ type: "success", text: t(okKey) }); reset(); load(); } catch (err) { setMsg({ type: "error", text: errorText(t, err) }); } finally { setBusy(false); }
  };
  const submit = () => (mode === "recommend"
    ? run(() => api.recommendFollowup(appointment.id, { date, time, note: note.trim() }), "doctor.followup.recommended")
    : run(() => api.scheduleFollowup(appointment.id, { date, time, patient_agreed: agreed }), "doctor.followup.scheduled"));
  const canSubmit = date && time && (mode === "recommend" || agreed) && !busy;

  return (
    <Card className="mb-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-black">{t("doctor.followup.title")}</h2><p className="text-sm text-ink-muted">{t("doctor.followup.subtitle")}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button fullWidth={false} size="sm" variant={mode === "recommend" ? "primary" : "secondary"} onClick={() => { setMode("recommend"); setMsg(null); }}>{t("doctor.followup.recommend")}</Button>
          <Button fullWidth={false} size="sm" variant={mode === "direct" ? "primary" : "secondary"} onClick={() => { setMode("direct"); setMsg(null); }}>{t("doctor.followup.schedule")}</Button>
        </div>
      </div>
      {msg && <div className="mt-3"><Alert type={msg.type === "success" ? "success" : undefined}>{msg.text}</Alert></div>}

      {mode && (
        <div className="mt-4 space-y-3 rounded-xl border border-line p-4">
          <p className="text-sm text-ink-muted">{t(mode === "recommend" ? "doctor.followup.recommendHint" : "doctor.followup.scheduleHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase text-ink-muted">{t("doctor.followup.date")}
              <input type="date" min={localDateInput()} value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT} mt-1 font-normal normal-case`} />
            </label>
            <label className="text-xs font-bold uppercase text-ink-muted">{t("doctor.followup.time")}
              <select value={time} onChange={(e) => setTime(e.target.value)} disabled={!free?.length} className={`${INPUT} mt-1 font-normal normal-case`}>
                <option value="">{date && free === null ? t("doctor.calendar.loadingSlots") : free && !free.length ? t("doctor.calendar.noFreeSlots") : t("doctor.calendar.pickSlot")}</option>
                {(free || []).map((slot) => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </label>
          </div>
          {mode === "recommend" ? (
            <label className="block text-xs font-bold uppercase text-ink-muted">{t("doctor.followup.note")}
              <textarea maxLength={300} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("doctor.followup.notePlaceholder")} className={`${INPUT} mt-1 font-normal normal-case`} />
              <span className="mt-1 block text-end font-normal normal-case"><bdi dir="ltr">{note.length}/300</bdi></span>
            </label>
          ) : (
            <label className="flex items-start gap-2 text-sm font-semibold">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4" />
              <span>{t("doctor.followup.agreed")}</span>
            </label>
          )}
          <div className="flex gap-2">
            <Button fullWidth={false} size="sm" loading={busy} disabled={!canSubmit} onClick={submit}>{t(mode === "recommend" ? "doctor.followup.sendRecommendation" : "doctor.followup.confirmSchedule")}</Button>
            <Button fullWidth={false} size="sm" variant="secondary" onClick={reset}>{t("doctor.calendar.close")}</Button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {items.length === 0 ? <p className="text-ink-muted">{t("doctor.followup.none")}</p> : (
          <ul className="divide-y divide-line">
            {items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-bold">{formatShort(r.proposed_starts_at, lang, timezone)}</p>
                  {r.note && <p className="text-sm text-ink-muted">{r.note}</p>}
                  {r.response_note && <p className="text-sm text-ink-muted">{t("doctor.followup.patientNote")}: {r.response_note}</p>}
                  {r.status === "accepted" && r.appointment_id && <Link to={`/doctor/queue/${r.appointment_id}`} className="text-sm font-bold text-brand-700">{t("doctor.followup.openBooked")} →</Link>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={TONE[r.status] || "neutral"}>{t(`doctor.followup.status.${r.status}`)}</Badge>
                  {r.status === "pending" && <Button fullWidth={false} size="sm" variant="dangerOutline" disabled={busy} onClick={() => run(() => api.withdrawFollowup(r.id), "doctor.followup.withdrawn")}>{t("doctor.followup.withdraw")}</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
