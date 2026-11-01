import { useEffect, useState } from "react";
import { useLanguage } from "../../context/LanguageContext.jsx";
import Alert from "./Alert.jsx";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";

/**
 * "Are you sure?" dialog for deletes. `onConfirm` may be async; if it throws, the error's
 * message is shown inside the dialog. The parent closes the dialog when onConfirm succeeds.
 */
export default function ConfirmDialog({ open, title, itemName, message, confirmLabel, onConfirm, onClose }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setBusy(false);
      setError("");
    }
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError(err?.message || t("auth.errors.generic"));
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {itemName && <p className="rounded-xl bg-surface px-4 py-3 font-bold">{itemName}</p>}
        <p className="text-ink-muted">{message || t("admin.confirm.irreversible")}</p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" fullWidth={false} onClick={onClose}>
            {t("admin.form.cancel")}
          </Button>
          <Button variant="danger" fullWidth={false} loading={busy} onClick={confirm}>
            {confirmLabel || t("admin.delete")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
