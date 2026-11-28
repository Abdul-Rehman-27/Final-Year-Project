import { useEffect, useState } from "react";
import Alert from "../../components/common/Alert.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Input from "../../components/common/Input.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import Toggle from "../../components/common/Toggle.jsx";
import { useLanguage } from "../../context/LanguageContext.jsx";
import { hospitalProfileService } from "../../services/hospitalProfileService.js";
import { toRequest, validateHospitalProfile } from "../../utils/hospitalProfile.js";

const blank = { name: "", address: "", phone: "", email: "", emergencyNumber: "", open24Hours: true, opensAt: "", closesAt: "", labOpensAt: "", labClosesAt: "" };
const fromApi = (d) => ({ ...blank, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v ?? ""])), open24Hours: d.open24Hours !== false });

/** Admin > Hospital Profile: the details patients and doctors see (name, contact, emergency number, opening hours). */
export default function AdminHospitalProfile() {
  const { t } = useLanguage();
  const [values, setValues] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true; setLoadError(false);
    hospitalProfileService.get().then((d) => live && setValues(fromApi(d))).catch(() => live && setLoadError(true));
    return () => { live = false; };
  }, [retry]);

  const set = (k) => (e) => { setValues((v) => ({ ...v, [k]: e.target.value })); setNotice(null); };
  const err = (k) => (errors[k] ? t(`admin.hospital.errors.${errors[k]}`) : undefined);

  const save = async () => {
    const found = validateHospitalProfile(values);
    setErrors(found); setNotice(null);
    if (Object.keys(found).length) return;
    setSaving(true);
    try { setValues(fromApi(await hospitalProfileService.save(toRequest(values)))); setNotice({ type: "success", text: t("admin.hospital.saved") }); }
    catch (e) { setNotice({ type: "error", text: t(e.code === "VALIDATION_ERROR" ? "admin.hospital.errors.invalid" : "auth.errors.generic") }); }
    finally { setSaving(false); }
  };

  if (!values) {
    return <><PageHeader title={t("admin.nav.hospitalProfile")} />{loadError
      ? <div className="max-w-xl space-y-3"><Alert>{t("auth.errors.generic")}</Alert><Button fullWidth={false} onClick={() => setRetry((x) => x + 1)}>{t("doctor.tryAgain")}</Button></div>
      : <p>{t("common.loading")}</p>}</>;
  }

  return (
    <>
      <PageHeader title={t("admin.nav.hospitalProfile")} />
      <p className="mb-4 max-w-2xl text-ink-muted">{t("admin.hospital.subtitle")}</p>
      {notice && <div className="mb-4 max-w-3xl"><Alert type={notice.type === "success" ? "success" : undefined}>{notice.text}</Alert></div>}
      <Card className="max-w-3xl space-y-5 p-6">
        <h2 className="text-xl font-black">{t("admin.hospital.general")}</h2>
        <Input id="hp-name" label={t("admin.hospital.name")} required value={values.name} onChange={set("name")} error={err("name")} maxLength={100} />
        <Input id="hp-address" label={t("admin.hospital.address")} value={values.address} onChange={set("address")} maxLength={255} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input id="hp-phone" label={t("admin.hospital.phone")} dir="ltr" value={values.phone} onChange={set("phone")} error={err("phone")} />
          <Input id="hp-email" label={t("admin.hospital.email")} dir="ltr" value={values.email} onChange={set("email")} error={err("email")} />
        </div>
        <Input id="hp-emergency" label={t("admin.hospital.emergency")} dir="ltr" value={values.emergencyNumber} onChange={set("emergencyNumber")} error={err("emergencyNumber")} />

        <h2 className="pt-2 text-xl font-black">{t("admin.hospital.hours")}</h2>
        <div className="flex items-center gap-3">
          <Toggle checked={values.open24Hours} onChange={(v) => { setValues((x) => ({ ...x, open24Hours: v })); setNotice(null); }} label={t("admin.hospital.open24")} />
          <span className="font-semibold">{t("admin.hospital.open24")}</span>
        </div>
        {!values.open24Hours && (
          <div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="hp-opens" type="time" dir="ltr" label={t("admin.hospital.opensAt")} value={values.opensAt} onChange={set("opensAt")} />
              <Input id="hp-closes" type="time" dir="ltr" label={t("admin.hospital.closesAt")} value={values.closesAt} onChange={set("closesAt")} />
            </div>
            {err("hours") && <p role="alert" className="mt-1.5 text-sm text-red-600">{err("hours")}</p>}
          </div>
        )}

        <h2 className="pt-2 text-xl font-black">{t("admin.hospital.labHours")}</h2>
        <p className="-mt-3 text-sm text-ink-muted">{t("admin.hospital.labHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input id="hp-lab-opens" type="time" dir="ltr" label={t("admin.hospital.opensAt")} value={values.labOpensAt} onChange={set("labOpensAt")} />
          <Input id="hp-lab-closes" type="time" dir="ltr" label={t("admin.hospital.closesAt")} value={values.labClosesAt} onChange={set("labClosesAt")} />
        </div>
        {err("labHours") && <p role="alert" className="-mt-3 text-sm text-red-600">{err("labHours")}</p>}
        {(values.labOpensAt || values.labClosesAt) && <Button variant="secondary" size="sm" fullWidth={false} onClick={() => setValues((x) => ({ ...x, labOpensAt: "", labClosesAt: "" }))}>{t("admin.hospital.clearLab")}</Button>}

        <div className="pt-2"><Button fullWidth={false} loading={saving} onClick={save}>{t("admin.hospital.save")}</Button></div>
      </Card>
    </>
  );
}
