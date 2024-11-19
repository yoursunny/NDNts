// https://github.com/named-data/python-ndn/blob/96ae4bfb0060435e3f19c11d37feca512a8bd1f5/docs/src/lvs/lvs.rst#tutorial

// The platform prefix definition. The pair of quotes means that it can only be matched by the identical component.
#platform: "ndn"/"blog"
// The certificate name suffix definition. Each underscore can be matched by an arbitrary pattern except that contains slash.
#KEY: "KEY"/_/_/_
// The root certificate definition, i.e., /ndn/blog/KEY/<key-id>/<issuer>/<cert-id>.
#root: #platform/#KEY
// Admin's certificate definition. The non-sharp patterns, role and adminID, are sent from the application. Each pattern can match an arbitrary components, but the matched components for the same pattern should be the same. The constraint shows that the component "_role" must be "admin". The underscore means that the matched components for the pattern "_role" may not be identical in the chain. The admin's certificate must be signed by the root certificate.
#admin: #platform/_role/adminID/#KEY & {_role: "admin"} <= #root
// author's certificate definition. The ID is verified by a user function. Both constraints must be met. It can only be signed by the admin's certificate.
#author: #platform/_role/ID/#KEY & {_role: "author", ID: $isValidID()} <= #admin
// author's and reader's certificate definition. The role can be either "reader" or "author". The ID is verified by a user function. Both constraints must be met. It can only be signed by the admin's certificate.
#user: #platform/_role/ID/#KEY & {_role: "reader"|"author", ID: $isValidID()} <= #admin
// article's trust schema. The component "year" is verified by a user function. The article can be signed by the admin's certificate or one author's certificate.
#article: #platform/ID/"post"/year/articleID & {year: $isValidYear()} <= #admin | #author
