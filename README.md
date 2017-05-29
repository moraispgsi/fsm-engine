# fsm-engine
[![Build Status](https://travis-ci.org/moraispgsi/fsm-engine.svg?branch=master)](https://travis-ci.org/moraispgsi/fsm-engine)

A small engine based on fsm-core and SCION





## Synopsis

This module consists of an lightweight engine for finite-state machines. The engine executes state-charts from SCXML files which are stored in a database using Sequelize.js. It uses the SCION javascript library to instantiate the state-charts. Also the fsm-engine module extend the fsm-core module.

The repository created by the engine is composed of five database tables:
- FsmCoreFsm //Each row is a finite-state machine model
- FsmCoreVersion //Each row is a finite-state machine model version
- FsmEngineInstance //Each row is an instance of a finite-state machine version
- FsmEngineSnapshot //Each row is a snapshot of an instance
- FsmEngineConfiguration //Each row is a key-value pair for the configuration of the engine

## Code Example
```javascript
let co = require('co');
let init = require("fsm-engine");

co(function*(){
    let engine = yield init('mysql', 'host', 'root', 'root', 'mydatabase', {logging: false});
    //using a finite-state machine from a fsm-core repository
    let fsm = yield engine.getFsmByName("myfsm");
    let version = yield engine.getLatestSealedFsmVersion(fsm.id);
    let instance = yield engine.createInstance(version.id);
    yield instance.start();
    yield instance.sendEvent('eventName', {foo: "bar"});
}).catch((err)=> console.log(err));
```
## Motivation

To provide a library for developing and running finite-state machine based on an international W3C standard https://www.w3.org/TR/scxml/

## Installation

git clone the repository  
npm install  

This module uses the sequelize.js library to connect to a database using the information given, a database library as to be installed and its type should be sent as the dialect  

  One of the following libraries will suffice:  
$ npm install --save pg pg-hstore  
$ npm install --save mysql2  
$ npm install --save sqlite3  
$ npm install --save tedious // MSSQL  

## API Reference

- Verifies if a version is sealed
  - isVersionSealed (versionID)
- Gets a finite-state machine by its name
  - getFsmByName(name)
- Finds a finite-state machine by ID
  - getFsmById(fsmID)
- Finds a version by ID
  - getVersionById(versionID)
- Returns the latest sealed finite-state machine version
  - getLatestSealedFsmVersion(fsmID)
- Returns the latest finite-state machine version
  - getLatestFsmVersion(fsmID)
- Gets all the versions of a finite-state machine
  - getFsmVersions(fsmID)
- Gets all the versions that are sealed of a finite-state machine
  - getFsmSealedVersions(fsmID)
- Creates a new Finite-state machine model.
  - createFSM(name)
- Removes a finite-State machine model if there is only one version and that version is not sealed
  - removeFSM(fsmID)
- Removes a finite-State machine model version if the version is not sealed
  - removeFSMVersion(versionID)
- Sets the current SCXML for a FSM model version
  - setScxml(versionID, scxml)
- Seals a FSM model version if it is not already sealed and the SCXML of the version is valid
  - seal(versionID)
- Creates a new version of a finite-state machine. The new version will reference the old one. The latest version must be sealed
  - newVersion(fsmID)
- Validates a SCXML string
  - validateSCXML(scxml)
- Gets all the instances of a Finite-state machine by Finite-state machine name
  - getInstancesByFsmName(fsmName)
- Gets all the instances of a finite-state machine version
  - getInstancesByVersionId(versionId)
- Gets all the instances of a Finite-state machine by Finite-state machine id
  - getInstancesByFsmId(fsmId)
- Gets all existing instances
  - getAllInstances()
- Gets an instance by its id
  - getInstanceById(instanceId)
- Gets the server configuration from the database
  - getConfig()
- Sets a value in a configuration key
  - setConfigValue(key, value)
- Sets the configuration with a config object
  - setConfig(config)


## Tests

## Contributors

## License

MIT
