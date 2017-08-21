/**
 * Created by Ricardo Morais on 07/06/2017.
 */

let debug = require("debug")("interpreter-actions");
let vm = require('vm');
let vsprintf = require('sprintf-js').vsprintf;

/**
 * Schedule an event for a specific date
 * <schedule event="eventToRaise" exprDate="new Date()" raise="eventName"/>
 * @param arguments
 * @param sandbox
 */
function schedule(args, sandbox, eventContext, engine, instance) {
    debug("Action schedule");
    if (!args.raise) {
        throw new Error("Missing the raise argument, not executed");
    }
    let event = args.raise;
    let when = args.when;
    let priority = args.priority || 'normal';
    let data = args.data || {};

    let machine = instance.machine,
        versionKey = instance.versionKey,
        instanceKey = instance.instanceKey;

    //create a job instance
    let job = engine.queue
            .createJob(`event:${machine}:${versionKey}:${instanceKey}`, {
                machine,
                versionKey,
                instanceKey,
                event: event,
                data: data
            })
            .attempts(20)
            .priority(priority);

    engine.queue.schedule(when, job);

    debug("Fired '%s' event on scheduled date '%s'", event, when);
}

/**
 * Unschedules a job
 * <unschedule job="myJob"/>
 * @param arguments
 * @param sandbox
 * @param event
 */
function unschedule(args, sandbox, eventContext, engine, instance) {
    debug("Action unschedule - not implemented yet");
    if (!args.job) {
        throw new Error("Missing the job argument, not executed");
    }

    //todo
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
    // unschedule: unschedule,
    log: log,
    runInstance: runInstance,
    stopInstance: stopInstance,
    sendEvent: sendEvent,
};

