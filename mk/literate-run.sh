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
if [ -n ''$LINT ]; then
  (
    echo '// tslint:disable no-console'
    echo '// tslint:disable-next-line ordered-imports'
    codedown ts < README.md
  ) > $ROOTDIR/mk/literate-temp.ts
  tslint -p $ROOTDIR $ROOTDIR/mk/literate-temp.ts
else
  codedown ts < README.md | ts-node -r tsconfig-paths/register
fi
