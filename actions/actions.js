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
    let exprId = actionArguments.expr;
    let exprView = actionArguments.expr;
    let host = actionArguments.host;
    let route = actionArguments.route;
    let errorEvent = actionArguments.errorEvent;
    let successEvent = actionArguments.successEvent;

    let data ={
        id: id,
        view: view
    };

    if(id === void 0){
        data.id = vm.runInContext(exprId, sandbox);
    } else if (view === void 0){
        data.view = vm.runInContext(exprView, sandbox);
    }

    request({
        url: host + route,
        method: "POST",
        json: true,
        body: data,
    },  (error, response, body) => {
        if (error !== void 0) {
            if(errorEvent !== void 0) {
                this.raise(errorEvent);
            }
            return;
        }
        if(successEvent !== void 0) {
            this.raise(successEvent);
        }
    });
    return $http("10.0.0.220:5003", "changeView", {
        id: id,
        view: view
    })(sandbox, data);
};

module.exports = actions;