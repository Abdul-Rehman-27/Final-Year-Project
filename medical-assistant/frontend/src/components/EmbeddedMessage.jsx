import StructuredReply from "../StructuredReply";
import ClarifyChip from "./ClarifyChip";
import { AppointmentCard, DoctorCards, HospitalCard } from "./DoctorCards";

// One chat message in the embedded design: patient messages are teal bubbles, assistant replies are cards.
const hasUrdu = (value) => /[\u0600-\u06ff]/.test(value || "");

export default function EmbeddedMessage({ t, message, contact, canReply, replyActive, onReplyPick, onBook, busy }) {
  const isPatient = message.role === "user";
  const structured = message.structured;
  const medical = !isPatient && structured?.type === "medical";
  const text = structured?.type === "message" ? structured.message : message.content || message.answer || "";

  if (isPatient) {
    return (
      <div className="flex max-w-[82%] flex-col items-end gap-1 self-end">
        {message.reply_to && <p className="max-w-full truncate rounded-lg bg-surface px-2.5 py-1 text-[12px] text-ink-soft opacity-80">↩ {message.reply_to}</p>}
        <div dir="auto" className={`whitespace-pre-wrap break-words rounded-2xl bg-brand-700 px-5 py-3.5 text-[16px] leading-6 text-white ${hasUrdu(text) ? "font-urdu leading-9" : ""}`}>{text}</div>
      </div>
    );
  }

  const heading = String(message.content || "").split("\n")[0];
  const card = structured?.type === "doctors" && Array.isArray(structured.doctors)
    ? <DoctorCards t={t} heading={heading} doctors={structured.doctors} bookingEnabled={Boolean(structured.booking_enabled)} busy={busy} onBook={onBook} />
    : structured?.type === "hospital" && structured.hospital ? <HospitalCard t={t} heading={heading} hospital={structured.hospital} />
      : structured?.type === "appointment" && structured.action !== "cancel" && structured.appointment ? <AppointmentCard t={t} heading={heading} appointment={structured.appointment} /> : null;

  const question = medical ? structured.follow_up_question : "";
  return (
    <div className="max-w-[88%] self-start rounded-2xl border border-line bg-surface/60 p-5 text-ink">
      {card ? card : medical
        ? <StructuredReply data={structured} language={message.language} contact={contact} bare hideFollowUp />
        : <div dir="auto" className={`whitespace-pre-wrap break-words text-[16px] leading-6 ${hasUrdu(text) ? "font-urdu leading-9" : ""}`}>{text}</div>}
      {question && <ClarifyChip t={t} question={question} active={replyActive} onPick={canReply ? () => onReplyPick(question) : undefined} />}
    </div>
  );
}
