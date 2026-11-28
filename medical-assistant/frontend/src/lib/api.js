// Shared request helper. Moved out of App.jsx (no behaviour change).
let cityHospitalAuth = null;

export function setCityHospitalAuth(value) {
  cityHospitalAuth = value;
}

export async function api(path, options = {}) {
  let url = path;
  let requestOptions = options;
  // Route embedded chat traffic through CityHospital so the admin usage totals are recorded.
  if (cityHospitalAuth && path.startsWith("/api/v1/chat/sessions")) {
    const apiBase = cityHospitalAuth.apiUrl.replace(/\/+$/, "");
    url = `${apiBase}${path.replace(/^\/api\/v1/, "")}`;
    requestOptions = {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${cityHospitalAuth.token}`,
      },
    };
  }
  const response = await fetch(url, requestOptions);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status})`);
  return payload;
}

// Hospital phone numbers for the emergency banner. Read from the CityHospital portal, so the admin's profile is the single source.
// Returns { hospitalNumber } (emergency number, else the main phone), or null when not embedded or unavailable.
export async function fetchHospitalContact() {
  if (!cityHospitalAuth) return null;
  try {
    const response = await fetch(`${cityHospitalAuth.apiUrl.replace(/\/+$/, "")}/patient/hospital`, { headers: { Authorization: `Bearer ${cityHospitalAuth.token}` } });
    if (!response.ok) return null;
    const hospital = await response.json();
    return { hospitalNumber: String(hospital.emergency_number || hospital.phone || "").trim() };
  } catch {
    return null;
  }
}
