/**
 * Created by Ricardo Morais on 24/04/2017.
 */

import debugStart from "debug";
let debug = debugStart("instance");
/**
 * The instance class
 */
export default class Instance {

    constructor(core, documentString, actionDispatcherURL, machineName, versionKey, instanceKey) {
        this.core = core;
        this.documentString = documentString;
        this.actionDispatcher = actionDispatcherURL;
        this.machineName = machineName;
        this.versionKey = versionKey;
        this.instanceKey = instanceKey;
    }

    async _save() {
        //Take a snapshot of the instance
        let snapshot = this.sc.getSnapshot();
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

    async start(snapshot) {
        // await this._save();  //Saves the first snapshot
        //Mark has changed
        // this.sc.on("onTransition", () => {
        //     this.hasChanged = true
        // });
        // this.sc.start();                    //Start the statechart
        let cp = require('child_process');
        let child = cp.fork(__dirname + '/interpreterProcess.js');
        this.child =  child;
        debug("Forked the interpreter process");

        let documentString = this.documentString;
        let actionDispatcherURL = null;

        //Send messages to initialize and start the interpreter
        await new Promise(function(resolve, reject) {
            child.on('message', function(message) {
                switch(message.action) {
                    case 'init':
                        debug("Init ACK");
                        child.send({action: "start"});
                        break;
                    case 'start':
                        debug("Start ACK");
                        resolve();
                        break;
                }
            });

            child.send({
                action: "init",
                documentString: documentString,
                snapshot: snapshot,
                actionDispatcherURL: actionDispatcherURL,
            });
        });

        // this.interval = setInterval(function () {
        //     if (this.sc === null) {
        //         clearInterval(this.interval);
        //         return;
        //     }
        //     if (this.sc.isFinal()) {
        //         let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        //         info.hasEnded = true;
        //         this.core.setInstanceInfo(this.machineName, this.versionKey, this.instanceKey, info);
        //         return;
        //     }
        //     if (!this.sc._isStepping && this.hasChanged) {
        //         this._save().then();
        //         this.hasChanged = false;
        //     }
        // }.bind(this), SNAPSHOT_DELAY);

        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        info.hasStarted = true;
        this.core.setInstanceInfo(this.machineName, this.versionKey, this.instanceKey, info);
    }

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

    hasEnded() {
        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        return info.hasEnded;
    }

    /**
     * Revert an instance to a previous snapshot
     */
    revert(snapshotKey) {
        this.stop();
        let info = this.core.getSnapshotInfo(this.machineName, this.versionKey, this.instanceKey, snapshotKey);
        this.start(info.snapshot);
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
        await new Promise(function(resolve, reject) {
            child.on('message', function(message) {
                if(message.action === 'event') {
                    debug('Received event ACK');
                        resolve();
                }
            })
        });

    }
}

