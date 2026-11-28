import Glyph from "./Glyph";

export default function NavButton({ active, onClick, icon, children }) {
  return <button onClick={onClick} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${active ? "bg-brand-tint text-brand-800" : "text-ink-muted hover:bg-surface"}`}><Glyph className="text-base">{icon}</Glyph>{children}</button>;
}
