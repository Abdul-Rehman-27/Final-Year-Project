"""Doctor availability engine (P5c).

Layer 1  weekly template   : per weekday, up to MAX_SESSIONS sessions (start, end, slot_minutes, room) + breaks.
Layer 2  date exceptions   : leave | custom_hours (replaces template) | extra_session (adds to template). Exceptions win.
Layer 3  appointment guard : any change is checked against future appointments; if one would no longer fit,
                             the change is refused (callers answer 409 + the list). Appointments are never touched here.

Pure functions work on plain dicts so a *hypothetical* availability can be compared with the current one.
Slot grid rule (per session): starts = start, start+m, ... while slot_end <= session end; a slot whose interval
overlaps a break is dropped. Gaps between sessions produce no slots at all.
"""
import re
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.portal import PortalAppointment, PortalDoctorSchedule, PortalScheduleException
from app.services.portal_core import KARACHI, as_utc, utcnow

HHMM = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
SLOT_CHOICES = (15, 30, 45)
MAX_SESSIONS = 4
MAX_BREAKS = 10            # sanity cap per day
MAX_LEAVE_RANGE_DAYS = 366  # sanity cap for one leave-range request
KINDS = ("leave", "custom_hours", "extra_session")
ACTIVE = ("pending", "confirmed")
DEFAULT_SLOT_MINUTES = 30


class ScheduleInvalid(Exception):
    """Raised by validators; routes turn it into 422 SCHEDULE_INVALID."""


def mins(t: str) -> int:
    return int(t[:2]) * 60 + int(t[3:])


def hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


# ---------------------------------------------------------------- validation
def clean_sessions(raw, *, allow_empty=False) -> list[dict]:
    if not isinstance(raw, list) or len(raw) > MAX_SESSIONS or (not raw and not allow_empty):
        raise ScheduleInvalid("sessions")
    out = []
    for s in raw:
        if not isinstance(s, dict):
            raise ScheduleInvalid("session")
        st, en, slot, room = s.get("start_time"), s.get("end_time"), s.get("slot_minutes"), s.get("room_label", "")
        if (not isinstance(st, str) or not isinstance(en, str) or not HHMM.fullmatch(st) or not HHMM.fullmatch(en)
                or type(slot) is not int or slot not in SLOT_CHOICES or not isinstance(room, str) or len(room) > 40):
            raise ScheduleInvalid("session fields")
        if mins(st) >= mins(en) or mins(en) - mins(st) < slot:
            raise ScheduleInvalid("session range")
        out.append({"start_time": st, "end_time": en, "slot_minutes": slot, "room_label": room})
    out.sort(key=lambda x: mins(x["start_time"]))
    for a, b in zip(out, out[1:]):
        if mins(b["start_time"]) < mins(a["end_time"]):
            raise ScheduleInvalid("sessions overlap")
    return out


def clean_breaks(raw, sessions: list[dict]) -> list[dict]:
    """Breaks must each lie fully inside one session and must not overlap each other."""
    if raw is None:
        raw = []
    if not isinstance(raw, list) or len(raw) > MAX_BREAKS:
        raise ScheduleInvalid("breaks")
    out = []
    for b in raw:
        if not isinstance(b, dict):
            raise ScheduleInvalid("break")
        st, en = b.get("start_time"), b.get("end_time")
        if not isinstance(st, str) or not isinstance(en, str) or not HHMM.fullmatch(st) or not HHMM.fullmatch(en) or mins(st) >= mins(en):
            raise ScheduleInvalid("break fields")
        if not any(mins(s["start_time"]) <= mins(st) and mins(en) <= mins(s["end_time"]) for s in sessions):
            raise ScheduleInvalid("break outside session")
        out.append({"start_time": st, "end_time": en})
    out.sort(key=lambda x: mins(x["start_time"]))
    for a, b in zip(out, out[1:]):
        if mins(b["start_time"]) < mins(a["end_time"]):
            raise ScheduleInvalid("breaks overlap")
    return out


# ---------------------------------------------------------------- model of one doctor's availability
def row_sessions(row: PortalDoctorSchedule | None) -> list[dict]:
    if row is None or not row.is_active:
        return []
    if row.sessions_json is not None:
        return list(row.sessions_json)
    if row.start_time and row.end_time:      # legacy single-window row
        return [{"start_time": row.start_time, "end_time": row.end_time,
                 "slot_minutes": row.slot_minutes or 15, "room_label": row.room_label or ""}]
    return []


def row_breaks(row: PortalDoctorSchedule | None) -> list[dict]:
    return list(row.breaks_json) if row is not None and row.is_active and row.breaks_json else []


class Avail:
    """templates: {weekday: (sessions, breaks)}; exceptions: {date: (kind, sessions, breaks)}."""

    def __init__(self, templates: dict, exceptions: dict):
        self.templates, self.exceptions = templates, exceptions

    def day(self, d: date):
        sessions, breaks = self.templates.get(d.weekday(), ([], []))
        exc = self.exceptions.get(d)
        if exc:
            kind, es, eb = exc
            if kind == "leave":
                return [], [], "leave"
            if kind == "custom_hours":
                return list(es), list(eb), "custom_hours"
            if kind == "extra_session":
                return sorted(list(sessions) + list(es), key=lambda x: mins(x["start_time"])), list(breaks) + list(eb), "extra_session"
        return list(sessions), list(breaks), "template"

    def grid(self, d: date) -> list[dict]:
        """Every bookable slot of the day (before removing booked/past ones)."""
        sessions, breaks, _ = self.day(d)
        out = []
        for s in sessions:
            m, cur, end = s["slot_minutes"], mins(s["start_time"]), mins(s["end_time"])
            while cur + m <= end:
                if not any(cur < mins(b["end_time"]) and mins(b["start_time"]) < cur + m for b in breaks):
                    out.append({"time": hhmm(cur), "slot_minutes": m, "room_label": s["room_label"]})
                cur += m
        return out

    def fits(self, d: date, start_min: int, length: int) -> bool:
        """True if [start, start+length) lies inside one session and touches no break."""
        sessions, breaks, _ = self.day(d)
        end = start_min + length
        return (any(mins(s["start_time"]) <= start_min and end <= mins(s["end_time"]) for s in sessions)
                and not any(start_min < mins(b["end_time"]) and mins(b["start_time"]) < end for b in breaks))

    def session_at(self, d: date, start_min: int):
        for s in self.day(d)[0]:
            if mins(s["start_time"]) <= start_min < mins(s["end_time"]):
                return s
        return None


def load(db: Session, doctor_id: int) -> Avail:
    templates = {r.weekday: (row_sessions(r), row_breaks(r)) for r in db.scalars(
        select(PortalDoctorSchedule).where(PortalDoctorSchedule.doctor_id == doctor_id)).all()}
    exceptions = {e.day: (e.kind, e.sessions_json or [], e.breaks_json or []) for e in db.scalars(
        select(PortalScheduleException).where(PortalScheduleException.doctor_id == doctor_id)).all()}
    return Avail(templates, exceptions)


def with_templates(av: Avail, templates: dict) -> Avail:
    return Avail(dict(templates), dict(av.exceptions))


def with_exception(av: Avail, d: date, value) -> Avail:
    ex = dict(av.exceptions)
    if value is None:
        ex.pop(d, None)
    else:
        ex[d] = value
    return Avail(dict(av.templates), ex)


def validate_exception(av: Avail, d: date, kind: str, sessions: list[dict], breaks: list[dict]):
    """Check the combined result of an exception (e.g. extra session + template sessions) and return the stored tuple."""
    if kind not in KINDS:
        raise ScheduleInvalid("kind")
    if kind == "leave":
        if sessions or breaks:
            raise ScheduleInvalid("leave takes no sessions")
        return ("leave", [], [])
    if not sessions:
        raise ScheduleInvalid("sessions required")
    probe = with_exception(av, d, (kind, sessions, breaks))
    comb_s, comb_b, _ = probe.day(d)
    if len(comb_s) > MAX_SESSIONS:
        raise ScheduleInvalid("too many sessions")
    for a, b in zip(comb_s, comb_s[1:]):
        if mins(b["start_time"]) < mins(a["end_time"]):
            raise ScheduleInvalid("sessions overlap")
    clean_breaks(comb_b, comb_s)
    return (kind, sessions, breaks)


# ---------------------------------------------------------------- appointments vs availability
def local_parts(dt: datetime):
    loc = as_utc(dt).astimezone(KARACHI)
    return loc.date(), loc.hour * 60 + loc.minute


def appointment_minutes(av: Avail, a: PortalAppointment) -> int:
    """Stored duration, else the slot size of the session the visit starts in, else DEFAULT_SLOT_MINUTES."""
    if a.duration_minutes:
        return a.duration_minutes
    d, m = local_parts(a.starts_at)
    s = av.session_at(d, m)
    return s["slot_minutes"] if s else DEFAULT_SLOT_MINUTES


def future_active(db: Session, doctor_id: int, from_day: date | None = None, to_day: date | None = None):
    """Appointments availability must protect: active, still `scheduled` (not started / checked in), in the future."""
    rows = db.scalars(select(PortalAppointment).where(
        PortalAppointment.doctor_id == doctor_id, PortalAppointment.status.in_(ACTIVE),
        PortalAppointment.visit_status == "scheduled", PortalAppointment.starts_at > utcnow())).all()
    out = []
    for a in rows:
        d, _ = local_parts(a.starts_at)
        if (from_day is None or d >= from_day) and (to_day is None or d <= to_day):
            out.append(a)
    return sorted(out, key=lambda x: as_utc(x.starts_at))


def newly_invalidated(db: Session, doctor_id: int, old: Avail, new: Avail, from_day=None, to_day=None) -> list[PortalAppointment]:
    """Appointments that fit `old` but would no longer fit `new` (not inside a session, or touching a break)."""
    bad = []
    for a in future_active(db, doctor_id, from_day, to_day):
        d, m = local_parts(a.starts_at)
        length = appointment_minutes(old, a)
        if old.fits(d, m, length) and not new.fits(d, m, length):
            bad.append(a)
    return bad


# ---------------------------------------------------------------- serialisation
def template_rows(db: Session, doctor_id: int) -> list[dict]:
    """schedule_day x7 (Monday first). Legacy fields = first session (backward compatible); `sessions`/`breaks` are additive."""
    saved = {r.weekday: r for r in db.scalars(select(PortalDoctorSchedule).where(PortalDoctorSchedule.doctor_id == doctor_id)).all()}
    rows = []
    for i in range(7):
        sessions, breaks = row_sessions(saved.get(i)), row_breaks(saved.get(i))
        first = sessions[0] if sessions else None
        rows.append({"weekday": i, "is_active": bool(sessions),
                     "start_time": first["start_time"] if first else None, "end_time": first["end_time"] if first else None,
                     "slot_minutes": first["slot_minutes"] if first else 15, "room_label": first["room_label"] if first else "",
                     "sessions": sessions, "breaks": breaks})
    return rows


def exception_dict(e: PortalScheduleException) -> dict:
    return {"date": e.day.isoformat(), "kind": e.kind, "sessions": e.sessions_json or [], "breaks": e.breaks_json or [], "note": e.note or ""}
