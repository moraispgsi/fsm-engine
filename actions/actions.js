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

let actions = {};


actions.changeView = function(sandbox, event, actionArguments) {

    let id = actionArguments.id;
    let view = actionArguments.view;
    let exprId = actionArguments.exprId;
    let exprView = actionArguments.exprView;
    let host = actionArguments.host;
    let route = "/changeVisualization";
    let exprHost = actionArguments.exprHost;
    let errorEvent = actionArguments.errorEvent;
    let successEvent = actionArguments.successEvent;

    id    = id    ? id    : vm.runInContext(exprId, sandbox);
    view  = view  ? view  : vm.runInContext(exprView, sandbox);
    host  = host  ? host  : vm.runInContext(exprHost, sandbox);

    let data = {
        id: id,
        view: view
    };

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

module.exports = actions;