import { INITIAL_STAFF } from "../data/mockStaff.js";

/**
 * MOCK staff service (data lives in memory and resets on page refresh).
 * When the backend is ready, only this file changes: replace the bodies with
 * api.get("/admin/staff"), api.post("/admin/staff"), api.put(...) calls.
 */
let staff = [...INITIAL_STAFF];
const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

const makeTempPassword = () => `Ch@${Math.random().toString(36).slice(2, 8)}${10 + Math.floor(Math.random() * 90)}`;

export const staffService = {
  async list() {
    await wait();
    return [...staff];
  },

  /** Returns { member, tempPassword }. Throws { code: "EMAIL_TAKEN" } for a duplicate email. */
  async create(data) {
    await wait();
    const email = data.email.toLowerCase();
    if (staff.some((s) => s.email === email)) throw { code: "EMAIL_TAKEN" };
    const member = { ...data, email, id: Date.now(), status: "active" };
    staff = [member, ...staff];
    return { member, tempPassword: makeTempPassword() };
  },

  async update(id, data) {
    await wait();
    const current = staff.find((s) => s.id === id);
    const member = { ...current, ...data, email: current.email }; // email cannot be changed
    staff = staff.map((s) => (s.id === id ? member : s));
    return member;
  },
};
