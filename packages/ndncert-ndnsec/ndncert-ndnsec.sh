#!/bin/sh
export TS_NODE_PROJECT=../../mk/tsconfig-literate.json
node -r esm -r ts-node/register/transpile-only -r tsconfig-paths/register src/index.ts "$@"
