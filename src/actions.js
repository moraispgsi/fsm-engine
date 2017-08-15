/**
 * Created by Ricardo Morais on 07/06/2017.
 */

let debug = require("debug")("interpreter-actions");
let vm = require('vm');
let scheduleLib = require('node-schedule');
let vsprintf = require('sprintf-js').vsprintf;

let jobs = {};
/**
 * Schedule an event for a specific date
 * <schedule event="eventToRaise" exprDate="new Date()" job="myJob"/>
 * @param arguments
 * @param sandbox
 */
function schedule(args, sandbox, eventContext) {
    debug("Action schedule");
    if (!args.raise) {
        throw new Error("Missing the raise argument, not executed");
    }
    let event = args.raise;
    let date = args.date;
    let jobIdentifier = args.job;

    let job = scheduleLib.scheduleJob(date, function () {
        debug("Fired '%s' event on scheduled date '%s'", event, date);
        if (jobIdentifier) {
            delete jobs[jobIdentifier];
        }
        this.send({name: event});

    }.bind(this));

    if (args.job) {
        jobs[args.job] = job;
    }
}

/**
 * Unschedules a job
 * <unschedule job="myJob"/>
 * @param arguments
 * @param sandbox
 * @param event
 */
function unschedule(args, sandbox, eventContext) {
    debug("Action unschedule");
    if (!args.job) {
        throw new Error("Missing the job argument, not executed");
    }
    jobs[args.job].cancel();
}

function log(args, sandbox, eventContext, engine, instance) {
    debug("Action log");

    if (!args.message) {
        throw new Error("Missing the message argument, not executed");
    }

    args.data = args.data || [];

    instance.debugLog(vsprintf(args.message, args.data));
}

function runInstance(args, sandbox, eventContext, engine) {
    debug("Action runInstance");

    if (!args.machine || !args.versionKey) {
        throw new Error("Missing the machine or versionKey or instanceKey arguments, not executed");
    }

    engine.addInstance(args.machine, args.versionKey).then((instanceKey) => {
        engine.runInstance(args.machine, args.versionKey, instanceKey).then((job) => {
            job.on('complete', (result) => {
                this.send({
                    name: args.raise || 'runningInstance',
                    machine: args.machine,
                    versionKey: args.versionKey,
                    instanceKey: instanceKey
                });
            })
        });
    })
}

function stopInstance(args, sandbox, eventContext, engine) {
    debug("Action stopInstance");

    if (!args.machine || !args.versionKey || !args.instanceKey) {
        throw new Error("Missing the machine or versionKey or instanceKey arguments, not executed");
    }

    engine.stopInstance(args.machine, args.versionKey, args.instanceKey).then((job) => {
        job.on('complete', (result) => {
            this.send({
                name: args.raise || 'runningInstance',
                machine: args.machine,
                versionKey: args.versionKey,
                instanceKey: data.instanceKey
            });
        })
    });
}

function sendEvent(args, sandbox, eventContext, engine) {
    debug("Action sendEvent");

    if (!args.machine || !args.versionKey || !args.instanceKey) {
        throw new Error("Missing the machine or versionKey or instanceKey arguments, not executed");
    }

    if (!args.raise) {
        throw new Error("Missing the raise argument, not executed");
    }

    engine.sendEvent(args.machine, args.versionKey, args.instanceKey, args.raise || 'eventSent', args.data).then();

}

export default {
    schedule: schedule,
    unschedule: unschedule,
    log: log,
    runInstance: runInstance,
    stopInstance: stopInstance,
    sendEvent: sendEvent,
};

