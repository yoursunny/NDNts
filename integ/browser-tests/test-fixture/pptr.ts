import path from "node:path";

import { console, delay } from "@ndn/util";
import puppeteer, { type Page } from "puppeteer";
import { beforeAll } from "vitest";

const port = 9327;
export let page: Page;

beforeAll(async () => {
  const browser = await puppeteer.launch();
  page = await browser.newPage();
  page.on("console", (evt) => { console.log(`[BROWSER ${evt.type()}] ${evt.text()}`); });
  return async () => {
    await browser.close();
  };
});

/**
 * Navigate to test case page.
 * @param importMeta - `import.meta` of calling test case.
 * @param delayDuration - How long (in milliseconds) to wait after navigation.
 */
export async function navigateToPage(importMeta: ImportMeta, delayDuration = 500) {
  const dir = path.basename(importMeta.dirname);
  await page.goto(`http://localhost:${port}/${dir}.html`);
  await delay(delayDuration);
}

/** Invoke JavaScript function (in global scope) on page. */
export function pageInvoke<F extends (...args: any[]) => any>(funcName: string, ...args: Parameters<F>): ReturnType<F> {
  const argJ = JSON.stringify(args);
  return page.evaluate(`${funcName}.apply(undefined,(${argJ}))`) as ReturnType<F>;
}
