/**
 * This is the example1
 * Objective: Allow one machine instance to create a new instance of another machine and start it
 * Actors:
 *  machine1: waits 10 seconds before exiting
 *  machine2: creates and starts an instance of the machine1
 * Use "set DEBUG=instance-log" to see the logs
 * Artifacts: A repository will be created in the project folder, remove it after every run
 */

let Engine = require("./../dist/index");
let co = require("co");

co(function*(){
    let engine = new Engine(null, null);
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
                <engine:schedule job="job1" exprDate="new Date().addSeconds(10)" raise="exit" />
            </onentry>
            <transition event="exit" target="final" />
        </state>
        <state id="clock">
            <onentry>
               <send event="tick" />
            </onentry>
            <transition event="tick">
                <engine:log message="%s seconds have passed." exprData="[ ticks ]" />
                <engine:schedule job="job2" exprDate="new Date().addSeconds(1)" raise="tick" />
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
            <engine:runInstance exprMachine="machine" exprVersionKey="versionKey" raise="instanceCreated" />
        </onentry>
        <transition event="instanceCreated" target="final">
            <engine:log message="Instance %s was successfully created." exprData="[ _event.instanceKey ]" />
            <assign location="instanceKey" expr="_event.instanceKey" />
        </transition>
    </state>
    <final id="final">
            <onentry>
            <engine:log message="Machine is exiting." />
        </onentry>
    </final>
    </scxml>`;

    // yield engine.addMachine("machine1");
    // yield engine.addMachine("machine2");
    //
    // yield engine.setVersionSCXML("machine1", "version1", scxml1);
    // yield engine.setVersionSCXML("machine2", "version1", scxml2);
    //
    // yield engine.sealVersion("machine1", "version1");
    // yield engine.sealVersion("machine2", "version1");
    //
    // let info1 = yield engine.getVersionInfo('machine1', 'version1');
    // let info2 = yield engine.getVersionInfo('machine2', 'version1');


    for(let i = 0; i < 50; i ++) {
        let instanceKey = yield engine.addInstance("machine2", "version1");
        yield engine.runInstance('machine2', 'version1', instanceKey);
    }


}).catch((err)=>{console.log(err)});

