//Libraries
import Instance from "./instance";
import Core from "fsm-core";
import customExecuteStart from "./customExecContent";
import debugStart from "debug";
let debug = debugStart("engine");

export default class Engine extends Core{

    constructor(actionDispatcherHost, repositoryPath){
        super(repositoryPath);
        this.actionDispatcherHost = actionDispatcherHost;
        this.repositoryPath = repositoryPath;
        this.instanceStore = {};
        this.hasStarted = false;
        this.isRunning = false;
        this.serverConfig = null;
        this.serverGlobals = null;
        this.execute = customExecuteStart(actionDispatcherHost);
    }

    async init(cloneURL, publicKey, privateKey, passphrase){

        if(this.hasStarted) {
            throw new Error("Engine has already stated.");
        }

        this.instanceStore = {};

        debug("Starting the");
        if(cloneURL){
            await super.initRemoteGitSSH(cloneURL, publicKey, privateKey, passphrase);
        } else {
            await super.init();
        }
        debug("Core was initialized");

        this.serverConfig = this._loadConfig();
        this.serverGlobals = this._generateServerGlobals(this.serverConfig);

        debug('Attepting to reload instances');
        for(let machineName of this.getMachinesNames()) {
            for(let versionKey of this.getVersionsKeys(machineName)) {
                for(let instanceKey of this.getInstancesKeys(machineName, versionKey)) {
                    let info = this.getInstanceInfo(machineName, versionKey, instanceKey);
                    let shouldReload  = false;//= info.hasStarted && info.hasEnded;
                    let instance = null;
                    if(shouldReload){
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

    resume() {
        debug('Engine resuming');
        for(let key of Object.keys(this.instanceStore)){
            //todo get latest snapshot to restart
            this.instanceStore[key].start();
        }
        this.isRunning = true;
        debug('Engine has resumed');
    }

    stop(){
        debug('Engine stopping');
        for(let key of Object.keys(this.instanceStore)){
            this.instanceStore[key].stop();
        }

        this.isRunning = false;
        debug('Engine has stopped');
    };

    _loadConfig(){
        debug('Loading configuration');
        let serverConfig = this.getConfig();
        debug("Server Config: $s", serverConfig);
        //If there isn't a configuration yet
        if(!serverConfig.simulateTime) {
            serverConfig.simulateTime = false;
            serverConfig.simulationCurrentDate = new Date();
            serverConfig.snapshotFrequency = 1000;
            this.setConfig(serverConfig);
        }
        return serverConfig;
    }


    _generateServerGlobals(serverConfig){
        //The server global data for the sandbox
        let serverGlobals =  {
            now: function(){
                if(serverConfig.simulateTime) {
                    return new Date(serverConfig.simulationCurrentDate);
                } else {
                    return new Date();
                }
            }
        };

        return serverGlobals;
    }

    async _makeInstance(documentString, machineName, versionKey) {
        debug("Creating the instance");
        //start the interpreter
        let instanceKey = await super.addInstance(machineName, versionKey);
        let instance = new Instance(this, documentString, null, machineName, versionKey, instanceKey);
        this.instanceStore[machineName + versionKey + instanceKey] = instance;
        return instance;
    }

    async addInstance(machineName, versionKey) {
        debug("Checking if the version is sealed");
        //Making sure the version is sealed
        let isVersionSealed = this.getVersionInfo(machineName, versionKey).isSealed;
        if(!isVersionSealed){
            throw new Error("The version is not sealed");
        }

        let documentString = this.getVersionSCXML(machineName, versionKey);
        return await this._makeInstance(documentString, machineName, versionKey);
    }

    async reloadInstance(machineName, versionKey, instanceKey, snapshot) {

        debug("Checking if the version is sealed");
        //Making sure the version is sealed
        let isVersionSealed = this.getVersionInfo(machineName, versionKey).isSealed;
        if(!isVersionSealed){
            throw new Error("The version is not sealed");
        }

        let documentString = this.getVersionSCXML(machineName, versionKey);
        return new Instance(this, documentString, snapshot, machineName, versionKey, instanceKey);
    }

    getInstance(machineName, versionKey, instanceKey) {
        let key = machineName + versionKey + instanceKey;
        if (!this.instanceStore[key]) {
            throw new Error("Instance not found");
        }
        return this.instanceStore[key];
    }

    async sendGlobalEvent(eventName, data) {
        for (let property in this.instanceStore) {
            if (this.instanceStore.hasOwnProperty(property)) {
                let instance = this.instanceStore[property];
                if(instance.hasStarted()){
                    instance.sendEvent(eventName, data);
                }
            }
        }
    }

    setCurrentSimulationDate(date) {
        if(!this.serverConfig.simulateTime) {
            throw new Error("The server is not currently simulating time");
        }
        this.serverConfig.simulationCurrentDate = date;
        this.setConfig(this.serverConfig);
    }

    getCurrentSimulationDate() {
        if(!this.serverConfig.simulateTime) {
            throw new Error("The server is not currently simulating time");
        }
        return this.serverConfig.simulationCurrentDate;
    }

    enableSimulationMode(date) {
        this.serverConfig.simulationCurrentDate = date;
        this.serverConfig.simulateTime = true;
        this.setConfig(this.serverConfig);
    }

    disableSimulationMode() {
        this.serverConfig.simulateTime = false;
        this.serverConfig.simulationCurrentDate = null;
        this.setConfig(this.serverConfig);
    }
}


