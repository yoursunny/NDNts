#!/bin/bash
set -euo pipefail
INPWD="$PWD"
cd "$(dirname "${BASH_SOURCE[0]}")"/..
ACT=${1:-}
shift || true

if [[ $ACT == lint ]]; then
  RECURSE=(corepack pnpm -r --workspace-concurrency=1 --stream)
  LINTPWD=(bash "$PWD/mk/build.sh" lint pwd)
  XO=(env NODE_OPTIONS='--max-old-space-size=8192' xo-yoursunny --config "$PWD/xo.config.mjs")
  [[ ${CI:-} != true ]] && XO+=(--fix)

  if [[ ${1:-} == pwd ]]; then
    echo -e "\n\e[93mLINTING $INPWD\e[39m"
    exec "${XO[@]}" "$INPWD"
  fi

  # corepack pnpm lint all
  if [[ ${1:-} == all ]]; then
    echo -e "\n\e[96mLINTING ENTIRE CODEBASE\e[39m"
    exec "${XO[@]}"
  fi

  # corepack pnpm lint PACKAGE [PACKAGE]
  if [[ -n ${1:-} && $1 != diff ]]; then
    echo -e "\n\e[96mLINTING PACKAGES $*\e[39m"
    exec "${XO[@]}" "$@"
  fi

  # corepack pnpm lint diff [COMMIT]
  if [[ ${1:-} == diff ]]; then
    SINCE=${2:-HEAD}
    echo -e "\n\e[96mLINTING CHANGES SINCE $SINCE\e[39m"
    exec "${RECURSE[@]}" --filter="...[$SINCE]" exec "${LINTPWD[@]}"
  fi

  # corepack pnpm lint
  echo -e "\n\e[96mLINTING PACKAGES\e[39m"
  "${RECURSE[@]}" exec "${LINTPWD[@]}"
  echo -e "\n\e[96mLINTING CODEBASE ROOT\e[39m"
  exec "${XO[@]}" --no-recursive .
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
  exec rm -rf pkg/*/lib/ pkg/*/tsconfig.tsbuildinfo
fi

TSCFLAG=
case $ACT in
  watch) TSCFLAG=-w ;;
  force) TSCFLAG=-f ;;
esac
tsc -b mk/tsconfig-solution.json $TSCFLAG --listEmittedFiles |
  node mk/build-post.mjs
