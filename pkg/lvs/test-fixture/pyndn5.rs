// https://github.com/named-data/python-ndn/blob/64938def54afd11f9766243b19bf06e6a2ccd163/tests/misc/light_versec_test.py#L385

#network: network & { network: "ndn" | "yoursunny" }
#CERT: "KEY"/_/_/_
#sitename: s1
#sitename: s1/s2
#sitename: s1/s2/s3
#routername: #network/#sitename/"%C1.Router"/routerid
#rootcert: #network/#CERT
#sitecert: #network/#sitename/#CERT <= #rootcert
#operatorcert: #network/#sitename/"%C1.Operator"/opid/#CERT <= #sitecert
#routercert: #routername/#CERT <= #operatorcert
#lsdbdata: #routername/"nlsr"/"lsdb"/lsatype/version/segment <= #routercert
