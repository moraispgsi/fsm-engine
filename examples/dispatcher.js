let Engine = require("./../dist/index");
let interpreter = "fsm-engine-interpreter";
let interpreterPath = require(interpreter).getPath();
let moment = require('moment');
let co = require("co");

co(function*(){
    let engine = new Engine('http://localhost:3012','eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.S1Cg_Ilvjkhb5e0YIUFwWvhtIeqkdjhmDx9IBKMf5qg', process.cwd() + "/repo", interpreterPath);
    yield engine.init();

    let hermes = `
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript"
    initial="initial"
    xmlns:engine="https://insticc.org/fsm-engine"
    xmlns:cms="http://www.insticc.org/cms" 
    >
    <state id="initial">
        <onentry>
            <engine:log message="Entered" />
            <cms:changeVisibility name="conferenceName" id="conference_venue_list_menu_item"  visibility="true"/>
            <engine:log message="Exited" />
        </onentry>
    </state>
</scxml>
`;

    yield engine.addMachine("hermes");

    engine.setVersionSCXML("hermes", "version1", hermes);

    yield engine.sealVersion("hermes", "version1");

    let instance = yield engine.addInstance("hermes", "version1");
    yield instance.start();

    console.log(JSON.stringify(yield instance.getSnapshot()));

}).catch((err)=>{console.log(err)});
