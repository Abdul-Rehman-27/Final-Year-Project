export function openPrintWindow({ title, markup, css }) {
  const win = window.open("", "_blank");
  if (!win) return null;

  try {
    win.document.write(`<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet"><style>${css}</style></head><body><p style="padding:24px">Preparing&#8230;</p></body></html>`);
    win.document.close();
    win.document.body.innerHTML = markup;

    let printed = false;
    const print = () => {
      if (printed || win.closed) return;
      printed = true;
      try {
        win.focus();
        win.print();
      } catch (error) {
        console.error("Print document could not be printed", error);
        win.close();
      }
    };
    const fallback = setTimeout(print, 2500);
    Promise.resolve(win.document.fonts?.ready)
      .then(() => new Promise((resolve) => setTimeout(resolve, 120)))
      .then(() => {
        if (!printed) {
          clearTimeout(fallback);
          print();
        }
      })
      .catch(() => {});
    return win;
  } catch (error) {
    console.error("Print document could not be opened", error);
    win.close();
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}
