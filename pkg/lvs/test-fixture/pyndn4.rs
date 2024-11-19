// https://github.com/named-data/python-ndn/blob/96ae4bfb0060435e3f19c11d37feca512a8bd1f5/tests/misc/light_versec_test.py#L287

#r1: a/b/c & { c: b, c: a, a: "a"|"x" } | { b: "b"|"y" } <= #r2 | #r3
#r2: x/y/z & { x: "xxx" }
#r3: x/y/z & { y: "yyy" }
