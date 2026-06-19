# Zap bindings for Node.js

This package is a wrapper exposing the Zap runtime to Node.js. Both the
serialization and the RPC layer are exposed.

> Historical note: this binding was originally derived from Kenton Varda's
> `node-capnp`, and the native addon links against the upstream Cap'n Proto C++
> library as its serialization/RPC engine (the external OSS dependency).

## Caveats

### This implementation is SLOW

Because v8 cannot inline or otherwise optimize calls into C++ code, and because
the C++ bindings are implemented in terms of the "dynamic" API, this
implementation is actually very slow.  In fact, the main advantage of Zap --
the ability to use the wire format as an in-memory format -- does not apply
here, because accessor overhead of such an approach would be too high.
Instead, this implementation is based on decoding messages to native Javascript
objects in an upfront parsing step, and conversely initializing outgoing
messages from complete Javascript objects.  This actually makes the library
somewhat nicer syntactically than it would be otherwise, but it is not fast.

A pure-Javascript implementation would likely be much faster.

### The interface is not final

Especially because of the above caveat, we expect the interface may change
in the future.

## Installation

### From source

    git clone git://github.com/zap-proto/node-zap.git
    cd node-zap
    npm install

Note: node-zap uses [node-gyp](https://github.com/nodejs/node-gyp) for
building. To manually invoke the build process, you can use `node-gyp rebuild`.
This will put the compiled extension in `build/Release/zap.node`. However,
when you do `require('zap')`, it will expect the module to be in, for
example, `bin/linux-x64-v8-3.11/zap.node`. You can manually put the module
here every time you build (or symlink it), or you can use the included build
script. Either `npm install` or `node build -f` will do this for you. If you
are going to be hacking on node-zap, it may be worthwhile to first do
`node-gyp configure` and then for subsequent rebuilds you can just do
`node-gyp build` which will be faster than a full `npm install` or
`node-gyp rebuild`.

## Usage

### Loading the module

    var zap = require("zap");

### Loading schemas

    // Schemas are parsed at runtime.  Once "zap" has been imported, you can
    // load schemas using require().  You can omit the ".zap" suffix if you
    // prefer.
    var foo = require("./foo.zap");

    // If you'd rather not rely on hooking require() (a deprecated -- but
    // probably permanent -- feature of Node), you can use zap.import(), but
    // this makes relative imports uglier:
    var foo = zap.import(__dirname + "/foo.zap");

    // zap.import() takes an exact file name.  If you want to search the
    // import path, use importSystem().  This searches the usual Node module
    // locations as well as standard places to install schema files (i.e.
    // /usr/include and /usr/local/include).
    var schema = zap.importSystem("capnp/schema.capnp");

### Parsing / serializing messages

    var obj = zap.parse(foo.SomeStruct, inputBuffer);
    var outputBuffer = zap.serialize(foo.SomeStruct, obj);

### Connecting to RPC servers

    // connect() accepts the same address string format as kj::Network.
    var conn = zap.connect("localhost:1234");

    // restore() is like EzRpc::importCap()
    var cap = conn.restore("exportName", foo.MyInterface);

### Making an RPC call

    // Method parameters are native Javascript values, converted using the
    // same rules as zap.serialize().
    var promise = cap.someMethod("foo", 123, {a: 1, b: 2});

    // Methods return ES6 "Promise" objects.  The response is a Javascript
    // object containing the results by name.
    promise.then(function(response) {
      console.log(response.namedResult);
    })
    // If the remote object throws an rpc exception, the promise will be
    // rejected. The error returned will have a property `kjType`, which
    // will be a string representation of the exception's `type` field.
    .catch(function(error) {
        switch(error.kjType) {
        case 'failed':
            console.log("A generic problem occurred:", error.message);
            break;
        case 'overloaded':
            console.log("Resource overload on the remote end:", error.message);
            break;
        case 'disconnected':
            // ...
            break;
        case 'unimplemented':
            // ...
            break;
        }
    });

### Pipelining

    // Pipelining is supported.
    promise.anotherMethod();

    // You can explicitly close capabilities and connections if you don't want
    // to wait for the garbage collector to do it.
    cap.close();
    conn.close();

### Implementing an interface

Create a Javascript object with methods corresponding to the interface, and
just pass that object anywhere where a capability is expected.  Methods can
return promises.

For instance, given:

    interface Foo {
      foo @0 (a: Text, b: Int32) -> (c: Text);
    }

    interface Bar {
      bar @0 (foo :Foo) -> ();
    }

You could write:

    // Implement the Foo interface.
    var myFoo = {
      foo: function (a, b) {
        return {c: "blah"};
      }
    }

    // Use it in a call.
    someBar.bar(myFoo);

Zap protocols often depend on explicit notification when there are
no more references to an object. In C++ this would be accomplished by
implementing a destructor, but of course Javascript is garbage collected.
Instead, you may give your object a `close()` method, which will be called
as soon as there are no more references.

    var myFoo = {
      foo: function (a, b) {
        return {c: "blah"};
      },
      close: () {
        console.log("client disconnected");
      }
    }

Note, however, that `close()` will be called once for every time your
native object is coerced to a capability. So, if you did:

    someBar.bar(myFoo);
    someBar.bar(myFoo);

Then `myFoo.close()` will eventually be called twice. To prevent this,
you can explicitly convert your object to a capability once upfront, and
then use that:

    var cap = new zap.Capability(myFoo, mySchema.Foo);

    someBar.bar(cap);
    someBar.bar(cap);

    // Close our own copy of the reference. Note that this does not
    // necessarily call `myFoo.close()` -- that happens only after the
    // two copies passed to the `bar()` calls above have also been closed.
    cap.close();

In this case, the library only wraps `myFoo` as a capability once, and then
calls `close()` once all copies of that reference have been dropped.

If one of your methods throws an exception, or returns a promise which
is subsequently rejected, it will be converted to a Zap rpc
exception. If the exception has a `kjType` property, that will be used
for the exception's `type` field, otherwise the type will be `failed`.

    var myBar = {
        bar: function(foo) {
            if(!bazAvailable()) {
                var err = new Error("The baz is busy; try again later.");
                err.kjType = 'overloaded';
                throw(err);
            }
            // ...
        }
    }

### Exporting a bootstrap capability

    // Connect to another server and export `myFoo` as a bootstrap capability.
    var newConn = zap.connect("localhost:4321",
                              new zap.Capability(myFoo, mySchema.Foo));

### Accepting RPC connections

Not implemented.  Currently you can only be a client, not a server.  (But you
*can* implement capabilities as a client.)
