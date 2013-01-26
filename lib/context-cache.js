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

/*jslint node: true, plusplus: true */

'use strict';

var DEFAULT_MAX_CACHE_SIZE = 100,
    DEFAULT_CACHE_HIT_THRESHOLD = 0,
    DEFAULT_HOT_CACHE_TTL_MS = 1000;

/**
 * @class ContextCache
 * @constructor
 * @params {Object} cfg A configuration object which may contain the following:
 *     <dl>
 *       <dt>maxCacheSize</dt>
 *       <dd>Maximum number of contexts for which data should be stored in
 *         cache. An error is thrown if the value specified is invalid in
 *         order to prevent the cache from behaving in upredictable ways.
 *         Defaults to 100 if not specified.</dd>
 *       <dt>cacheHitThreshold</dt>
 *       <dd>When a box is first put into rotation, all contexts will be cached,
 *         even if they are never requested again! (in Yahoo! Search's current
 *         production system, we have a lot of contexts with only 1 hit after
 *         many hours of receiving traffic) This setting prevents that from
 *         happening, so that only the contexts that are actually requested
 *         several times end up being cached. An error is thrown if the value
 *         specified is invalid in order to prevent the cache from behaving in
 *         upredictable ways. Defaults to 0 if not specified.</dd>
 *       <dt>storeObjectsSerialized</dt>
 *       <dd>When this option is enabled, objects are stored serialized in the
 *         master cache to reduce even further the number of objects stored and
 *         therefore the work the GC has to do. Defaults to false if not
 *         specified.</dd>
 *       <dt>hotcacheTTL</dt>
 *       <dd>When the 'storeObjectsSerialized' option is enabled, a small "hot"
 *         cache mitigates the costs of serializing/deserializing objects
 *         during the handling of a request by keeping the deserialized version
 *         for a short amount of time in memory. That amount of time can be
 *         specified (in milliseconds) using this option. An error is thrown if
 *         the value specified is invalid in order to prevent the cache from
 *         behaving in upredictable ways. Defaults to 10 if not specified.</dd>
 *       <dt>isolationMode</dt>
 *       <dd>In order to protect data that's in the cache, it is often cloned
 *         before being passed to the caller. Cloning is an expensive operation
 *         so we create an empty object and set its prototype to the cached
 *         object. This is done only when this option is enabled. Otherwise,
 *         the raw object is sent back to the caller. Defaults to false if not
 *         specified.</dd>
 *     </dl>
 */
function ContextCache(cfg) {

    if (!cfg) {
        cfg = {};
    }

    //-- Private variables ----------------------------------------------------

    var // Internal config object. We prefer to use this instead of the
        // specified object since that one may be modified later on by
        // the caller, changing the properties of this instance.
        config = {},

        // The "master" cache, containing the (serialized) data
        // only for the most requested contexts.
        cache = {},

        // The number of hits for each requested context.
        hits = {},

        // The number of contexts for which we have data in the cache
        count = 0,

        // The total number of read operations
        accesses = 0,

        // The number of cache hits
        totalhits = 0,

        // The "hot" cache, initialized below, only if needed, which contains
        // the deserialized data.
        hotcache;

    //-- Validate/compute configuration options -------------------------------

    if (cfg.hasOwnProperty('maxCacheSize') &&
            (isNaN(cfg.maxCacheSize) || cfg.maxCacheSize <= 0)) {
        throw new Error('Invalid value for the "maxCacheSize" option');
    }

    config.maxCacheSize = cfg.maxCacheSize || DEFAULT_MAX_CACHE_SIZE;

    if (cfg.hasOwnProperty('cacheHitThreshold') &&
            (isNaN(cfg.cacheHitThreshold) || cfg.cacheHitThreshold <= 0)) {
        throw new Error('Invalid value for the "cacheHitThreshold" option');
    }

    config.cacheHitThreshold = cfg.cacheHitThreshold || DEFAULT_CACHE_HIT_THRESHOLD;

    config.storeObjectsSerialized = !!cfg.storeObjectsSerialized;

    if (config.storeObjectsSerialized) {
        hotcache = {};

        if (cfg.hasOwnProperty('hotcacheTTL') &&
                (isNaN(cfg.hotcacheTTL) || cfg.hotcacheTTL <= 0)) {
            throw new Error('Invalid value for the "hotcacheTTL" option');
        }

        config.hotcacheTTL = cfg.hotcacheTTL || DEFAULT_HOT_CACHE_TTL_MS;
    }

    config.isolationMode = !!cfg.isolationMode;

    //-- Private methods ------------------------------------------------------

    function heir(o) {
        function F() {}
        F.prototype = o;
        return new F();
    }

    function heirDeep(o) {
        var dest,
            i;

        dest = heir(o);
        for (i in o) {
            if (o.hasOwnProperty(i) && o[i] && typeof o[i] === 'object') {
                dest[i] = heirDeep(o[i]);
            }
        }
        return dest;
    }

    function purgeHotCache() {
        if (!hotcache) {
            return;
        }

        var now = Date.now(),
            context;

        // The hot cache should be relatively small, so iterating over its
        // content should be a fast operation if it's done regularly enough.
        for (context in hotcache) {
            if (hotcache.hasOwnProperty(context)) {
                if (now - hotcache[context].ts > config.hotcacheTTL) {
                    delete hotcache[context];
                }
            }
        }
    }

    function store(context, data) {
        count++;

        if (hotcache) {
            // Store the serialized version of the object...
            cache[context] = JSON.stringify(data);

            // We also add the raw object to the hot cache since we're likely
            // to read it soon during the handling of this request.
            hotcache[context] = {
                ts: Date.now(),
                data: data
            };

            // Now, this is our opportunity to remove stale entries
            // from the hot cache!
            purgeHotCache();
        } else {
            cache[context] = data;
        }
    }

    function retrieve(context) {
        var now = Date.now(),
            data,
            o;

        accesses++;

        if (cache.hasOwnProperty(context)) {
            // This is a frequently requested context...
            totalhits++;
            data = cache[context];

            if (hotcache) {
                if (hotcache.hasOwnProperty(context)) {
                    // This object was accessed recently enough that it is
                    // still in the hot cache. Retrieve it...
                    o = hotcache[context];
                    data = o.data;

                    // ... and update its timestamp so that the object may live
                    // in the hot cache long enough to make that cache
                    // worthwhile...
                    o.ts = now;
                } else {
                    // This usually happens on the first hit during the
                    // handling of a request for a frequently requested
                    // context.
                    data = JSON.parse(data);

                    hotcache[context] = {
                        ts: now,
                        data: data
                    };

                    // Now, this is our opportunity to remove stale entries
                    // from the hot cache.
                    purgeHotCache();
                }
            }
        }

        return data;
    }

    //-- Public methods -------------------------------------------------------

    /**
     * Stores the data for the specified context in the cache.
     * @method set
     * @params {String} context
     * @params {Object} data
     * @return {Boolean}
     */
    this.set = function (context, data) {
        if (typeof context !== 'string') {
            throw new Error('Invalid value for the "context" parameter');
        }

        var ctx,
            minctx;

        if (cache.hasOwnProperty(context)) {
            // This context has already been cached -> nothing to do!
            return true;
        }

        if (!hits.hasOwnProperty(context)) {
            // This context has never been requested before.
            hits[context] = 0;
        }

        if (hits[context] < config.cacheHitThreshold) {
            // Do not cache contexts that have not been requested enough...
            return false;
        }

        if (count < config.maxCacheSize) {
            // The cache is not full, so we can just store the data.
            store(context, data);
            return true;
        }

        // The cache is full. Let's find the cache entry for which the number
        // of hits is the smallest...

        for (ctx in cache) {
            if (cache.hasOwnProperty(ctx)) {
                if (!minctx) {
                    minctx = ctx;
                } else if (hits[ctx] < hits[minctx]) {
                    minctx = ctx;
                }
            }
        }

        // Now, let's see if it is smaller than the number of hits for the
        // specified context. If so, cache the data for the specified context.

        if (hits[minctx] < hits[context]) {
            delete cache[minctx];
            store(context, data);
            return true;
        }

        return false;
    };

    /**
     * Returns the cached data for the specified context.
     * @method get
     * @params {String} ctx
     * @return {Object}
     */
    this.get = function (context) {
        if (typeof context !== 'string') {
            throw new Error('Invalid value for the "context" parameter');
        }

        // Retrieve the data. This may return undefined!
        var data = retrieve(context);

        // Update the hit count for this context...
        if (hits.hasOwnProperty(context)) {
            hits[context]++;
        } else {
            hits[context] = 1;
        }

        if (data && config.isolationMode) {
            // This ensures that whatever the application code does, it won't
            // pollute the values we store in the cache. It is also more
            // efficient than cloning!
            data = heirDeep(data);
        }

        return data;
    };

    /**
     * Returns the cache hit rate.
     * @method getHitRate
     * @return {Number}
     */
    this.getHitRate = function () {
        if (accesses === 0) {
            return 0;
        }

        return totalhits / accesses;
    };

    /**
     * Returns up-to-date information about this cache.
     * @method getInfo
     * @return {Object}
     */
    this.getInfo = function () {
        var info, key, ctx;

        info = {};

        info.config = {};
        for (key in config) {
            if (config.hasOwnProperty(key)) {
                info.config[key] = config[key];
            }
        }

        info.contexts = {};

        for (ctx in hits) {
            if (hits.hasOwnProperty(ctx)) {
                info.contexts[ctx] = {
                    hits: hits[ctx],
                    cached: cache.hasOwnProperty(ctx)
                };
            }
        }

        return info;
    };
}

module.exports.create = function (config) {
    return new ContextCache(config);
};
