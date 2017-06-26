/**
 * Created by Ricardo Morais on 24/04/2017.
 */

import debugStart from "debug";
let debug = debugStart("instance");
import dush from "dush";
/**
 * The instance class
 */
export default class Instance {

    /**
     * Contructor for an instance
     * @param core The fsm-core
     * @param documentString The SCXML document
     * @param actionDispatcherURL The URL for the action-dispatcher
     * @param machineName The machine name
     * @param versionKey The version key
     * @param instanceKey The instance Key
     * @param interpreterPath The interpreter process JavaScript file path
     */
    constructor(core, documentString, actionDispatcherURL, machineName, versionKey, instanceKey, interpreterPath) {
        this.core = core;
        this.documentString = documentString;
        this.actionDispatcher = actionDispatcherURL;
        this.machineName = machineName;
        this.versionKey = versionKey;
        this.instanceKey = instanceKey;
        this.interpreterPath = interpreterPath || __dirname + '/interpreterProcess.js';
        this.emitter = dush();
    }

    /**
     * Saves a snapshot if it is different from the latest one in the repository
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
                //No change since the latest snapshot
                return;
            }
        }
        await this.core.addSnapshot(this.machineName, this.versionKey, this.instanceKey, snapshot);
    }

    /**
     * Starts the interpreter process
     * @param snapshot An optional snapshot to run the interpreter
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
            debug("Message received");
            this.emitter.emit(message.action, message);
        });

        //Send messages to initialize and start the interpreter
        await new Promise((resolve, reject) => {
            this.emitter.once("initACK", (data) => {
                debug("Init ACK");
                this.emitter.off("initNACK");
                child.send({action: "start"});
                this.emitter.once("startACK", () => {
                    debug("start ACK");
                    this.emitter.off("startNACK");
                    resolve();
                });
                this.emitter.once("startNACK", (data) => {
                    debug("start NACK");
                    this.emitter.off("startACK");
                    reject(data.message)
                });
            });

            this.emitter.once("initNACK", (data) => {
                debug("Init NACK %s", data.message);
                this.emitter.off("initACK");
                reject(data.message)
            });

            child.send({
                action: "init",
                documentString: documentString,
                snapshot: snapshot,
                actionDispatcherURL: actionDispatcherURL,
            });
        });

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

    hasStarted() {
        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        return info.hasStarted;
    }

    hasStopped() {
        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        return info.hasStopped;
    }

    hasEnded() {
        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        return info.hasEnded;
    }

    /**
     * Revert the instance to a previous snapshot
     */
    async revert(snapshotKey) {
        this.stop();
        let info = this.core.getSnapshotInfo(this.machineName, this.versionKey, this.instanceKey, snapshotKey);
        await this.start(info.snapshot);
    }

    /**
     * Send an event to the statechart
     * @param eventName The name of the event
     * @param data The data of the event
     */
    async sendEvent(eventName, data) {
        //Find out if the instance has already started
        if (!(this.hasStarted())) {
            throw new Error("The instance hasn't started yet.");
        }
        data = data || {};
        data.name = eventName;
        let child = this.child;
        child.send({action: "event", data});

        debug('Sending event to the interpreter');
        await new Promise((resolve, reject) => {
           this.once("eventACK", () => {
               debug('Received event ACK');
               this.off('eventNACK');
               resolve();
           });
            this.once("eventNACK", (data) => {
                debug('Received event NACK');
                this.off('eventACK');
                reject(data.message);
            });
        });
    }
}

