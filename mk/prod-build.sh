#!/bin/bash
if ! [[ -f tsconfig.build.json ]]; then
  exit 1
fi

MODULE=commonjs
if [[ $(node --print 'require("./package.json").type') == 'module' ]]; then
  MODULE=es2015
fi

tsc -p tsconfig.build.json -d --module $MODULE
tsc -p tsconfig.build.json --removeComments true --module $MODULE
