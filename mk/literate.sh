#!/bin/bash
set -e
ROOTDIR=$(pwd)

literate_extract() {
  pushd $1 >/dev/null
  if ! grep '```ts' README.md >/dev/null; then
    rm -f literate-temp.ts
    popd >/dev/null
    return 1
  fi
  codedown ts < README.md > literate-temp.ts
  popd >/dev/null
}

literate_run() {
  echo -e '\n\e[96m'RUNNING EXAMPLES IN $1/README.md'\e[39m'
  local LOADER=$(realpath --relative-to=$1 $ROOTDIR/mk/esm-loader.mjs)
  pushd $1 >/dev/null
  node --loader $LOADER --experimental-specifier-resolution=node literate-temp.ts
  popd >/dev/null
}

if [[ $1 == 'lint' ]]; then
  for D in $(find packages -name README.md -printf '%h\n'); do
    literate_extract $D || true
  done
  eslint -c mk/eslintrc-literate.js packages/*/literate-temp.ts
  exit
fi

if [[ -z $1 ]]; then
  find packages -name README.md -printf '%h\n'| xargs -L 1 bash mk/literate.sh
  exit
fi

if literate_extract $1; then
  literate_run $1
fi
