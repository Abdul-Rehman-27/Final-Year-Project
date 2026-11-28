import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "../../context/LanguageContext.jsx";
import Button from "../common/Button.jsx";
import Toggle from "../common/Toggle.jsx";

const sameSet = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * Switch list: one row per permission, ON = active for this role.
 * Changes stay in a draft until "Save changes" (or are thrown away with "Discard").
 *  - role: { id, permissionIds }
 *  - permissions: [{ id, name, code, description }]
 *  - onSave(permissionIds) -> Promise
 */
export default function RolePermissionEditor({ role, permissions, onSave }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(role.permissionIds);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Start from the saved permissions whenever another role is selected or the saved list changes
  useEffect(() => {
    setDraft(role.permissionIds);
  }, [role.id, role.permissionIds]);

  useEffect(() => setQuery(""), [role.id]);

  const dirty = !sameSet(draft, role.permissionIds);
  const enabledCount = permissions.filter((p) => draft.includes(p.id)).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return permissions;
    return permissions.filter((p) => `${p.name} ${p.code} ${p.description}`.toLowerCase().includes(q));
  }, [permissions, query]);

  const toggle = (id, on) => setDraft((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));
  const setAll = (on) => setDraft(on ? permissions.map((p) => p.id) : []);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  if (!permissions.length) {
    return <p className="rounded-xl bg-surface px-4 py-6 text-ink-muted">{t("admin.rolesPage.noPermissions")}</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.rolesPage.search")}
          aria-label={t("admin.rolesPage.search")}
          className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/20"
        />
        <Button variant="secondary" size="sm" fullWidth={false} onClick={() => setAll(true)}>
          {t("admin.rolesPage.enableAll")}
        </Button>
        <Button variant="secondary" size="sm" fullWidth={false} onClick={() => setAll(false)}>
          {t("admin.rolesPage.disableAll")}
        </Button>
      </div>

      <p className="mb-3 text-sm font-bold text-brand-700">
        <span dir="ltr" className="inline-block">
          {enabledCount} / {permissions.length}
        </span>{" "}
        {t("admin.rolesPage.enabled")}
      </p>

      {visible.length === 0 ? (
        <p className="rounded-xl bg-surface px-4 py-6 text-ink-muted">{t("admin.rolesPage.noMatch")}</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((p) => {
            const on = draft.includes(p.id);
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${
                  on ? "border-brand-600/40 bg-brand-50" : "border-line bg-white"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-bold">
                    {p.name}{" "}
                    <code dir="ltr" className="ms-1 inline-block rounded bg-white/80 px-1.5 py-0.5 text-xs font-normal text-ink-muted">
                      {p.code}
                    </code>
                  </p>
                  {p.description && <p className="truncate text-sm text-ink-muted">{p.description}</p>}
                </div>
                <Toggle checked={on} onChange={(v) => toggle(p.id, v)} label={p.name} />
              </li>
            );
          })}
        </ul>
      )}

      <div
        className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ${
          dirty ? "bg-amber-50 text-amber-800" : "bg-surface text-ink-muted"
        }`}
      >
        <span className="text-sm font-bold">{dirty ? t("admin.rolesPage.unsaved") : t("admin.rolesPage.permissionsHint")}</span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" fullWidth={false} disabled={!dirty || saving} onClick={() => setDraft(role.permissionIds)}>
            {t("admin.rolesPage.discard")}
          </Button>
          <Button size="sm" fullWidth={false} disabled={!dirty} loading={saving} onClick={save}>
            {t("admin.rolesPage.saveChanges")}
          </Button>
        </div>
      </div>
    </div>
  );
}
