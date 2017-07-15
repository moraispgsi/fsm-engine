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
        <data id="date" expr="null"/>
    </datamodel>
    <state id="initial">
        <onentry>
            <engine:log message="Machine has initialized." />
            <engine:log message="Scheduling exit in 10 seconds." />
            <engine:schedule job="myjob" exprDate="new Date().addSeconds(10)" event="ev1" />
        </onentry>
        <transition event="ev1" target="final" />
    </state>
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
        <data id="machine" expr="'machine1'" />
        <data id="versionKey" expr="'version1'" />
        <data id="instanceKey" expr="null" />
    </datamodel>
    <state id="initial">
        <onentry>
            <engine:log message="Machine has initialized." />
            <engine:addInstance exprMachine="machine" exprVersionKey="versionKey" event="instanceCreated" />
        </onentry>
        <transition event="instanceCreated">
            <engine:log message="Instance %s was successfully created." exprData="{ instanceKey: _event.instanceKey }" />
            <assign location="instanceKey" expr="_event.instanceKey" />
            <engine:startInstance exprMachine="machine" exprVersionKey="versionKey" exprInstanceKey="instanceKey" event="instanceStarted" />
        </transition>
        <transition event="instanceStarted" target="final">
            <engine:log message="Instance %s was successfully Started." exprData="{instanceKey: _event.instanceKey}" />
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

