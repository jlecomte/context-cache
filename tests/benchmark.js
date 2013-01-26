/*jslint node:true, nomen:true, stupid: true */
'use strict';

var fs = require('fs'),
    dimensions = JSON.parse(fs.readFileSync(__dirname + '/fixtures/dimensions.json', 'utf-8')),
    Benchmark = require('benchmark').Benchmark,
    Benchtable = require('benchtable');

function getSuite(testName) {
    var suite;

    // enabling benchmark suite

    suite = Benchmark.Suite(testName);

    suite.on('start', function () {
        console.log('Starting benchmarks.');
    });

    suite.on('cycle', function (event) {
        if (!event.target.error) {
            console.log(String(event.target));
        }
    });

    suite.on('error', function (event) {
        console.error(String(event.target) + String(event.target.error));
    });

    suite.on('complete', function (event) {
        console.warn('Fastest is ' + this.filter('fastest').pluck('name'));
    });

    return suite;
}

function getSuiteTable(testName) {
    var suiteTable;

    // enabling benchtable suite

    suiteTable = new Benchtable(testName);

    suiteTable.on('start', function () {
        console.log('Starting benchmarks.');
    });

    suiteTable.on('cycle', function (event) {
        if (!event.target.error) {
            console.log(String(event.target));
        }
    });

    suiteTable.on('error', function (event) {
        console.error(String(event.target) + String(event.target.error));
    });

    suiteTable.on('complete', function (event) {
        console.warn('Fastest is ' + this.filter('fastest').pluck('name'));
        console.log(this.table.toString());
    });

    return suiteTable;
}

function getContext() {
    var context = {},
        dimension,
        l,
        i;

    for (dimension in dimensions) {
        if (dimensions.hasOwnProperty(dimension)) {
            l = dimensions[dimension].values.length;
            i = Math.floor(l * Math.random());
            context[dimensions[dimension].name] = dimensions[dimension].values[i];
        }
    }

    return JSON.stringify(context);
}

function getSimpleObject() {
    return {a: 1, b: 2, c: 3};
}

function get3LevelsObject() {
    return {a: {b: {c: 1}}};
}

function get10LevelsObject() {
    return {a: {b: {c: {d: {e: {f: {g: {h: {i: {j: 1}}}}}}}}}};
}

function getBigObject() {
    return {a: {b: 'big string: ' + new Array(20000).join("very "), c: 'super big string: ' + new Array(20000).join("very ")}};
}

function testSetIsolation () {
    // example of a benchtable test
    var v0 = require('../lib/context-cache.js').create({});
    var v1 = require('../lib/context-cache.js').create({
        isolationMode: 'json'
    });
    var v2 = require('../lib/context-cache.js').create({
        isolationMode: 'proto'
    });
    var v3 = require('../lib/context-cache.js').create({
        isolationMode: 'clone'
    });

    getSuiteTable('context set method')
        // add functions
        .addFunction('set without isolation', function(s) {
            v0.set(getContext(), s);
        })
        .addFunction('set with json isolation', function(s) {
            v1.set(getContext(), s);
        })
        .addFunction('set with proto isolation', function(s) {
            v2.set(getContext(), s);
        })
        .addFunction('set with clone isolation', function(s) {
            v3.set(getContext(), s);
        })
        // add inputs
        .addInput('Simple object', [getSimpleObject()])
        .addInput('3 levels deep object', [get3LevelsObject()])
        .addInput('10 levels deep object', [get10LevelsObject()])
        .addInput('Extremely big object', [getBigObject()])
        // spin it!
        .run();
}

function testGetIsolation() {
    // example of a benchtable test
    var v0 = require('../lib/context-cache.js').create({
        isolationMode: false,
        storeObjectsSerialized: 10
    });
    var v1 = require('../lib/context-cache.js').create({
        isolationMode: 'json',
        storeObjectsSerialized: 10
    });
    var v2 = require('../lib/context-cache.js').create({
        isolationMode: 'clone',
        storeObjectsSerialized: 10
    });
    var v3 = require('../lib/context-cache.js').create({
        isolationMode: 'proto',
        storeObjectsSerialized: 10
    });
    var c1 = getContext();
    var c2 = getContext();
    var c3 = getContext();
    var c4 = getContext();

    // simple object
    v0.set(c1, getSimpleObject());
    v1.set(c1, getSimpleObject());
    v2.set(c1, getSimpleObject());
    v3.set(c1, getSimpleObject());

    // 3 levels deep
    v0.set(c2, get3LevelsObject());
    v1.set(c2, get3LevelsObject());
    v2.set(c2, get3LevelsObject());
    v3.set(c2, get3LevelsObject());

    // 10 levels deep
    v0.set(c3, get10LevelsObject());
    v1.set(c3, get10LevelsObject());
    v2.set(c3, get10LevelsObject());
    v3.set(c3, get10LevelsObject());

    // Extremely big object
    v0.set(c4, getBigObject());
    v1.set(c4, getBigObject());
    v2.set(c4, getBigObject());
    v3.set(c4, getBigObject());

    getSuiteTable('context get method in isolation')
        // add functions
        .addFunction('get without isolation', function(context) {
            v0.get(context);
        })
        .addFunction('get with json isolation', function(context) {
            v1.get(context);
        })
        .addFunction('get with clone isolation', function(context) {
            v2.get(context);
        })
        .addFunction('get with proto isolation', function(context) {
            v3.get(context);
        })
        // add inputs
        .addInput('Simple object', [c1])
        .addInput('3 levels deep object', [c2])
        .addInput('10 levels deep object', [c3])
        .addInput('Extremely big object', [c4])
        // spin it!
        .run();
}

testSetIsolation();
testGetIsolation();