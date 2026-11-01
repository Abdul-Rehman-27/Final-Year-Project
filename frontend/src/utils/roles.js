/** System roles show a translated name; roles created by the admin show the name they typed. */
export const roleName = (t, role) => (role.system ? t(`admin.roles.${role.key}`) : role.name);

/** Returns a function key -> label for the staff table (falls back to the translation of the key). */
export const makeRoleLabel = (t, roles) => (key) => {
  const role = roles.find((r) => r.key === key);
  return role ? roleName(t, role) : t(`admin.roles.${key}`);
};
