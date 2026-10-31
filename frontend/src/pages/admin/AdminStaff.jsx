import StaffSection from "../../components/admin/StaffSection.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import useStaff from "../../hooks/useStaff.js";

/** Full staff list (the Overview only shows the first 5). */
export default function AdminStaff() {
  const { t } = useLanguage();
  const staffApi = useStaff();

  return (
    <>
      <PageHeader title={t("admin.nav.staff")} />
      <StaffSection {...staffApi} />
    </>
  );
}
