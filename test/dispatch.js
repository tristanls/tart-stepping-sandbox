/*

dispatch.js - dispatch tests

The MIT License (MIT)

Copyright (c) 2014 Tristan Slominski

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

*/
"use strict";

var fs = require('fs');
var marshal = require('tart-marshal');
var path = require('path');
var sandbox = require('../index.js');
var tart = require('tart-stepping');

var test = module.exports = {};

test['dispatch returns an effect of actor processing message after dispatch'] = function (test) {
    test.expect(3);
    var stepping = tart.stepping();
    var createSandbox = stepping.sponsor(sandbox.createBeh);

    var moduleString = fs.readFileSync(
        path.normalize(path.join(__dirname, 'eventLoop', 'module.js')), 'utf8');

    var network = marshal.router(stepping.sponsor);
    var transport = network.transport;
    var testDomain = network.domain('ocap:test');

    var sandboxControls;

    var okCreated = testDomain.sponsor(function okCreatedBeh(message) {
        // console.log("OK CREATED");
        sandboxControls = message;

        // Set up the test routing table.
        var domainURI = 
            'ansible://' + sandboxControls.domain + '/';
        network.routingTable[domainURI] = 
            sandboxControls.receptionist;

        var controlDomainURI = 
            'ansible://' + sandboxControls.controlDomain + '/';
        network.routingTable[controlDomainURI] = 
            sandboxControls.controlReceptionist;

        // Sponsor the test behaviors.
        transport({
            address: sandboxControls.sponsor,
            content: testDomain.encode({
                ok: okSponsored,
                fail: fail,
                module: moduleString
            })
        });
    });

    var actorWithFirstBeh;
    var okSponsored = testDomain.sponsor(function okSponsoredBeh(message) {
        actorWithFirstBeh = message;
        actorWithFirstBeh({customer: fail});

        // Dispatch a single event
        transport({
            address: sandboxControls.dispatch,
            content: testDomain.encode({
                ok: okDispatch
            })
        });
    });

    var okDispatch = testDomain.sponsor(function okDispatchBeh(message) {
        // {customer: fail} message should have been delivered to actorWithFirstBeh
        test.strictEqual(message.event.message.customer, fail);
        test.strictEqual(message.event.context.self, actorWithFirstBeh);
    });

    var fail = testDomain.sponsor(function failBeh(message) {
        throw new Error(message);
    });

    createSandbox({ok: okCreated, fail: fail, transport: transport});
    test.ok(stepping.eventLoop({
        // log: function (effect) {
        //     if (effect === false) {
        //         console.log('no events exist for dispatch');
        //     } else {
        //         console.log(require('util').inspect(effect, {depth: null}));
        //     }
        // }
    }));
    test.done();
};