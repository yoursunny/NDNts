set -e

if [ ''$1 = 'lint' ]; then
  LINT=$1
  shift
fi

if [ -z $1 ]; then
  find packages -name README.md -printf '%h\n'| xargs -L 1 sh mk/literate-run.sh $LINT
  exit
fi

ROOTDIR=$(pwd)
cd $1
if ! grep '```ts' README.md >/dev/null; then
  exit 0
fi
if [ -n ''$LINT ]; then
  (
    echo '// tslint:disable no-console'
    echo '// tslint:disable-next-line ordered-imports'
    codedown ts < README.md
  ) > $ROOTDIR/mk/literate-temp.ts
  echo literate lint $1/README.md >/dev/stderr
  tslint -p $ROOTDIR $ROOTDIR/mk/literate-temp.ts
else
  echo literate exec $1/README.md >/dev/stderr
  codedown ts < README.md | ts-node -r tsconfig-paths/register
fi
