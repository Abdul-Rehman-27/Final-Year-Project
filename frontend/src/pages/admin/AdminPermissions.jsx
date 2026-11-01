import { useState } from "react";

import PermissionFormModal from "../../components/admin/PermissionFormModal.jsx";
import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import usePermissions from "../../hooks/usePermissions.js";

/** Admin > Permissions: define, edit and delete the permissions that can be given to roles. */
export default function AdminPermissions() {
  const { t } = useLanguage();
  const { permissions, loading, addPermission, updatePermission, removePermission } = usePermissions();
  const [form, setForm] = useState({ open: false, permission: null });
  const [toDelete, setToDelete] = useState(null);
  const [notice, setNotice] = useState("");

  const closeForm = () => setForm({ open: false, permission: null });

  const handleSubmit = async (values) => {
    if (form.permission) {
      await updatePermission(form.permission.id, values);
      setNotice(t("admin.permissions.updated"));
    } else {
      await addPermission(values);
      setNotice(t("admin.permissions.created"));
    }
    closeForm();
  };

  const handleDelete = async () => {
    try {
      await removePermission(toDelete.id);
    } catch {
      throw new Error(t("auth.errors.generic"));
    }
    setToDelete(null);
    setNotice(t("admin.permissions.deleted"));
  };

  const columns = [
    { header: t("admin.permissions.name"), render: (p) => <span className="font-bold">{p.name}</span> },
    {
      header: t("admin.permissions.code"),
      render: (p) => (
        <code dir="ltr" className="inline-block rounded-md bg-surface px-2 py-1 text-sm">
          {p.code}
        </code>
      ),
    },
    { header: t("admin.permissions.description"), render: (p) => <span className="text-ink-muted">{p.description || "-"}</span> },
    { header: t("admin.permissions.usedBy"), render: (p) => p.roleCount },
    {
      header: "",
      className: "text-end",
      render: (p) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" fullWidth={false} onClick={() => setForm({ open: true, permission: p })}>
            {t("admin.edit")}
          </Button>
          <Button variant="dangerOutline" size="sm" fullWidth={false} onClick={() => setToDelete(p)}>
            {t("admin.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={t("admin.nav.permissions")} />
      <Card>
        <div className="flex items-center justify-between gap-4 p-6 pb-4">
          <h2 className="text-2xl font-black">{t("admin.nav.permissions")}</h2>
          <Button fullWidth={false} size="sm" onClick={() => setForm({ open: true, permission: null })}>
            {t("admin.permissions.add")}
          </Button>
        </div>

        {notice && (
          <div className="px-6 pb-4">
            <Alert type="info">{notice}</Alert>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={permissions}
          loading={loading}
          loadingText={t("common.loading")}
          emptyText={t("admin.permissions.empty")}
        />
      </Card>

      <PermissionFormModal open={form.open} permission={form.permission} onClose={closeForm} onSubmit={handleSubmit} />
      <ConfirmDialog
        open={!!toDelete}
        title={t("admin.permissions.deleteTitle")}
        itemName={toDelete?.name}
        message={
          toDelete?.roleCount > 0
            ? `${t("admin.permissions.deleteWarning")} ${t("admin.confirm.irreversible")}`
            : t("admin.confirm.irreversible")
        }
        onConfirm={handleDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
