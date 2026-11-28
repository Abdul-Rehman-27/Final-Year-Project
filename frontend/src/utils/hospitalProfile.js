const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE = /^[0-9+()\s-]{3,50}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Same rules as the backend (PUT /admin/hospital-profile). Returns { field: i18nKeySuffix } for every invalid field. */
export function validateHospitalProfile(v) {
  const e = {};
  const name = (v.name || "").trim();
  if (name.length < 2 || name.length > 100) e.name = "name";
  if (v.phone && !PHONE.test(v.phone)) e.phone = "phone";
  if (v.emergencyNumber && !PHONE.test(v.emergencyNumber)) e.emergencyNumber = "phone";
  if (v.email && !EMAIL.test(v.email)) e.email = "email";
  if (!v.open24Hours) {
    if (!HHMM.test(v.opensAt || "") || !HHMM.test(v.closesAt || "")) e.hours = "hoursRequired";
    else if (v.opensAt >= v.closesAt) e.hours = "hoursOrder";
  }
  const lo = v.labOpensAt || "", lc = v.labClosesAt || "";
  if (!!lo !== !!lc) e.labHours = "labBoth";
  else if (lo && (!HHMM.test(lo) || !HHMM.test(lc))) e.labHours = "labBoth";
  return e;
}

/** Form values -> request body (empty strings stay empty; lab hours null when unset). */
export function toRequest(v) {
  return {
    name: v.name.trim(), address: (v.address || "").trim(), phone: (v.phone || "").trim(), email: (v.email || "").trim(),
    emergencyNumber: (v.emergencyNumber || "").trim(), open24Hours: !!v.open24Hours,
    opensAt: v.open24Hours ? null : v.opensAt, closesAt: v.open24Hours ? null : v.closesAt,
    labOpensAt: v.labOpensAt || null, labClosesAt: v.labClosesAt || null,
  };
}
