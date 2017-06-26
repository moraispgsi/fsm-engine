/**
 * Created by Ricardo Morais on 17/06/2017.
 */

//Libraries
import scxml from "scxml";
import vm from "vm";
import customExecuteStart from "./custom";
import debugStart from "debug";
import dateUtils from "date-utils";
let debug = debugStart("interpreter");

const REFRESH_INTERVAL = 1000;

export default class Interpreter {

    constructor(documentString, snapshot, actionDispatcherURL){
        this.documentString = documentString;
        this.snapshot = snapshot;
        this.actionDispatcherURL = actionDispatcherURL;
        this.execute = customExecuteStart(actionDispatcherURL);
        this.hasStarted = false;
        this.hasChanged = false;
        debug(documentString)
    }

    /**
     * Create the sandbox for the interpreter
     * @method _createSandbox
     */
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

    /**
     * Start the interpreter
     * @method start
     * @returns {Promise}
     */
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
        process.send({
            action: "snapshot",
            snapshot: this.sc.getSnapshot()
        });
        //Mark has changed
        this.sc.on("onTransition", () => {
            this.hasChanged = true;
        });

        this.hasStarted = true;
        this.interval = setInterval( () => {
            if (this.sc === null) {
                clearInterval(this.interval);
                return;
            }
            if (this.sc.isFinal()) {
                process.send({
                    action: "finished",
                });
                return;
            }
            if (!this.sc._isStepping && this.hasChanged) {
                process.send({
                    action: "snapshot",
                    snapshot: this.sc.getSnapshot()
                });
                this.hasChanged = false;
            }
        }, REFRESH_INTERVAL);

    }

    /**
     * Send an event to the interpreter
     * @method sendEvent
     * @param {String} data The data that goes along with the event
     */
    sendEvent(data){
        if(!this.hasStarted) {
            throw new Error("Can't send event, the interpreter hasn't started");
        }
        this.sc.gen(data);
        process.send({
            action: "snapshot",
            snapshot: this.sc.getSnapshot()
        });
    }
}




