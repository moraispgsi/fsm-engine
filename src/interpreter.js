/**
 * Created by Ricardo Morais on 17/06/2017.
 */

//Libraries
import scxml from "scxml";
import vm from "vm";
import customExecuteStart from "./customExecContent";
import debugStart from "debug";
let debug = debugStart("interpreter");


export default class Interpreter {

    constructor(documentString, snapshot, actionDispatcherURL){
        this.documentString = documentString;
        this.snapshot = snapshot;
        this.actionDispatcherURL = actionDispatcherURL;
        this.execute = customExecuteStart(actionDispatcherURL);
        this.hasStarted = false;
        debug(documentString)
    }

    _createSandbox(){

        let execute = this.execute;
        //Define the sandbox for the v8 virtual machine
        let sandbox = {
            Date: Date,
            //The server global variables and functions
            // globals: serverGlobal,
            //The function that will process the custom actions
            postMessage: function(message) {
                let type = message.data["$type"];
                let stripNsPrefixRe = /^(?:{(?:[^}]*)})?(.*)$/;
                let arr = stripNsPrefixRe.exec(type);
                let ns;
                let action;
                if(arr.length === 2) {
                    ns = type.substring(1, type.indexOf("}"));
                    action = arr[1];
                } else {
                    ns = "";
                    action = arr[0];
                }

                execute.call(this, ns, action, sandbox, message._event, message.data);
            }
        };

        return vm.createContext(sandbox);
    }

    async start() {
        debug("Starting the interpreter");

        //Create the SCION model from the SCXML document
        let model = await new Promise((resolve, reject) => {
            scxml.documentStringToModel(null, this.documentString, function (err, model) {
                if (err) {
                    reject(err);
                }
                resolve(model);
            });
        }).then();

        let vmSandbox = this._createSandbox();

        //Create the SCION-CORE fnModel to use in its interpreter
        let fnModel = await new Promise((resolve, reject) => {
            model.prepare(function (err, fnModel) {
                if (err) {
                    reject(err);
                }
                resolve(fnModel);
            }, vmSandbox);
        }).then();

        this.sandbox = vmSandbox;
        //Instantiate the interpreter
        this.sc = new scxml.scion.Statechart(fnModel, {snapshot: this.snapshot});
        this.sc.start();
        this.hasStarted = true;

    }

    sendEvent(data){

        if(!this.hasStarted) {
            throw new Error("Can't send event, the interpreter hasn't started");
        }

        this.sc.gen(data);
    }
}




