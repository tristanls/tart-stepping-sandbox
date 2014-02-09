/*

eventLoop.js - eventLoop tests

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

test["eventLoop by default dispatches all events and returns 'true'"] = function (test) {
    test.expect(4);
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

    var okSponsored = testDomain.sponsor(function okSponsoredBeh(message) {
        // console.log("OK SPONSORED");
        // message is the sponsored module.js actor "module.js/firstBeh"
        // send it a message
        var actorWithFirstBeh = message;
        actorWithFirstBeh({customer: okFinished});

        // Dispatch all messages.
        // FIXME: There is a race condition between send the message to
        //        'actorWithFirstBeh' and invoking 'eventLoop' capability.
        //        The current code ignores this race condition.
        transport({
            address: sandboxControls.eventLoop,
            content: testDomain.encode({
                ok: okEventLoop
            })
        });
    });

    var okFinished = testDomain.sponsor(function okFinishedBeh(message) {
        // console.log("OK FINISHED");
        test.strictEqual(message.first, true);
        test.strictEqual(message.second, true);
    });

    var okEventLoop = testDomain.sponsor(function okEventLoop(message) {
        // console.log("OK EVENT LOOP");
        test.ok(message);
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

test["eventLoop dispatches specified number of events and returns 'false' if not drained"] = function (test) {
    test.expect(3);
    var stepping = tart.stepping();
    var createSandbox = stepping.sponsor(sandbox.createBeh);

    var moduleString = fs.readFileSync(
        path.normalize(path.join(__dirname, 'eventLoop', 'eventLoopCount.js')), 'utf8');

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

    var okSponsored = testDomain.sponsor(function okSponsoredBeh(message) {
        // console.log("OK SPONSORED");
        // Message is the sponsored eventLoopCount.js actor:
        //   "eventLoopCount.js/incrementBeh"
        // send it an initial message
        var actorWithIncrementBeh = message;
        actorWithIncrementBeh({count: 0, customer: okIncremented});

        // Dispatch three messages.
        // FIXME: There is a race condition between send the message to
        //        'actorWithFirstBeh' and invoking 'eventLoop' capability.
        //        The current code ignores this race condition.
        transport({
            address: sandboxControls.eventLoop,
            content: testDomain.encode({
                ok: okEventLoop,
                arguments: [{count: 3}]
            })
        });        
    });

    var currentCount;
    var okIncremented = testDomain.sponsor(function okIncrementedBeh(message) {
        // currentCount will be tested after all in-flight messages are
        // delivered
        currentCount = message;
    });

    var okEventLoop = testDomain.sponsor(function okEventLoop(message) {
        // console.log("OK EVENT LOOP");
        test.strictEqual(message, false);
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
    test.equal(currentCount, 3);
    test.done();    
};

test["eventLoop throws exception and pauses by default if actor behavior throws an exception"] = function (test) {
    test.expect(6);
    var stepping = tart.stepping();
    var createSandbox = stepping.sponsor(sandbox.createBeh);

    var moduleString = fs.readFileSync(
        path.normalize(path.join(__dirname, 'eventLoop', 'failBeh.js')), 'utf8');

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

    var okSponsored = testDomain.sponsor(function okSponsoredBeh(message) {
        // console.log("OK SPONSORED");
        // Send messages that will throw exceptions.
        var failActor = message;
        failActor('fail once');
        failActor('fail again');

        // Dispatch messages until failure.
        // FIXME: There is a race condition between send the message to
        //        'actorWithFirstBeh' and invoking 'eventLoop' capability.
        //        The current code ignores this race condition.
        transport({
            address: sandboxControls.eventLoop,
            content: testDomain.encode({
                fail: firstFail
            })
        });
    });   

    var firstFail = testDomain.sponsor(function firstFailBeh(message) {
        test.equal(message.message, 'boom!');
        test.ok(message.stack);
        // Dispatch messages until failure.
        // FIXME: There is a race condition between send the message to
        //        'actorWithFirstBeh' and invoking 'eventLoop' capability.
        //        The current code ignores this race condition.        
        transport({
            address: sandboxControls.eventLoop,
            content: testDomain.encode({
                fail: secondFail
            })
        });
    });

    var secondFail = testDomain.sponsor(function secondFailBeh(message) {
        test.equal(message.message, 'boom!');
        test.ok(message.stack);  
        // Dispatch any remaining messages (none).
        // FIXME: There is a race condition between send the message to
        //        'actorWithFirstBeh' and invoking 'eventLoop' capability.
        //        The current code ignores this race condition.        
        transport({
            address: sandboxControls.eventLoop,
            content: testDomain.encode({
                ok: okNoFail
            })
        });
    });

    var okNoFail = testDomain.sponsor(function okNoFailBeh(message) {
        test.strictEqual(message, true);
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

test["eventLoop allows fail handler to be overriden"] = function (test) {
    test.expect(5);
    var stepping = tart.stepping();
    var createSandbox = stepping.sponsor(sandbox.createBeh);

    var moduleString = fs.readFileSync(
        path.normalize(path.join(__dirname, 'eventLoop', 'failBeh.js')), 'utf8');

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

    var eventLoopFail = testDomain.sponsor(function eventLoopFailBeh(message) {
        test.equal(message.message, 'boom!');
        test.ok(message.stack);
    });

    var okSponsored = testDomain.sponsor(function okSponsoredBeh(message) {
        // console.log("OK SPONSORED");
        // Send messages that will throw exceptions.
        var failActor = message;
        failActor('fail once');
        failActor('fail again');

        // Dispatch messages until failure.
        // FIXME: There is a race condition between send the message to
        //        'actorWithFirstBeh' and invoking 'eventLoop' capability.
        //        The current code ignores this race condition.
        transport({
            address: sandboxControls.eventLoop,
            content: testDomain.encode({
                fail: fail,
                arguments: [{fail: eventLoopFail}]
            })
        });
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

test["eventLoop allows for logging effects of dispatched events"] = function (test) {
    test.expect(12);
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

    var eventLoopLog = testDomain.sponsor(function eventLoopLogBeh(message) {
        if (message) { // last is false
            test.ok(message.created);
            test.ok(message.sent);
            test.ok(message.event);
            test.ok(message.behavior);
            test.ok(message.became);
        }
    });

    var okSponsored = testDomain.sponsor(function okSponsoredBeh(message) {
        // console.log("OK SPONSORED");
        var actorWithFirstBeh = message;
        actorWithFirstBeh({customer: this.sponsor(function () {})});
    
        // Dispatch all messages.
        // FIXME: There is a race condition between send the message to
        //        'actorWithFirstBeh' and invoking 'eventLoop' capability.
        //        The current code ignores this race condition.
        transport({
            address: sandboxControls.eventLoop,
            content: testDomain.encode({
                ok: okEventLoop,
                arguments: [{log: eventLoopLog}]
            })
        });
    });

    var okEventLoop = testDomain.sponsor(function okEventLoop(message) {
        // console.log("OK EVENT LOOP");
        test.ok(message);
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