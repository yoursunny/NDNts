import * as path from "node:path";

import { delay } from "@ndn/util";
import puppeteer, { type Page } from "puppeteer";
import { beforeAll } from "vitest";

const port = 9327;
export let page: Page;

beforeAll(async () => {
  const browser = await puppeteer.launch();
  page = await browser.newPage();
  return async () => {
    await browser.close();
  };
});

/**
 * Obtain HTML page URI for test case.
 * @param testcaseDirname __dirname
 */
export function getPageUri(testcaseDirname: string) {
  const name = path.basename(testcaseDirname);
  return `http://localhost:${port}/${name}.html`;
}

/** Navigate to test case page. */
export async function navigateToPage(testcaseDirname: string, delayDuration = 500) {
  await page.goto(getPageUri(testcaseDirname));
  await delay(delayDuration);
}

/** Invoke JavaScript function (in global scope) on page. */
export function pageInvoke<F extends (...args: any[]) => any>(
    funcName: string, ...args: Parameters<F>): ReturnType<F> {
  const argJ = JSON.stringify(args);
  return page.evaluate(`${funcName}.apply(undefined,(${argJ}))`) as ReturnType<F>;
}
