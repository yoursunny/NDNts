#!/bin/sh
node -r ts-node/register/transpile-only -r tsconfig-paths/register src/ "$@"
