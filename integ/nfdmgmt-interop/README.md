# `@ndn/nfdmgmt` Interoperability Test

Test environment:

* Ubuntu 26.04
* ndn-cxx 0.9.0-39-g093f5006
* Node.js 26.5.0

Reference implementation:

* NFD 24.07-34-g146968d3
  * Launched with `nfd.conf.sample`
* [NDNd](https://github.com/named-data/ndnd) commit `c45174db7d18dc5b9b5d632d1439e8a5c945fca2` (2026-07-11)
  * YaNFD launched with `yanfd.sample.yml`

Ensure test script points to the running NFD or YaNFD as a local-scope face with one of these commands:

```bash
export NDNTS_UPLINK=unix:///run/nfd/nfd.sock
export NDNTS_UPLINK=tcp://127.0.0.1:6363
```

Test [Forwarder Status](https://redmine.named-data.net/projects/nfd/wiki/ForwarderStatus):

```bash
corepack pnpm literate integ/nfdmgmt-interop/general.ts
```

Test [Face Management](https://redmine.named-data.net/projects/nfd/wiki/FaceMgmt) and [RIB Management](https://redmine.named-data.net/projects/nfd/wiki/RibMgmt):

```bash
corepack pnpm literate integ/nfdmgmt-interop/face-rib.ts
```

Test [Strategy Choice Management](https://redmine.named-data.net/projects/nfd/wiki/StrategyChoice):

```bash
corepack pnpm literate integ/nfdmgmt-interop/strategy.ts
```

Test [Content Store Management](https://redmine.named-data.net/projects/nfd/wiki/CsMgmt) (incompatible with YaNFD due to [NDNd issue 196](https://github.com/named-data/ndnd/issues/196)):

```bash
corepack pnpm literate integ/nfdmgmt-interop/cs.ts
```

Test [Prefix Announcement](https://redmine.named-data.net/projects/nfd/wiki/RibMgmt#Register-a-route-with-Prefix-Announcement-object) (incompatible with YaNFD due to [NDNd issue 195](https://github.com/named-data/ndnd/issues/195)):

```bash
env NDNTS_NFDREGANN=1 corepack pnpm literate integ/nfdmgmt-interop/prefixann.ts
ndnping -c 20 /localhost/demo-prefixann
```
