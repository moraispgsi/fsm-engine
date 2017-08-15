/**
 * Created by Ricardo Morais on 24/04/2017.
 */

import debugStart from "debug";
import Interpreter from "./interpreter";

import scxml from "scxml";
import vm from "vm";
import CustomExecutableContent from "./custom";
import moment from "moment-business-days";
import dateUtils from "date-utils";
const REFRESH_INTERVAL = 1000;
/**
 * The instance class
 */
class Instance {

    /**
     * Constructor for an instance
     * @constructor
     * @param {Core} engine The fsm-engine
     * @param {String} documentString The SCXML document
     * @param {String} machine The machine name
     * @param {String} versionKey The version key
     * @param {String} instanceKey The instance Key
     */
    constructor(engine, documentString, machine, versionKey, instanceKey) {
        this.engine = engine;
        this.machine = machine;
        this.versionKey = versionKey;
        this.instanceKey = instanceKey;
        this.documentString = documentString;
        this.customExecContent = new CustomExecutableContent(this, engine, engine.dispatcherURL, engine.dispatcherToken);
        this.hasChanged = false;
        this.lastSnapshot = null;

        //DEBUG
        let debug = debugStart("instance");
        let debugLog = debugStart("instance-log");
        this.debug = function() {
            let prefix = `${machine}|${versionKey}|${instanceKey}: `;
            arguments[0] = prefix + arguments[0];
            debug.apply(null, arguments)
        };
        this.debugLog = function() {
            let prefix = `${machine}|${versionKey}|${instanceKey}: `;
            arguments[0] = prefix + arguments[0];
            debugLog.apply(null, arguments)
        };
    }

    /**
     * Saves a snapshot if it is different from the latest one in the repository
     * @method _save
     * @memberOf Instance
     * @param {Object} snapshot The snapshot object
     * @returns {Promise.<void>}
     * @private
     */
    async _save(snapshot) {

        //Take a snapshot of the instance
        //Get last snapshot on the database
        this.lastSnapshot = snapshot;
        let snapshotsKeys = await this.engine.getSnapshotsKeys(this.machine, this.versionKey, this.instanceKey);
        if (snapshotsKeys.length > 0) {
            let lastSnapshotKey = snapshotsKeys[snapshotsKeys.length - 1];
            let info = await this.engine.getSnapshotInfo(this.machine, this.versionKey, this.instanceKey, lastSnapshotKey);
            if (JSON.stringify(snapshot) === JSON.stringify(info)) {
                return; //No change since the latest snapshot
            }
        }
        await this.engine.addSnapshot(this.machine, this.versionKey, this.instanceKey, snapshot);
    }

//     this.engine.getInstanceInfo(this.machine, this.versionKey, this.instanceKey).then((info)=> {
//     info.hasStarted = true;
//     info.hasStopped = false;
//     info.hasEnded = true;
//     this.engine.setInstanceInfo(this.machine, this.versionKey, this.instanceKey, info).then();
// });
    /**
     * Starts the interpreter process
     * @method start
     * @memberOf Instance
     * @param {Object} snapshot An optional snapshot to run the interpreter
     * @returns {Promise.<void>}
     */
    async start(snapshot = null, onFinishHandler) {
        this.lastSnapshot = snapshot;
        this.debug("Starting the interpreter");

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
        this.sc = new scxml.scion.Statechart(fnModel, {snapshot: snapshot});
        this.sc.start();

        await this.save();

        //Mark has changed
        this.sc.on("onTransition", () => {
            this.hasChanged = true;
        });

        this._hasStarted = true;
        this.interval = setInterval( () => {
            if (this.sc === null) {
                clearInterval(this.interval);
                return;
            }
            if (this.sc.isFinal()) {
                clearInterval(this.interval);
                this.save().then();
                if(this.onFinishHandler) {
                    this.onFinishHandler();
                }
                return;
            }
            if (!this.sc._isStepping && this.hasChanged) {
                this.save().then();
                this.hasChanged = false;
            }
        }, REFRESH_INTERVAL);

    }

    getSnapshot() {
        return this.sc.getSnapshot();
    }

    /**
     * Request to save a snapshot
     * @memberOf Instance
     * @method save
     */
    async save() {
        let snapshot = this.getSnapshot();
        if(snapshot) {
            this.debug('Saving data %s', JSON.stringify(snapshot));
            await this._save(snapshot);
        }
    }

    /**
     * Forces the interpreter to stop.
     * @memberOf Instance
     * @method stop
     * @returns {Promise.<void>}
     */
    async stop() {
        if(this.hasStarted() && !this.hasEnded()){
            await this._save(this.getSnapshot());
            let info = await this.engine.getInstanceInfo(this.machine, this.versionKey, this.instanceKey);
            info.hasStarted = true;
            info.hasStopped = true;
            info.hasEnded = false;
            await this.engine.setInstanceInfo(this.machine, this.versionKey, this.instanceKey, info);
        }
    }

    async pause() {
        if(this.hasStarted() && !this.hasEnded()){
            await this._save(this.getSnapshot());
        }
    }

    /**
     * Check if the instance has started
     * @method hasStarted
     * @memberOf Instance
     * @returns {boolean}
     */
    async hasStarted() {
        let info = await this.engine.getInstanceInfo(this.machine, this.versionKey, this.instanceKey);
        return info.hasStarted;
    }

    /**
     * Check if the instance has started
     * @method hasStopped
     * @memberOf Instance
     * @returns {boolean}
     */
    async hasStopped() {
        let info = await this.engine.getInstanceInfo(this.machine, this.versionKey, this.instanceKey);
        return info.hasStopped;
    }

    /**
     * Check if the instance has ended(the Statechart reached the final state)
     * @method hasEnded
     * @memberOf Instance
     * @returns {boolean}
     */
    async hasEnded() {
        let info = await this.engine.getInstanceInfo(this.machine, this.versionKey, this.instanceKey);
        return info.hasEnded;
    }

    /**
     * Send an event to the statechart
     * @method sendEvent
     * @memberOf Interpreter
     * @param {String} event The name of the event
     * @param {Object} eventData The data of the event
     */
    sendEvent(event, eventData) {
        //Find out if the instance has already started
        if(!this._hasStarted) {
            throw new Error("Can't send event, the interpreter hasn't started");
        }

        let data = eventData;
        data.event = event;

        this.sc.gen(data);
        this.save().then();
    }

    /**
     * Create the sandbox for the interpreter
     * @method _createSandbox
     * @memberOf Interpreter
     * @private
     */
    _createSandbox(){

        let custom = this.customExecContent;
        //Define the sandbox for the v8 virtual machine
        let sandbox = {
            moment: moment,
            Date: Date,
            me: {
                machine: this.machine,
                versionKey: this.versionKey,
                instanceKey: this.instanceKey
            },
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

                custom.execute(this, ns, action, sandbox, message._event, message.data);
            }
        };

        return vm.createContext(sandbox);
    }

}

export default Instance;
