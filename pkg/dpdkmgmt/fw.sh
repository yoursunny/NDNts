#!/bin/bash
set -euo pipefail

if ! docker image inspect localhost/ndn-dpdk &>/dev/null; then
  docker pull ghcr.io/usnistgov/ndn-dpdk
  docker tag ghcr.io/usnistgov/ndn-dpdk localhost/ndn-dpdk
fi

docker rm -f ndndpdk-svc
docker run -d --name ndndpdk-svc \
  --restart on-failure \
  --cap-add IPC_LOCK --cap-add NET_ADMIN --cap-add SYS_ADMIN --cap-add SYS_NICE \
  -v /run/ndn:/run/ndn \
  localhost/ndn-dpdk

GQLSERVER=$(docker inspect -f 'http://{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}:3030' ndndpdk-svc)
DPDKCTRL="docker run -i --rm localhost/ndn-dpdk ndndpdk-ctrl --gqlserver $GQLSERVER"

jq -n '{
  eal: {
    cores: [1],
    lcoresPerNuma: { "0": 6 },
    memFlags: "--no-huge -m 4096",
    disablePCI: true
  },
  lcoreAlloc: {
    RX: [1],
    TX: [2],
    FWD: [3,4],
    CRYPTO: [5]
  },
  mempool: {
    DIRECT: { capacity: 65535, dataroom: 2200 },
    INDIRECT: { capacity: 65535 }
  },
  fib: {
    capacity: 255,
    startDepth: 6
  },
  pcct: {
    pcctCapacity: 65535,
    csMemoryCapacity: 20000,
    csIndirectCapacity: 20000
  }
}' | $DPDKCTRL activate-forwarder

echo
echo 'NDN-DPDK forwarder started.'
echo
echo 'Export these environment variables for @ndn/dpdkmgmt demo:'
echo
echo '  'export DEMO_DPDKMGMT_GQLSERVER=$GQLSERVER
echo '  'export DEMO_DPDKMGMT_MEMIF=1 \# optional
echo
echo 'To shutdown NDN-DPDK:'
echo
echo '  'docker rm -f ndndpdk-svc
