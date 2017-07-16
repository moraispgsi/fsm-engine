/**
 * This is the example1
 * Objective: Recursive instantiation
 * Actors:
 *  fib: Calculates the n fib

 * Use "set DEBUG=instance-log" to see the logs
 * Artifacts: A repository will be created in the project folder, remove it after every run
 * Caution: Every instance will correspond to one process. Do not use n > 5
 */

let Engine = require("./../dist/index");
let interpreter = "fsm-engine-interpreter";
let interpreterPath = require(interpreter).getPath();
let co = require("co");

co(function*() {
    let engine = new Engine(null, null, process.cwd() + "/repo", interpreterPath);
    yield engine.init();

    // Waits for 10 seconds and exits
    let scxml = `
    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" datamodel="ecmascript"
        xmlns:engine="https://INSTICC.org/fsm-engine"
        initial="uninitialized">
        <datamodel>
            <data id="n" expr="0"/>
            <data id="cb" expr="false"/>
            <data id="cbRaise" expr="'done'"/>
            <data id="cbMachine" expr="null"/>
            <data id="cbVersionKey" expr="null"/>
            <data id="cbInstanceKey" expr="null"/>
            
            <data id="req1InstanceKey" expr="null"/>
            <data id="req2InstanceKey" expr="null"/>
            
            <data id="A" expr="null"/>
            <data id="B" expr="null"/>
            <data id="result" expr="0"/>
            
        </datamodel>
        <state id="uninitialized">
            <onentry>
                <engine:log message="Instance is awaiting initialization. %s" exprData="[JSON.stringify(me)]" />
            </onentry>
            <transition event="init" target="calculating"> 
                <engine:log message="Initializing with event %s" exprData="[JSON.stringify(_event)]" />
                
                <assign location="n" expr=" _event.n " />
                <if cond="_event.callback">
                    <assign location="cb" expr="true" />
                    <assign location="cbRaise" expr="_event.raise" />
                    <assign location="cbMachine" expr="_event.machine" />
                    <assign location="cbVersionKey" expr="_event.versionKey" />
                    <assign location="cbInstanceKey" expr="_event.instanceKey" />
                </if>
                <engine:log message="Fib(%s)" exprData="[ n ]" />
                
            </transition>
        </state>
        <state id="calculating">
        
            <onentry>
                <if cond="n &lt; 2">
                    <engine:log message="Fib(%s) = %s" exprData="[n,  n]" />
                    <assign location="result" expr="n" />
                    <send event="return" />  
                <else />  
                    <engine:addInstance machine="machine" versionKey="version1" raise="req1.created" />
                    <engine:addInstance machine="machine" versionKey="version1" raise="req2.created" />  
                </if>
            </onentry>
            
            <transition event="req1.created">
                <assign location="req1InstanceKey" expr="_event.instanceKey" />
                <engine:startInstance machine="machine" versionKey="version1" 
                                      exprInstanceKey="req1InstanceKey" raise="req1.started" />
            </transition>
            
            <transition event="req2.created">
                <assign location="req2InstanceKey" expr="_event.instanceKey" />
                <engine:startInstance machine="machine" versionKey="version1" 
                                      exprInstanceKey="req2InstanceKey" raise="req2.started" />
            </transition>
            
            <transition event="req1.started">
                <engine:log message="Sending request 1." />
                <engine:sendEvent machine="machine" versionKey="version1" exprInstanceKey="req1InstanceKey" 
                       raise="req1.eventSent" event="init" 
                       exprEventData="{
                                     n: n - 1,
                                     callback: true,
                                     raise: 'req1.completed',
                                     machine: me.machine, 
                                     versionKey: me.versionKey, 
                                     instanceKey: me.instanceKey
                                  }"
                        />
            </transition>
            
            <transition event="req2.started">
                <engine:log message="Sending request 2." />
                <engine:sendEvent machine="machine" versionKey="version1" exprInstanceKey="req2InstanceKey" 
                       raise="req2.eventSent" event="init" 
                       exprEventData="{
                                     n: n - 2,
                                     callback: true,
                                     raise: 'req2.completed',
                                     machine: me.machine, 
                                     versionKey: me.versionKey, 
                                     instanceKey: me.instanceKey
                                  }" />
            </transition>
            
            <transition event="req1.completed">
                <engine:log message="Fib(%s): result %s" exprData="[n - 1, JSON.stringify(_event)]" />
                <assign location="A" expr="_event.result" />
                <if cond="A !== null &amp;&amp; B !== null">
                    <send event="ready" />
                </if>
            </transition>
            
            <transition event="req2.completed">
                <assign location="B" expr="_event.result" />
                <if cond="A !== null &amp;&amp; B !== null">
                    <send event="ready" />
                </if>
            </transition>
            
            <transition event="ready">
                <engine:log message="Fib(%s) = %s" exprData="[n,  A + B ]" />
                <assign location="result" expr="A + B" />
                <send event="return" />
            </transition>
            
            <transition event="return">
                <if cond="cb">
                    <engine:sendEvent exprEvent="cbRaise" exprEventData="{ result: result }"
                        exprMachine="cbMachine" exprVersionKey="cbVersionKey" exprInstanceKey="cbInstanceKey" 
                        raise="done" />
                <else />
                    <send event="done" />
                </if>
            </transition>
            
            <transition event="done" target="final" />
           
        </state>
        <final id="final">
            <onentry>
                <engine:log message="Machine is exiting." />
            </onentry>
        </final>
    </scxml>`;

    yield engine.addMachine("machine");

    engine.setVersionSCXML("machine", "version1", scxml);

    yield engine.sealVersion("machine", "version1");

    let instance = yield engine.addInstance("machine", "version1");
    yield instance.start();
    yield instance.sendEvent('init', {
        n: 5,
        callback: false
    });

}).catch((err) => {
    console.log(err)
});

