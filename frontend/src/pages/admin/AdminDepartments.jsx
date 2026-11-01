import { useState } from "react";

import DepartmentFormModal from "../../components/admin/DepartmentFormModal.jsx";
import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import useDepartments from "../../hooks/useDepartments.js";

/** Admin > Departments: define, edit and delete hospital departments. */
export default function AdminDepartments() {
  const { t } = useLanguage();
  const { departments, loading, addDepartment, updateDepartment, removeDepartment } = useDepartments();
  const [form, setForm] = useState({ open: false, department: null });
  const [toDelete, setToDelete] = useState(null);
  const [notice, setNotice] = useState("");

  const closeForm = () => setForm({ open: false, department: null });

  const handleSubmit = async (values) => {
    if (form.department) {
      await updateDepartment(form.department.id, values);
      setNotice(t("admin.departments.updated"));
    } else {
      await addDepartment(values);
      setNotice(t("admin.departments.created"));
    }
    closeForm();
  };

  const handleDelete = async () => {
    try {
      await removeDepartment(toDelete.id);
    } catch (err) {
      throw new Error(err?.code === "IN_USE" ? t("admin.departments.inUse") : t("auth.errors.generic"));
    }
    setToDelete(null);
    setNotice(t("admin.departments.deleted"));
  };

  const columns = [
    { header: t("admin.departments.name"), render: (d) => <span className="font-bold">{d.name}</span> },
    { header: t("admin.departments.description"), render: (d) => <span className="text-ink-muted">{d.description || "-"}</span> },
    { header: t("admin.departments.staff"), render: (d) => d.staffCount },
    {
      header: "",
      className: "text-end",
      render: (d) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" fullWidth={false} onClick={() => setForm({ open: true, department: d })}>
            {t("admin.edit")}
          </Button>
          <Button variant="dangerOutline" size="sm" fullWidth={false} onClick={() => setToDelete(d)}>
            {t("admin.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={t("admin.nav.departments")} />
      <Card>
        <div className="flex items-center justify-between gap-4 p-6 pb-4">
          <h2 className="text-2xl font-black">{t("admin.nav.departments")}</h2>
          <Button fullWidth={false} size="sm" onClick={() => setForm({ open: true, department: null })}>
            {t("admin.departments.add")}
          </Button>
        </div>

        {notice && (
          <div className="px-6 pb-4">
            <Alert type="info">{notice}</Alert>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={departments}
          loading={loading}
          loadingText={t("common.loading")}
          emptyText={t("admin.departments.empty")}
        />
      </Card>

      <DepartmentFormModal open={form.open} department={form.department} onClose={closeForm} onSubmit={handleSubmit} />
      <ConfirmDialog
        open={!!toDelete}
        title={t("admin.departments.deleteTitle")}
        itemName={toDelete?.name}
        onConfirm={handleDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
