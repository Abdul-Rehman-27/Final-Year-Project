import { useState } from "react";
import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { errorText, LoadState } from "../../components/doctor/DoctorCommon.jsx";
import useDoctorSchedule from "../../hooks/useDoctorSchedule.js";
import { dayBreaks, daySessions, dayHasErrors, MAX_BREAKS, MAX_SESSIONS, sessionSlots, validateSessionsDay, withSessions } from "../../utils/schedule.js";
import { formatDateTime } from "../../utils/datetime.js";
import { fill } from "../../utils/format.js";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const INPUT = "w-full rounded-xl border border-line bg-white p-3";
const NEW_SESSION = { start_time: "09:00", end_time: "13:00", slot_minutes: 15, room_label: "" };

const toMin = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const toTime = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function newBreak(session) {
  return { start_time: session.start_time, end_time: toTime(Math.min(toMin(session.start_time) + 30, toMin(session.end_time))) };
}

function FieldError({ code, t }) {
  return code ? <p className="mt-1 text-xs text-red-700">{t(code)}</p> : null;
}

export default function DoctorAvailability() {
  const { t, lang } = useLanguage();
  const schedule = useDoctorSchedule();
  const [notice, setNotice] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [open, setOpen] = useState(() => new Set());
  const invalid = schedule.days.some(dayHasErrors);

  const change = (index, fn) => {
    schedule.setDays((current) => current.map((day, i) => (i === index ? fn(day) : day)));
    setNotice(null);
    setConflicts([]);
  };
  const setSessions = (index, sessions) => change(index, (day) => withSessions(day, sessions));
  const toggleOpen = (weekday) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(weekday)) next.delete(weekday); else next.add(weekday);
    return next;
  });
  const toggleDay = (index, weekday, enabled) => {
    if (enabled) {
      const previous = [...schedule.days].reverse().map(daySessions).find((s) => s.length);
      setSessions(index, [{ ...NEW_SESSION, room_label: previous?.[0]?.room_label || "" }]);
      setOpen((current) => new Set(current).add(weekday));
    } else {
      setSessions(index, []);
    }
  };
  const updateSession = (index, day, sIndex, key, value) => setSessions(index, daySessions(day).map((s, i) => (i === sIndex ? { ...s, [key]: value } : s)));
  const addSession = (index, day) => {
    const sessions = daySessions(day);
    const last = sessions[sessions.length - 1];
    const start = last ? Math.min(toMin(last.end_time), 23 * 60 - 60) : 14 * 60;
    setSessions(index, [...sessions, { ...NEW_SESSION, start_time: toTime(start), end_time: toTime(Math.min(start + 180, 23 * 60 + 45)), room_label: last?.room_label || "" }]);
  };
  const removeSession = (index, day, sIndex) => change(index, (d) => {
    const sessions = daySessions(d).filter((_, i) => i !== sIndex);
    return withSessions(d, sessions, dayBreaks(d).filter((b) => sessions.some((s) => s.start_time <= b.start_time && b.end_time <= s.end_time)));
  });
  const setBreaks = (index, day, breaks) => change(index, (d) => withSessions(d, daySessions(d), breaks));
  const updateBreak = (index, day, bIndex, key, value) => setBreaks(index, day, dayBreaks(day).map((b, i) => (i === bIndex ? { ...b, [key]: value } : b)));

  const save = async () => {
    setNotice(null);
    setConflicts([]);
    try {
      await schedule.save();
      setNotice({ type: "success", text: t("doctor.availability.saved") });
    } catch (err) {
      if (err?.code === "SCHEDULE_CONFLICT") setConflicts(err.appointments || []);
      setNotice({ type: "error", text: errorText(t, err) });
    }
  };

  return (
    <LoadState loading={schedule.loading} error={schedule.error} onRetry={schedule.reload}>
      <PageHeader showLanguage title={t("doctor.availability.title")} subtitle={t("doctor.availability.subtitle")} />
      {notice && (
        <div className="mb-4">
          <Alert type={notice.type}>{notice.text}</Alert>
          {conflicts.length > 0 && (
            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">{t("doctor.availability.conflictTitle")}</p>
              <ul className="mt-1 list-disc ps-5">
                {conflicts.map((a) => (
                  <li key={a.id}>{fill(t("doctor.availability.conflictRow"), { patient: a.patient_name, when: formatDateTime(a.starts_at, lang) })}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Card className="p-5">
        <h2 className="text-2xl font-black">{t("doctor.availability.weekly")}</h2>
        <p className="mb-1 mt-1 text-ink-muted">{t("doctor.availability.help")}</p>
        <p className="mb-5 text-sm text-ink-muted">{t("doctor.availability.breakHelp")}</p>

        <div className="space-y-3">
          {schedule.days.map((day, index) => {
            const weekday = WEEKDAYS[day.weekday];
            const dayName = t(`doctor.days.long.${weekday}`);
            const sessions = daySessions(day);
            const breaks = dayBreaks(day);
            const errs = validateSessionsDay(day);
            const isOpen = day.is_active && open.has(day.weekday);
            const slotCount = sessions.reduce((sum, s) => sum + sessionSlots(s, breaks).length, 0);
            const summary = day.is_active
              ? `${sessions.map((s) => `${s.start_time}–${s.end_time}`).join(" · ")} · ${fill(t("doctor.availability.sessionsSummary"), { count: sessions.length, slots: slotCount })}`
              : t("doctor.availability.notWorking");
            return (
              <div key={day.weekday} className="rounded-2xl border border-line">
                <div className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    aria-label={fill(t("doctor.availability.toggleDay"), { day: dayName })}
                    checked={day.is_active}
                    onChange={(event) => toggleDay(index, day.weekday, event.target.checked)}
                    className="h-[22px] w-[22px] accent-brand-700"
                  />
                  <span className="w-28 font-bold">{dayName}</span>
                  <span className="flex-1 text-ink-muted">{summary}</span>
                  {(errs.day || errs.sessions.some(Boolean) || errs.breaks.some(Boolean)) && <span className="text-xs font-semibold text-red-700">!</span>}
                  {day.is_active && (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={fill(t(isOpen ? "doctor.availability.collapse" : "doctor.availability.expand"), { day: dayName })}
                      onClick={() => toggleOpen(day.weekday)}
                      className="rounded-lg px-3 py-1 text-lg font-bold text-brand-700 hover:bg-brand-50"
                    >
                      {isOpen ? "−" : "+"}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="space-y-4 border-t border-line p-3">
                    {sessions.map((s, sIndex) => (
                      <div key={sIndex} className="rounded-xl bg-gray-50 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="font-semibold">{fill(t("doctor.availability.session"), { n: sIndex + 1 })}</p>
                          {sessions.length > 1 && (
                            <Button fullWidth={false} size="sm" variant="secondary" onClick={() => removeSession(index, day, sIndex)}>
                              {fill(t("doctor.availability.removeSession"), { n: sIndex + 1 })}
                            </Button>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <label className="text-xs font-bold uppercase text-ink-muted">{t("doctor.availability.start")}
                            <input type="time" value={s.start_time || ""} onChange={(e) => updateSession(index, day, sIndex, "start_time", e.target.value)} className={`${INPUT} mt-1 font-normal normal-case`} />
                          </label>
                          <label className="text-xs font-bold uppercase text-ink-muted">{t("doctor.availability.end")}
                            <input type="time" aria-invalid={Boolean(errs.sessions[sIndex])} value={s.end_time || ""} onChange={(e) => updateSession(index, day, sIndex, "end_time", e.target.value)} className={`${INPUT} mt-1 font-normal normal-case`} />
                          </label>
                          <label className="text-xs font-bold uppercase text-ink-muted">{t("doctor.availability.slot")}
                            <select value={s.slot_minutes} onChange={(e) => updateSession(index, day, sIndex, "slot_minutes", Number(e.target.value))} className={`${INPUT} mt-1 font-normal normal-case`}>
                              {[15, 30, 45].map((minutes) => <option key={minutes} value={minutes}>{fill(t("doctor.availability.slotOption"), { minutes })}</option>)}
                            </select>
                          </label>
                          <label className="text-xs font-bold uppercase text-ink-muted">{t("doctor.availability.room")}
                            <input type="text" maxLength={40} value={s.room_label || ""} onChange={(e) => updateSession(index, day, sIndex, "room_label", e.target.value)} className={`${INPUT} mt-1 font-normal normal-case`} />
                          </label>
                        </div>
                        <FieldError code={errs.sessions[sIndex]} t={t} />
                        <p className="mt-2 text-sm text-ink-muted" title={sessionSlots(s, breaks).join(" · ")}>
                          {t("doctor.availability.bookable")}: {sessionSlots(s, breaks).slice(0, 4).join(" · ")}{sessionSlots(s, breaks).length > 4 ? " …" : ""}
                        </p>
                      </div>
                    ))}
                    {sessions.length < MAX_SESSIONS && (
                      <Button fullWidth={false} size="sm" variant="secondary" onClick={() => addSession(index, day)}>{t("doctor.availability.addSession")}</Button>
                    )}

                    <div>
                      <p className="mb-2 font-semibold">{t("doctor.availability.breaks")}</p>
                      {breaks.map((b, bIndex) => (
                        <div key={bIndex} className="mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-ink-muted">{t("doctor.availability.breakLabel")}</span>
                            <input type="time" aria-label={`${t("doctor.availability.breakLabel")} ${t("doctor.availability.start")}`} value={b.start_time || ""} onChange={(e) => updateBreak(index, day, bIndex, "start_time", e.target.value)} className="rounded-xl border border-line bg-white p-2" />
                            <input type="time" aria-label={`${t("doctor.availability.breakLabel")} ${t("doctor.availability.end")}`} value={b.end_time || ""} onChange={(e) => updateBreak(index, day, bIndex, "end_time", e.target.value)} className="rounded-xl border border-line bg-white p-2" />
                            <Button fullWidth={false} size="sm" variant="secondary" onClick={() => setBreaks(index, day, breaks.filter((_, i) => i !== bIndex))}>{t("doctor.availability.removeBreak")}</Button>
                          </div>
                          <FieldError code={errs.breaks[bIndex]} t={t} />
                        </div>
                      ))}
                      {breaks.length < MAX_BREAKS && (
                        <Button fullWidth={false} size="sm" variant="secondary" onClick={() => setBreaks(index, day, [...breaks, newBreak(sessions[0])])}>{t("doctor.availability.addBreak")}</Button>
                      )}
                    </div>
                    <FieldError code={errs.day} t={t} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {invalid && <p className="mt-4 text-sm font-semibold text-red-700">{t("doctor.availability.fixErrors")}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <Button fullWidth={false} variant="secondary" onClick={schedule.reload}>{t("doctor.availability.reset")}</Button>
          <Button fullWidth={false} disabled={!schedule.dirty || invalid} loading={schedule.saving} onClick={save}>{t("doctor.availability.save")}</Button>
        </div>
      </Card>
    </LoadState>
  );
}
