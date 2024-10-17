// https://github.com/named-data/python-ndn/blob/44ef2cac915041d75cdb64a63355bd2cb0194913/docs/src/lvs/details.rst#signing-key-suggesting

#KEY: "KEY"/_/_/_
#article: /"article"/_topic/_ & { _topic: "eco" | "spo" } <= #author
#author: /site/"author"/_/#KEY <= #admin
#admin: /site/"admin"/_/#KEY <= #anchor
#anchor: /site/#KEY & {site: "la" | "ny" }
