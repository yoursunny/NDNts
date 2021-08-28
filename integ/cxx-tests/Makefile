CXX ?= g++
CXXFLAGS ?= -std=c++14 -Wall -Werror `pkg-config --cflags libndn-cxx`
LDFLAGS ?=
LIBS ?= `pkg-config --libs libndn-cxx`

%/a.out: %/*.cpp
	$(CXX) $(CXXFLAGS) -o $@ $^ $(LDFLAGS) $(LIBS)

clean:
	find -name a.out -delete
