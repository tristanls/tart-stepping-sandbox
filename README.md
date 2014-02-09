# tart-stepping-sandbox

_Stability: 1 - [Experimental](https://github.com/tristanls/stability-index#stability-1---experimental)_

[![NPM version](https://badge.fury.io/js/tart-stepping-sandbox.png)](http://npmjs.org/package/tart-stepping-sandbox)

Remotely controlled sandbox for controlling [tart-stepping](https://github.com/dalnefre/tart-stepping).

## Overview

Remotely controlled sandbox for controlling [tart-stepping](https://github.com/dalnefre/tart-stepping). Familiarity with [tart-stepping](https://github.com/dalnefre/tart-stepping) is assumed.

  * [Usage](#usage)
  * [Tests](#tests)
  * [Documentation](#documentation)
  * [Sources](#sources)

## Usage

To run the below example run:

    npm run readme

```javascript
"use strict";

var sandbox = require('../index.js');
var tart = require('tart');

var sponsor = tart.minimal();

var create = sponsor(sandbox.createBeh);

var transport = sponsor(function transportBeh(message) {
    console.dir(message);
});

var ok = sponsor(function okBeh(message) {
    console.dir(message);
});

var fail = sponsor(function failBeh(message) {
    console.dir(message);
});

create({fail: fail, ok: ok, transport: transport});
```

## Tests

    npm test

## Documentation

**Public API**

  * [sandbox.createBeh](#sandboxcreatebeh)
  * [sandboxCapabilities.destroy](#sandboxcapabilitiesdestroy)
  * [sandboxCapabilities.dispatch](#sandboxcapabilitiesdispatch)
  * [sandboxCapabilities.effect](#sandboxcapabilitieseffect)
  * [sandboxCapabilities.eventLoop](#sandboxcapabilitieseventloop)
  * [sandboxCapabilities.sponsor](#sandboxcapabilitiessponsor)

### sandbox.createBeh

Actor behavior that will create a new [tart-stepping](https://github.com/dalnefre/tart-stepping) configuration and respond with capabilities allowing for remote control of that configuration.

Message format:

  * `fail`: _Actor_ `function (error) {}` Fail actor to respond to if errors occur when creating.
  * `ok`: _Actor_ `function (sandboxCapabilities) {}` Ok actor to respond to with created capabilities.
  * `transport`: _Actor_ `function (message) {}` Transport actor capability that will be used for outbound traffic from the created sandbox.

The behavior creates two domains. The `controlDomain`, is the control surface for the [tart-stepping](https://github.com/dalnefre/tart-stepping) configuration. The other created domain (`domain`) is the actual [tart-stepping](https://github.com/dalnefre/tart-stepping) configuration which will accept commands from the `controlDomain` to dispatch, run the event loop, inspect last effect, destroy the configuration, or sponsor new actor behaviors.

`sandbox.createBeh` will return a `response` object to `ok` actor that contains the following:

  * `controlDomain`: _String_ String name for the created control domain.
  * `controlReceptionist`: _Actor_ `function (message) {}` Receptionist actor for the control domain to be registered with a transport for the given `controlDomain` name.
  * `destroy`: _URI_ URI of the capability to destroy the created configuration.
  * `dispatch`: _URI_ URI of the capability to dispatch the next event.
  * `domain`: _String_ String name for the created domain to be controlled.
  * `effect`: _URI_ URI of the capability to inspect the currently queued effects for the configuration.
  * `eventLoop`: _URI_ URI of the capability to invoke the event loop on controlled configuration.
  * `receptionist`: _Actor_ `function (message) {}` Receptionist actor for the domain under control to be registered with a transport for the given `domain`.
  * `sponsor`: _URI_ URI of the capability to sponsor actor behaviors within the domain under control. 

### sandboxCapabilities.destroy

Destroys the sandboxed configuration.

Message format:

  * `ok`: _Actor_ Optional actor to ack after destruction is complete.

### sandboxCapabilities.dispatch

Dispatch the next event. This is a wrapper around [stepping.dispatch()](https://github.com/dalnefre/tart-stepping#steppingdispatch) using [tart-adapter](https://github.com/tristanls/tart-adapter) message format.

### sandboxCapabilities.effect

Return the value of `stepping.effect` (see [tart-stepping](https://github.com/dalnefre/tart-stepping)).

Message format:

  * `ok`: _Actor_ Actor to receive value of `stepping.effect`.

### sandboxCapabilities.eventLoop

Dispatch events in a manner provided by `control`. This is a wrapper around [stepping.eventLoop(\[control\])](https://github.com/dalnefre/tart-stepping#steppingeventloopcontrol) using [tart-adapter](https://github.com/tristanls/tart-adapter) message format.

### sandboxCapabilities.sponsor

Given a Node.js module that exports behaviors (see [tart-vm](https://github.com/tristanls/tart-vm)), sponsor an actor for each behavior exported from the module.

Message format:

  * `fail`: _Actor_ `function (error) {}` Fail actor to respond to if errors occur.
  * `module`: _String_ Node.js module that exports behaviors that should be sponsored. The resulting actors will be sent to `ok` actor as a map of name-capability URI pairs, or a single capability URI.
  * `ok`: _Actor_ `function (response) {}` Ok actor to respond to with sponsored capability URIs.

## Sources

  * [Tiny Actor Run-Time (JavaScript)](https://github.com/organix/tartjs)
