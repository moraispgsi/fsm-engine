//Libraries
import Instance from "./instance";
import Core from "fsm-core";
import debugStart from "debug";
let debug = debugStart("engine");

/**
 * Represents an engine that interprets SCXML
 */
class Engine extends Core {

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

        debug('Attepting to reload instances');
        for (let machineName of this.getMachinesNames()) {
            for (let versionKey of this.getVersionsKeys(machineName)) {
                for (let instanceKey of this.getInstancesKeys(machineName, versionKey)) {
                    let versionInfo = this.getVersionInfo(machineName, versionKey);
                    let documentString = this.getVersionSCXML(machineName, versionKey);
                    let versionActionDispatcherHost = versionInfo.actionDispatcherHost;
                    let info = this.getInstanceInfo(machineName, versionKey, instanceKey);
                    let shouldReload = info.hasStarted && !info.hasEnded;
                    let instance = null;
                    if (shouldReload) {
                        let snapshotsKeys = this.getSnapshotsKeys(instance.machineName,
                            instance.versionKey, instance.instanceKey);
                        if (snapshotsKeys.length === 0) {
                            instance = await this.reloadInstance(machineName, versionKey, instanceKey, null);
                        } else {
                            let instance = this.instanceStore[key];
                            let snapshotKey = snapshotsKeys[snapshotsKeys.length - 1];
                            let snapshot = this.getSnapshotInfo(instance.machineName, instance.versionKey,
                                instance.instanceKey, snapshotKey);
                            instance = await this.reloadInstance(machineName, versionKey, instanceKey, snapshot);
                        }

                        //The snapshot is parsed as JSON or is null if none was found
                        instance.start();

                    } else {
                        instance = new Instance(this, documentString, versionActionDispatcherHost,
                            machineName, versionKey, instanceKey, this.interpreterPath);
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
     * Stops the engine's executions
     * @method stop
     * @memberOf Engine
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
     * @memberOf Engine
     * @returns {Object} The configuration object
     * @private
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
        let instance = new Instance(this, documentString, null, machineName, versionKey, instanceKey,
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
     * @param {Object} snapshot The snapshot object
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
}

export default Engine;
