/**
 * Created by Ricardo Morais on 24/04/2017.
 */

import debugStart from "debug";

import dush from "dush";
let defaultInterpreter = "fsm-engine-interpreter";
let interpreter = require(defaultInterpreter);
let defaultInterpreterPath = (interpreter).getPath();
/**
 * The instance class
 */
class Instance {

    /**
     * Constructor for an instance
     * @constructor
     * @param {Core} engine The fsm-engine
     * @param {String} documentString The SCXML document
     * @param {String} actionDispatcherURL The URL for the action-dispatcher
     * @param {String} actionDispatcherToken The access token for the action-dispatcher
     * @param {String} machine The machine name
     * @param {String} versionKey The version key
     * @param {String} instanceKey The instance Key
     * @param {String} interpreterPath The interpreter process JavaScript file path
     */
    constructor(queue, engine, documentString, actionDispatcherURL, actionDispatcherToken, machine, versionKey, instanceKey, interpreterPath) {
        this.engine = engine;
        this.documentString = documentString;
        this.dispatcherURL = actionDispatcherURL;
        this.dispatcherToken = actionDispatcherToken;
        this.machine = machine;
        this.versionKey = versionKey;
        this.instanceKey = instanceKey;
        this.interpreterPath = interpreterPath || defaultInterpreterPath;
        this.emitter = dush();
        this.lastSnapshot = null;
        this.queue = queue;
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
        // return; //todo delete this

        this.lastSnapshot = snapshot;
        let snapshotsKeys = this.engine.getSnapshotsKeys(this.machine, this.versionKey, this.instanceKey);
        if (snapshotsKeys.length > 0) {
            let lastSnapshotKey = snapshotsKeys[snapshotsKeys.length - 1];
            let info = this.engine.getSnapshotInfo(this.machine, this.versionKey, this.instanceKey, lastSnapshotKey);
            if (JSON.stringify(snapshot) === JSON.stringify(info)) {
                return; //No change since the latest snapshot
            }
        }
        await this.engine.addSnapshot(this.machine, this.versionKey, this.instanceKey, snapshot);
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
    async _requestChild(action, data = {}){
        //Send messages to initialize and start the interpreter
        return await new Promise((resolve, reject) => {
            this.emitter.once("response", (data) => {
                if (data.error) {
                    this.debug("Received error");
                    reject(data.error);
                    return;
                }
                this.debug(JSON.stringify(data));
                this.debug("Actions %s successfully", action);
                resolve(data);
            });
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
    async start(snapshot = null) {
        this.lastSnapshot = snapshot;
        let cp = require('child_process');
        let child = cp.fork(this.interpreterPath);
        this.child =  child;
        this.debug("Forked the interpreter process");

        let documentString = this.documentString;

        child.on("message", (message) => {
            this.debug("Message received", message.action);
            this.emitter.emit(message.action, message);
        });

        child.on("exit", () => {
            this.debug("Process was killed");
            this.removeListeners();

            if(!this.hasEnded() && !this.hasStopped()) {
                // Restart the process, it was killed
                this.start(this.lastSnapshot).then();
            }
        });

        this.debug("Sending initialize signal");
        await this._requestChild("init", {
            documentString: documentString,
            snapshot: snapshot,
            dispatcherURL: this.dispatcherURL,
            dispatcherToken: this.dispatcherToken,
            machine: this.machine,
            versionKey: this.versionKey,
            instanceKey: this.instanceKey
        });

        this.emitter.once("finished", (data) => {
            this.getSnapshot().then((snapshot) => {
                this.lastSnapshot = snapshot;
                this.child.kill();
                this.child = null;
                let info = this.engine.getInstanceInfo(this.machine, this.versionKey, this.instanceKey);
                info.hasStarted = true;
                info.hasStopped = false;
                info.hasEnded = true;
                this.engine.setInstanceInfo(this.machine, this.versionKey, this.instanceKey, info);
            });
        });

        this.addListeners();

        this.debug("Sending start signal");
        await this._requestChild("start");

        let info = this.engine.getInstanceInfo(this.machine, this.versionKey, this.instanceKey);
        info.hasStarted = true;
        this.engine.setInstanceInfo(this.machine, this.versionKey, this.instanceKey, info);
    }

    addListeners() {
        this.emitter.on("snapshot", (data) => {
            // this.queue.push(function(cb) {
            //
            //
            // });

            this._save(data.snapshot).then(() => {
                if(this.child) {
                    this.child.send({
                        action: "response" + data.actionId,
                        message: "successful"
                    });
                }
            });

        });

        this.emitter.on('log', (data) => {

            if(data.data){
                this.debugLog.apply(null, ['LOG: ' + data.message].concat(Object.values(data.data)));
            } else {
                this.debugLog('LOG: ' + data.message);
            }

            if(this.child) {
                this.child.send({
                    action: "response" + data.actionId,
                    message: "successful"
                });
            }
        });

        this.emitter.on('addInstance', (data) => {

            this.debug("Adding instance of machine %s, version %s", data.machine, data.versionKey);

            this.engine.addInstance(data.machine, data.versionKey).then((instance) => {
                if(this.child) {
                    this.child.send({
                        action: "response" + data.actionId,
                        message: "successful",
                        instanceKey: instance.instanceKey
                    });
                }
            }).catch((err) => {
                if(this.child) {
                    this.child.send({
                        action: "response" + data.actionId,
                        error: err
                    });
                }
            });

        });

        this.emitter.on('startInstance', (data) => {

            this.debug("Starting instance %s of machine %s, version %s", data.instanceKey, data.machine, data.versionKey);

            try {
                let instance = this.engine.getInstance(data.machine, data.versionKey, data.instanceKey);
                instance.start().then(() => {
                    if(this.child) {
                        this.child.send({
                            action: "response" + data.actionId,
                            message: "successful",
                            machine: data.machine,
                            versionKey: data.versionKey,
                            instanceKey: data.instanceKey
                        })
                    }
                }).catch((err) => {
                    if(this.child) {
                        this.child.send({
                            action: "response" + data.actionId,
                            error: err
                        });
                    }
                });
            } catch(err) {
                if(this.child) {
                    this.child.send({
                        action: "response" + data.actionId,
                        error: err
                    });
                }
            }
        });

        this.emitter.on('stopInstance', (data) => {

            this.debug("Stopping instance %s of machine %s, version %s", data.instanceKey, data.machine, data.versionKey);

            try {
                let instance = this.engine.getInstance(data.machine, data.versionKey, data.instanceKey);
                instance.stop().then(() => {
                    if(this.child) {
                        this.child.send({
                            action: "response" + data.actionId,
                            message: "successful",
                            machine: data.machine,
                            versionKey: data.versionKey,
                            instanceKey: data.instanceKey
                        })
                    }
                }).catch((err) => {
                    if(this.child) {
                        this.child.send({
                            action: "response" + data.actionId,
                            error: err
                        });
                    }
                });
            } catch(err) {
                if(this.child) {
                    this.child.send({
                        action: "response" + data.actionId,
                        error: err
                    });
                }
            }

        });

        this.emitter.on('sendEvent', (data) => {

            this.debug("Sending an event to the instance %s of machine %s, version %s", data.instanceKey, data.machine, data.versionKey);

            try {
                let instance = this.engine.getInstance(data.machine, data.versionKey, data.instanceKey);
                instance.sendEvent(data.event, data.eventData || {}).then();

                if(this.child) {
                    this.child.send({
                        action: "response" + data.actionId,
                        message: "successful",
                        machine: data.machine,
                        versionKey: data.versionKey,
                        instanceKey: data.instanceKey
                    })
                }

            } catch(err) {
                if(this.child) {
                    this.child.send({
                        action: "response" + data.actionId,
                        error: err
                    });
                }
            }

        });

    }

    removeListeners() {
        this.emitter.off('snapshot');
        this.emitter.off('log');
        this.emitter.off('addInstance');
        this.emitter.off('startInstance');
        this.emitter.off('stopInstance');
        this.emitter.off('sendEvent');
    }

    /**
     * Request to save a snapshot
     * @memberOf Instance
     * @method save
     */
    async save() {
        let data = await this._requestChild("getSnapshot");
        await this._save(data.snapshot);
    }

    /**
     * Forces the interpreter to stop.
     * @memberOf Instance
     * @method stop
     * @returns {Promise.<void>}
     */
    async stop() {
        if(this.hasStarted() && !this.hasEnded()){
            let data = await this._requestChild("getSnapshot");
            await this._save(data.snapshot);
            let info = this.engine.getInstanceInfo(this.machine, this.versionKey, this.instanceKey);
            info.hasStarted = true;
            info.hasStopped = true;
            info.hasEnded = false;
            this.engine.setInstanceInfo(this.machine, this.versionKey, this.instanceKey, info);
            this.child.kill();
        }
    }

    /**
     * Swaps the dispatcher
     * @param dispatcherURL The new Dispatcher URL
     * @param dispatcherToken The new Dispatcher Token
     */
    async swapDispatcher(dispatcherURL, dispatcherToken) {
        this.dispatcherURL = dispatcherURL;
        this.dispatcherToken = dispatcherToken;

        if(this.hasStarted() && ! this.hasEnded() && !this.hasStopped()) {
            let requestData = {
                data: {
                    dispatcherURL: dispatcherURL,
                    dispatcherToken: dispatcherToken
                }

            };
            this.debug('Sending swapDispatcher signal to the interpreter');
            await this._requestChild("swapDispatcher", requestData);
        }
    }

    /**
     * Check if the instance has started
     * @method hasStarted
     * @memberOf Instance
     * @returns {boolean}
     */
    hasStarted() {
        let info = this.engine.getInstanceInfo(this.machine, this.versionKey, this.instanceKey);
        return info.hasStarted;
    }

    /**
     * Check if the instance has started
     * @method hasStopped
     * @memberOf Instance
     * @returns {boolean}
     */
    hasStopped() {
        let info = this.engine.getInstanceInfo(this.machine, this.versionKey, this.instanceKey);
        return info.hasStopped;
    }

    /**
     * Check if the instance has ended(the Statechart reached the final state)
     * @method hasEnded
     * @memberOf Instance
     * @returns {boolean}
     */
    hasEnded() {
        let info = this.engine.getInstanceInfo(this.machine, this.versionKey, this.instanceKey);
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

        if (this.hasStopped()) {
            return this.lastSnapshot;
        }

        if (this.hasEnded()) {
            return this.lastSnapshot;
        }

        this.debug('Sending request to the interpreter');
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
        await this.stop();
        let info = this.engine.getSnapshotInfo(this.machine, this.versionKey, this.instanceKey, snapshotKey);
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
            data: eventData
        };

        requestData.data.name = event;

        this.debug('Sending event signal to the interpreter');
        await this._requestChild("event", requestData);
    }
}

export default Instance;
