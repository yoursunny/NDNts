# syncps

```bash
sudo apt install build-essential clang-8 liblog4cxx-dev libprotobuf-dev libssl-dev protobuf-compiler

# ndn-ind commit dd934a7a5106cda6ea14675554427e12df1ce18f
git clone https://github.com/operantnetworks/ndn-ind.git
cd ndn-ind
./configure
make -j$(nproc)
sudo make install
sudo ldconfig

# DNMP-v2 commit c9431460f85c326a410758aa4ff2a26bfcf0df69
git clone https://github.com/pollere/DNMP-v2.git
cd DNMP-v2
make syncps/syncps-content.pb.cc

NDNTS_NFDREG=1 npm run literate packages/sync/interop-test/syncps.ts

./demo /syncps-interop /syncps-interop-data /syncps-interop-data/ind/$RANDOM >/dev/null

```
