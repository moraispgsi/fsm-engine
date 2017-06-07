
let schedule = require('node-schedule');
let date = new Date("Wed Jun 07 2017 20:21:00 GMT+0100 (GMT Daylight Time)");

let id = schedule.scheduleJob(date, function(){
    console.log('The world is going to end today.');
});
