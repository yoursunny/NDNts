#!/bin/bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

for F in *.rs; do
  pyndntools Compile-Lvs -o "${F%.rs}.tlv" "$F"
done
