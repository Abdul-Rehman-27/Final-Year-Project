"""Read-only connector to the CityHospital database (step 3): doctors, free slots and hospital info.

It reads the portal tables by SQL and never writes. The schedule and slot rules below are COPIED from the portal
(`backend/app/services/availability.py` -> `Avail`, `backend/app/services/patient_portal.py` -> `bookable_doctors`,
`day_slot_details`, `too_far`). If those rules change in the portal, change them here too.
"""
from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine, text

from app.core import settings

KARACHI = ZoneInfo("Asia/Karachi")
ACTIVE = ("pending", "confirmed")
MAX_ADVANCE_DAYS = 30
DEFAULT_SLOT_MINUTES = 30


def mins(value: str) -> int:
    return int(value[:2]) * 60 + int(value[3:])


def hhmm(total: int) -> str:
    return f"{total // 60:02d}:{total % 60:02d}"


def as_json(value, default):
    if value is None:
        return default
    if isinstance(value, str):
        try:
            return json.loads(value)
        except ValueError:
            return default
    return value


def as_utc(value) -> datetime | None:
    """Database timestamps come back as datetimes (Postgres) or text (SQLite); a value without a zone is UTC."""
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00").replace(" ", "T"))
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class Avail:
    """Same model as the portal: weekly template per weekday plus date exceptions (leave / custom_hours / extra_session)."""

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
        sessions, breaks, _ = self.day(d)
        out = []
        for s in sessions:
            m, cur, end = s["slot_minutes"], mins(s["start_time"]), mins(s["end_time"])
            while cur + m <= end:
                if not any(cur < mins(b["end_time"]) and mins(b["start_time"]) < cur + m for b in breaks):
                    out.append({"time": hhmm(cur), "slot_minutes": m, "room_label": s.get("room_label", "")})
                cur += m
        return out

    def session_at(self, d: date, start_min: int):
        for s in self.day(d)[0]:
            if mins(s["start_time"]) <= start_min < mins(s["end_time"]):
                return s
        return None


def row_sessions(row: dict) -> list[dict]:
    if not row.get("is_active"):
        return []
    sessions = as_json(row.get("sessions_json"), None)
    if sessions is not None:
        return list(sessions)
    if row.get("start_time") and row.get("end_time"):   # legacy single-window row
        return [{"start_time": row["start_time"], "end_time": row["end_time"], "slot_minutes": row.get("slot_minutes") or 15, "room_label": row.get("room_label") or ""}]
    return []


class HospitalConnector:
    def __init__(self, url: str | None = None, now=None):
        self.url = url if url is not None else (settings.HOSPITAL_DATABASE_URL or settings.SUMMARIZER_DATABASE_URL or settings.MEDICAL_ASSISTANT_DATABASE_URL)
        self._now = now          # tests pass a fixed clock
        self._engine = None

    @property
    def configured(self) -> bool:
        return bool(self.url)

    def now(self) -> datetime:
        return self._now() if self._now else datetime.now(timezone.utc)

    def _rows(self, sql: str, **params) -> list[dict]:
        if self._engine is None:
            self._engine = create_engine(self.url)
        with self._engine.connect() as connection:
            return [dict(row) for row in connection.execute(text(sql), params).mappings().all()]

    # ---- hospital info
    def hospital(self) -> dict | None:
        rows = self._rows("SELECT name, address, phone, email, open_hours, emergency_number FROM portal_hospital_settings WHERE id = 1")
        if not rows:
            return None
        row = rows[0]
        return {key: (row.get(key) or "") for key in ("name", "address", "phone", "email", "open_hours", "emergency_number")}

    # ---- doctors
    def doctors(self) -> list[dict]:
        """Active doctors with a department and at least one active schedule day (or an upcoming extra date)."""
        today = self.now().astimezone(KARACHI).date().isoformat()
        scheduled = {row["doctor_id"] for row in self._rows("SELECT doctor_id FROM portal_doctor_schedules WHERE is_active = :on", on=True)}
        scheduled |= {row["doctor_id"] for row in self._rows("SELECT doctor_id FROM portal_schedule_exceptions WHERE day >= :today AND kind != 'leave'", today=today)}
        rows = self._rows(
            "SELECT u.id, u.full_name, d.id AS department_id, d.name AS department, s.specialty "
            "FROM users u JOIN admin_staff_profiles s ON s.user_id = u.id JOIN admin_departments d ON d.id = s.department_id "
            "WHERE u.role = 'doctor' AND u.is_active = :on ORDER BY u.full_name", on=True)
        return [{"id": row["id"], "name": row["full_name"], "department": row["department"], "specialty": row["specialty"] or ""} for row in rows if row["id"] in scheduled]

    def _availability(self, doctor_id: int) -> Avail:
        templates = {row["weekday"]: (row_sessions(row), as_json(row.get("breaks_json"), []) if row.get("is_active") else [])
                     for row in self._rows("SELECT weekday, is_active, start_time, end_time, slot_minutes, room_label, sessions_json, breaks_json FROM portal_doctor_schedules WHERE doctor_id = :id", id=doctor_id)}
        exceptions = {}
        for row in self._rows("SELECT day, kind, sessions_json, breaks_json FROM portal_schedule_exceptions WHERE doctor_id = :id", id=doctor_id):
            day = row["day"] if isinstance(row["day"], date) and not isinstance(row["day"], datetime) else date.fromisoformat(str(row["day"])[:10])
            exceptions[day] = (row["kind"], as_json(row["sessions_json"], []), as_json(row["breaks_json"], []))
        return Avail(templates, exceptions)

    def slots(self, doctor_id: int, day: date, patient_id: int | None = None, ignore_appointment_id: int | None = None) -> list[dict]:
        """Free slots [{time, slot_minutes, room_label}] for one day: not past, not booked, inside the booking window.
        `ignore_appointment_id` = the patient's own appointment being rescheduled (it must not block its own new time)."""
        now = self.now()
        if day > now.astimezone(KARACHI).date() + timedelta(days=MAX_ADVANCE_DAYS):
            return []
        avail = self._availability(doctor_id)
        grid = avail.grid(day)
        if not grid:
            return []
        lo = datetime.combine(day, time(0, 0), tzinfo=KARACHI).astimezone(timezone.utc)
        hi = lo + timedelta(days=1)

        def minutes_of(row) -> int:
            if row.get("duration_minutes"):
                return row["duration_minutes"]
            local = as_utc(row["starts_at"]).astimezone(KARACHI)
            session = avail.session_at(local.date(), local.hour * 60 + local.minute)
            return session["slot_minutes"] if session else DEFAULT_SLOT_MINUTES

        placeholders = ", ".join(f"'{status}'" for status in ACTIVE)
        busy = []
        for row in self._rows(f"SELECT id, starts_at, duration_minutes FROM portal_appointments WHERE doctor_id = :id AND status IN ({placeholders})", id=doctor_id):
            if row["id"] == ignore_appointment_id:
                continue
            start = as_utc(row["starts_at"])
            if lo - timedelta(hours=3) <= start < hi:
                busy.append((start, start + timedelta(minutes=minutes_of(row))))
        mine = []
        if patient_id is not None:
            for row in self._rows(f"SELECT id, doctor_id, starts_at, duration_minutes FROM portal_appointments WHERE patient_id = :id AND status IN ({placeholders})", id=patient_id):
                if row["id"] == ignore_appointment_id:
                    continue
                start = as_utc(row["starts_at"])
                other = avail if row["doctor_id"] == doctor_id else self._availability(row["doctor_id"])
                local = start.astimezone(KARACHI)
                length = row.get("duration_minutes") or (other.session_at(local.date(), local.hour * 60 + local.minute) or {}).get("slot_minutes", DEFAULT_SLOT_MINUTES)
                mine.append((start, start + timedelta(minutes=length)))
        out = []
        for slot in grid:
            start = datetime.combine(day, time(int(slot["time"][:2]), int(slot["time"][3:])), tzinfo=KARACHI).astimezone(timezone.utc)
            end = start + timedelta(minutes=slot["slot_minutes"])
            if start <= now or any(start < b_end and b_start < end for b_start, b_end in busy + mine):
                continue
            out.append(slot)
        return out

    def next_slots(self, doctor_id: int, patient_id: int | None = None, start_day: date | None = None, ignore_appointment_id: int | None = None) -> dict | None:
        """First day (from start_day, within the booking window) that has a free slot: {date, slots}."""
        first = start_day or self.now().astimezone(KARACHI).date()
        for offset in range(MAX_ADVANCE_DAYS + 1):
            day = first + timedelta(days=offset)
            found = self.slots(doctor_id, day, patient_id, ignore_appointment_id)
            if found:
                return {"date": day.isoformat(), "slots": found}
        return None

    def appointments(self, patient_id: int) -> list[dict]:
        """The patient's own appointments they may still change or cancel (step 4).
        Same rule as the portal `editable()`: active, still scheduled, not checked in; and not on a day before today."""
        placeholders = ", ".join(f"'{status}'" for status in ACTIVE)
        today = self.now().astimezone(KARACHI).date()
        rows = self._rows(
            "SELECT a.id, a.doctor_id, a.starts_at, a.token_no, a.booking_no, a.room_label, a.visit_status, a.checked_in_at, u.full_name AS doctor_name "
            f"FROM portal_appointments a JOIN users u ON u.id = a.doctor_id WHERE a.patient_id = :id AND a.status IN ({placeholders})", id=patient_id)
        out = []
        for row in rows:
            if (row.get("visit_status") or "scheduled") != "scheduled" or row.get("checked_in_at"):
                continue
            local = as_utc(row["starts_at"]).astimezone(KARACHI)
            if local.date() < today:
                continue
            out.append({"id": row["id"], "doctor_id": row["doctor_id"], "doctor_name": row["doctor_name"], "date": local.date().isoformat(),
                        "time": local.strftime("%H:%M"), "token_no": row.get("token_no") or "", "booking_no": row.get("booking_no") or "", "room": row.get("room_label") or ""})
        return sorted(out, key=lambda item: (item["date"], item["time"]))
