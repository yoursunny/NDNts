# NDNts Browser Tests

These integration tests confirm NDNts works in web browser environment.

In each test case,

* `browser.ts` is bundled with [webpack](https://webpack.js.org/) and runs in the browser.
  It exports one or more functions on the `window` object.
* `test.t.ts` runs in Node.js.
  It controls a Chromium browser via [Puppeteer](https://pptr.dev/), invokes the browser side function, and checks its output.
* `api.ts` defines the contract between Node.js and browser.

## Puppeteer Docker

```bash
docker pull satantime/puppeteer-node:20-slim

docker run -it --rm \
  --network host \
  --mount type=bind,source=$(pwd),target=/NDNts \
  --mount type=bind,source=$HOME/.cache/puppeteer,target=/pptr-cache,readonly=true \
  -e PUPPETEER_CACHE_DIR=/pptr-cache \
  --cap-add SYS_ADMIN \
  --user $(id -u):$(id -g) \
  --workdir /NDNts/integ/browser-tests \
  satantime/puppeteer-node:20-slim bash
```

Type `corepack pnpm test` to run the tests.
