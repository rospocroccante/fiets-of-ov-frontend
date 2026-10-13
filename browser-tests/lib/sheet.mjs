// The portrait phone's results sheet lands collapsed, on its summary header, with the
// options hidden under it. A scenario that measures the options opens the sheet to half
// first, the way a finger does: a touch on the handle, then a wait for the settle to stop
// moving the sheet.

import { sleep } from "./chrome.mjs";

export const SHEET = '[data-fov="results-sheet"]';
export const HANDLE = '[data-fov="sheet-handle"]';

// Wait for a detent, then for the sheet's top to stop moving: the settle is a spring and
// ends when it is within half a pixel.
export async function sheetSettledAt(page, detent, { timeout = 8000 } = {}) {
  await page.waitFor(`document.querySelector('${SHEET}[data-detent="${detent}"]')`, {
    label: `the sheet at ${detent}`,
    timeout,
  });
  let last = null;
  for (let i = 0; i < 40; i++) {
    const top = await page.eval(`return document.querySelector('${SHEET}').getBoundingClientRect().top;`);
    if (last !== null && Math.abs(top - last) < 0.5) break;
    last = top;
    await sleep(80);
  }
}

// Open a collapsed sheet to half. Returns false where there is no sheet (a phone on its
// side, a desktop window), so callers can use it on every viewport.
export async function openSheetToHalf(page) {
  if (!(await page.eval(`return !!document.querySelector('${SHEET}');`))) return false;
  await sheetSettledAt(page, "peek");
  await page.waitFor(`document.querySelector('${HANDLE}')`, { label: "the sheet's handle" });
  const h = await page.eval(`return window.__fov.rect(document.querySelector('${HANDLE}'));`);
  await page.tap(Math.round(h.x + h.w / 2), Math.round(h.y + h.h / 2));
  await sheetSettledAt(page, "half");
  return true;
}
