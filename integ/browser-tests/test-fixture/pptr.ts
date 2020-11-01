import * as path from "path";

import jestPuppeteerConfig from "../jest-puppeteer.config.js";

jest.setTimeout(20000);

/**
 * Obtain HTML page URI for test case.
 * @param testcaseDirname __dirname
 */
export function getPageUri(testcaseDirname: string) {
  const port = jestPuppeteerConfig.server.port;
  const name = path.basename(testcaseDirname);
  return `http://localhost:${port}/${name}.html`;
}

/** Navigate to test case page. */
export async function navigateToPage(testcaseDirname: string, delay = 200) {
  await page.goto(getPageUri(testcaseDirname));
  await new Promise((r) => setTimeout(r, delay));
}

/**
 * Subset of Page type needed by pageInvoke function.
 *
 * Use a loose declaration instead of an import, because @types/expect-puppeteer and
 * @types/jest-environment-puppeteer sometimes refer to different versions of
 * @types/puppeteer , causing type checking errors.
 */
interface Page {
  evaluate(...args: any[]): any;
}

/** Invoke JavaScript function (in global scope) on page. */
export function pageInvoke<F extends (...args: any[]) => any>(
    page: Page,
    funcName: string, ...args: Parameters<F>): ReturnType<F> {
  const argJ = JSON.stringify(args);
  return page.evaluate(`${funcName}.apply(undefined,(${argJ}))`) as ReturnType<F>;
}
