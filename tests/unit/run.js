/*

Copyrights for code authored by Yahoo! Inc. is licensed under the following
terms:

MIT License

Copyright (c) 2013 Yahoo! Inc. All Rights Reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

*/

/*jslint node: true, nomen: true, stupid: true */

'use strict';

var fs = require('fs'),
    json = fs.readFileSync(__dirname + '/../fixtures/dimensions.json', 'utf-8'),
    dimensions = JSON.parse(json),
    Y = require('yui').use('test'),
    A = Y.Test.Assert,
    AO = Y.Test.ObjectAssert,
    ContextCache;

function getContext() {
    var context = {};

    Y.each(dimensions, function (dimension) {
        var l = dimension.values.length,
            i = Math.floor(l * Math.random());
        context[dimension.name] = dimension.values[i];
    });

    return JSON.stringify(context);
}

Y.Test.Runner.add(new Y.Test.Case({

    name: 'context-cache unit tests',

    setUp: function () {
        ContextCache = require('../../lib/context-cache.js');
    },

    'test if we can create a context cache instance': function () {
        var cc = ContextCache.create(),
            info;

        A.isObject(cc, 'ContextCache');

        A.isFunction(cc.get, 'ContextCache::get');
        A.isFunction(cc.set, 'ContextCache::set');
        A.isFunction(cc.getHitRate, 'ContextCache::getHitRate');
        A.isFunction(cc.getInfo, 'ContextCache::getInfo');

        info = cc.getInfo();
        A.areSame(100, info.config.maxCacheSize);
        A.areSame(0, info.config.cacheHitThreshold);
        A.isFalse(!!info.config.isolationMode);
        A.isFalse(info.config.storeObjectsSerialized);
        A.isUndefined(info.config.hotcacheTTL);
        A.isTrue(Y.Object.isEmpty(info.contexts));
    },

    'test adding and retrieving data to/from a cache': function () {
        var context = getContext(),
            cc = ContextCache.create(),
            info;

        info = cc.getInfo();
        A.isUndefined(info.contexts[context]);

        A.isTrue(cc.set(context, {}));

        info = cc.getInfo();
        A.areSame(0, info.contexts[context].hits);
        A.isTrue(info.contexts[context].cached);

        A.isNotUndefined(cc.get(context));

        info = cc.getInfo();
        A.areSame(1, info.contexts[context].hits);
        A.isTrue(info.contexts[context].cached);

        cc.get(context);
        cc.get(context);

        info = cc.getInfo();
        A.areSame(3, info.contexts[context].hits);
        A.isTrue(info.contexts[context].cached);
    },

    'test cacheHitThreshold configuration': function () {
        var context = getContext(),
            data = {},
            cc = ContextCache.create({
                cacheHitThreshold: 3
            });

        A.isFalse(cc.set(context, data));
        cc.get(context);
        A.isFalse(cc.set(context, data));
        cc.get(context);
        A.isFalse(cc.set(context, data));
        cc.get(context);
        A.isTrue(cc.set(context, data));
    },

    'test maxCacheSize configuration and what happens when we try to add data to an already full cache': function () {
        var context1 = getContext(),
            context2 = getContext(),
            context3 = getContext(),
            context4 = getContext(),

            cc = ContextCache.create({
                maxCacheSize: 3
            }),

            info;

        cc.get(context1);
        A.isTrue(cc.set(context1, {}));

        cc.get(context2);
        cc.get(context2);
        A.isTrue(cc.set(context2, {}));

        cc.get(context3);
        cc.get(context3);
        cc.get(context3);
        A.isTrue(cc.set(context3, {}));

        cc.get(context4);
        A.isFalse(cc.set(context4, {}));

        cc.get(context4); // Bumps the number of hits for context4 above context1...
        A.isTrue(cc.set(context4, {}));

        info = cc.getInfo();

        A.areSame(1, info.contexts[context1].hits);
        A.isFalse(info.contexts[context1].cached);

        A.areSame(2, info.contexts[context2].hits);
        A.isTrue(info.contexts[context2].cached);

        A.areSame(3, info.contexts[context3].hits);
        A.isTrue(info.contexts[context3].cached);

        A.areSame(2, info.contexts[context4].hits);
        A.isTrue(info.contexts[context4].cached);
    },

    'test storeObjectsSerialized configuration': function () {
        var context1 = getContext(),
            context2 = getContext(),
            cc = ContextCache.create({
                storeObjectsSerialized: true
            }),
            info;

        info = cc.getInfo();
        A.isTrue(info.config.storeObjectsSerialized);
        A.areSame(1000, info.config.hotcacheTTL);

        cc.get(context1);
        cc.set(context1, {});

        this.wait(function () {
            cc.set(context2, {}); // this will purge the hot cache, removing context1
            A.isNotUndefined(cc.get(context1));
            A.isNotUndefined(cc.get(context1));
            A.isNotUndefined(cc.get(context2));
        }, 1500);
    },

    'test isolationMode': function () {
        var context = getContext(),
            source = {
                a: {
                    b: 1
                },
                c: 1
            };

        function validate(model) {
            var cc, dest;

            cc = ContextCache.create({
                isolationMode: model
            });

            cc.set(context, source);

            dest = cc.get(context);

            A.areSame(1, dest.a.b, model);

            // changing top level entries
            dest.c = 2;
            // changing child entries
            dest.a.b = 3;
            // adding top level entries
            dest.d = 4;
            // adding child entries
            dest.a.e = 5;

            A.areSame(1, source.c, model + ': top level entries are not isolated');
            A.areSame(1, source.a.b, model + ': child entries are not isolated');
            A.isUndefined(source.d, model + ': new top level entries are not isolated');
            A.isUndefined(source.a.e, model + ': new child entries are not isolated');
        }

        validate('json');
        validate('clone');
    }
}));

process.on('exit', function () {
    var results = Y.Test.Runner.getResults();
    if (results && results.failed) {
        process.exit(1);
    }
});

Y.Test.Runner.run();
