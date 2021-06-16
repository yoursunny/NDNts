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

if [[ $ACT == cover ]]; then
  if [[ $# -eq 1 ]] && [[ ${1:0:1} != '-' ]]; then
    TESTSUITE=$1
    SRCDIR=$TESTSUITE
    while [[ ${#SRCDIR} -gt 1 ]] && ! [[ -d $SRCDIR/src ]]; do
      SRCDIR=$(dirname $SRCDIR)
    done
    if [[ ${#SRCDIR} -gt 1 ]]; then
      exec jest --coverage --collectCoverageFrom=$SRCDIR'/src/**/*' "$@"
    fi
  fi
  exec jest --coverage "$@"
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
