if (!/^pnpm/.test(process.env.npm_config_user_agent)) {
  // eslint-disable-next-line no-console
  console.log("Use `npm run bootstrap` to install dependencies in this repository\n");
  process.exit(1);
}
