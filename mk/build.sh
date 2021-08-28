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

  if [[ -n $1 ]]; then
    if [[ $1 == all ]]; then
      shift
    fi
    exec env NODE_OPTIONS='--max-old-space-size=2048' xo $XOFLAG "$@"
  fi

  ROOTDIR=$(pwd)
  for DIR in $(pnpm -r exec pwd); do
    if [[ $DIR == $ROOTDIR ]]; then
      continue
    fi
    echo -e '\n\e[96m'LINTING $DIR'\e[39m'
    bash mk/build.sh lint $DIR
  done
  echo -e '\n\e[96m'LINTING CODEBASE ROOT'\e[39m'
  exec bash mk/build.sh lint all
fi

if [[ $ACT == cover ]]; then
  if [[ $# -eq 1 ]] && [[ ${1:0:1} != '-' ]]; then
    TESTSUITE=$1
    SRCDIR=${TESTSUITE%/}
    while [[ ${#SRCDIR} -gt 1 ]] && ! [[ -d $SRCDIR/src ]]; do
      SRCDIR=$(dirname $SRCDIR)
    done
    if [[ ${#SRCDIR} -gt 1 ]]; then
      set -x
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
