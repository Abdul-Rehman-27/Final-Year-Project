import { useState } from "react";

import { useLanguage } from "../../context/LanguageContext.jsx";
import useDepartments from "../../hooks/useDepartments.js";
import useRoles from "../../hooks/useRoles.js";
import { makeRoleLabel } from "../../utils/roles.js";
import Alert from "../common/Alert.jsx";
import Avatar from "../common/Avatar.jsx";
import Badge from "../common/Badge.jsx";
import Button from "../common/Button.jsx";
import Card from "../common/Card.jsx";
import DataTable from "../common/DataTable.jsx";
import StaffFormModal from "./StaffFormModal.jsx";

/**
 * "Staff accounts" card: title, Add staff button, table with Edit buttons and the add/edit dialog.
 * Props come from the useStaff() hook. `limit` shows only the first N rows (used on Overview).
 */
export default function StaffSection({ staff, loading, addStaff, updateStaff, limit }) {
  const { t } = useLanguage();
  const [modal, setModal] = useState({ open: false, member: null });
  const [notice, setNotice] = useState("");
  const { roles } = useRoles();
  const { departments } = useDepartments();
  const roleLabel = makeRoleLabel(t, roles);
  const departmentName = (id) => departments.find((d) => d.id === id)?.name || "-";

  const rows = limit ? staff.slice(0, limit) : staff;
  const closeModal = () => setModal({ open: false, member: null });

  const handleSubmit = async (values) => {
    if (modal.member) {
      await updateStaff(modal.member.id, values);
      setNotice(t("admin.updated"));
    } else {
      const tempPassword = await addStaff(values);
      setNotice(`${t("admin.createdFor")} ${values.fullName}. ${t("admin.tempPassword")}: ${tempPassword}`);
    }
    closeModal();
  };

  const columns = [
    {
      header: t("admin.table.name"),
      render: (s) => (
        <div className="flex items-center gap-3">
          <Avatar src={s.photo} name={s.fullName} />
          <div>
            <p className="font-bold">{s.fullName}</p>
            <p className="text-sm text-ink-muted" dir="ltr">
              {s.email}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: t("admin.table.contact"),
      render: (s) => (
        <span dir="ltr" className="inline-block">
          {s.phone}
        </span>
      ),
    },
    { header: t("admin.table.role"), render: (s) => roleLabel(s.role) },
    { header: t("admin.table.department"), render: (s) => departmentName(s.departmentId) },
    {
      header: t("admin.table.status"),
      render: (s) => <Badge tone={s.status === "active" ? "success" : "neutral"}>{t(`admin.status.${s.status}`)}</Badge>,
    },
    {
      header: "",
      className: "text-end",
      render: (s) => (
        <Button variant="secondary" size="sm" fullWidth={false} onClick={() => setModal({ open: true, member: s })}>
          {t("admin.edit")}
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <div className="flex items-center justify-between gap-4 p-6 pb-4">
        <h2 className="text-2xl font-black">{t("admin.staffAccounts")}</h2>
        <Button fullWidth={false} size="sm" onClick={() => setModal({ open: true, member: null })}>
          {t("admin.addStaff")}
        </Button>
      </div>

      {notice && (
        <div className="px-6 pb-4">
          <Alert type="info">{notice}</Alert>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        loadingText={t("common.loading")}
        emptyText={t("admin.empty")}
      />

      <StaffFormModal
        open={modal.open}
        member={modal.member}
        roles={roles}
        departments={departments}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
