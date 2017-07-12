//Libraries
import Instance from "./instance";
import Core from "fsm-core";
import Queue from 'queue';
import debugStart from "debug";

let debug = debugStart("engine");

/**
 * Represents an engine that interprets SCXML
 */
class Engine extends Core {

    constructor(actionDispatcherURL, actionDispatcherToken, repositoryPath, interpreterPath) {
        super(repositoryPath);
        this.dispatcherURL = actionDispatcherURL;
        this.dispatcherToken = actionDispatcherToken;
        this.repositoryPath = repositoryPath;
        this.interpreterPath = interpreterPath;
        this.instanceStore = {};
        this.hasStarted = false;
        this.isRunning = false;
        this.serverConfig = null;
        this.serverGlobals = null;
        this.queue = new Queue();
        this.queue.autostart = true;
        this.queue.concurrency = 0;
        this.queue.start();
    }

    /**
     * Initialize the engine
     * @method init
     * @memberOf Engine
     * @param {String} cloneURL The url of the remote git repository
     * @param {String} publicKey The path to the public key for the ssh connection
     * @param {String} privateKey The path to the private key for the ssh connection
     * @param {String} passphrase The passphrase used to make the key
     * @returns {Promise}
     */
    async init(cloneURL, publicKey, privateKey, passphrase) {

        if (this.hasStarted) {
            throw new Error("Engine has already stated.");
        }

        this.instanceStore = {};

        debug("Starting the engine");
        if (cloneURL) {
            await super.initRemoteGitSSH(cloneURL, publicKey, privateKey, passphrase);
        } else {
            await super.init();
        }
        debug("Core was initialized");

        this.serverConfig = this._loadConfig();

        debug('Attempting to reload instances');
        for (let machineName of this.getMachinesNames()) {
            for (let versionKey of this.getVersionsKeys(machineName)) {
                for (let instanceKey of this.getInstancesKeys(machineName, versionKey)) {
                    let versionInfo = this.getVersionInfo(machineName, versionKey);
                    let documentString = this.getVersionSCXML(machineName, versionKey);
                    let info = this.getInstanceInfo(machineName, versionKey, instanceKey);
                    let shouldRestart = info.hasStarted && !info.hasEnded;
                    let instance = new Instance(this.queue, this, documentString, this.dispatcherURL, this.dispatcherToken,
                        machineName, versionKey, instanceKey, this.interpreterPath);

                    //The instance should be restarted
                    if (shouldRestart) {
                        let snapshotsKeys = this.getSnapshotsKeys(instance.machineName,
                            instance.versionKey, instance.instanceKey);
                        if (snapshotsKeys.length === 0) {
                            await instance.start();
                        } else {
                            let snapshotKey = snapshotsKeys[snapshotsKeys.length - 1];
                            let snapshot = this.getSnapshotInfo(instance.machineName, instance.versionKey,
                                instance.instanceKey, snapshotKey);
                            await instance.start(snapshot);
                        }
                    }

                    //Store the instance in the instanceStore
                    this.instanceStore[machineName + versionKey + instanceKey] = instance;

                }
            }
        }

        debug('Engine is running');
        this.isRunning = true;
    }

    /**
     * Resumes the engine's executions
     * @method resume
     * @memberOf Engine
     */
    resume() {
        debug('Engine resuming');
        for (let key of Object.keys(this.instanceStore)) {
            let instance = this.instanceStore[key];
            let snapshotsKeys = this.getSnapshotsKeys(instance.machineName, instance.versionKey, instance.instanceKey);
            if (snapshotsKeys.length === 0) {
                this.instanceStore[key].start();
            } else {
                let instance = this.instanceStore[key];
                let snapshotKey = snapshotsKeys[snapshotsKeys.length - 1];
                let snapshot = this.getSnapshotInfo(instance.machineName, instance.versionKey, instance.instanceKey, snapshotKey);
                this.instanceStore[key].start(snapshot);
            }
        }
        this.isRunning = true;
        debug('Engine has resumed');
    }

    /**
     * Swaps the dispatcher
     * @param dispatcherURL The new Dispatcher URL
     * @param dispatcherToken The new Dispatcher Token
     */
    async swapDispatcher(dispatcherURL, dispatcherToken) {
        this.dispatcherURL = dispatcherURL;
        this.dispatcherToken = dispatcherToken;
        for(let key of this.instanceStore) {
            await this.instanceStore[key].swapDispatcher(dispatcherURL, dispatcherToken);
        }
    }

    /**
     * Stops the engine's executions
     * @method stop
     * @memberOf Engine
     */
    async stop() {
        debug('Engine stopping');
        for (let key of Object.keys(this.instanceStore)) {
            await this.instanceStore[key].stop();
        }
        this.isRunning = false;
        debug('Engine has stopped');
    };

    /**
     * Load the configuration from the core
     * @method _loadConfig
     * @memberOf Engine
     * @returns {Object} The configuration object
     * @private
     */
    _loadConfig() {
        debug('Loading configuration');
        let serverConfig = this.getConfig();
        debug("Server Config: %s", serverConfig);
        //If there isn't a configuration yet
        // if (!serverConfig.simulateTime) {
        //     this.setConfig(serverConfig);
        // }
        return serverConfig;
    }

    /**
     * Overrides the addInstance method in order to store the instance in memory
     * @method addInstance
     * @memberOf Engine
     * @param {String} machineName The machine name
     * @param {String} versionKey The version key
     * @param {String} interpreterPath The path to the interpreter JavaScript File
     * @returns {Promise.<Instance>} The new instance
     */
    async addInstance(machineName, versionKey, interpreterPath) {
        debug("Checking if the version is sealed");
        //Making sure the version is sealed
        let isVersionSealed = this.getVersionInfo(machineName, versionKey).isSealed;
        if (!isVersionSealed) {
            throw new Error("The version is not sealed");
        }

        let documentString = this.getVersionSCXML(machineName, versionKey);
        let instanceKey = await super.addInstance(machineName, versionKey);
        let instance = new Instance(this.queue, this, documentString, this.dispatcherURL, this.dispatcherToken,
            machineName, versionKey, instanceKey,
            interpreterPath || this.interpreterPath);
        this.instanceStore[machineName + versionKey + instanceKey] = instance;
        return instance;
    }

    /**
     * Reloads an instance using a previously taken snapshot
     * @method reloadInstance
     * @memberOf Engine
     * @param {String} machineName The name of the machine
     * @param {String} versionKey The version key
     * @param {String} instanceKey The instance key
     * @param {String} snapshot The snapshot
     * @returns {Promise.<Instance>} The reloaded instance
     */
    async reloadInstance(machineName, versionKey, instanceKey, snapshot) {
        debug("Checking if the version is sealed");
        //Making sure the version is sealed
        let isVersionSealed = this.getVersionInfo(machineName, versionKey).isSealed;
        if (!isVersionSealed) {
            throw new Error("The version is not sealed");
        }

        let documentString = this.getVersionSCXML(machineName, versionKey);
        let instance = new Instance(this.queue, this, documentString, this.dispatcherURL, this.dispatcherToken,
            machineName, versionKey, instanceKey, this.interpreterPath);

        await instance.start(snapshot);
        return instance;
    }

    /**
     * Returns an instance from the engine
     * @method getInstance
     * @memberOf Engine
     * @param {String} machineName The machine name
     * @param {String} versionKey The version key
     * @param {String} instanceKey The instance key
     * @returns {Instance} The instance
     */
    getInstance(machineName, versionKey, instanceKey) {
        let key = machineName + versionKey + instanceKey;
        if (!this.instanceStore[key]) {
            throw new Error("Instance not found");
        }
        return this.instanceStore[key];
    }

    /**
     * Sends a global event to the engine
     * @method sendGlobalEvent
     * @memberOf Engine
     * @param {String} eventName The name of the event
     * @param {Object} data The data to send along with the event
     */
    sendGlobalEvent(eventName, data) {
        for (let property in this.instanceStore) {
            if (this.instanceStore.hasOwnProperty(property)) {
                let instance = this.instanceStore[property];
                if (instance.hasStarted()) {
                    instance.sendEvent(eventName, data);
                }
            }
        }
    }


    /**
     * Request every instance to save a snapshot of themselves
     * @method save
     * @memberOf Engine
     */
    async save() {
        for (let property in this.instanceStore) {
            if (this.instanceStore.hasOwnProperty(property)) {
                let instance = this.instanceStore[property];
                if (instance.hasStarted()) {
                    await instance.save();
                }
            }
        }
    }
}

export default Engine;
