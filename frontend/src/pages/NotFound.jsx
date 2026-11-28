import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext.jsx";

export default function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-black">{t("notFound.title")}</h1>
      <Link to="/login" className="font-bold text-brand-700 hover:underline">
        {t("notFound.back")}
      </Link>
    </div>
  );
}
