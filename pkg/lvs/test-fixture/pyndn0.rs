// https://github.com/named-data/python-ndn/blob/44ef2cac915041d75cdb64a63355bd2cb0194913/docs/src/lvs/lvs.rst#quick-example

// Site prefix is "/a/blog"
#site: "a"/"blog"
// The trust anchor name is of pattern /a/blog/KEY/<key-id>/<issuer>/<cert-id>
#root: #site/#KEY
// Posts are signed by some author's key
#article: #site/"article"/category/year/month <= #author
// An author's key is signed by an admin's key
#author: #site/role/author/#KEY & { role: "author" } <= #admin
// An admin's key is signed by the root key
#admin: #site/"admin"/admin/#KEY <= #root

#KEY: "KEY"/_/_/_
