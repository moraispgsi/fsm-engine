/**
 * Created by Ricardo Morais on 24/04/2017.
 */

import debugStart from "debug";
let debug = debugStart("instance");
import dush from "dush";
let interpreter = "fsm-engine-interpreter";
let defaultInterpreterPath = require(interpreter).getPath();
/**
 * The instance class
 */
class Instance {

    /**
     * Constructor for an instance
     * @constructor
     * @param {Core} core The fsm-core
     * @param {String} documentString The SCXML document
     * @param {String} actionDispatcherURL The URL for the action-dispatcher
     * @param {String} machineName The machine name
     * @param {String} versionKey The version key
     * @param {String} instanceKey The instance Key
     * @param {String} interpreterPath The interpreter process JavaScript file path
     */
    constructor(core, documentString, actionDispatcherURL, machineName, versionKey, instanceKey, interpreterPath) {
        this.core = core;
        this.documentString = documentString;
        this.actionDispatcher = actionDispatcherURL;
        this.machineName = machineName;
        this.versionKey = versionKey;
        this.instanceKey = instanceKey;
        this.interpreterPath = interpreterPath || defaultInterpreterPath;
        this.emitter = dush();
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
        let snapshotsKeys = this.core.getSnapshotsKeys(this.machineName, this.versionKey, this.instanceKey);
        if (snapshotsKeys.length > 0) {
            let lastSnapshotKey = snapshotsKeys[snapshotsKeys.length - 1];
            let info = this.core.getSnapshotInfo(this.machineName, this.versionKey, this.instanceKey, lastSnapshotKey);
            if (JSON.stringify(snapshot) === JSON.stringify(info)) {
                return; //No change since the latest snapshot
            }
        }
        await this.core.addSnapshot(this.machineName, this.versionKey, this.instanceKey, snapshot);
    }

    /**
     * Request an action to be done on a child process(interpreter instance)
     * @method _requestChild
     * @memberOf Instance
     * @param {String} action The action to be done by the child process
     * @param {Object} data The data that accompanies the action
     * @returns {Promise} The result of the action request
     * @private
     */
    async _requestChild(action, data){
        //Send messages to initialize and start the interpreter
        return await new Promise((resolve, reject) => {
            this.emitter.once("response", (data) => {
                if (data.error) {
                    debug("Received error");
                    reject(data.error);
                    return;
                }
                debug(JSON.stringify(data));
                debug("Actions %s successfully", action);
                resolve(data);
            });
            data = data || {};
            data.action = action;
            this.child.send(data);
        });
    }

    /**
     * Starts the interpreter process
     * @method start
     * @memberOf Instance
     * @param {Object} snapshot An optional snapshot to run the interpreter
     * @returns {Promise.<void>}
     */
    async start(snapshot) {
        let cp = require('child_process');
        let child = cp.fork(this.interpreterPath);
        this.child =  child;
        debug("Forked the interpreter process");

        let documentString = this.documentString;
        let actionDispatcherURL = null;

        child.on("message", (message) => {
            debug("Message received", message.action);
            this.emitter.emit(message.action, message);
        });

        debug("Sending initialize signal");
        await this._requestChild("init", {
            documentString: documentString,
            snapshot: snapshot,
            actionDispatcherURL: actionDispatcherURL,
        });

        debug("Sending start signal");
        await this._requestChild("start");

        this.emitter.once("finished", (data) => {
            child.kill();
            let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
            info.hasStarted = true;
            info.hasStopped = false;
            info.hasEnded = true;
            this.core.setInstanceInfo(this.machineName, this.versionKey, this.instanceKey, info);
        });

        this.emitter.once("snapshot", (data) => {
            this._save(data.snapshot).then();
        });

        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        info.hasStarted = true;
        this.core.setInstanceInfo(this.machineName, this.versionKey, this.instanceKey, info);
    }

    /**
     * Forces the interpreter to stop.
     * @memberOf Instance
     * @method stop
     */
    stop() {
        if(this.hasStarted() && !this.hasEnded()){
            this.child.kill();
            let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
            info.hasStarted = true;
            info.hasStopped = true;
            info.hasEnded = false;
            this.core.setInstanceInfo(this.machineName, this.versionKey, this.instanceKey, info);
        }
    }

    /**
     * Check if the instance has started
     * @method hasStarted
     * @memberOf Instance
     * @returns {boolean}
     */
    hasStarted() {
        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        return info.hasStarted;
    }

    /**
     * Check if the instance has started
     * @method hasStopped
     * @memberOf Instance
     * @returns {boolean}
     */
    hasStopped() {
        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        return info.hasStopped;
    }

    /**
     * Check if the instance has ended(the Statechart reached the final state)
     * @method hasEnded
     * @memberOf Instance
     * @returns {boolean}
     */
    hasEnded() {
        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        return info.hasEnded;
    }

    /**
     * Get a snapshot of the instance
     * @method getSnapshot
     * @memberOf Instance
     * @returns {Promise.<Object>}
     */
    async getSnapshot() {
        //Find out if the instance has already started
        if (!(this.hasStarted())) {
            throw new Error("The instance hasn't started yet.");
        }
        debug('Sending request to the interpreter');
        let data = await this._requestChild("getSnapshot");
        return data.snapshot;
    }

    /**
     * Revert the instance to a previous snapshot
     * @method revert
     * @memberOf Instance
     * @param {String} snapshotKey The snapshot key
     * @returns {Promise.<void>}
     */
    async revert(snapshotKey) {
        this.stop();
        let info = this.core.getSnapshotInfo(this.machineName, this.versionKey, this.instanceKey, snapshotKey);
        await this.start(info.snapshot);
    }

    /**
     * Send an event to the statechart
     * @method sendEvent
     * @memberOf Instance
     * @param {String} event The name of the event
     * @param {Object} eventData The data of the event
     */
    async sendEvent(event, eventData) {
        //Find out if the instance has already started
        if (!(this.hasStarted())) {
            throw new Error("The instance hasn't started yet.");
        }
        let requestData = {
            data: {
                name: event,
                data: eventData,
            }

        };
        debug('Sending event signal to the interpreter');
        await this._requestChild("event", requestData);
    }
}

export default Instance;
