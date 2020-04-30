#!/bin/bash
set -e
ACT=$1

if [[ $ACT == clean ]]; then
  rm -rf packages/*/lib/ packages/*/literate-temp.ts packages/*/tsconfig.tsbuildinfo
  exit
fi

TSCFLAG=
if [[ $ACT == watch ]]; then
  TSCFLAG=-w
elif [[ $ACT == force ]]; then
  TSCFLAG=-f
fi

tsc -b mk/tsconfig-solution.json $TSCFLAG --listEmittedFiles \
  | node mk/build-post.js
