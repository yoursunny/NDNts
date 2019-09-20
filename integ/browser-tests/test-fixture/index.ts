import * as path from "path";
import { Page } from "puppeteer";

import jestPuppeteerConfig from "../jest-puppeteer.config.js";

/**
 * Obtain HTML page URI for test case.
 * @param testcaseDirname __dirname
 */
export function getPageUri(testcaseDirname: string) {
  const port = jestPuppeteerConfig.server.port;
  const name = path.basename(testcaseDirname);
  return `http://localhost:${port}/${name}.html`;
}

/**
 * Invoke JavaScript function (in global scope) on page.
 */
export function pageInvoke<F extends (...args: any[]) => any>(
    page: Page,
    funcName: string, ...args: Parameters<F>): ReturnType<F> {
  const argJ = JSON.stringify(args);
  return page.evaluate(`${funcName}.apply(undefined,(${argJ}))`) as ReturnType<F>;
}
