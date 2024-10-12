#!/usr/bin/env python
import sys

import ndn.app_support.light_versec

lvs_text = sys.stdin.read()
lvs_model = ndn.app_support.light_versec.compile_lvs(lvs_text)
sys.stdout.buffer.write(lvs_model.encode())
