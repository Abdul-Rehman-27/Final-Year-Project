import StaffSection from "../../components/admin/StaffSection.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatCard from "../../components/common/StatCard.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { MOCK_STATS } from "../../data/mockStaff.js";
import useStaff from "../../hooks/useStaff.js";

/** Screen 9 - Admin Dashboard: totals + staff accounts. */
export default function AdminOverview() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const staffApi = useStaff();

  const doctors = staffApi.staff.filter((s) => s.role === "doctor").length;

  return (
    <>
      <PageHeader title={t("admin.nav.overview")} subtitle={`${user?.full_name} · ${t("admin.administrator")}`} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard value={doctors} label={t("admin.stats.doctors")} />
        <StatCard value={MOCK_STATS.patients.toLocaleString("en-US")} label={t("admin.stats.patients")} />
        <StatCard value={staffApi.staff.length} label={t("admin.stats.staff")} />
        <StatCard value={MOCK_STATS.today} label={t("admin.stats.today")} />
      </div>

      <StaffSection {...staffApi} limit={5} />
    </>
  );
}
