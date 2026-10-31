import Card from "../components/common/Card.jsx";
import PageHeader from "../components/common/PageHeader.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";

/** Placeholder for pages that are built in a later phase. */
export default function ComingSoon({ titleKey }) {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader title={t(titleKey)} />
      <Card className="p-6 text-ink-muted">{t("admin.comingSoon")}</Card>
    </>
  );
}
