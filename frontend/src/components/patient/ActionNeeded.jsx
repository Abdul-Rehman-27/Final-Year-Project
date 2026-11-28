import { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { useAsync } from "../../hooks/useAsync.js";
import { patientErrorKey, patientPortalService } from "../../services/patientPortalService.js";
import { formatShort, localDateInput } from "../../utils/datetime.js";
import Chip from "./Chip.jsx";
import MicroLabel from "./MicroLabel.jsx";
import PortalButton from "./PortalButton.jsx";
import PortalCard from "./PortalCard.jsx";
import PortalField from "./PortalField.jsx";

const fill = (text, values) => Object.entries(values).reduce((r, [k, v]) => r.replace(`{${k}}`, v), text);

/** Pending doctor reschedule proposals and follow-up recommendations, with accept / decline actions. */
export default function ActionNeeded({ onChanged }) {
  const { t, lang } = useLanguage();
  const props = useAsync(() => patientPortalService.listProposals("pending"), []);
  const recs = useAsync(() => patientPortalService.listFollowups("pending"), []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [other, setOther] = useState(null); // { id, doctorId, date, slot }
  const slots = useAsync(() => (other ? patientPortalService.getSlots(other.doctorId, other.date) : Promise.resolve({ slots: [] })), [other?.doctorId, other?.date]);

  const proposals = props.data?.items || [];
  const recommendations = recs.data?.items || [];
  if (!proposals.length && !recommendations.length && !error) return null;

  const run = async (fn) => {
    setError(""); setBusy(true);
    try { await fn(); await Promise.all([props.reload(), recs.reload()]); setOther(null); onChanged?.(); }
    catch (err) { setError(patientErrorKey(err)); if (err.code === "SLOT_UNAVAILABLE") { slots.reload(); recs.reload(); props.reload(); } }
    finally { setBusy(false); }
  };
  const errorText = error ? (t(error) === error ? t("patient.errors.GENERIC") : t(error)) : "";

  return <PortalCard className="mb-[18px]">
    <h2 className="text-[18px] font-bold">{t("patient.actions.title")}</h2>
    {errorText && <p role="alert" className="mt-2 text-sm text-red-700">{errorText}</p>}
    {proposals.map((p) => <div key={`p${p.id}`} className="mt-3 rounded-[14px] bg-surface p-4">
      <MicroLabel>{t("patient.actions.proposalLabel")}</MicroLabel>
      <p className="mt-1 text-[15px] text-ink">{fill(t("patient.actions.proposalText"), { doctor: p.doctor_name, from: formatShort(p.original_starts_at, lang), to: formatShort(p.proposed_starts_at, lang) })}</p>
      {p.note && <p className="mt-1 text-[13px] text-ink-soft">{p.note}</p>}
      <div className="mt-3 flex flex-wrap gap-3"><PortalButton disabled={busy} onClick={() => run(() => patientPortalService.acceptProposal(p.id))}>{t("patient.actions.accept")}</PortalButton><PortalButton variant="secondary" disabled={busy} onClick={() => run(() => patientPortalService.declineProposal(p.id))}>{t("patient.actions.decline")}</PortalButton></div>
    </div>)}
    {recommendations.map((r) => <div key={`r${r.id}`} className="mt-3 rounded-[14px] bg-surface p-4">
      <MicroLabel>{t("patient.actions.followupLabel")}</MicroLabel>
      <p className="mt-1 text-[15px] text-ink">{fill(t("patient.actions.followupText"), { doctor: r.doctor_name, when: formatShort(r.proposed_starts_at, lang) })}</p>
      {r.note && <p className="mt-1 text-[13px] text-ink-soft">{r.note}</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        <PortalButton disabled={busy} onClick={() => run(() => patientPortalService.acceptFollowup(r.id))}>{t("patient.actions.accept")}</PortalButton>
        <PortalButton variant="secondary" disabled={busy} onClick={() => setOther(other?.id === r.id ? null : { id: r.id, doctorId: r.doctor_id, date: localDateInput(Date.parse(r.proposed_starts_at)), slot: "" })}>{t("patient.actions.otherTime")}</PortalButton>
        <PortalButton variant="secondary" disabled={busy} onClick={() => run(() => patientPortalService.declineFollowup(r.id))}>{t("patient.actions.decline")}</PortalButton>
      </div>
      {other?.id === r.id && <div className="mt-4">
        <PortalField id={`other-date-${r.id}`} label={t("patient.appointments.fields.date")} type="date" min={localDateInput()} value={other.date} onChange={(e) => setOther({ ...other, date: e.target.value, slot: "" })} />
        <div className="flex flex-wrap gap-3" role="group" aria-label={t("patient.appointments.fields.availableTimes")}>{(slots.data?.slots || []).map((time) => <Chip key={time} variant="slot" selected={other.slot === time} onClick={() => setOther({ ...other, slot: time })}>{time}</Chip>)}</div>
        {!slots.loading && (slots.data?.slots || []).length === 0 && <p className="mt-2 text-sm text-ink-soft">{t("patient.appointments.noSlots")}</p>}
        <PortalButton className="mt-3" disabled={!other.slot || busy} onClick={() => run(() => patientPortalService.acceptFollowup(r.id, { date: other.date, time: other.slot }))}>{t("patient.actions.bookThis")}</PortalButton>
      </div>}
    </div>)}
  </PortalCard>;
}
