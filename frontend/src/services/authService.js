import api from "./api.js";

export const authService = {
  async login({ email, password, role }) {
    const { data } = await api.post("/auth/login", { email, password, role });
    return data;
  },

  /** Maps the form's camelCase fields to the API's snake_case body. */
  async register(form) {
    const { data } = await api.post("/auth/register", {
      full_name: form.fullName,
      email: form.email,
      phone: form.phone,
      date_of_birth: form.dob,
      gender: form.gender,
      password: form.password,
    });
    return data;
  },
};
