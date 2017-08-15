/**
 * Created by Ricardo Morais on 28/03/2017.
 */

import vm from "vm";
import request from "request";
import engineActions from "./actions";
import debugStart from "debug";
let debug = debugStart("custom-action");

class CustomExecutableContent {

    constructor(instance, engine, dispatcherURL = null, dispatcherToken = null) {
        this.instance = instance;
        this.engine = engine;
        this.dispatcherURL = dispatcherURL;
        this.dispatcherToken = dispatcherToken;
    }

    /**
     * Executes a custom action on an actions server host by calling its REST API /execute method
     * @param context The execution context of the statechart
     * @param namespace The namespace of the action
     * @param action The name of the action
     * @param sandbox The sandbox of the finite-state machine instance which the action was requested
     * @param event The event in case the action was requested inside a transition
     * @param actionArguments The arguments of the action call
     */
    execute(context, namespace, action, sandbox, event, actionArguments) {

        try {
            let data = {
                namespace: namespace,
                action: action,
                arguments: {}
            };

            debug("Custom action with data: %s", JSON.stringify(data));

            for (let key of Object.keys(actionArguments)) {
                if (key[0] !== '$') {
                    if (key.startsWith("expr")) {
                        let newKey = key.substring("expr".length);
                        newKey = newKey[0].toLowerCase() + newKey.substring(1);
                        let prefix = 'var _event = ' + JSON.stringify(event) + ';';
                        vm.runInContext(prefix, sandbox);
                        vm.runInContext("var result6990080817 = " + actionArguments[key], sandbox);
                        data.arguments[newKey] = sandbox.result6990080817;
                    } else {
                        data.arguments[key] = actionArguments[key];
                    }
                }
            }

            if (namespace.toLowerCase() === "https://insticc.org/fsm-engine") {
                if(typeof engineActions[action] === 'function') {
                    engineActions[action].call(context, data.arguments, sandbox, event, this.engine, this.instance);
                }
                return;
            }

            if(!this.dispatcherURL) {
                return;
            }

            let host = this.dispatcherURL;
            let route = "/execute";
            let errorEvent = data.arguments.errorEvent;
            let successEvent = data.arguments.successEvent;

            request({
                url: host + route,
                headers: {
                    'Authorization': 'JWT ' + this.dispatcherToken
                },
                method: "POST",
                json: true,
                body: data,
            }, (error, response, body) => {
                if (error) {
                    debug("Request to action dispatcher failed with error: %s", error);
                    if (errorEvent) {
                        context.send({name: errorEvent, data: error});
                    }
                    return;
                }
                if (successEvent) {
                    debug("Request to action dispatcher was successful");
                    context.send({name: successEvent, data: error});
                }
            });

        } catch (err) {
            debug("Custom action not executed", err);
        }
    };

}

export default CustomExecutableContent;
