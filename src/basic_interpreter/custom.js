/**
 * Created by Ricardo Morais on 28/03/2017.
 */

import vm from "vm";
import request from "request";
import engineActions from "./actions";
import debugStart from "debug";
let debug = debugStart("custom-action");

export default function(actionDispatcherHost){

    /**
     * Executes a custom action on an actions server host by calling its REST API /execute method
     * @param namespace The namespace of the action
     * @param action The name of the action
     * @param sandbox The sandbox of the finite-state machine instance which the action was requested
     * @param event The event in case the action was requested inside a transition
     * @param actionArguments The arguments of the action call
     */
    return function(namespace, action, sandbox, event, actionArguments) {

        try {
            let data = {
                namespace: namespace,
                action: action,
                arguments: {}
            };

            debug("Custom action with data: %s", JSON.stringify(data));

            for (let key of Object.keys(actionArguments)) {
                if(key[0] !== '$'){
                    if (key.startsWith("expr")) {
                        let newKey = key.substring("expr".length);
                        newKey = newKey[0].toLowerCase() + newKey.substring(1);
                        data.arguments[newKey] = vm.runInContext(actionArguments[key], sandbox);
                    } else {
                        data.arguments[key] = actionArguments[key];
                    }
                }
            }

            if(namespace.toLowerCase() === "https://insticc.org/fsm-engine") {
                engineExecute.call(this, action, data.arguments, sandbox, event);
                return;
            }

            let host = actionDispatcherHost;
            let route = "/execute";
            let errorEvent = data.arguments.errorEvent;
            let successEvent = data.arguments.successEvent;

            request({
                url: host + route,
                method: "POST",
                json: true,
                body: data,
            }, (error, response, body) => {
                if (error) {
                    debug("Request to action dispatcher failed with error: %s", error);
                    if (errorEvent) {
                        this.send({name: errorEvent, data: error});
                    }
                    return;
                }
                if (successEvent) {
                    debug("Request to action dispatcher was successful");
                    this.send({name: successEvent, data: error});
                }
            });

        } catch (err) {
            debug("Custom action not executed");
        }
    };

    function engineExecute(action, args, sandbox, event){
        switch(action){
            case "schedule":
                engineActions.schedule.call(this, args, sandbox, event);
                break;
            case "unschedule":
                engineActions.unschedule.call(this, args, sandbox, event);
                break;
        }
    }

};
