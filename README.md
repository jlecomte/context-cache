# Context cache

Overview
========

Requests are often served differently depending on their "context".
The context of a request is composed of multiple dimensions.
Here are some examples of common dimensions:

-   environment   { production, staging, regression, development, etc. }
-   lang          { en-US, en-GB, fr-FR, fr-CA, etc. }
-   device        { desktop, tablet, phone, etc. }
-   partner       { foo, bar, baz, etc. }
-   experiment    { A, B, C, etc. }

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

Usage
=====

Install the `context-cache` npm package:

    npm install context-cache

You can then create a `ContextCache` instance in your application code:

    var ContextCache = require('./context-cache');
    var cc = ContextCache.create();

You can pass configuration settings to `create`:

    var cc = ContextCache.create({
        maxCacheSize: 200,
        cacheHitThreshold: 10,
        storeObjectsSerialized: true,
        hotcacheTTL: 300,
        isolationMode: true
    });

You can then use that instance to store/retrieve in/from the cache:

    var ctx = JSON.stringify(context);
    cc.set(ctx, data);
    var data = cc.get(ctx);

Finally, you can obtain information about the cache itself:

    console.log(cc.getInfo());
