/**
 * Created by Ricardo Morais on 28/03/2017.
 */
module.exports = function(actionsHost){

    let vm = require('vm');
    let request = require('request');

    /**
     * Executes a custom action on an actions server host by calling its REST API /execute method
     * @param namespace The namespace of the action
     * @param action The name of the action
     * @param sandbox The sandbox of the finite-state machine instance which the action was requested
     * @param event The event in case the action was requested inside a transition
     * @param actionArguments The arguments of the action call
     */
    let execute = function(namespace, action, sandbox, event, actionArguments) {

        try {

            let data = {
                stripNsPrefixRe: /^(?:{(?:[^}]*)})?(.*)$/,
                namespace: namespace,
                action: action,
                arguments: {}
            };

            for (let key of Object.keys(actionArguments)) {
                if(key[0] != '$'){
                    if (key.startsWith("expr")) {
                        let newKey = key.substring("expr".length);
                        newKey = newKey[0].toLowerCase() + newKey.substring(1);
                        data.arguments[newKey] = vm.runInContext(actionArguments[key], sandbox);
                    } else {
                        data.arguments[key] = actionArguments[key];
                    }
                }
            }

            let host = actionsHost;
            let route = "/execute";
            let errorEvent = actionArguments.errorEvent;
            let successEvent = actionArguments.successEvent;

            request({
                url: host + route,
                method: "POST",
                json: true,
                body: data,
            }, (error, response, body) => {
                if (error) {
                    if (errorEvent) {
                        this.raise(errorEvent);
                    }
                    return;
                }
                if (successEvent) {
                    this.raise(successEvent);
                }
            });

        } catch (err) {
            console.log(err);
        }
    };

    return execute;

};
