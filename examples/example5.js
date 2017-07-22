/**
 * This is the example1
 * Objective: Allow one machine instance to create a new instance of another machine and start it
 * Actors:
 *  machine1: waits 10 seconds before exiting (using momento)
 *  machine2: creates and starts an instance of the machine1
 * Use "set DEBUG=instance-log" to see the logs
 * Artifacts: A repository will be created in the project folder, remove it after every run
 */

let Engine = require("./../dist/index");
let interpreter = "fsm-engine-interpreter";
let interpreterPath = require(interpreter).getPath();
let co = require("co");

co(function*(){
    let engine = new Engine(null, null, process.cwd() + "/repo", interpreterPath);
    yield engine.init();

    // Waits for 10 seconds and exits
    let scxml1 = `
    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript"
        xmlns:engine="https://INSTICC.org/fsm-engine"
        initial="initial">
    <datamodel>
        <data id="ticks" expr="1"/>
    </datamodel>
    <parallel id="initial">
        <state id="main">
            <onentry>
                <engine:log message="Machine has initialized." />
                <engine:log message="Scheduling exit in 10 seconds." />
                <engine:schedule job="job1" exprDate="moment().add(10, 'seconds').toDate()" raise="exit" />
            </onentry>
            <transition event="exit" target="final" />
        </state>
        <state id="clock">
            <onentry>
               <send event="tick" />
            </onentry>
            <transition event="tick">
                <engine:log message="%s seconds have passed." exprData="[ ticks ]" />
                <engine:schedule job="job2" exprDate="moment().add(1, 'seconds').toDate()" raise="tick" />
                <assign location="ticks" expr="ticks + 1" />
            </transition>
        </state>
    </parallel>
    <final id="final">
        <onentry>
            <engine:log message="Machine is exiting." />
        </onentry>
    </final>
    </scxml>`;

    // Creates an instance of the machine1/version1
    let scxml2 = `
    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript"
        xmlns:engine="https://INSTICC.org/fsm-engine"
        initial="initial">
    <datamodel>
        <data id="machine"     expr="'machine1'" />
        <data id="versionKey"  expr="'version1'" />
        <data id="instanceKey" expr="null" />
    </datamodel>
    <state id="initial">
        <onentry>
            <engine:log message="Machine has initialized." />
            <engine:addInstance exprMachine="machine" exprVersionKey="versionKey" raise="instanceCreated" />
        </onentry>
        <transition event="instanceCreated">
            <engine:log message="Instance %s was successfully created." exprData="[ _event.instanceKey ]" />
            <assign location="instanceKey" expr="_event.instanceKey" />
            <engine:startInstance exprMachine="machine" exprVersionKey="versionKey" exprInstanceKey="instanceKey" raise="instanceStarted" />
        </transition>
        <transition event="instanceStarted" target="final">
            <engine:log message="Instance %s was successfully started." exprData="[ _event.instanceKey ]" />
        </transition>
    </state>
    <final id="final">
            <onentry>
            <engine:log message="Machine is exiting." />
        </onentry>
    </final>
    </scxml>`;

    yield engine.addMachine("machine1");
    yield engine.addMachine("machine2");

    engine.setVersionSCXML("machine1", "version1", scxml1);
    engine.setVersionSCXML("machine2", "version1", scxml2);

    yield engine.sealVersion("machine1", "version1");
    yield engine.sealVersion("machine2", "version1");

    let instance = yield engine.addInstance("machine2", "version1");
    yield instance.start();

}).catch((err)=>{console.log(err)});

