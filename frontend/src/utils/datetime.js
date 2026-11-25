const locale = (lang) => lang === "ur" ? "ur-PK-u-nu-latn" : "en-GB";
function parts(iso, lang, tz, options) { return new Intl.DateTimeFormat(locale(lang), { timeZone: tz || "Asia/Karachi", hourCycle: "h23", ...options }).formatToParts(new Date(iso)); }
function val(p, type) { return p.find((x) => x.type === type)?.value || ""; }
export function formatShort(iso, lang = "en", tz) { const p=parts(iso,lang,tz,{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}); return `${val(p,"weekday")} ${val(p,"day")} ${val(p,"month")} · ${val(p,"hour")}:${val(p,"minute")}`; }
export function formatTime(iso, tz) { const p=parts(iso,"en",tz,{hour:"2-digit",minute:"2-digit"}); return `${val(p,"hour")}:${val(p,"minute")}`; }
export function formatDate(iso, lang="en", tz) { const p=parts(iso,lang,tz,{day:"2-digit",month:"short",year:"numeric"}); return `${val(p,"day")} ${val(p,"month")} ${val(p,"year")}`; }
export function formatDay(iso, lang="en", tz) { const p=parts(iso,lang,tz,{weekday:"long",day:"2-digit",month:"long"}); return `${val(p,"weekday")}, ${val(p,"day")} ${val(p,"month")}`; }
export function mmss(ms) { const s=Math.max(0,Math.ceil(ms/1000)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }
export function dayPart(nowMs, tz="Asia/Karachi") { const hour=Number(val(parts(nowMs,"en",tz,{hour:"2-digit"}),"hour")); return hour<12?"morning":hour<17?"afternoon":"evening"; }
