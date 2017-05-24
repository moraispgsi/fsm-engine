/**
 * Created by Ricardo Morais on 28/03/2017.
 */

let vm = require('vm');
let request = require('request');

/*
high lever actions arguments come in this format
    actionArguments: {
       argName1: value1,
       argName2: value2
    }
*/

let execute = function(action, sandbox, event, actionArguments) {

    let data = {
        action: action,
        arguments: {}
    };

    for(let key of Object.keys(actionArguments)) {
        if(key.startsWith("expr")) {
            let newKey = actionArguments.key.substring("expr".length);
            newKey = Character.toLowerCase(newKey[0])+newKey.substring(1);
            data.arguments[newKey] = vm.runInContext(actionArguments[key], sandbox);
        } else {
            data.arguments[key] = actionArguments[key];
        }
    }

    let host = actionArguments.host;
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
            if(errorEvent) {
                this.raise(errorEvent);
            }
            return;
        }
        if(successEvent) {
            this.raise(successEvent);
        }
    });
};

module.exports = execute;