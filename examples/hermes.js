let Engine = require("./../dist/index");
let interpreter = "fsm-engine-interpreter";
let interpreterPath = require(interpreter).getPath();
let moment = require('moment');
let co = require("co");

co(function*(){
    let engine = new Engine(null, null, process.cwd() + "/repo", interpreterPath);
    yield engine.init();

let hermes = `
<scxml xmlns="http://www.w3.org/2005/07/scxml"
       xmlns:engine="https://INSTICC.org/fsm-engine"
       version="1.0" initial="uninitialized">

    <datamodel>
        <data id="idEvent" expr="null"/>
        <data id="name" expr="null"/>

        <!-- anchor -->
        <data id="milestoneType" expr="null"/>
        <data id="milestoneEvent" expr="null"/>

        <!-- action -->
        <data id="timeShift" expr="null"/>
        <data id="timeShiftUnit" expr="null"/>

        <data id="defaultHours" expr="null"/>
        <data id="addressedTo" expr="null"/>
        <data id="from" expr="null"/>

        <!-- warning offset (t0) -->
        <data id="warningReportTO" expr="null"/>
        <data id="warningOn" expr="null"/>
        <data id="warningOnUnit" expr="null"/>

        <!-- report -->
        <data id="reportOn" expr="null"/>
        <data id="reportOnUnit" expr="null"/>
        <data id="reportEmailsOn" expr="null"/>
        <data id="reportEmailsOnUnit" expr="null"/>

        <data id="warningConcreteDate" expr="null"/>

        <data id="Gc" expr="false"/>
        <data id="t0" expr="null"/>
        <data id="deltaTrpt_hrs" expr="72"/>
        <data id="deltaTrsc_hrs" expr="24"/>
        <data id="deltaTrscn_hrs" expr="24"/>

    </datamodel>

    <state id="uninitialized">
        <transition event="init" target="hibernation">
            <assign location="idEvent" expr="_event.idEvent"/>
            <assign location="name" expr="_event.name"/>
            <assign location="milestoneType" expr="_event.milestoneType"/>
            <assign location="milestoneEvent" expr="_event.milestoneEvent"/>
            <assign location="timeShift" expr="_event.timeShift"/>
            <assign location="timeShiftUnit" expr="_event.timeShiftUnit"/>
            <assign location="defaultHours" expr="_event.defaultHours"/>
            <assign location="addressedTo" expr="_event.addressedTo"/>
            <assign location="from" expr="_event.from"/>
            <assign location="warningReportTO" expr="_event.warningReportTO"/>
            <assign location="warningOn" expr="_event.warningOn"/>
            <assign location="warningOnUnit" expr="_event.warningOnUnit"/>
            <assign location="reportOn" expr="_event.reportOn"/>
            <assign location="reportOnUnit" expr="_event.reportOnUnit"/>
            <assign location="reportEmailsOn" expr="_event.reportEmailsOn"/>
            <assign location="reportEmailsOnUnit" expr="_event.reportEmailsOnUnit"/>

            <engine:log message="Machine is initializing" />

            <script>

                warningConcreteDate = moment(milestoneEvent);

                switch(warningOnUnit) {
                    case 's':
                        warningConcreteDate.add(warningOn ,'seconds');
                        break;
                    case 'm':
                        warningConcreteDate.add(warningOn ,'minutes');
                        break;
                    case 'h':
                        warningConcreteDate.add(warningOn ,'hours');
                        break;
                    case 'd':
                        warningConcreteDate.add(warningOn ,'days');
                        break;
                    case 'wd':
                        warningConcreteDate.businessAdd(warningOn);
                        break;
                    default:
                        // what to do in the default case
                        break;
                }

                t0 = moment(milestoneEvent)
                switch(timeShiftUnit) {
                    case 's':
                        t0.add(timeShift ,'seconds');
                        break;
                    case 'm':
                        t0.add(timeShift ,'minutes');
                        break;
                    case 'h':
                        t0.add(timeShift ,'hours');
                        break;
                    case 'd':
                        t0.add(timeShift ,'days');
                        break;
                    case 'wd':
                        t0.businessAdd(timeShift);
                        break;
                    default:
                        // what to do in the defaul case
                        break;
                }
                
                t0.hour(defaultHours).minute(0).second(0);

            </script>

            <send event="hibernation"/>
            
        </transition>
    </state>

    <state id="hibernation">
        <onentry>
            <engine:log message="Scheduling warning date" />
            <engine:schedule job="warningJob" exprDate="warningConcreteDate.toDate()" raise="warning" />
        </onentry>

        <transition event="warning" target="prepareForAction">
            <engine:log message="Warning sent to %s" exprData="[warningReportTO]" />
        </transition>

    </state>

    <state id="prepareForAction">

        <onentry>
            <engine:schedule job="action" exprDate="t0.toDate()" raise="actionTime" />
        </onentry>

        <transition event="actionTime">
            <engine:log message="Verifying the general condition" />
            <if cond="Gc">
                <engine:log message="General condition was verified" />
                <send event="verified" />
            <else />
                <engine:log message="General condition was not verified, not ready." />
                <send event="notVerified" />
            </if>
        </transition>

        <transition event="verified" target="do" />
        <transition event="notVerified" target="notReady" />

    </state>

    <state id="notReady">

        <onentry>
            <engine:schedule job="manualRescheduleTimeOut" exprDate="t0.add(deltaTrsc_hrs, 'hours').toDate()" raise="timeOut" />
        </onentry>

        <transition event="MRsch" target="hibernation">
            <engine:unschedule job="manualRescheduleTimeOut" />
            <!-- todo - treat the event recieved to manually change t0 -->
        </transition>

        <transition event="timeOut" target="hibernation">
            <assign location="t0" expr="t0.add(deltaTrsc_hrs + deltaTrscn_hrs, 'hours')"/>
        </transition>

    </state>
    
    <final id="do">
        <onentry>
            <engine:log message="Executing the action" />
        </onentry>
    </final>

</scxml>

`;

    yield engine.addMachine("hermes");

    engine.setVersionSCXML("hermes", "version1", hermes);

    yield engine.sealVersion("hermes", "version1");

    let instance = yield engine.addInstance("hermes", "version1");
    yield instance.start();
    yield instance.sendEvent('init', {
        "idEvent":"1538",
        "name":"Ask More Reviewers",
        "milestoneType":"PaperSubmission",
        "milestoneEvent": moment(),
        "timeShift":"1",
        "timeShiftUnit":"m",
        "defaultHours":"8",
        "addressedTo":"Reviewer",
        "from":"REX",
        "warningReportTO":"REX",
        "warningOn":"10",
        "warningOnUnit":"s",
        "reportOn":"0",
        "reportOnUnit":"h",
        "reportEmailsOn":"72",
        "reportEmailsOnUnit":"h"
    });

    console.log(JSON.stringify(yield instance.getSnapshot()));

}).catch((err)=>{console.log(err)});

