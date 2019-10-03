# NDNts Browser Tests

These integration tests confirm NDNts works in web browser environment.

In each test case,

* `browser.ts` is bundled with [webpack](https://webpack.js.org/) and runs in the browser. It exports one or more functions on the `window` object.
* `test.t.ts` runs in Node.js. It controls a Chromium browser via [Puppeteer](https://pptr.dev/), invokes the browser side function, and checks its output.
* `api.ts` defines the contract between Node.js and browser.
