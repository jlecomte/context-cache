/*jslint node:true, nomen:true, stupid: true */

'use strict';

var fs = require('fs'),
    dimensions = JSON.parse(fs.readFileSync(__dirname + '/../fixtures/dimensions.json', 'utf-8')),
    Benchmark = require('benchmark').Benchmark,
    Benchtable = require('benchtable');

module.exports = {

    getSuite: function (testName) {
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
    },

    getSuiteTable: function (testName) {
        var suiteTable = new Benchtable(testName);

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
    },

    getContext: function () {
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
    },

    getSimpleObject: function () {
        return {a: 1, b: 2, c: 3};
    },

    get3LevelsObject: function () {
        return {a: {b: {c: 1}}};
    },

    get10LevelsObject: function () {
        return {a: {b: {c: {d: {e: {f: {g: {h: {i: {j: 1}}}}}}}}}};
    },

    getBigObject: function () {
        return {a: {b: 'big string: ' + new Array(20000).join("very "), c: 'super big string: ' + new Array(20000).join("very ")}};
    }
};
