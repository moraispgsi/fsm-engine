let Engine = require("./../dist/index");
let co = require("co")

co(function*(){
  let engine = new Engine(void 0, process.cwd() + "/repo");
  yield engine.init();
  let scxml = `<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript"
    xmlns:ddm="https://insticc.org/DDM"
    xmlns:test="https://insticc.org/test"
    xmlns:engine="https://INSTICC.org/fsm-engine"
    initial="uninitialized">
    <datamodel>
        <data id="date"          expr="null"/>
        <data id="hasExtension"  expr="false"/>
        <data id="extensionDate" expr="null"/>
        <data id="deadlineId"    expr="-1"/>
        <data id="hideDate"      expr="null"/>
    </datamodel>
        <state id="uninitialized">
            <transition event="init" target="idle">
                <assign location="date" expr="new Date(new Date().getTime() + 1000 * 5)"/>
                <assign location="deadlineId" expr="_event.deadlineId"/>
            </transition>
        </state>
        <state id="idle">
            <onentry>
                <ddm:updateDeadline exprId="deadlineId" state="" />
                <assign location="hideDate" expr="new Date(new Date().getTime() + 1000 * 10)"/>
                <engine:schedule event="expired" exprDate="date" job="dateJob"/>
            </onentry>
           <!-- if an extension event is receive, save the extension date -->
           <transition event="extension">
               <assign location="extensionDate" expr="new Date(new Date().getTime() + 1000 * 60 * 2)"/> 
               <assign location="hasExtension" expr="true"/> 
           </transition>
           <!-- if the deadline receives the event cancel it goes to the state canceled -->
           <transition event="cancel" target="canceled">
              <engine:unschedule job="dateJob"/>
           </transition>
           <!-- if the the date expires and there isn't an extension date go to expired -->
           <transition event="expired" cond="!hasExtension" target="expired"/>
           <!-- if the the date expires and there is an extension date go to extended -->
           <transition event="expired" cond="hasExtension" target="extended"/>
       </state>
     <state id="extended">
        <onentry>
            <ddm:updateDeadline exprId="deadlineId" state="extended" />
            <assign location="hideDate" expr="new Date(new Date().getTime() + 1000 * 5)"/>
            <engine:schedule event="extensionExpired" exprDate="extensionDate" job="extensionJob"/>
        </onentry>
        <transition event="extensionExpired" target="expired"/>
    </state>
    <state id="expired">
        <onentry>
            <ddm:updateDeadline exprId="deadlineId" state="expired" />
            <engine:schedule event="hide" exprDate="hideDate" job="hideJob"/>
        </onentry>
        <transition event="hide" target="final"/>
    </state>
    <state id="canceled">
        <onentry>
            <ddm:updateDeadline exprId="deadlineId" state="canceled" />
            <assign location="hideDate" expr="new Date(new Date().getTime() + 1000 * 60 * 2)"/>
            <engine:schedule event="hide" exprDate="hideDate" job="hideJob"/>
        </onentry>
        <transition event="hide" target="final"/>
    </state>
<final id="final">
    <onentry>
            <ddm:deleteDeadline exprId="deadlineId" />
    </onentry>
</final>
</scxml>`;
  yield engine.addMachine("deadline");
  engine.setVersionSCXML("deadline", "version1", scxml);
  yield engine.sealVersion("deadline", "version1");
  let instance = yield engine.addInstance("deadline", "version1");
  yield instance.start();
  let date = new Date(new Date().getTime() + 1000 * 10);
  instance.sc.on("onTransition", (state)=>{console.log(state);});
  instance.sendEvent('init', {date: date, deadlineId: 1, now: new Date()});

}).catch((err)=>{console.log(err)});

