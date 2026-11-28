// Real doctors and free slots from the hospital database. Step 4: when the portal can book (`bookingEnabled`), a slot or "Book now"
// sends a normal chat message ("Book Dr. X on 2026-11-30 at 10:30"); the chat then asks yes / no before anything is booked.
export const bookMessage = (doctor, slot) => `Book ${doctor.name} on ${doctor.date} at ${slot}`;
const initials = (name) => name.replace(/^dr\.?\s+/i, "").split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");

function dayLabel(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function DoctorCard({ t, doctor, bookingEnabled, busy, onBook }) {
  const first = doctor.slots[0];
  const detail = doctor.specialty || doctor.department;
  const live = bookingEnabled && !busy && typeof onBook === "function";
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-tint text-[14px] font-bold text-brand-800">{initials(doctor.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-ink">{doctor.name}</p>
          <p className="text-[14px] text-ink-soft">{detail}{first ? ` · ${t("nextSlot")} ${dayLabel(doctor.date)} ${first}` : ` · ${t("noSlots")}`}</p>
        </div>
        <button type="button" disabled={!live || !first} onClick={() => onBook(bookMessage(doctor, first))} title={bookingEnabled ? undefined : t("bookingSoon")}
          className={`shrink-0 rounded-xl bg-brand-700 px-5 py-3 text-[15px] font-bold text-white ${live && first ? "hover:bg-brand-800" : "cursor-not-allowed opacity-50"}`}>{t("bookNow")}</button>
      </div>
      {doctor.slots.length > 0 && (
        <div className="mt-3 border-t border-divider pt-3">
          <p className="mb-2 text-[14px] text-ink-soft">{t("slotsOn")} {dayLabel(doctor.date)}{doctor.room ? ` · ${doctor.room}` : ""}</p>
          <div className="flex flex-wrap gap-2">
            {doctor.slots.map((slot) => (
              <button key={slot} type="button" disabled={!live} onClick={() => onBook(bookMessage(doctor, slot))} title={bookingEnabled ? undefined : t("bookingSoon")}
                className={`rounded-xl border border-brand-700 px-4 py-2 text-[15px] font-bold text-brand-800 ${live ? "hover:bg-brand-tint" : "cursor-not-allowed opacity-50"}`}>{slot}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DoctorCards({ t, heading, doctors, bookingEnabled = false, busy = false, onBook }) {
  return (
    <div className="space-y-3">
      {heading && <p dir="auto" className="text-[16px] text-ink">{heading}</p>}
      {doctors.map((doctor) => <DoctorCard key={doctor.id} t={t} doctor={doctor} bookingEnabled={bookingEnabled} busy={busy} onBook={onBook} />)}
      {!bookingEnabled && <p className="text-[13px] text-ink-soft">{t("bookingSoon")}</p>}
    </div>
  );
}

export function HospitalCard({ t, heading, hospital }) {
  const rows = [["address", hospital.address], ["phone", hospital.phone], ["emergency", hospital.emergency_number], ["hours", hospital.open_hours], ["email", hospital.email]].filter(([, value]) => value);
  return (
    <div className="space-y-3">
      {heading && <p dir="auto" className="text-[16px] text-ink">{heading}</p>}
      <div className="rounded-2xl border border-line bg-white p-4">
        <p className="mb-2 text-[16px] font-bold text-ink">{hospital.name}</p>
        <dl className="space-y-1 text-[15px]">
          {rows.map(([key, value]) => (
            <div key={key} className="flex gap-3"><dt className="w-24 shrink-0 text-ink-soft">{t(`hospital_${key}`)}</dt><dd className="min-w-0 break-words text-ink"><bdi>{value}</bdi></dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}

// Outcome of a booking / move, as the portal recorded it (the token comes from the portal, not from the assistant).
export function AppointmentCard({ t, heading, appointment }) {
  const rows = [["apptDoctor", appointment.doctor_name], ["apptDepartment", appointment.department], ["apptDate", dayLabel(appointment.date)], ["apptTime", appointment.time], ["apptRoom", appointment.room], ["apptBooking", appointment.booking_no]].filter(([, value]) => value);
  return (
    <div className="space-y-3">
      {heading && <p dir="auto" className="text-[16px] font-bold text-ink">{heading}</p>}
      <div className="rounded-2xl border border-line bg-white p-4">
        {appointment.token_no && (
          <div className="mb-3 flex items-center justify-between rounded-xl bg-brand-tint px-4 py-3">
            <span className="text-[14px] text-brand-800">{t("apptToken")}</span>
            <span data-testid="appointment-token" className="text-[22px] font-bold tracking-wide text-brand-800"><bdi>{appointment.token_no}</bdi></span>
          </div>
        )}
        <dl className="space-y-1 text-[15px]">
          {rows.map(([key, value]) => (
            <div key={key} className="flex gap-3"><dt className="w-28 shrink-0 text-ink-soft">{t(key)}</dt><dd className="min-w-0 break-words text-ink"><bdi>{value}</bdi></dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}
