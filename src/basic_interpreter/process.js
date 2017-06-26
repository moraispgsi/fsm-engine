/**
 * Created by Ricardo Morais on 17/06/2017.
 */

import Interpreter from "./interpreter";
import debugStart from "debug";
import dush from "dush";
let debug = debugStart("interpreter");
debug("Initializing the interpreter process");

let context = { interpreter: null };
const emitter = dush();

process.on('message', function(message) {
    debug("Message received");
    emitter.emit(message.action, message);
});

emitter.on("init", (message) => {
    if(context.interpreter) {
        process.send({
            action: "initACK",
            status: 500,
            message: "Interpreter was already initialized."
        });
        return;
    }
    debug("Creating the interpreter");

    try {
        context.interpreter = new Interpreter(message.documentString,
            message.snapshot,
            message.actionDispatcherURL);
        debug("Created the interpreter");

        process.send({
            action: "initACK",
            status: 200
        });

    } catch (err) {
        process.send({
            action: "initNACK",
            status: 500,
            message: err
        });
    }
});

emitter.on("start", (message) => {
    if(!context.interpreter){
        process.send({
            action: "startNACK",
            status: 500,
            message: "Interpreter was not initialized. Please use the action init"
        });
        return;
    }
    context.interpreter.start().then(()=>{
        process.send({
            action: "startACK",
            status: 200
        });
    });
});

emitter.on("event", (message) => {
    if(!context.interpreter){
        process.send({
            action: "eventNACK",
            status: 500,
            message: "Interpreter is was not initialized. Please use the action init"
        });
        return;
    }

    if(!context.interpreter.hasStarted) {
        process.send({
            action: "eventNACK",
            status: 500,
            message: "Interpreter hasn't started yet. Please use the action start first"
        });
        return;
    }

    context.interpreter.sendEvent(message.data);

    process.send({
        action: "eventACK",
        status: 200,
        message: "Event was sent"
    });
});
