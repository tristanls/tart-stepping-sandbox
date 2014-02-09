/*

index.js - "tart-stepping-sandbox": Remotely controlled sandbox for tart-stepping

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

var crypto = require('crypto');
var marshal = require('tart-marshal');
var revocable = require('tart-revocable');
var tart = require('tart-stepping');
var vm = require('tart-vm');

var sandbox = module.exports;

// We require a special type of adapter in order to convert global references
// from within vm context into something we can understand in this context.
var adapter = function adapter(fn) {
    return function applyBeh(message) {
        try {
            var result = fn.apply({}, message.arguments);
            message && message.ok && message.ok(result);
        } catch (ex) {
            var error = new Error(ex.message);
            error.stack = ex.stack;
            message && message.fail && message.fail(error);
        }
    };
};

// We require a special type of adapter in order to convert exceptions thrown
// from sandboxed behavior that are passed to the `fail` function if given.
var eventLoopAdapter = function eventLoopAdapter(fn) {
    return function applyBeh(message) {
        if (message && Array.isArray(message.arguments)
            && typeof message.arguments[0] === 'object') {

            if (message.arguments[0].fail) {
                var _fail = message.arguments[0].fail;
                message.arguments[0].fail = function (exception) {
                    var error = new Error(exception.message);
                    error.stack = exception.stack;
                    _fail(error);
                };
            }
        }
        try {
            var result = fn.apply({}, message.arguments);
            message && message.ok && message.ok(result);
        } catch (ex) {
            var error = new Error(ex.message);
            error.stack = ex.stack;
            message && message.fail && message.fail(error);
        }
    };
};

/*
  * `message`: _Object_
    * `fail`: _Actor_ `function (error) {}` Fail actor to respond to if errors
        occur when creating.
    * `ok`: _Actor_ `function (response) {}` Ok actor to respond to with created
        capabilities.
    * `transport`: _Actor_ `function (message) {}` Transport actor capability
        that will be used for outbound traffic from the created sandbox.
*/
sandbox.createBeh = function createBeh (message) {
    // host configuration sponsors revocable proxies and destroy capability
    var host = this.sponsor;
    var revokes = [];

    // create transport proxy
    var transportRevocableCaps = revocable.proxy(message.transport);
    revokes.push(transportRevocableCaps.revokeBeh);
    var transportProxy = host(transportRevocableCaps.proxyBeh);

    // create sandbox control domain name
    var controlDomainName = crypto.randomBytes(42).toString('base64');    

    // create sandbox control domain
    var controlDomain = marshal.domain(
        'ansible://' + controlDomainName + '/', host, transportProxy);

    // create control domain receptionist proxy
    var controlDomainReceptionistRevocableCaps =
        revocable.proxy(controlDomain.receptionist);
    revokes.push(controlDomainReceptionistRevocableCaps.revokeBeh);
    var controlDomainReceptionistProxy =
        host(controlDomainReceptionistRevocableCaps.proxyBeh);

    // create new stepping configuration
    var stepping = tart.stepping();

    // create sandbox domain name
    var domainName = crypto.randomBytes(42).toString('base64');

    // create the sandbox domain
    var domain = marshal.domain(
        'ansible://' + domainName + '/', stepping.sponsor, transportProxy);

    // create domain receptionist proxy
    var domainReceptionistRevocableCaps = revocable.proxy(domain.receptionist);
    revokes.push(domainReceptionistRevocableCaps.revokeBeh);
    var domainReceptionistProxy = host(domainReceptionistRevocableCaps.proxyBeh);

    var sandbox = controlDomain.sponsor(vm.sandboxBeh);

    /*
      * `message`: _Object_
        * `fail`: _Actor_ `function (error) {}` Fail actor to respond to if
            errors occur.
        * `module`: _String_ Node.js module that exports behaviors that should
            be sponsored. The resulting actors will be sent to `ok` actor as a
            map of name-capability URI pairs, or a single capability URI.
        * `ok`: _Actor_ `function (response) {}` Ok actor to respond to with
            sponsored capability URIs.
    */
    var sponsorBeh = function sponsorBeh(message) {
        var reqOk = message.ok;

        var ok = this.sponsor(function ok(message) {
            if (typeof message === 'function') {
                reqOk(stepping.sponsor(message));
                return;
            }

            if (typeof message === 'object') {
                var response = {};
                Object.keys(message).forEach(function (behName) {
                    response[behName] = stepping.sponsor(message[behName]);
                });
                reqOk(response);
                return;
            }
        });
        
        message.ok = ok;
        sandbox(message);
    };

    var sponsor = controlDomain.sponsor(sponsorBeh);
    var sponsorRevocableCaps = revocable.proxy(sponsor);
    revokes.push(sponsorRevocableCaps.revokeBeh);
    // The control surface of tart-stepping cannot be sponsored by tart-stepping
    // itself. We let the host configuration sponsor the control surface.
    var sponsorProxy = controlDomain.sponsor(sponsorRevocableCaps.proxyBeh);
    // Even though the host configuration sponsors the control surface, we
    // export control surface actors using the domain under control so that
    // they are nicely bundled together.
    var sponsorCapURI = controlDomain.localToRemote(sponsorProxy);    

    var dispatchBeh = adapter(stepping.dispatch);
    var dispatch = controlDomain.sponsor(dispatchBeh);
    var dispatchRevocableCaps = revocable.proxy(dispatch);
    revokes.push(dispatchRevocableCaps.revokeBeh);
    // The control surface of tart-stepping cannot be sponsored by tart-stepping
    // itself. We let the host configuration sponsor the control surface.
    var dispatchProxy = controlDomain.sponsor(dispatchRevocableCaps.proxyBeh);
    // Even though the host configuration sponsors the control surface, we
    // export control surface actors using the domain under control so that
    // they are nicely bundled together.    
    var dispatchCapURI = controlDomain.localToRemote(dispatchProxy);

    var eventLoopBeh = eventLoopAdapter(stepping.eventLoop);
    var eventLoop = controlDomain.sponsor(eventLoopBeh);
    var eventLoopRevocableCaps = revocable.proxy(eventLoop);
    revokes.push(eventLoopRevocableCaps.revokeBeh);
    // The control surface of tart-stepping cannot be sponsored by tart-stepping
    // itself. We let the host configuration sponsor the control surface.    
    var eventLoopProxy = controlDomain.sponsor(eventLoopRevocableCaps.proxyBeh);
    // Even though the host configuration sponsors the control surface, we
    // export control surface actors using the domain under control so that
    // they are nicely bundled together.      
    var eventLoopCapURI = controlDomain.localToRemote(eventLoopProxy);

    /*
      * `message`: _Object_ _(Default: undefined)_
        * `ok`: _Actor_
    */
    var destroyBeh = function destroyBeh(message) {
        // instantiate revoke actors and invoke them
        var sponsor = this.sponsor;
        revokes.forEach(function (revokeBeh) {
            sponsor(revokeBeh)();
        });

        // ack destruction
        message && message.ok instanceof Function && message.ok();
    };
    var destroy = controlDomain.sponsor(destroyBeh);
    var destroyCapURI = controlDomain.localToRemote(destroy);

    /*
      * `message`: _Object_ _(Default: undefined)_
        * `ok`: _Actor_
    */
    var effectBeh = function effectBeh(message) {
        // respond with current effect
        message && message.ok instanceof Function && message.ok(stepping.effect);
    };
    var effect = controlDomain.sponsor(effectBeh);
    var effectCapURI = controlDomain.localToRemote(effect);

    message.ok({
        controlDomain: controlDomainName,
        controlReceptionist: controlDomainReceptionistProxy,
        destroy: destroyCapURI,
        dispatch: dispatchCapURI,
        domain: domainName,
        effect: effectCapURI,
        eventLoop: eventLoopCapURI,
        receptionist: domainReceptionistProxy,
        sponsor: sponsorCapURI
    });
};