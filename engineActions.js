/**
 * Created by Ricardo Morais on 07/06/2017.
 */


let debug = require("debug")("engine-actions");
let vm = require('vm');

let jobs = {};

/**
 * Schedule an event for a specific date
 * <schedule event="eventToRaise" exprDate="new Date()" job="myJob"/>
 * @param arguments
 * @param sandbox
 * @param event
 */
function schedule(arguments, sandbox, event) {
    debug("Action schedule");
    let schedule = require('node-schedule');
    if(!arguments.event) {
        debug("Missing the event argument, not executed");
        return;
    }


    let job = schedule.scheduleJob(arguments.date, function(){
        debug("Fired on scheduled date");
        if(arguments.job) {
            delete jobs[arguments.job];
        }
        this.raise(arguments.event);

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
function unschedule(arguments, sandbox, event) {
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

