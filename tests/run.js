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
    basename = require('path').basename,
    Y = require('yui').use('test'),
    cases = [];

process.on('exit', function () {
    var results = Y.Test.Runner.getResults();
    if (results && results.failed) {
        process.exit(1);
    }
});

fs.readdirSync(__dirname + '/cases').forEach(function (filename) {
    if (!/\.js$/.test(filename)) {
        return;
    }

    var name = basename(filename, '.js');

    cases.push({
        name: name,
        test: require('./cases/' + name)
    });
});

cases.forEach(function (testCase) {
    Y.Test.Runner.add(testCase.test);
});

Y.Test.Runner.run();
