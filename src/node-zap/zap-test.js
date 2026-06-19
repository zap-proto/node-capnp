// Copyright (c) 2014 Sandstorm Development Group, Inc. and contributors
// Licensed under the MIT License:
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

var fs = require("fs");
var zap = require("./zap");
var assert = require("assert");
var spawn = require("child_process").spawn;

var goldenBinary;
var goldenPackedBinary;
var goldenFlatBinary;
var goldenPackedFlatBinary;
try {
  // Works in Ekam build.
  goldenBinary = fs.readFileSync("node-zap/testdata/binary");
  goldenPackedBinary = fs.readFileSync("node-zap/testdata/packedbinary");
  goldenFlatBinary = fs.readFileSync("node-zap/testdata/flat");
  goldenPackedFlatBinary = fs.readFileSync("node-zap/testdata/packedflat");
} catch (ex) {
  // Works in npm build.
  goldenBinary = fs.readFileSync("src/node-zap/testdata/binary");
  goldenPackedBinary = fs.readFileSync("src/node-zap/testdata/packedbinary");
  goldenFlatBinary = fs.readFileSync("src/node-zap/testdata/flat");
  goldenPackedFlatBinary = fs.readFileSync("src/node-zap/testdata/packedflat");
}

var test = require("./test.zap");
assert(test === zap.import(__dirname + "/test.zap"));
assert(test === require("./test"));

assert("namespace" in zap.importSystem("capnp/c++.capnp"));

var parsed = zap.parse(test.TestAllTypes, goldenBinary);

var roundTripped = zap.serialize(test.TestAllTypes, parsed);

var canon = zap.bytesToPreorder(test.TestAllTypes, roundTripped);

assert.equal(goldenBinary.length, roundTripped.length, "Round trip changed size?");
assert.equal(goldenBinary.toString("base64"), canon.toString("base64"), "Round trip lost data?");

assert.equal(3456789012, test.TestConstants.uint32Const);
assert.equal("foo", test.TestConstants.textConst);
assert.equal("baz", test.TestConstants.structConst.textField);
assert.equal("xyzzy", test.TestConstants.textListConst[1]);

// Test packed serialization/deserialization

var parsedPacked = zap.parsePacked(test.TestAllTypes, goldenPackedBinary);
var roundTrippedPacked = zap.serializePacked(test.TestAllTypes, parsedPacked);
assert.equal(goldenPackedBinary.length, roundTrippedPacked.length, "Round trip changed size?");
assert.equal(goldenPackedBinary.toString("base64"), roundTrippedPacked.toString("base64"), "Round trip lost data?");

var parsedFlat = zap.parse(test.TestAllTypes, goldenFlatBinary, {flat: true});
var roundTrippedFlat = zap.serialize(test.TestAllTypes, parsedFlat, {flat: true});
assert.equal(goldenFlatBinary.length, roundTrippedFlat.length, "Round trip changed size?");
assert.equal(goldenFlatBinary.toString("base64"), roundTrippedFlat.toString("base64"), "Round trip lost data?");

var parsedPackedFlat = zap.parse(test.TestAllTypes, goldenPackedFlatBinary, {packed: true, flat: true});
var roundTrippedPackedFlat = zap.serialize(test.TestAllTypes, parsedPackedFlat, {packed: true, flat: true});
assert.equal(goldenPackedFlatBinary.length, roundTrippedPackedFlat.length, "Round trip changed size?");
assert.equal(goldenPackedFlatBinary.toString("base64"), roundTrippedPackedFlat.toString("base64"), "Round trip lost data?");

// TODO(someday): do a more thorough deep equality comparison of parsed and parsedPacked
var keys = ["voidField", "boolField", "int8Field", "int16Field", "int32Field", "int64Field"];
for (var key in keys) {
  assert.equal(parsed[key], parsedPacked[key]);
  assert.equal(parsed[key], parsedFlat[key]);
  assert.equal(parsed[key], parsedPackedFlat[key]);
}

console.log("serialization: pass");

// =======================================================================================
// Test matchPowerboxQuery

if (zap.matchPowerboxQuery) {

var tag1 = zap.serialize(test.TestAllTypes, {int32Field: 123});
var tag2 = zap.serialize(test.TestAllTypes, {int32Field: 321});
var tag3 = zap.serialize(test.TestAllTypes, {});

assert(zap.matchPowerboxQuery(tag1, tag1));
assert(zap.matchPowerboxQuery(tag2, tag2));
assert(zap.matchPowerboxQuery(tag3, tag3));

assert(!zap.matchPowerboxQuery(tag1, tag2));
assert(!zap.matchPowerboxQuery(tag2, tag3));
assert(!zap.matchPowerboxQuery(tag3, tag1));

var emptyTag = zap.serialize(test.TestEmptyStruct, {});
assert(!zap.matchPowerboxQuery(emptyTag, tag1));
assert(!zap.matchPowerboxQuery(emptyTag, tag2));
assert(zap.matchPowerboxQuery(emptyTag, tag3));
assert(!zap.matchPowerboxQuery(tag1, emptyTag));
assert(!zap.matchPowerboxQuery(tag2, emptyTag));
assert(zap.matchPowerboxQuery(tag3, emptyTag));

// Test comparing pointers.
var tagStr1 = zap.serialize(test.TestAllTypes, {textField: "foo"});
var tagStr2 = zap.serialize(test.TestAllTypes, {textField: "bar"});
var tagStr3 = zap.serialize(test.TestAllTypes, {textField: ""});
assert(zap.matchPowerboxQuery(tagStr1, tagStr1));
assert(zap.matchPowerboxQuery(tagStr2, tagStr2));
assert(zap.matchPowerboxQuery(tagStr3, tagStr3));
assert(!zap.matchPowerboxQuery(tagStr1, tagStr2));
assert(!zap.matchPowerboxQuery(tagStr2, tagStr3));
assert(!zap.matchPowerboxQuery(tagStr3, tagStr1));
assert(zap.matchPowerboxQuery(tagStr1, emptyTag));
assert(zap.matchPowerboxQuery(tagStr2, emptyTag));
assert(zap.matchPowerboxQuery(tagStr3, emptyTag));
assert(zap.matchPowerboxQuery(emptyTag, tagStr1));
assert(zap.matchPowerboxQuery(emptyTag, tagStr2));
assert(zap.matchPowerboxQuery(emptyTag, tagStr3));

// Note that string comparisons are actually list comparisons. But let's make sure an exact match
// is required (which is not the case for list-of-structs).
var tagStr4 = zap.serialize(test.TestAllTypes, {textField: "oof"});
assert(!zap.matchPowerboxQuery(tagStr1, tagStr4));

// Test list-of-structs.
var tagFooBar = zap.serialize(test.TestAllTypes,
    {structList: [{textField: "foo"}, {textField: "bar"}]});
var tagBarFoo = zap.serialize(test.TestAllTypes,
    {structList: [{textField: "bar"}, {textField: "foo"}]});
var tagFooOnly = zap.serialize(test.TestAllTypes,
    {structList: [{textField: "foo"}]});
var tagBarOnly = zap.serialize(test.TestAllTypes,
    {structList: [{textField: "bar"}]});
var tagEmptyList = zap.serialize(test.TestAllTypes,
    {structList: []});

assert(zap.matchPowerboxQuery(tagFooBar, tagFooBar));
assert(zap.matchPowerboxQuery(tagFooBar, tagBarFoo));
assert(zap.matchPowerboxQuery(tagBarFoo, tagFooBar));
assert(zap.matchPowerboxQuery(tagFooOnly, tagFooBar));
assert(zap.matchPowerboxQuery(tagBarOnly, tagFooBar));
assert(zap.matchPowerboxQuery(tagFooOnly, tagBarFoo));
assert(zap.matchPowerboxQuery(tagBarOnly, tagBarFoo));
assert(!zap.matchPowerboxQuery(tagFooBar, tagFooOnly));
assert(!zap.matchPowerboxQuery(tagFooBar, tagBarOnly));
assert(!zap.matchPowerboxQuery(tagBarFoo, tagFooOnly));
assert(!zap.matchPowerboxQuery(tagBarFoo, tagBarOnly));

assert(zap.matchPowerboxQuery(tagFooBar, emptyTag));
assert(zap.matchPowerboxQuery(tagFooOnly, emptyTag));
assert(zap.matchPowerboxQuery(tagBarOnly, emptyTag));
assert(zap.matchPowerboxQuery(emptyTag, tagFooBar));
assert(zap.matchPowerboxQuery(emptyTag, tagFooOnly));
assert(zap.matchPowerboxQuery(emptyTag, tagBarOnly));

assert(!zap.matchPowerboxQuery(tagFooBar, tagEmptyList));
assert(!zap.matchPowerboxQuery(tagFooOnly, tagEmptyList));
assert(!zap.matchPowerboxQuery(tagBarOnly, tagEmptyList));
assert(zap.matchPowerboxQuery(tagEmptyList, tagFooBar));
assert(zap.matchPowerboxQuery(tagEmptyList, tagFooOnly));
assert(zap.matchPowerboxQuery(tagEmptyList, tagBarOnly));

// Test list-of-pointers.
var tagStrList1 = zap.serialize(test.TestAllTypes, {textList: ["foo", "bar"]});
var tagStrList2 = zap.serialize(test.TestAllTypes, {textList: ["bar", "foo"]});
var tagStrList3 = zap.serialize(test.TestAllTypes, {textList: ["foo"]});
var tagStrList4 = zap.serialize(test.TestAllTypes, {textList: ["foo", null]});

assert(zap.matchPowerboxQuery(tagStrList1, tagStrList1));
assert(zap.matchPowerboxQuery(tagStrList2, tagStrList2));
assert(!zap.matchPowerboxQuery(tagStrList1, tagStrList2));
assert(!zap.matchPowerboxQuery(tagStrList2, tagStrList1));
assert(!zap.matchPowerboxQuery(tagStrList3, tagStrList1));
assert(zap.matchPowerboxQuery(tagStrList4, tagStrList1));

console.log("matchPowerboxQuery: pass");

}

// =======================================================================================
// Test RPC, if possible.

if (!fs.existsSync("capnp-samples")) {
  console.warn("skipping RPC because capnp-samples not present");
  process.exit(0);
}

var Fiber = require("fibers");

function wait(promise) {
  var fiber = Fiber.current;
  var success, result, error;
  promise.then(function (p) {
    success = true;
    result = p;
    fiber.run();
  }, function (e) {
    success = false;
    error = e;
    fiber.run();
  });
  Fiber.yield();
  if (success) {
    return result;
  } else {
    throw error;
  }
}

function doFiber(func, child) {
  new Fiber(function () {
    try {
      func();
      if (child) {
        child.kill();
        child.unref();
      }
    } catch (err) {
      console.log(err.stack);
      if (child) {
        child.kill();
        child.unref();
      }
      process.exit(1);
    }
  }).run();
}

var child = spawn("capnp-samples/calculator-server", ["127.0.0.1:21311"],
                  {stdio: [0, "pipe", 2], env: {}});

child.stdio[1].once("readable", function() {
  child.stdio[1].resume();  // ignore all input

  doFiber(function() {
    var conn = zap.connect("127.0.0.1:21311");
    var Calculator = zap.import("capnp-samples/calculator.capnp").Calculator;
    var calc = conn.restore(null, Calculator);

    var add = calc.getOperator("add").func;
    var subtract = calc.getOperator("subtract").func;
    var pow = {
      call: function (params) {
        return Math.pow(params[0], params[1]);
      },
      close: function () {
        this.closed = true;
      },
      closed: false
    };

    function usePow(pow) {
      var localCap = new zap.Capability(pow, Calculator.Function);
      assert.equal(9, wait(localCap.call([3, 2])).value);
      assert(!pow.closed);
      localCap.close();
      assert(pow.closed);

      var promise = calc.evaluate(
          {call: {"function": subtract, params: [
              {call: {"function": add, params: [
                  {literal: 123}, {literal: 456}]}},
              {literal: 321}]}});

      var value = promise.value;
      assert.equal(258, wait(value.read()).value);
      value.close();

      pow.closed = false;
      value = calc.evaluate(
          {call: {"function": pow, params: [{literal: 2}, {literal: 4}]}}).value;
      assert.equal(16, wait(value.read()).value);

      // Wait a moment to give the capability a chance to be dropped.
      wait(new Promise((resolve, reject) => setTimeout(resolve, 10)));
      assert(pow.closed);
      value.close();
    }
    usePow(pow);

    // Try using a class.
    class PowClass {
      constructor() {
        this.closed = false
      }
      call(params) {
        return Math.pow(params[0], params[1]);
      }
      close() {
        this.closed = true;
      }
    };
    usePow(new PowClass());

    // Try wrapping a promise as a capability -- calls are queued until resolution.
    var resolvePromisedCalc;
    var promisedCalc = new zap.Capability(new Promise(function (resolve, reject) {
      resolvePromisedCalc = resolve;
    }), Calculator);

    value = promisedCalc.evaluate(
        {call: {"function": add, params: [
            {literal: 123}, {literal: 321}]}}).value;
    promise = value.read();
    resolvePromisedCalc(calc);
    assert.equal(444, wait(promise).value);
    value.close();

    // Like above, but reject the promise so queued calls fail.
    var rejectPromisedCalc;
    promisedCalc = new zap.Capability(new Promise(function (resolve, reject) {
      rejectPromisedCalc = reject;
    }), Calculator);

    value = promisedCalc.evaluate(
        {call: {"function": add, params: [
            {literal: 123}, {literal: 321}]}}).value;
    promise = value.read();
    rejectPromisedCalc(new Error("foo example error"));
    assert.throws(function() { wait(promise); }, /foo example error/);
    value.close();

    add.close();
    subtract.close();
    calc.close();
    conn.close();

    console.log("rpc: pass");
  }, child);
});
