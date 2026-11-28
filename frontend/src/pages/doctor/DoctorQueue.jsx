import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useDoctorContext } from "../../context/DoctorContext.jsx";
import useDoctorQueue from "../../hooks/useDoctorQueue.js";
import { formatTime } from "../../utils/datetime.js";
import { fill } from "../../utils/format.js";
import PageHeader from "../../components/common/PageHeader.jsx";
import Card from "../../components/common/Card.jsx";
import Tabs from "../../components/common/Tabs.jsx";
import Badge from "../../components/common/Badge.jsx";
import Avatar from "../../components/common/Avatar.jsx";
import Button from "../../components/common/Button.jsx";
import Alert from "../../components/common/Alert.jsx";
import GraceCountdown from "../../components/doctor/GraceCountdown.jsx";
import VisitStatusSelect from "../../components/doctor/VisitStatusSelect.jsx";
import { LoadState, Status, errorText } from "../../components/doctor/DoctorCommon.jsx";

const callErrorKey = { in_progress: "ALREADY_IN_PROGRESS", held: "QUEUE_HELD", not_next: "NOT_NEXT" };

export default function DoctorQueue() {
  const { t, lang } = useLanguage();
  const { hospital } = useDoctorContext();
  const queue = useDoctorQueue();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [actionError, setActionError] = useState(null);
  const [now, setNow] = useState(Date.now());
  const refreshedAtZero = useRef(new Set());
  const tz = hospital?.timezone || "Asia/Karachi";
  const items = queue.data?.items || [];
  const expected = queue.data?.expected || [];
  const counts = queue.data?.counts || {};
  const waiting = items.filter((item) => item.queue_state === "waiting").sort((a, b) => a.position - b.position);
  const firstWaitingId = waiting[0]?.id;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshOnZero = (id, graceEndsAt) => {
    const key = `${id}:${graceEndsAt}`;
    if (!refreshedAtZero.current.has(key)) {
      refreshedAtZero.current.add(key);
      void queue.refresh().catch(() => {});
    }
  };
  const perform = async (action) => {
    try {
      await action();
      setActionError(null);
    } catch (error) {
      setActionError(error);
    }
  };
  const changeStatus = (id, status) => perform(() => queue.setVisitStatus(id, status));
  const checkIn = (id) => perform(() => queue.checkIn(id));
  const tabs = ["all", "waiting", "in_progress", "completed", "incomplete"].map((id) => ({
    id,
    label: fill(t(`doctor.queue.${id === "in_progress" ? "inProgress" : id}`), { n: counts[id] || 0 }),
  }));
  const visibleItems = items.filter((item) => filter === "all" || item.queue_state === filter);
  const dateTitle = queue.data ? (() => {
    const parts = new Intl.DateTimeFormat(lang === "ur" ? "ur-PK-u-nu-latn" : "en-GB", { timeZone: tz, weekday: "long", day: "2-digit", month: "short" }).formatToParts(new Date(queue.data.server_now));
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("weekday")} ${get("day")} ${get("month")}`;
  })() : "";

  const countdown = (id, deadline) => (
    <bdi dir="ltr"><GraceCountdown graceEndsAt={deadline} serverOffset={queue.serverOffset} onZero={() => refreshOnZero(id, deadline)} /></bdi>
  );
  const circle = (item) => {
    const text = item.queue_state === "holding" ? "–" : item.queue_state === "completed" ? "✓" : item.queue_state === "incomplete" ? "!" : item.position;
    const style = item.queue_state === "in_progress" ? "bg-brand-700 text-white" : item.queue_state === "waiting" ? "bg-brand-tint text-brand-700" : "bg-surface text-ink-muted";
    return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold ${style}`}>{text}</span>;
  };

  return (
    <LoadState loading={queue.loading} error={queue.error} onRetry={queue.refresh}>
      <PageHeader showLanguage title={t("doctor.queue.title")} subtitle={fill(t("doctor.queue.subtitle"), { date: dateTitle })} />
      <Tabs variant="pill" tabs={tabs} active={filter} onChange={setFilter} />
      <div className="grid gap-5 lg:grid-cols-[2.2fr_1fr]">
        <Card className="min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-black">{t("doctor.queue.queue")}</h2>
            <p className="text-sm text-ink-muted">{t("doctor.queue.notePrefix")} <bdi dir="ltr">{formatTime(new Date(now + queue.serverOffset).toISOString(), tz)}</bdi></p>
          </div>
          {actionError && <div className="mb-4"><Alert>{errorText(t, actionError)}</Alert></div>}
          {!visibleItems.length ? <p className="py-8 text-ink-muted">{t("doctor.queue.nobody")}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[740px] table-fixed text-start">
                <colgroup><col className="w-12" /><col className="w-20" /><col className="w-[185px]" /><col className="w-[190px]" /><col className="w-[200px]" /></colgroup>
                <thead><tr className="border-b border-line text-xs font-bold uppercase tracking-[.08em] text-ink-muted">
                  <th className="px-2 py-3">#</th><th className="px-2 py-3">{t("doctor.queue.token")}</th><th className="px-2 py-3">{t("doctor.queue.patient")}</th><th className="px-2 py-3">{t("common.status")}</th><th className="px-2 py-3 text-end">{t("doctor.queue.action")}</th>
                </tr></thead>
                <tbody>{visibleItems.map((item) => {
                  const holding = item.queue_state === "holding";
                  const first = item.queue_state === "waiting" && item.id === firstWaitingId;
                  const patient = holding ? fill(t("doctor.queue.reserved"), { name: item.patient_name, age: item.patient_age ?? "—" }) : `${item.patient_name} · ${item.patient_age ?? "—"} y`;
                  const graceFirst = holding ? "border-y-2 border-s-2 border-dashed border-amber-400" : "";
                  const graceMiddle = holding ? "border-y-2 border-dashed border-amber-400" : "";
                  const graceLast = holding ? "border-y-2 border-e-2 border-dashed border-amber-400" : "";
                  return <tr key={item.id} onClick={() => item.queue_state === "in_progress" && navigate(`/doctor/queue/${item.id}`)} onKeyDown={(event) => event.key === "Enter" && item.queue_state === "in_progress" && navigate(`/doctor/queue/${item.id}`)} tabIndex={item.queue_state === "in_progress" ? 0 : undefined} className={`${holding ? "bg-amber-50" : "border-b border-line"} ${item.queue_state === "in_progress" ? "cursor-pointer hover:bg-brand-50" : ""}`}>
                    <td className={`px-2 py-3 align-middle ${graceFirst}`}>{circle(item)}</td>
                    <td className={`px-2 py-3 align-middle font-bold ${graceMiddle}`}><bdi dir="ltr">{item.token_no || "—"}</bdi></td>
                    <td className={`px-2 py-3 align-middle ${graceMiddle}`}><div className="font-bold">{patient}</div><p className="text-sm text-ink-muted">{t("doctor.queue.scheduledLabel")} <bdi dir="ltr">{formatTime(item.starts_at, tz)}</bdi> · {holding ? t("doctor.queue.notCheckedIn") : <>{t("doctor.queue.checkedInLabel")} <bdi dir="ltr">{item.checked_in_at ? formatTime(item.checked_in_at, tz) : "—"}</bdi></>}</p></td>
                    <td className={`px-2 py-3 align-middle ${graceMiddle}`}>
                      {holding ? <><Badge tone="warning">{t("doctor.queue.holdingLabel")} · {t("doctor.queue.graceWord")} {countdown(item.id, item.grace_ends_at)} {t("doctor.queue.left")}</Badge></> : <Status value={item.queue_state} />}
                      {item.queue_state === "in_progress" && <p className="mt-1 text-xs text-ink-muted">{t("doctor.queue.calledLabel")} <bdi dir="ltr">{item.called_at ? formatTime(item.called_at, tz) : "—"}</bdi> · {t("doctor.queue.positionLocked")}</p>}
                      {first && <p className="mt-1 text-xs text-ink-muted">{t("doctor.queue.nextInLine")}</p>}
                    </td>
                    <td className={`px-2 py-3 align-middle ${graceLast}`} onClick={(event) => event.stopPropagation()}><div className="ms-auto flex w-[168px] flex-col items-stretch justify-center gap-2">
                      {item.queue_state === "in_progress" ? <Button size="sm" fullWidth={false} className="h-10 w-[168px] whitespace-nowrap" onClick={() => navigate(`/doctor/queue/${item.id}`)}>{t("doctor.queue.open")}</Button> : item.queue_state === "waiting" ? <Button size="sm" fullWidth={false} className="h-10 w-[168px] whitespace-nowrap" disabled={!item.can_call} title={item.call_blocked_reason ? t(`doctor.errors.${callErrorKey[item.call_blocked_reason]}`) : undefined} onClick={() => changeStatus(item.id, "in_progress")}>{t("doctor.queue.call")}</Button> : holding ? <Button size="sm" variant="secondary" fullWidth={false} className="h-10 w-[168px] whitespace-nowrap" onClick={() => checkIn(item.id)}>{t("doctor.queue.checkIn")}</Button> : <Button size="sm" variant="secondary" fullWidth={false} className="h-10 w-[168px] whitespace-nowrap" onClick={() => navigate(`/doctor/queue/${item.id}`)}>{t("doctor.common.view")}</Button>}
                      {["waiting", "in_progress"].includes(item.queue_state) && <VisitStatusSelect id={item.id} visitStatus={item.visit_status} canCall={item.can_call} onSetStatus={(status) => queue.setVisitStatus(item.id, status)} onError={setActionError} />}
                    </div></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-5">
          <Card className="p-5"><h2 className="mb-3 text-xl font-black">{t("doctor.queue.expected")}</h2>
            {expected.length ? expected.map((item) => <div key={item.id} className="flex items-center gap-2 border-b border-line py-3 last:border-0">
              <Avatar name={item.patient_name} /><div className="min-w-0 flex-1"><b className="block truncate">{item.patient_name}</b><p className="text-sm text-ink-muted"><bdi dir="ltr">{formatTime(item.starts_at, tz)}</bdi>{item.expected_state === "holding" && <> · {t("doctor.queue.graceEndsLabel")} <bdi dir="ltr">{item.grace_ends_at ? formatTime(item.grace_ends_at, tz) : "—"}</bdi></>}</p></div>
              {item.expected_state === "holding" ? <Badge tone="warning">{countdown(item.id, item.grace_ends_at)}</Badge> : <Status value={item.expected_state === "later" ? "later" : "grace_expired"} />}
              {["holding", "grace_expired"].includes(item.expected_state) && <Button size="sm" variant="secondary" fullWidth={false} onClick={() => checkIn(item.id)}>{t("doctor.queue.checkIn")}</Button>}
            </div>) : <p className="text-ink-muted">{t("doctor.queue.everyoneCheckedIn")}</p>}
          </Card>
          <Card className="space-y-2 p-5"><h2 className="text-xl font-black">{t("doctor.queue.grace")}</h2>
            {["grace1", "grace2", "grace3", "grace4"].map((key) => <p key={key} className="text-ink-muted">{fill(t(`doctor.queue.${key}`), { n: queue.data?.grace_minutes ?? 5 })}</p>)}
          </Card>
        </div>
      </div>
    </LoadState>
  );
}
