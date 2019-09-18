if (!/^pnpm/.test(process.env.npm_config_user_agent)) {
  console.log("Use `npx pnpm install` to install dependencies in this repository\n");
  process.exit(1);
}
