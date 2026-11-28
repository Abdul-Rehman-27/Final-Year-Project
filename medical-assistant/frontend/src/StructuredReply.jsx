const LABELS = {
  english: {
    symptoms: "Symptoms",
    condition: "Condition",
    causes: "Possible causes",
    estimate: "Rough estimates only, not a diagnosis.",
    tips: "Quick tips",
    emergency: "Emergency check",
    call: (hospital, number) => `In an emergency call ${hospital ? `the hospital on ${hospital} or ` : ""}${number}.`,
    levels: ["EMERGENCY - seek care now", "See a doctor soon", "Not an emergency right now"],
  },
  urdu: {
    symptoms: "علامات",
    condition: "حالت",
    causes: "ممکنہ وجوہات",
    estimate: "یہ صرف موٹا اندازہ ہے، تشخیص نہیں۔",
    tips: "فوری مشورے",
    call: (hospital, number) => `ایمرجنسی میں ${hospital ? `ہسپتال ${hospital} یا ` : ""}${number} پر کال کریں۔`,
    emergency: "ایمرجنسی کی جانچ",
    levels: ["ایمرجنسی - فوراً طبی مدد لیں", "جلد ڈاکٹر کو دکھائیں", "فی الحال ایمرجنسی نہیں"],
  },
  roman: {
    symptoms: "Alamaat",
    condition: "Halat",
    causes: "Mumkin wajohaat",
    estimate: "Yeh sirf mota andaza hai, tashkhees nahi.",
    tips: "Fori mashwaray",
    call: (hospital, number) => `Emergency mein ${hospital ? `hospital ${hospital} ya ` : ""}${number} par call karein.`,
    emergency: "Emergency check",
    levels: ["EMERGENCY - foran madad lein", "Jald doctor ko dikhayen", "Filhal emergency nahi"],
  },
};

const EMERGENCY_STYLES = {
  emergency: "border-red-300 bg-red-100 text-red-950",
  see_doctor_soon: "border-amber-300 bg-amber-100 text-amber-950",
  not_emergency: "border-emerald-300 bg-emerald-100 text-emerald-950",
};

const EMERGENCY_NUMBER = "1122";

// Numbers stay left-to-right even inside Urdu text.
function withLtrNumbers(text) {
  return String(text).split(/([+\d][\d\s()-]{2,}\d)/).map((part, index) => (index % 2 === 1 ? <bdi key={index} dir="ltr">{part}</bdi> : part));
}

// A cause is {name, percent} (percent can be null); older saved replies hold plain strings.
const asCause = (item) => (item && typeof item === "object" ? { name: String(item.name || ""), percent: Number.isFinite(item.percent) ? item.percent : null } : { name: String(item || ""), percent: null });
const causeText = (item) => { const cause = asCause(item); return cause.percent === null ? cause.name : `${cause.name} (${cause.percent}%)`; };

const BANNER_STYLES = {
  emergency: "bg-red-100 text-red-900",
  see_doctor_soon: "bg-amber-100 text-amber-900",
  not_emergency: "bg-emerald-50 text-emerald-900",
};

// Embedded design: one coloured banner (level + reason + who to call), then the cause bars.
function Banner({ emergency, labels, levelIndex, contact }) {
  const callLine = emergency.level === "not_emergency" ? "" : labels.call(contact?.hospitalNumber || "", EMERGENCY_NUMBER);
  return (
    <div className={`rounded-xl px-5 py-4 text-[16px] font-bold leading-6 ${BANNER_STYLES[emergency.level]}`}>
      <p>{labels.levels[levelIndex]}{emergency.reason ? <>. <HighlightedText text={emergency.reason} /></> : null}</p>
      {callLine && <p className="mt-1">{withLtrNumbers(callLine)}</p>}
    </div>
  );
}

function CauseBars({ title, note, items }) {
  const causes = (Array.isArray(items) ? items : []).map(asCause).filter((cause) => cause.name);
  if (!causes.length) return null;
  return (
    <section>
      <h4 className="mb-3 text-[12px] font-bold uppercase tracking-[0.8px] text-ink-soft">{title}</h4>
      <ul className="space-y-3.5">
        {causes.map((cause, index) => (
          <li key={index}>
            <div className="flex items-baseline justify-between gap-3 text-[16px] text-ink">
              <span><HighlightedText text={cause.name} /></span>
              {cause.percent !== null && <span className="shrink-0 text-[14px] text-ink-soft"><bdi dir="ltr">{cause.percent}%</bdi></span>}
            </div>
            {cause.percent !== null && (
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={cause.percent} aria-label={cause.name} className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#e3ebe8]" dir="ltr">
                <div className="h-full rounded-full bg-brand-700" style={{ width: `${Math.max(2, cause.percent)}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {causes.some((cause) => cause.percent !== null) && <p className="mt-2 text-[12px] text-ink-soft">{note}</p>}
    </section>
  );
}

function HighlightedText({ text }) {
  return String(text).split("**").map((part, index) => (
    index % 2 === 1
      ? <strong key={index} className="font-semibold text-[#173a34]">{part}</strong>
      : part
  ));
}

function ItemList({ title, items, tip = false }) {
  if (!Array.isArray(items) || !items.some(Boolean)) return null;
  return (
    <section>
      <h4 className="mb-1 text-[10px] font-bold text-brand-800">{title}</h4>
      <ul className="space-y-0.5 text-[11px] leading-4 text-[#34514b]">
        {items.filter(Boolean).map((item, index) => (
          <li key={index} className="flex gap-1.5">
            <span aria-hidden="true" className="shrink-0 text-brand-700">{tip ? "✓" : "•"}</span>
            <span><HighlightedText text={typeof item === "object" ? causeText(item) : item} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Larger list used by the embedded design.
function BareList({ title, items, tip = false }) {
  if (!Array.isArray(items) || !items.some(Boolean)) return null;
  return (
    <section>
      <h4 className="mb-2 text-[12px] font-bold uppercase tracking-[0.8px] text-ink-soft">{title}</h4>
      <ul className="space-y-1 text-[16px] leading-6 text-ink">
        {items.filter(Boolean).map((item, index) => (
          <li key={index} className="flex gap-2"><span aria-hidden="true" className="shrink-0 text-brand-700">{tip ? "✓" : "•"}</span><span><HighlightedText text={item} /></span></li>
        ))}
      </ul>
    </section>
  );
}

// `bare` drops the outer card (the embedded chat draws its own); `hideFollowUp` leaves the follow-up
// question to the clarify chip.
export default function StructuredReply({ data, language = "english", bare = false, hideFollowUp = false, contact = null }) {
  if (!data || data.type !== "medical") return null;
  const selectedLanguage = LABELS[language] ? language : "english";
  const labels = LABELS[selectedLanguage];
  const emergency = data.emergency || {};
  const levels = { emergency: 0, see_doctor_soon: 1, not_emergency: 2 };
  const levelIndex = levels[emergency.level];
  const direction = selectedLanguage === "urdu";

  if (bare) {
    return (
      <div dir={direction ? "rtl" : "ltr"} className={`w-full space-y-5 text-ink ${direction ? "text-right font-urdu leading-9" : "text-left"}`}>
        {levelIndex !== undefined && <Banner emergency={emergency} labels={labels} levelIndex={levelIndex} contact={contact} />}
        <CauseBars title={labels.causes} note={labels.estimate} items={data.possible_causes} />
        {data.condition && <p className="text-[16px] leading-6"><HighlightedText text={data.condition} /></p>}
        <BareList title={labels.symptoms} items={data.symptoms} />
        <BareList title={labels.tips} items={data.quick_tips} tip />
      </div>
    );
  }

  return (
    <div dir={direction ? "rtl" : "ltr"} className={`w-full space-y-2.5 ${bare ? "" : "rounded-xl border border-[#dce9e5] bg-[#f3f8f6] p-3"} text-[#24413c] ${direction ? "text-right" : "text-left"} ${direction ? "font-serif" : ""}`} style={direction ? { fontFamily: "'Noto Nastaliq Urdu', 'Noto Naskh Arabic', serif" } : undefined}>
      {levelIndex !== undefined && (
        <div className={`w-full rounded-lg border px-3 py-2 ${EMERGENCY_STYLES[emergency.level]}`}>
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide opacity-80">{labels.emergency}</p>
          <div className="flex items-center gap-2 text-[11px] font-bold">
            <span aria-hidden="true">{levelIndex === 0 ? "🚨" : levelIndex === 1 ? "⚠️" : "✓"}</span>
            <span>{labels.levels[levelIndex]}</span>
          </div>
          {emergency.reason && <p className="mt-1 text-[10px] leading-4"><HighlightedText text={emergency.reason} /></p>}
        </div>
      )}
      <ItemList title={labels.symptoms} items={data.symptoms} />
      {data.condition && <section><h4 className="mb-0.5 text-[10px] font-bold text-brand-800">{labels.condition}</h4><p className="text-[11px] leading-4"><HighlightedText text={data.condition} /></p></section>}
      <ItemList title={labels.causes} items={data.possible_causes} />
      <ItemList title={labels.tips} items={data.quick_tips} tip />
      {!hideFollowUp && data.follow_up_question && <p className="border-t border-[#dce9e5] pt-2 text-[11px] leading-4"><HighlightedText text={data.follow_up_question} /></p>}
    </div>
  );
}
