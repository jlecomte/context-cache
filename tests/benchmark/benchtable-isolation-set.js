/*jslint node:true, nomen:true, stupid: true */

'use strict';

var common = require('./benchmark-common.js'),
    ContextCache = require('../../lib/context-cache.js'),

    v0 = ContextCache.create(),

    v1 = ContextCache.create({
        isolationMode: 'json'
    }),

    v2 = ContextCache.create({
        isolationMode: 'clone'
    });

common.getSuiteTable('context set method')
    // add functions
    .addFunction('set without isolation', function (s) {
        v0.set(common.getContext(), s);
    })
    .addFunction('set with json isolation', function (s) {
        v1.set(common.getContext(), s);
    })
    .addFunction('set with clone isolation', function (s) {
        v2.set(common.getContext(), s);
    })
    // add inputs
    .addInput('Simple object', [common.getSimpleObject()])
    .addInput('3 levels deep object', [common.get3LevelsObject()])
    .addInput('10 levels deep object', [common.get10LevelsObject()])
    .addInput('Extremely big object', [common.getBigObject()])
    // spin it!
    .run();
