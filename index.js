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
    * `fail`: _Actor_ Fail actor to respond to if errors occur.
    * `ok`: _Actor_ Ok actor to respond to if no errors.
    * `transport`: _Actor_ Transport actor.
*/
sandbox.createBeh = function createBeh (message) {
    // host configuration sponsors revocable proxies and destroy capability
    var host = this.sponsor;
    var revokes = [];

    // create sandbox control domain name
    var controlDomainName = crypto.randomBytes(42).toString('base64');    

    // create sandbox control domain
    var controlDomain = marshal.domain(
        'ansible://' + controlDomainName + '/', host, message.transport);

    // create new stepping configuration
    var stepping = tart.stepping();

    // create sandbox domain name
    var domainName = crypto.randomBytes(42).toString('base64');

    // create the sandbox domain
    var domain = marshal.domain(
        'ansible://' + domainName + '/', stepping.sponsor, message.transport);

    var sandbox = controlDomain.sponsor(vm.sandboxBeh);

    /*
      * `message`: _Object_
        * `fail`: _Actor_ Fail actor to respond to if errors occur.
        * `module`: _String_ Node.js module that exports behaviors that should be
            sandboxed. The behaviors will be sent to `ok` actor as a map of
            name-behavior pairs, or a single behavior.        
        * `ok`: _Actor_ Ok actor to respond to with sandboxed actor behaviors.
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

    message.ok({
        controlDomain: controlDomainName,
        controlReceptionist: controlDomain.receptionist,
        destroy: destroyCapURI,
        dispatch: dispatchCapURI,
        domain: domainName,
        eventLoop: eventLoopCapURI,
        receptionist: domain.receptionist,
        sponsor: sponsorCapURI
    });
};