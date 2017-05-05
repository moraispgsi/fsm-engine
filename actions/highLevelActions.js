/**
 * Created by Ricardo Morais on 28/03/2017.
 */

let lowLevelActions = require('./lowLevelActions');
let vm = require('vm');

let $a = lowLevelActions.makeAction;
let $t = $a.transition;
let $i = (property) => $a.getInstanceProperty(property);
let $is = (property, value) => $a.setInstanceProperty(property, value);
let $d = (property) => $a.getDataProperty(property);
let $ds = (property, value) => $a.setDataProperty(property, value);
let $f = $a.getFixed;
let $seq = $a.actionSequence;
let $c = $a.context;
let $http = $a.httpRequest;
let $log = $a.log;

/*
high lever actions arguments come in this format
    actionArguments: {
       argName1: value1,
       argName2: value2
    }
 */

let actions = {};
actions.logme = function(sandbox, data, actionArguments) {
    let title = actionArguments.title;
    let text = actionArguments.text;
    return $log(title, text)(sandbox, data);
};

actions.changeView = function(sandbox, data, actionArguments) {

    let id = actionArguments.id;
    let view = actionArguments.view;

    if(typeof id === 'string'){
        id = vm.runInContext(id, sandbox);
    }

    return $http("10.0.0.220:5003", "changeView", {
        id: id,
        view: view
    })(sandbox, data);
};

module.exports = actions;