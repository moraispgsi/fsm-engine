/**
 * Created by Ricardo Morais on 17/06/2017.
 */

import Interpreter from "./interpreter";
let context = {
    interpreter: null
};
import debugStart from "debug";
let debug = debugStart("interpreter");
debug("Initializing the interpreter process");

process.on('message', function(message) {
    debug("Message received");

    switch(message.action) {
        case 'init':
            if(context.interpreter) {
                process.send({
                    action: "init",
                    status: 500,
                    message: "Interpreter was already initialized."
                });
                return;
            }
            debug("Creating the interpreter");

            context.interpreter = new Interpreter(message.documentString,
                message.snapshot,
                message.actionDispatcherURL);
            debug("Created the interpreter");

            process.send({
                action: "init",
                status: 200
            });
            break;
        case 'start':
            if(!context.interpreter){
                process.send({
                    action: "start",
                    status: 500,
                    message: "Interpreter is was not initialized. Please use the action init"
                });
                return;
            }
            context.interpreter.start().then(()=>{
                process.send({
                    action: "start",
                    status: 200
                });
            });
            break;
        case 'event':
            if(!context.interpreter){
                process.send({
                    action: "start",
                    status: 500,
                    message: "Interpreter is was not initialized. Please use the action init"
                });
                return;
            }
            if(!context.interpreter.hasStarted) {
                process.send({
                    action: "start",
                    status: 500,
                    message: "Interpreter hasn't started yet. Please use the action start first"
                });
                return;
            }

            context.interpreter.sendEvent(message.data);

            process.send({
                action: "event",
                status: 200,
                message: "Event was sent"
            });
            break;
    }

});
