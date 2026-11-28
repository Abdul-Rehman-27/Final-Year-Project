/** Turn an Axios error into { status, key } where key is an i18n key under auth.errors. */
export function parseApiError(err) {
  if (!err.response) return { status: 0, key: "auth.errors.network" };
  const { status } = err.response;
  if (status === 401) return { status, key: "auth.errors.invalidCredentials" };
  if (status === 403) return { status, key: "auth.errors.disabled" };
  if (status === 409) return { status, key: "auth.errors.emailTaken" };
  return { status, key: "auth.errors.generic" };
}

export const dashboardPath = (role) => `/${role}`;
