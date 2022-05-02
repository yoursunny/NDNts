#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"/..
ACT=${1:-}
shift || true

if [[ $ACT == lint ]]; then
  XOFLAG=--fix
  if [[ ${CI:-false} == true ]]; then
    XOFLAG=
  fi

  LINTDIFF=
  if [[ ${1:-} == diff ]]; then
    LINTDIFF=HEAD
    shift
    if [[ -n ${1:-} ]]; then
      LINTDIFF=$1
      shift
    fi
  fi

  if [[ -n ${1:-} ]]; then
    if [[ $1 == all ]]; then
      shift
    fi
    exec env NODE_OPTIONS='--max-old-space-size=3072' xo-yoursunny $XOFLAG "$@"
  fi

  ROOTDIR=$(pwd)
  for DIR in $(corepack pnpm -s -r exec pwd); do
    if [[ $DIR == $ROOTDIR ]]; then
      continue
    fi
    if [[ -n $LINTDIFF ]] && git diff --quiet $LINTDIFF $DIR; then
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
      exec env COVERPKG=$SRCDIR vitest --coverage "$@"
    fi
  fi
  exec vitest --coverage "$@"
fi

if [[ $ACT == clean ]]; then
  exec rm -rf packages/*/lib/ packages/*/tsconfig.tsbuildinfo
fi

TSCFLAG=
case $ACT in
  watch) TSCFLAG=-w;;
  force) TSCFLAG=-f;;
esac
tsc -b mk/tsconfig-solution.json $TSCFLAG --listEmittedFiles \
  | node mk/build-post.js
