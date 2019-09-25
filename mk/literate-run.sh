set -e

if [ ''$1 = 'lint' ]; then
  LINT=$1
  shift
fi

if [ -z $1 ]; then
  find packages -name README.md -printf '%h\n'| xargs -L 1 sh mk/literate-run.sh $LINT
elif [ -n ''$LINT ]; then
  (
    echo '// tslint:disable-next-line ordered-imports'
    codedown ts < $1/README.md
  ) > mk/literate-temp.ts
  tslint -p . mk/literate-temp.ts
else
  codedown ts < $1/README.md | ts-node -r tsconfig-paths/register
fi
