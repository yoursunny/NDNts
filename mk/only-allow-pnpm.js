#!/usr/bin/env node
if (!process.env.npm_config_user_agent.startsWith("pnpm")) {
  console.log("Use `npm run bootstrap` to install dependencies in this repository\n");
  process.exit(1);
}
