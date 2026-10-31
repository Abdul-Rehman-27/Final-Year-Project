import { useRef, useState } from "react";
import { useLanguage } from "../../context/LanguageContext.jsx";
import Avatar from "./Avatar.jsx";
import Button from "./Button.jsx";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * Profile photo picker with a round preview.
 * `value` is the image as a data URL ("" = no photo); With no photo it shows the dummy person picture.
 * onChange(dataUrl) is called when a photo is picked or removed.
 */
export default function ImageUpload({ value, onChange }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const [error, setError] = useState("");

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the user pick the same file again
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) return setError(t("upload.errorType"));
    if (file.size > MAX_SIZE) return setError(t("upload.errorSize"));

    setError("");
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };

  const remove = () => {
    setError("");
    onChange("");
  };

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar src={value} size="lg" />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" fullWidth={false} onClick={() => inputRef.current.click()}>
              {t(value ? "upload.change" : "upload.choose")}
            </Button>
            {value && (
              <Button variant="secondary" size="sm" fullWidth={false} onClick={remove}>
                {t("upload.remove")}
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-muted">{t("upload.hint")}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        onChange={handleFile}
        className="hidden"
        aria-label={t("upload.choose")}
        data-testid="photo-input"
      />
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
