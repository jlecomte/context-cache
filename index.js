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

/*

Requests are often served differently depending on their "context".
The context of a request is composed of multiple dimensions.
Here are some examples of common dimensions:

    - environment   { production, staging, regression, development, etc. }
    - lang          { en-US, en-GB, fr-FR, fr-CA, etc. }
    - device        { desktop, tablet, phone, etc. }
    - partner       { foo, bar, baz, etc. }
    - experiment    { A, B, C, etc. }

Oftentimes, meta-data necessary to handle a request has to be computed based on
its context. That computing can be expensive, so the result is usually cached.
Unfortunately, as you can see, the number of contexts can be extremely high
since it is the combination of the values each dimension can take. This results
in a very large cache containing a large number of objects. This in turns slows
down garbage collection (GC). At Yahoo!, we've seen instances where GC ends up
representing 70% of the average time needed to serve a request! Additionally,
in some cases, only a small number of contexts may really be needed to serve a
large percentage of traffic. For example, at Yahoo! Search, a node may cache
meta-data for 1,000+ contexts, but we noticed that the 100 most requested
contexts serve over 98% of our traffic.

This utility module solves this specific issue by caching data only for the
most requested contexts. This will result in low latency for most of your
traffic and low memory consumption, which is a requirement for efficient GC.

*/

/*jslint node: true, nomen: true, plusplus: true, todo: true */

'use strict';

var DEFAULT_MAX_CACHE_SIZE = 100,
    DEFAULT_CACHE_HIT_THRESHOLD = 10,
    DEFAULT_HOT_CACHE_TTL_MS = 1000;

function ContextCache(config) {

    var // The "master" cache, containing the serialized data
        // for the most requested contexts.
        _masterCache = {},

        // The number of contexts for which we have data in the master cache
        count = 0,

        // The total number of read operations
        _accesses = 0,

        // The number of cache hits
        _hits = 0,

        // The "hot" cache, initialized below, only if needed.
        _hotCache;

    //-- Validate/compute configuration options -------------------------------

    if (config.hasOwnProperty('maxCacheSize') &&
            (isNaN(config.maxCacheSize) || config.maxCacheSize <= 0)) {
        throw new Error('Invalid value for the "maxCacheSize" option');
    } else {
        config.maxCacheSize = DEFAULT_MAX_CACHE_SIZE;
    }

    if (config.hasOwnProperty('cacheHitThreshold') &&
            (isNaN(config.cacheHitThreshold) || config.cacheHitThreshold <= 0)) {
        throw new Error('Invalid value for the "cacheHitThreshold" option');
    } else {
        config.cacheHitThreshold = DEFAULT_CACHE_HIT_THRESHOLD;
    }

    if (config.hasOwnProperty('useHotCache') && config.useHotCache) {
        // When the hot cache is used, the objects are stored serialized in
        // the master cache to reduce even further the work the GC has to do.
        // This cache mitigates the costs of serializing/deserializing during
        // the handling of a single request.

        // When the hot cache is not used, the objects are stored deserialized
        // directly in the master cache.
        _hotCache = {};

        if (config.hasOwnProperty('hotCacheTTL') &&
                (isNaN(config.hotCacheTTL) || config.hotCacheTTL <= 0)) {
            throw new Error('Invalid value for the "hotCacheTTL" option');
        } else {
            config.hotCacheTTL = DEFAULT_HOT_CACHE_TTL_MS;
        }
    }

    //-- Private methods ------------------------------------------------------

    function _purgeHotCache() {
        var now = Date.now(),
            context;

        if (!_hotCache) {
            return;
        }

        for (context in _hotCache) {
            if (_hotCache.hasOwnProperty(context)) {
                if (now - _hotCache[context].ts > config.hotCacheTTL) {
                    delete _hotCache[context];
                }
            }
        }
    }

    //-- Public methods -------------------------------------------------------

    /**
     * @method set
     * @params {String} context
     * @params {Object} data
     * @return {Boolean}
     */
    this.set = function (context, data) {
        var mo;

        if (!_masterCache.hasOwnProperty(context)) {
            // This context was never written or even requested.
            // Create an empty entry in the master cache.
            _masterCache[context] = { hits: 0 };
        }

        mo = _masterCache[context];

        if (mo.data) {
            // The object was already cached -> nothing to do!
            return true;
        }

        if (mo.hits < config.cacheHitThreshold) {
            // This checks prevents data from being cached immediately after
            // a box is put into rotation. Indeed, we need to handle a few
            // requests to get some basic knowledge about what the traffic
            // patterns look like so we can optimize the content of the cache.
            return false;
        }

        if (count < config.maxCacheSize) {
            // The cache is not full, so we can just store the data.
            // Note that the data is stored serialized if the hot cache
            // is enabled.
            count++;
            mo.data = _hotCache ? JSON.stringify(data) : data;
            return true;
        }

        // The cache is full. Question is: can we bump something out of the
        // cache in order to put this new one in?
        // TODO
    };

    /**
     * @method get
     * @params {String} context
     * @return {Object}
     */
    this.get = function (context) {
        var now = Date.now(),
            ho,
            mo,
            data;

        _accesses++;

        if (_masterCache.hasOwnProperty(context)) {
            // This context has been requested before since we have an entry
            // for it in the master cache. This does not mean that the data
            // is actually available though!
            mo = _masterCache[context];
            mo.hits++;

            if (mo.data) {
                // This must be a frequently requested context since the data
                // is available in the master cache. This is a cache hit.
                _hits++;

                if (_hotCache) {
                    if (_hotCache.hasOwnProperty(context)) {
                        // This object was accessed recently enough that it is
                        // still in the hot cache. Retrieve it!
                        ho = _hotCache[context];
                        data = ho.data;

                        // Update its timestamp so that the object may live in
                        // the hot cache long enough to make that cache
                        // worthwhile...
                        ho.ts = now;
                    } else {
                        // This usually happens on the first hit during the
                        // handling of a request.
                        data = JSON.parse(mo.data);
                        _hotCache[context] = {
                            ts: now,
                            data: data
                        };
                        // Now, this is our opportunity to remove stale entries
                        // in the hot cache.
                        _purgeHotCache();
                    }
                } else {
                    data = mo.data;
                }

                return data;
            }
        } else {
            count++;
            _masterCache[context] = { hits: 1 };
        }
    };

    /**
     * @method getHitRate
     * @return {Number}
     */
    this.getHitRate = function () {
        if (_accesses === 0) {
            return 0;
        }

        return _hits / _accesses;
    };
}

module.exports = ContextCache;
