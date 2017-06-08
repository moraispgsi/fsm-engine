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
function schedule(arguments, sandbox, eventContext) {
    debug("Action schedule");
    if(!arguments.event) {
        debug("Missing the event argument, not executed");
        return;
    }
    let event = arguments.event;
    let date = arguments.date;
    let jobIdentifier = arguments.job;

    let job = scheduleLib.scheduleJob(date, function(){
        debug("Fired '%s' event on scheduled date '%s'", event, date);
        console.log(event);
        if(jobIdentifier) {
            delete jobs[jobIdentifier];
        }
        this.raise(event);

    }.bind(this));

    if(arguments.job){
        jobs[arguments.job] = job;
    }
}

/**
 * Unschedules a job
 * <unschedule job="myJob"/>
 * @param arguments
 * @param sandbox
 * @param event
 */
function unschedule(arguments, sandbox, eventContext) {
    debug("Action unschedule");
    if(!arguments.job){
        debug("Missing the job argument, not executed");
    }
    jobs[arguments.job].cancel();
}

module.exports = {
    schedule: schedule,
    unschedule: unschedule
};

