const LABELS = {
  english: {
    symptoms: "Symptoms",
    condition: "Condition",
    causes: "Possible causes",
    tips: "Quick tips",
    emergency: "Emergency check",
    levels: ["EMERGENCY - seek care now", "See a doctor soon", "Not an emergency right now"],
  },
  urdu: {
    symptoms: "علامات",
    condition: "حالت",
    causes: "ممکنہ وجوہات",
    tips: "فوری مشورے",
    emergency: "ایمرجنسی کی جانچ",
    levels: ["ایمرجنسی - فوراً طبی مدد لیں", "جلد ڈاکٹر کو دکھائیں", "فی الحال ایمرجنسی نہیں"],
  },
  roman: {
    symptoms: "Alamaat",
    condition: "Halat",
    causes: "Mumkin wajohaat",
    tips: "Fori mashwaray",
    emergency: "Emergency check",
    levels: ["EMERGENCY - foran madad lein", "Jald doctor ko dikhayen", "Filhal emergency nahi"],
  },
};

const EMERGENCY_STYLES = {
  emergency: "border-red-300 bg-red-100 text-red-950",
  see_doctor_soon: "border-amber-300 bg-amber-100 text-amber-950",
  not_emergency: "border-emerald-300 bg-emerald-100 text-emerald-950",
};

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
            <span><HighlightedText text={item} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function StructuredReply({ data, language = "english" }) {
  if (!data || data.type !== "medical") return null;
  const selectedLanguage = LABELS[language] ? language : "english";
  const labels = LABELS[selectedLanguage];
  const emergency = data.emergency || {};
  const levels = { emergency: 0, see_doctor_soon: 1, not_emergency: 2 };
  const levelIndex = levels[emergency.level];
  const direction = selectedLanguage === "urdu";

  return (
    <div dir={direction ? "rtl" : "ltr"} className={`w-full space-y-2.5 rounded-xl border border-[#dce9e5] bg-[#f3f8f6] p-3 text-[#24413c] ${direction ? "text-right" : "text-left"} ${direction ? "font-serif" : ""}`} style={direction ? { fontFamily: "'Noto Nastaliq Urdu', 'Noto Naskh Arabic', serif" } : undefined}>
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
      {data.follow_up_question && <p className="border-t border-[#dce9e5] pt-2 text-[11px] leading-4"><HighlightedText text={data.follow_up_question} /></p>}
    </div>
  );
}
