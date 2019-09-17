const fs = require("fs");

if (!fs.existsSync("packages/node_modules")) {
  fs.mkdirSync("packages/node_modules");
}
if (!fs.existsSync("packages/node_modules/@ndn")) {
  fs.symlinkSync("..", "packages/node_modules/@ndn", "dir");
}
