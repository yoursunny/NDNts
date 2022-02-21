CXX ?= g++
CXXFLAGS ?= -std=c++17 -Wall -Werror `pkg-config --cflags PSync libndn-cxx`
LDFLAGS ?=
LIBS ?= `pkg-config --libs PSync libndn-cxx`

all:

%/a.out: %/*.cpp
	$(CXX) $(CXXFLAGS) -o $@ $^ $(LDFLAGS) $(LIBS)

clean:
	find -name a.out -delete
