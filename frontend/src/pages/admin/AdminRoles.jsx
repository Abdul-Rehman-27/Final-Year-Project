import { useEffect, useState } from "react";

import RoleFormModal from "../../components/admin/RoleFormModal.jsx";
import RolePermissionEditor from "../../components/admin/RolePermissionEditor.jsx";
import Alert from "../../components/common/Alert.jsx";
import Badge from "../../components/common/Badge.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import usePermissions from "../../hooks/usePermissions.js";
import useRoles from "../../hooks/useRoles.js";
import { roleName } from "../../utils/roles.js";

/**
 * Admin > Roles. Left: list of roles (add / pick one). Right: the picked role's details and a switch
 * for every permission - only the switched-on permissions are active for that role.
 */
export default function AdminRoles() {
  const { t } = useLanguage();
  const { roles, loading, addRole, updateRole, savePermissions, removeRole } = useRoles();
  const { permissions } = usePermissions();

  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ open: false, role: null });
  const [toDelete, setToDelete] = useState(null);
  const [notice, setNotice] = useState("");

  // Select the first role once the list has loaded (and again if the selected one disappears)
  useEffect(() => {
    if (roles.length && !roles.some((r) => r.id === selectedId)) setSelectedId(roles[0].id);
  }, [roles, selectedId]);

  const selected = roles.find((r) => r.id === selectedId);
  const closeForm = () => setForm({ open: false, role: null });

  const handleSubmit = async (values) => {
    if (form.role) {
      await updateRole(form.role.id, values);
      setNotice(t("admin.rolesPage.updated"));
    } else {
      const role = await addRole(values);
      setSelectedId(role.id);
      setNotice(t("admin.rolesPage.created"));
    }
    closeForm();
  };

  const handleSavePermissions = async (ids) => {
    await savePermissions(selected.id, ids);
    setNotice(t("admin.rolesPage.saved"));
  };

  const handleDelete = async () => {
    try {
      await removeRole(toDelete.id);
    } catch (err) {
      const key = err?.code === "IN_USE" ? "inUse" : err?.code === "SYSTEM" ? "systemLocked" : null;
      throw new Error(key ? t(`admin.rolesPage.${key}`) : t("auth.errors.generic"));
    }
    setToDelete(null);
    setNotice(t("admin.rolesPage.deleted"));
  };

  return (
    <>
      <PageHeader title={t("admin.nav.roles")} />

      {notice && (
        <div className="mb-4">
          <Alert type="info">{notice}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* Roles list */}
        <Card className="h-fit p-4">
          <div className="mb-3 flex items-center justify-between gap-2 px-2">
            <h2 className="text-xl font-black">{t("admin.rolesPage.listTitle")}</h2>
            <Button size="sm" fullWidth={false} onClick={() => setForm({ open: true, role: null })}>
              {t("admin.rolesPage.add")}
            </Button>
          </div>

          {loading ? (
            <p className="px-2 py-4 text-ink-muted">{t("common.loading")}</p>
          ) : (
            <ul className="space-y-2">
              {roles.map((r) => {
                const active = r.id === selectedId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      aria-pressed={active}
                      className={`w-full rounded-xl border px-4 py-3 text-start transition-colors ${
                        active ? "border-brand-700 bg-brand-tint" : "border-line bg-white hover:bg-brand-50"
                      }`}
                    >
                      <span className="block font-bold">{roleName(t, r)}</span>
                      <span className="block text-sm text-ink-muted">
                        <span dir="ltr" className="inline-block">
                          {r.permissionIds.length} / {permissions.length}
                        </span>{" "}
                        {t("admin.nav.permissions")} · {r.memberCount} {t("admin.rolesPage.staff")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Permission editor of the selected role */}
        <Card className="p-6">
          {!selected ? (
            <p className="text-ink-muted">{t("admin.rolesPage.selectRole")}</p>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">
                    {t("admin.rolesPage.permissionsFor")} {roleName(t, selected)}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-ink-muted">
                    {selected.system && <Badge>{t("admin.rolesPage.system")}</Badge>}
                    {selected.description && <span>{selected.description}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" fullWidth={false} onClick={() => setForm({ open: true, role: selected })}>
                    {t("admin.edit")}
                  </Button>
                  {!selected.system && (
                    <Button variant="dangerOutline" size="sm" fullWidth={false} onClick={() => setToDelete(selected)}>
                      {t("admin.delete")}
                    </Button>
                  )}
                </div>
              </div>

              <RolePermissionEditor role={selected} permissions={permissions} onSave={handleSavePermissions} />
            </>
          )}
        </Card>
      </div>

      <RoleFormModal open={form.open} role={form.role} onClose={closeForm} onSubmit={handleSubmit} />
      <ConfirmDialog
        open={!!toDelete}
        title={t("admin.rolesPage.deleteTitle")}
        itemName={toDelete ? roleName(t, toDelete) : ""}
        onConfirm={handleDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
