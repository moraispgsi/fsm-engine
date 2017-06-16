/**
 * Created by Ricardo Morais on 07/06/2017.
 */


let debug = require("debug")("engine-actions");
let vm = require('vm');
let scheduleLib = require('node-schedule');

let jobs = {};

/**
 * Schedule an event for a specific date
 * <schedule event="eventToRaise" exprDate="new Date()" job="myJob"/>
 * @param arguments
 * @param sandbox
 * @param event
 */
function schedule(args, sandbox, eventContext) {
    debug("Action schedule");
    if(!args.event) {
        debug("Missing the event argument, not executed");
        return;
    }
    let event = args.event;
    let date = args.date;
    let jobIdentifier = args.job;

    let job = scheduleLib.scheduleJob(date, function(){
        debug("Fired '%s' event on scheduled date '%s'", event, date);
        if(jobIdentifier) {
            delete jobs[jobIdentifier];
        }
        this.send({name: event});

    }.bind(this));

    if(args.job){
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
    if(!args.job){
        debug("Missing the job argument, not executed");
    }
    jobs[args.job].cancel();
}

export default {
    schedule: schedule,
    unschedule: unschedule
};

