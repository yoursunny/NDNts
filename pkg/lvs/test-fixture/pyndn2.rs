// https://github.com/named-data/python-ndn/blob/44ef2cac915041d75cdb64a63355bd2cb0194913/docs/src/lvs/demonstration.rst

#KEY: "KEY"/_/_/_
#site: "lvs-test"
#article: #site/"article"/author/post/_version & {_version: $eq_type("v=0")} <= #author
#author: #site/"author"/author/"KEY"/_/admin/_ <= #admin
#admin: #site/"admin"/admin/#KEY <= #root
#root: #site/#KEY
