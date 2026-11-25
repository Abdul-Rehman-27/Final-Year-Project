import { useState } from "react";
import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { errorText, LoadState } from "../../components/doctor/DoctorCommon.jsx";
import useDoctorSchedule from "../../hooks/useDoctorSchedule.js";
import { expandWindow, validateDay } from "../../utils/schedule.js";
import { fill } from "../../utils/format.js";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function DoctorAvailability() {
  const { t } = useLanguage();
  const schedule = useDoctorSchedule();
  const [notice, setNotice] = useState(null);
  const errors = schedule.days.map(validateDay);
  const invalid = errors.some(Boolean);

  const updateDay = (index, key, value) => {
    schedule.setDays((current) => current.map((day, dayIndex) => (
      dayIndex === index ? { ...day, [key]: value } : day
    )));
    setNotice(null);
  };

  const toggleDay = (index, enabled) => {
    if (!enabled) {
      schedule.setDays((current) => current.map((day, dayIndex) => dayIndex === index
        ? { ...day, is_active: false, start_time: null, end_time: null, slot_minutes: 15, room_label: "" }
        : day));
    } else {
      const previousActive = [...schedule.days].reverse().find((day) => day.is_active);
      schedule.setDays((current) => current.map((day, dayIndex) => dayIndex === index
        ? { ...day, is_active: true, start_time: "09:00", end_time: "13:00", slot_minutes: 15, room_label: previousActive?.room_label || "" }
        : day));
    }
    setNotice(null);
  };

  const save = async () => {
    setNotice(null);
    try {
      await schedule.save();
      setNotice({ type: "success", text: t("doctor.availability.saved") });
    } catch (err) {
      setNotice({ type: "error", text: errorText(t, err) });
    }
  };

  return (
    <LoadState loading={schedule.loading} error={schedule.error} onRetry={schedule.reload}>
      <PageHeader
        showLanguage
        title={t("doctor.availability.title")}
        subtitle={t("doctor.availability.subtitle")}
      />
      {notice && <div className="mb-4"><Alert type={notice.type}>{notice.text}</Alert></div>}

      <Card className="overflow-hidden p-5">
        <h2 className="text-2xl font-black">{t("doctor.availability.weekly")}</h2>
        <p className="mb-5 mt-1 text-ink-muted">{t("doctor.availability.help")}</p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-start">
            <thead>
              <tr className="border-b border-line text-xs font-bold uppercase tracking-[.08em] text-ink-muted">
                <th scope="col" className="px-2 py-3" aria-label={t("doctor.availability.active")} />
                {["day", "start", "end", "slot", "room", "bookable"].map((key) => (
                  <th key={key} scope="col" className="px-2 py-3 text-start">{t(`doctor.availability.${key}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedule.days.map((day, index) => {
                const weekday = WEEKDAYS[day.weekday];
                const dayName = t(`doctor.days.long.${weekday}`);
                const slots = day.is_active ? expandWindow(day.start_time, day.end_time, day.slot_minutes) : [];
                const visibleSlots = slots.slice(0, 3).join(" · ") + (slots.length > 3 ? " …" : "");
                return (
                  <tr key={day.weekday} className="border-b border-line last:border-0">
                    <td className="p-2 align-middle">
                      <input
                        type="checkbox"
                        aria-label={fill(t("doctor.availability.toggleDay"), { day: dayName })}
                        checked={day.is_active}
                        onChange={(event) => toggleDay(index, event.target.checked)}
                        className="h-[22px] w-[22px] accent-brand-700"
                      />
                    </td>
                    <th scope="row" className="p-2 text-start font-bold">{dayName}</th>
                    <td className="p-2">
                      <input
                        type="time"
                        aria-label={fill(t("doctor.availability.fromDay"), { day: dayName })}
                        disabled={!day.is_active}
                        value={day.is_active ? day.start_time || "" : ""}
                        onChange={(event) => updateDay(index, "start_time", event.target.value || null)}
                        className="w-full rounded-xl border border-line bg-white p-3 disabled:bg-gray-50"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="time"
                        aria-label={fill(t("doctor.availability.toDay"), { day: dayName })}
                        aria-invalid={errors[index] === "doctor.availability.endAfterStart" || errors[index] === "doctor.availability.slotDoesNotFit"}
                        disabled={!day.is_active}
                        value={day.is_active ? day.end_time || "" : ""}
                        onChange={(event) => updateDay(index, "end_time", event.target.value || null)}
                        className="w-full rounded-xl border border-line bg-white p-3 disabled:bg-gray-50"
                      />
                      {errors[index] === "doctor.availability.endAfterStart" && (
                        <p className="mt-1 text-xs text-red-700">{t(errors[index])}</p>
                      )}
                      {errors[index] === "doctor.availability.slotDoesNotFit" && (
                        <p className="mt-1 text-xs text-red-700">{t(errors[index])}</p>
                      )}
                    </td>
                    <td className="p-2">
                      <select
                        aria-label={fill(t("doctor.availability.slotForDay"), { day: dayName })}
                        disabled={!day.is_active}
                        value={day.slot_minutes}
                        onChange={(event) => updateDay(index, "slot_minutes", Number(event.target.value))}
                        className="w-full rounded-xl border border-line bg-white p-3 disabled:bg-gray-50"
                      >
                        {[15, 30, 45].map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {fill(t("doctor.availability.slotOption"), { minutes })}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        aria-label={fill(t("doctor.availability.roomForDay"), { day: dayName })}
                        aria-invalid={errors[index] === "doctor.availability.roomTooLong"}
                        disabled={!day.is_active}
                        maxLength={40}
                        value={day.is_active ? day.room_label || "" : ""}
                        onChange={(event) => updateDay(index, "room_label", event.target.value)}
                        className="w-full rounded-xl border border-line bg-white p-3 disabled:bg-gray-50"
                      />
                      {errors[index] === "doctor.availability.roomTooLong" && (
                        <p className="mt-1 text-xs text-red-700">{t(errors[index])}</p>
                      )}
                    </td>
                    <td className="p-2 text-ink-muted" title={slots.join(" · ")}>
                      {day.is_active ? visibleSlots : t("doctor.availability.notWorking")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <Button fullWidth={false} variant="secondary" onClick={schedule.reload}>
            {t("doctor.availability.reset")}
          </Button>
          <Button fullWidth={false} disabled={!schedule.dirty || invalid} loading={schedule.saving} onClick={save}>
            {t("doctor.availability.save")}
          </Button>
        </div>
      </Card>
    </LoadState>
  );
}
