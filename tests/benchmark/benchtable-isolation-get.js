/*jslint node:true, nomen:true, stupid: true */

'use strict';

var common = require('./benchmark-common.js'),
    ContextCache = require('../../lib/context-cache.js'),

    v0 = ContextCache.create({
        isolationMode: false,
        storeObjectsSerialized: 10
    }),

    v1 = ContextCache.create({
        isolationMode: 'json',
        storeObjectsSerialized: 10
    }),

    v2 = ContextCache.create({
        isolationMode: 'clone',
        storeObjectsSerialized: 10
    }),

    c1 = common.getContext(),
    c2 = common.getContext(),
    c3 = common.getContext(),
    c4 = common.getContext();

// simple object
v0.set(c1, common.getSimpleObject());
v1.set(c1, common.getSimpleObject());
v2.set(c1, common.getSimpleObject());

// 3 levels deep
v0.set(c2, common.get3LevelsObject());
v1.set(c2, common.get3LevelsObject());
v2.set(c2, common.get3LevelsObject());

// 10 levels deep
v0.set(c3, common.get10LevelsObject());
v1.set(c3, common.get10LevelsObject());
v2.set(c3, common.get10LevelsObject());

// Extremely big object
v0.set(c4, common.getBigObject());
v1.set(c4, common.getBigObject());
v2.set(c4, common.getBigObject());

common.getSuiteTable('context common.get method in isolation')
    // add functions
    .addFunction('get without isolation', function (context) {
        v0.get(context);
    })
    .addFunction('get with json isolation', function (context) {
        v1.get(context);
    })
    .addFunction('get with clone isolation', function (context) {
        v2.get(context);
    })
    // add inputs
    .addInput('Simple object', [c1])
    .addInput('3 levels deep object', [c2])
    .addInput('10 levels deep object', [c3])
    .addInput('Extremely big object', [c4])
    // spin it!
    .run();
