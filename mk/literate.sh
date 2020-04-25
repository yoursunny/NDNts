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
  pushd $1 >/dev/null
  NODEVERSION=$(node --version)
  if [[ $NODEVERSION = v12* ]] && [[ $(echo $NODEVERSION | sed -e 's/^[^.]*\.//' -e 's/\.[^.]*$//') -le 15 ]]; then
    export TS_NODE_PROJECT=$ROOTDIR/mk/tsconfig-literate.json
    node -r esm -r ts-node/register -r tsconfig-paths/register literate-temp.ts
  else
    node --experimental-modules --loader $ROOTDIR/mk/literate-loader.mjs --experimental-specifier-resolution=node literate-temp.ts
  fi
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
