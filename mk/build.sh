#!/bin/bash
set -eo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..
ACT=$1
shift || true

if [[ $ACT == lint ]]; then
  XOFLAG=--fix
  if [[ $CI == true ]]; then
    XOFLAG=
  fi
  exec env NODE_OPTIONS='--max-old-space-size=4096' xo $XOFLAG "$@"
fi

if [[ $ACT == clean ]]; then
  exec rm -rf packages/*/lib/ packages/*/literate-temp.ts packages/*/tsconfig.tsbuildinfo
fi

TSCFLAG=
if [[ $ACT == watch ]]; then
  TSCFLAG=-w
elif [[ $ACT == force ]]; then
  TSCFLAG=-f
fi

tsc -b mk/tsconfig-solution.json $TSCFLAG --listEmittedFiles \
  | node mk/build-post.js
