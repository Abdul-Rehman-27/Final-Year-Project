/**
 * Opens a print window for a doctor document.
 *
 * CHANGED (empty-PDF fix):
 *  - The whole document (CSS + markup) is written in ONE document.write. Before, a "Preparing…" page was
 *    written first and the body was swapped afterwards with innerHTML, so Chrome/Brave could snapshot the
 *    print preview before the real content had been laid out.
 *  - The Google Fonts <link> no longer blocks rendering (media="print" + onload swap). A slow / blocked
 *    font request can no longer hold the first paint, which used to give a blank preview.
 *  - print() waits for: window load -> fonts ready (max 1.5 s) -> two animation frames, then fires once.
 *  - A visible "Print / Save as PDF" button is shown on screen (hidden when printing) as a manual fallback.
 */
export function openPrintWindow({ title, markup, css }) {
  const win = window.open("", "_blank");
  if (!win) return null;

  try {
    win.document.open();
    win.document.write(`<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Noto+Naskh+Arabic:wght@400;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'"><style>${css}</style></head><body><div class="print-toolbar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>${markup}</body></html>`);
    win.document.close();

    let printed = false;
    const print = () => {
      if (printed || win.closed) return;
      printed = true;
      try {
        win.focus();
        win.print();
      } catch (error) {
        console.error("Print document could not be printed", error);
      }
    };
    const afterPaint = () => win.requestAnimationFrame(() => win.requestAnimationFrame(print));
    const fontsReady = () => Promise.race([
      Promise.resolve(win.document.fonts?.ready).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    const start = () => fontsReady().then(afterPaint).catch(print);

    if (win.document.readyState === "complete") start();
    else win.addEventListener("load", start, { once: true });
    setTimeout(print, 4000); // last-resort fallback; print() only ever runs once
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
