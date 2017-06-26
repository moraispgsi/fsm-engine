//Libraries
import Instance from "./instance";
import Core from "fsm-core";
import customExecuteStart from "./basic_interpreter/custom";
import debugStart from "debug";
let debug = debugStart("engine");

export default class Engine extends Core {

    constructor(actionDispatcherHost, repositoryPath, interpreterPath) {
        super(repositoryPath);
        this.actionDispatcherHost = actionDispatcherHost;
        this.repositoryPath = repositoryPath;
        this.interpreterPath = interpreterPath;
        this.instanceStore = {};
        this.hasStarted = false;
        this.isRunning = false;
        this.serverConfig = null;
        this.serverGlobals = null;
        this.execute = customExecuteStart(actionDispatcherHost);
    }

    /**
     * Initialize the engine
     * @method init
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

        debug("Starting the");
        if (cloneURL) {
            await super.initRemoteGitSSH(cloneURL, publicKey, privateKey, passphrase);
        } else {
            await super.init();
        }
        debug("Core was initialized");

        this.serverConfig = this._loadConfig();

        debug('Attepting to reload instances');
        for (let machineName of this.getMachinesNames()) {
            for (let versionKey of this.getVersionsKeys(machineName)) {
                for (let instanceKey of this.getInstancesKeys(machineName, versionKey)) {
                    let versionInfo = this.getVersionInfo(machineName, versionKey);
                    let versionActionDispatcherHost = versionInfo.actionDispatcherHost;
                    let info = this.getInstanceInfo(machineName, versionKey, instanceKey);
                    let shouldReload = false;//= info.hasStarted && info.hasEnded;
                    let instance = null;
                    if (shouldReload) {
                        //todo - change the to allow snapshots

                        //The snapshot is parsed as JSON or is null if none was found
                        instance = await reloadInstance(machineName, versionKey, instanceKey, snapshot);
                        instance.start();

                    } else {
                        instance = await this.addInstance(machineName, versionKey, instanceKey);
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
     */
    resume() {
        debug('Engine resuming');
        for (let key of Object.keys(this.instanceStore)) {
            let snapshotKeys = this.getSnapshotKeys();
            if (snapshotKeys.length == 0) {
                this.instanceStore[key].start();
            } else {
                let instance = this.instanceStore[key];
                let snapshotKey = snapshotKeys[snapshotKeys.length - 1];
                let snapshot = this.getSnapshot(instance.machineName, instance.versionKey, instance.instanceKey, snapshotKey);
                this.instanceStore[key].start(snapshot);
            }
        }
        this.isRunning = true;
        debug('Engine has resumed');
    }

    /**
     * Stops the engine's executions
     * @method stop
     */
    stop() {
        debug('Engine stopping');
        for (let key of Object.keys(this.instanceStore)) {
            this.instanceStore[key].stop();
        }
        this.isRunning = false;
        debug('Engine has stopped');
    };

    /**
     * Load the configuration from the core
     * @method _loadConfig
     * @returns {Object} The configuration object
     */
    _loadConfig() {
        debug('Loading configuration');
        let serverConfig = this.getConfig();
        debug("Server Config: $s", serverConfig);
        //If there isn't a configuration yet
        if (!serverConfig.simulateTime) {
            this.setConfig(serverConfig);
        }
        return serverConfig;
    }


    /**
     * Overrides the addInstance method in order to store the instance in memory
     * @param machineName The machine name
     * @param versionKey The version key
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
        let instance = new Instance(this, documentString, null, machineName, versionKey, instanceKey,
                                          interpreterPath || this.interpreterPath);
        this.instanceStore[machineName + versionKey + instanceKey] = instance;
        return instance;
    }

    /**
     * Reloads an instance using a previously taken snapshot
     * @param machineName The name of the machine
     * @param versionKey The version key
     * @param instanceKey The instance key
     * @param snapshot The snapshot object
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
        return new Instance(this, documentString, snapshot, machineName, versionKey, instanceKey,
                            interpreterPath || this.interpreterPath);
    }

    /**
     * Returns an instance from the engine
     * @param machineName The machine name
     * @param versionKey The version key
     * @param instanceKey The instance key
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
     * @param eventName The name of the event
     * @param data The data to send along with the event
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
}


