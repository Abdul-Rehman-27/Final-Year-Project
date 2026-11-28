import test from "node:test";
import assert from "node:assert/strict";
import { validateHospitalProfile, toRequest } from "../src/utils/hospitalProfile.js";
import en from "../src/i18n/en.js";
import ur from "../src/i18n/ur.js";

const ok = { name: "City Hospital", phone: "+92 21 111", email: "a@b.co", emergencyNumber: "1122", open24Hours: true };

test("valid profile passes; invalid fields are reported", () => {
  assert.deepEqual(validateHospitalProfile(ok), {});
  assert.equal(validateHospitalProfile({ ...ok, name: "A" }).name, "name");
  assert.equal(validateHospitalProfile({ ...ok, phone: "abc" }).phone, "phone");
  assert.equal(validateHospitalProfile({ ...ok, email: "nope" }).email, "email");
});
test("hours rules mirror the backend", () => {
  assert.equal(validateHospitalProfile({ ...ok, open24Hours: false }).hours, "hoursRequired");
  assert.equal(validateHospitalProfile({ ...ok, open24Hours: false, opensAt: "20:00", closesAt: "08:00" }).hours, "hoursOrder");
  assert.deepEqual(validateHospitalProfile({ ...ok, open24Hours: false, opensAt: "08:00", closesAt: "20:00" }), {});
  assert.equal(validateHospitalProfile({ ...ok, labOpensAt: "08:00" }).labHours, "labBoth");
});
test("request body clears hours when open 24h and nulls empty lab hours", () => {
  const b = toRequest({ ...ok, address: "", opensAt: "08:00", closesAt: "20:00", labOpensAt: "", labClosesAt: "" });
  assert.equal(b.opensAt, null); assert.equal(b.labOpensAt, null); assert.equal(b.emergencyNumber, "1122");
});
test("English and Urdu have the same hospital-profile keys", () => {
  const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
  assert.deepEqual(keys(ur.admin.hospital), keys(en.admin.hospital));
  assert.ok(en.admin.nav.hospitalProfile && ur.admin.nav.hospitalProfile);
});
