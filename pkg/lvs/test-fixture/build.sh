#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

for F in *.rs; do
  python ../compile.py <$F >${F%.rs}.tlv
done
