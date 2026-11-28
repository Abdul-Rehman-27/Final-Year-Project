import { useCallback, useEffect, useState } from "react";
import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { errorText } from "../../components/doctor/DoctorCommon.jsx";
import { doctorPortalService as api } from "../../services/doctorPortalService.js";
import { dayKind, monthGrid, shiftMonth } from "../../utils/calendar.js";
import { formatDateLong, formatDateTime, formatTime, localDateInput } from "../../utils/datetime.js";
import { fill } from "../../utils/format.js";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const KIND_STYLE = {
  normal: "border-brand-200 bg-brand-50", modified: "border-amber-300 bg-amber-50", extra: "border-sky-300 bg-sky-50",
  off: "border-red-200 bg-red-50 text-red-800", closed: "border-line bg-gray-50 text-ink-muted",
};
const INPUT = "w-full rounded-xl border border-line bg-white p-2";
const NEW_SESSION = { start_time: "09:00", end_time: "13:00", slot_minutes: 15, room_label: "" };

function Conflicts({ t, lang, list }) {
  if (!list.length) return null;
  return (
    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <p className="font-semibold">{t("doctor.calendar.conflictTitle")}</p>
      <ul className="mt-1 list-disc ps-5">{list.map((a) => <li key={a.id}>{a.patient_name} · {formatDateTime(a.starts_at, lang)}</li>)}</ul>
    </div>
  );
}

function AppointmentRow({ t, lang, appt, onDone, report }) {
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [free, setFree] = useState(null);
  const actionable = appt.status === "confirmed" && appt.visit_status === "scheduled" && new Date(appt.starts_at) > new Date();

  useEffect(() => {
    setFree(null); setTime("");
    if (!date) return undefined;
    let live = true;
    api.getScheduleDay(date).then((d) => { if (live) setFree(d.slots.filter((s) => !s.booked_appointment_id).map((s) => s.time)); }).catch(() => { if (live) setFree([]); });
    return () => { live = false; };
  }, [date]);

  const run = async (fn, okKey) => {
    try { await fn(); report({ type: "success", text: t(okKey) }); setMode(null); onDone(); } catch (err) { report({ type: "error", text: errorText(t, err) }); }
  };
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p><span className="font-semibold">{formatTime(appt.starts_at)}</span> · {appt.patient_name}{appt.token_no ? ` · ${appt.token_no}` : ""} <span className="text-xs text-ink-muted">({appt.status})</span></p>
        {actionable && !mode && (
          <div className="flex gap-2">
            <Button fullWidth={false} size="sm" variant="secondary" onClick={() => setMode("move")}>{t("doctor.calendar.reschedule")}</Button>
            <Button fullWidth={false} size="sm" variant="dangerOutline" onClick={() => setMode("cancel")}>{t("doctor.calendar.cancel")}</Button>
          </div>
        )}
      </div>
      {mode === "cancel" && (
        <div className="mt-3 space-y-2">
          <textarea aria-label={t("doctor.calendar.cancelReason")} placeholder={t("doctor.calendar.cancelReason")} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT} />
          <div className="flex gap-2">
            <Button fullWidth={false} size="sm" variant="danger" disabled={!reason.trim()} onClick={() => run(() => api.cancelAppointment(appt.id, reason.trim()), "doctor.calendar.cancelled")}>{t("doctor.calendar.cancelConfirm")}</Button>
            <Button fullWidth={false} size="sm" variant="secondary" onClick={() => setMode(null)}>{t("doctor.calendar.close")}</Button>
          </div>
        </div>
      )}
      {mode === "move" && (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase text-ink-muted">{t("doctor.calendar.proposeDate")}
              <input type="date" min={localDateInput()} value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT} mt-1 font-normal normal-case`} />
            </label>
            <label className="text-xs font-bold uppercase text-ink-muted">{t("doctor.calendar.proposeTime")}
              <select value={time} onChange={(e) => setTime(e.target.value)} disabled={!free?.length} className={`${INPUT} mt-1 font-normal normal-case`}>
                <option value="">{date && free === null ? t("doctor.calendar.loadingSlots") : free && !free.length ? t("doctor.calendar.noFreeSlots") : t("doctor.calendar.pickSlot")}</option>
                {(free || []).map((slot) => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </label>
          </div>
          <input type="text" maxLength={300} aria-label={t("doctor.calendar.proposeNote")} placeholder={t("doctor.calendar.proposeNote")} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
          <div className="flex gap-2">
            <Button fullWidth={false} size="sm" disabled={!date || !time} onClick={() => run(() => api.proposeReschedule(appt.id, { date, time, note }), "doctor.calendar.proposed")}>{t("doctor.calendar.propose")}</Button>
            <Button fullWidth={false} size="sm" variant="secondary" onClick={() => setMode(null)}>{t("doctor.calendar.close")}</Button>
          </div>
        </div>
      )}
    </li>
  );
}

function DateManager({ t, date, day, onChanged, report, setConflicts }) {
  const [kind, setKind] = useState(null);
  const [sessions, setSessions] = useState([{ ...NEW_SESSION }]);
  const [note, setNote] = useState("");
  const setField = (i, key, value) => setSessions((cur) => cur.map((s, j) => (j === i ? { ...s, [key]: value } : s)));
  const submit = async (body, okKey) => {
    setConflicts([]);
    try { await api.putException(date, body); report({ type: "success", text: t(okKey) }); setKind(null); onChanged(); } catch (err) {
      if (err?.code === "SCHEDULE_CONFLICT") setConflicts(err.appointments || []);
      report({ type: "error", text: errorText(t, err) });
    }
  };
  const revert = async () => {
    setConflicts([]);
    try { await api.deleteException(date); report({ type: "success", text: t("doctor.calendar.reverted") }); onChanged(); } catch (err) {
      if (err?.code === "SCHEDULE_CONFLICT") setConflicts(err.appointments || []);
      report({ type: "error", text: errorText(t, err) });
    }
  };
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="mb-2 font-semibold">{t("doctor.calendar.manage")}</p>
      <div className="flex flex-wrap gap-2">
        <Button fullWidth={false} size="sm" variant="secondary" onClick={() => submit({ kind: "leave", note }, "doctor.calendar.saved")}>{t("doctor.calendar.markLeave")}</Button>
        <Button fullWidth={false} size="sm" variant="secondary" onClick={() => setKind("custom_hours")}>{t("doctor.calendar.customHours")}</Button>
        <Button fullWidth={false} size="sm" variant="secondary" onClick={() => setKind("extra_session")}>{t("doctor.calendar.extraSession")}</Button>
        {day.source !== "template" && <Button fullWidth={false} size="sm" variant="secondary" onClick={revert}>{t("doctor.calendar.revert")}</Button>}
      </div>
      <input type="text" maxLength={200} aria-label={t("doctor.calendar.note")} placeholder={t("doctor.calendar.note")} value={note} onChange={(e) => setNote(e.target.value)} className={`${INPUT} mt-2`} />
      {kind && (
        <div className="mt-3 space-y-2">
          {sessions.map((s, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-5">
              <input type="time" aria-label={t("doctor.calendar.from")} value={s.start_time} onChange={(e) => setField(i, "start_time", e.target.value)} className={INPUT} />
              <input type="time" aria-label={t("doctor.calendar.to")} value={s.end_time} onChange={(e) => setField(i, "end_time", e.target.value)} className={INPUT} />
              <select aria-label={t("doctor.calendar.slot")} value={s.slot_minutes} onChange={(e) => setField(i, "slot_minutes", Number(e.target.value))} className={INPUT}>{[15, 30, 45].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
              <input type="text" maxLength={40} aria-label={t("doctor.calendar.room")} placeholder={t("doctor.calendar.room")} value={s.room_label} onChange={(e) => setField(i, "room_label", e.target.value)} className={INPUT} />
              {sessions.length > 1 && <Button fullWidth={false} size="sm" variant="secondary" onClick={() => setSessions((cur) => cur.filter((_, j) => j !== i))}>{t("doctor.calendar.removeSession")}</Button>}
            </div>
          ))}
          <div className="flex gap-2">
            {sessions.length < 4 && <Button fullWidth={false} size="sm" variant="secondary" onClick={() => setSessions((cur) => [...cur, { ...NEW_SESSION, start_time: "14:00", end_time: "17:00" }])}>{t("doctor.calendar.addSession")}</Button>}
            <Button fullWidth={false} size="sm" onClick={() => submit({ kind, sessions, note }, "doctor.calendar.saved")}>{t("doctor.calendar.saveDate")}</Button>
            <Button fullWidth={false} size="sm" variant="secondary" onClick={() => setKind(null)}>{t("doctor.calendar.close")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DoctorCalendar() {
  const { t, lang } = useLanguage();
  const today = localDateInput();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [rows, setRows] = useState({});
  const [selected, setSelected] = useState(null);
  const [day, setDay] = useState(null);
  const [notice, setNotice] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [range, setRange] = useState({ from: "", to: "", note: "" });

  const loadMonth = useCallback(() => api.getScheduleMonth(month).then((r) => setRows(Object.fromEntries(r.days.map((d) => [d.date, d])))).catch((err) => setNotice({ type: "error", text: errorText(t, err) })), [month, t]);
  const loadDay = useCallback((date) => api.getScheduleDay(date).then(setDay).catch((err) => setNotice({ type: "error", text: errorText(t, err) })), [t]);
  useEffect(() => { void loadMonth(); }, [loadMonth]);
  useEffect(() => { if (selected) void loadDay(selected); else setDay(null); }, [selected, loadDay]);
  const refresh = () => { void loadMonth(); if (selected) void loadDay(selected); };
  const report = (n) => { setNotice(n); if (n.type === "success") setConflicts([]); };

  const saveRange = async () => {
    setConflicts([]);
    try { await api.leaveRange({ from: range.from, to: range.to, note: range.note }); report({ type: "success", text: t("doctor.calendar.rangeSaved") }); refresh(); } catch (err) {
      if (err?.code === "SCHEDULE_CONFLICT") setConflicts(err.appointments || []);
      setNotice({ type: "error", text: errorText(t, err) });
    }
  };
  const sourceLabel = { template: "sourceTemplate", leave: "sourceLeave", custom_hours: "sourceCustom", extra_session: "sourceExtra" };

  return (
    <>
      <PageHeader showLanguage title={t("doctor.calendar.title")} subtitle={t("doctor.calendar.subtitle")} />
      {notice && <div className="mb-4"><Alert type={notice.type}>{notice.text}</Alert><Conflicts t={t} lang={lang} list={conflicts} /></div>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <Button fullWidth={false} size="sm" variant="secondary" aria-label={t("doctor.calendar.prev")} onClick={() => setMonth(shiftMonth(month, -1))}>‹</Button>
            <h2 className="text-xl font-black">{formatDateLong(`${month}-01`, lang).slice(3)}</h2>
            <Button fullWidth={false} size="sm" variant="secondary" aria-label={t("doctor.calendar.next")} onClick={() => setMonth(shiftMonth(month, 1))}>›</Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold uppercase text-ink-muted">
            {WEEKDAYS.map((w) => <div key={w}>{t(`doctor.days.short.${w}`)}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthGrid(month).flat().map((date, i) => {
              if (!date) return <div key={`pad${i}`} />;
              const row = rows[date];
              const kind = dayKind(row);
              return (
                <button key={date} type="button" data-date={date} data-kind={kind} onClick={() => setSelected(date)}
                  className={`min-h-[64px] rounded-xl border p-1.5 text-start ${KIND_STYLE[kind]} ${selected === date ? "ring-2 ring-brand-700" : ""} ${date === today ? "font-black" : ""}`}>
                  <span className="block text-sm">{Number(date.slice(8))}</span>
                  {row?.appointments_count > 0 && <span className="mt-1 block rounded bg-white/80 px-1 text-[11px] font-semibold">{fill(t("doctor.calendar.appts"), { n: row.appointments_count })}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs" aria-label={t("doctor.calendar.legend")}>
            {[["normal", "normal"], ["modified", "modified"], ["extra", "extra"], ["off", "off"]].map(([k, key]) => (
              <span key={k} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded border ${KIND_STYLE[k]}`} />{t(`doctor.calendar.${key}`)}</span>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 font-semibold">{t("doctor.calendar.leaveRange")}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input type="date" aria-label={t("doctor.calendar.rangeFrom")} min={today} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className={INPUT} />
              <input type="date" aria-label={t("doctor.calendar.rangeTo")} min={range.from || today} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className={INPUT} />
              <input type="text" maxLength={200} aria-label={t("doctor.calendar.note")} placeholder={t("doctor.calendar.note")} value={range.note} onChange={(e) => setRange({ ...range, note: e.target.value })} className={INPUT} />
            </div>
            <div className="mt-2"><Button fullWidth={false} size="sm" disabled={!range.from || !range.to} onClick={saveRange}>{t("doctor.calendar.rangeSave")}</Button></div>
          </div>
        </Card>

        <Card className="p-5">
          {!selected || !day ? <p className="text-ink-muted">{t("doctor.calendar.selectDate")}</p> : (
            <>
              <h2 className="text-xl font-black">{formatDateLong(selected, lang)}</h2>
              <p className="mt-1 text-sm text-ink-muted">{t("doctor.calendar.source")}: {t(`doctor.calendar.${sourceLabel[day.source] || "sourceTemplate"}`)}</p>
              <ul className="mt-2 text-sm">
                {day.sessions.length ? day.sessions.map((s, i) => <li key={i}>{s.start_time}–{s.end_time} · {s.slot_minutes} min{s.room_label ? ` · ${s.room_label}` : ""}</li>) : <li className="text-ink-muted">{t("doctor.calendar.noSessions")}</li>}
              </ul>
              <p className="mb-2 mt-4 font-semibold">{t("doctor.calendar.appointments")}</p>
              {day.appointments.length ? (
                <ul className="space-y-2">{day.appointments.map((a) => <AppointmentRow key={a.id} t={t} lang={lang} appt={a} onDone={refresh} report={report} />)}</ul>
              ) : <p className="text-sm text-ink-muted">{t("doctor.calendar.noAppointments")}</p>}
              {selected >= today && <DateManager key={selected} t={t} date={selected} day={day} onChanged={refresh} report={report} setConflicts={setConflicts} />}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
