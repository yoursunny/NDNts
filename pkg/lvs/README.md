# @ndn/lvs

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package implements [python-ndn Light VerSec (LVS)](https://python-ndn.readthedocs.io/en/latest/src/lvs/lvs.html) binary format.
It is still in design stage and not yet usable.

To compile LVS textual format to binary format, you need to use python-ndn:

```bash
# create Python virtual environment
python3.11 -m venv ~/lvs.venv
source ~/lvs.venv/bin/activate

# install python-ndn
pip install 'python-ndn[dev] @ git+https://github.com/named-data/python-ndn@44ef2cac915041d75cdb64a63355bd2cb0194913'

# run the compiler
python ./pkg/lvs/compile.py <~/lvs-model.txt >~/lvs-model.tlv
```

The compiled binary TLV will be importable into NDNts in the future.
