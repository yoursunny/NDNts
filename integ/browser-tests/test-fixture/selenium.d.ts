import { ThenableWebDriver, until as wdUntil, By } from "selenium-webdriver";

declare global {
  var driver: ThenableWebDriver;
  const By: By;
  const until: typeof wdUntil;
  const cleanup: () => Promise<void>;
}
