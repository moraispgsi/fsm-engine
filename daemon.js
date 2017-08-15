/**
 * This is the example1
 * Objective: Allow one machine instance to create a new instance of another machine and start it
 * Actors:
 *  machine1: waits 10 seconds before exiting
 *  machine2: creates and starts an instance of the machine1
 * Use "set DEBUG=instance-log" to see the logs
 * Artifacts: A repository will be created in the project folder, remove it after every run
 */

let Engine = require("./dist/index");
let co = require("co");


co(function*(){
    let engine = new Engine(null, null);
    let redisOptions = {
        host: "213.228.151.36",
        port: 1245,
        password: process.env.REDIS_PASSWORD
    };
    yield engine.init();

    process.on('SIGINT', function() {
        engine.shutdown().then(() => {
           process.exit(0);
        }).catch(() => {
            process.exit(1);
        });
    });
}).catch((err)=>{console.log(err)});

