import { INITIAL_DEPARTMENTS } from "../data/mockRbac.js";
import { staffService } from "./staffService.js";

/**
 * MOCK department service (in memory, resets on refresh).
 * Backend later: GET/POST /admin/departments, PUT/DELETE /admin/departments/{id}.
 * Throws { code: "NAME_TAKEN" } or { code: "IN_USE" }.
 */
let departments = [...INITIAL_DEPARTMENTS];
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const nameTaken = (name, ignoreId) => departments.some((d) => d.id !== ignoreId && d.name.toLowerCase() === name.toLowerCase());

export const departmentService = {
  async list() {
    await wait();
    return departments.map((d) => ({ ...d, staffCount: staffService.countByDepartment(d.id) }));
  },

  async create({ name, description }) {
    await wait();
    if (nameTaken(name)) throw { code: "NAME_TAKEN" };
    const dept = { id: Date.now(), name, description };
    departments = [...departments, dept];
    return dept;
  },

  async update(id, { name, description }) {
    await wait();
    if (nameTaken(name, id)) throw { code: "NAME_TAKEN" };
    departments = departments.map((d) => (d.id === id ? { ...d, name, description } : d));
    return departments.find((d) => d.id === id);
  },

  async remove(id) {
    await wait();
    if (staffService.countByDepartment(id) > 0) throw { code: "IN_USE" };
    departments = departments.filter((d) => d.id !== id);
  },
};
