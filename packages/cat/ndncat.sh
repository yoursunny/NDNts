#!/bin/sh
node --loader ../../mk/esm-loader.mjs --experimental-specifier-resolution=node cli.cjs "$@"
