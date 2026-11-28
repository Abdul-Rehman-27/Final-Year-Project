import { useEffect, useState } from "react";
import { patientPortalService } from "../services/patientPortalService.js";

/** Loads the image files of a ready lab/radiology report as object URLs: [{ id, src, caption }]. */
export function useReportImages(reportId, files) {
  const [images, setImages] = useState([]);
  const key = `${reportId}:${(files || []).map((f) => f.id).join(",")}`;
  useEffect(() => {
    let cancelled = false; const urls = [];
    const imgs = (files || []).filter((f) => f.kind === "image");
    Promise.all(imgs.map((f) => patientPortalService.getLabFileBlob(reportId, f.id).then((blob) => { const src = URL.createObjectURL(blob); urls.push(src); return { id: f.id, src, caption: f.caption }; }).catch(() => ({ id: f.id, src: null, caption: f.caption })))).then((list) => { if (!cancelled) setImages(list); });
    return () => { cancelled = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return images;
}
