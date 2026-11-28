import { useEffect, useState } from "react";

import Alert from "../../components/common/Alert.jsx";
import StaffSection from "../../components/admin/StaffSection.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatCard from "../../components/common/StatCard.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { adminOverviewService } from "../../services/adminOverviewService.js";
import useStaff from "../../hooks/useStaff.js";

/** Screen 9 - Admin Dashboard: totals + staff accounts. */
export default function AdminOverview() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const staffApi = useStaff();
  const [stats, setStats] = useState({ doctors: 0, patients: 0, staff: 0, today: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    adminOverviewService.getStats().then((value) => {
      if (active) setStats(value);
    }).catch(() => {
      if (active) setError(t("admin.overviewLoadError"));
    });
    return () => { active = false; };
  }, [t]);

  return (
    <>
      <PageHeader title={t("admin.nav.overview")} subtitle={`${user?.full_name} · ${t("admin.administrator")}`} />

      {error && <div className="mb-5"><Alert>{error}</Alert></div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard value={stats.doctors} label={t("admin.stats.doctors")} />
        <StatCard value={stats.patients.toLocaleString("en-US")} label={t("admin.stats.patients")} />
        <StatCard value={stats.staff} label={t("admin.stats.staff")} />
        <StatCard value={stats.today} label={t("admin.stats.today")} />
      </div>

      <StaffSection {...staffApi} limit={5} />
    </>
  );
}
