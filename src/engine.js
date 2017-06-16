//Libraries
import scxml from "scxml";
import vm from "vm";
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
        this.serverConfig = null;
        this.serverGlobals = null;
        this.execute = customExecuteStart(actionDispatcherHost);
    }

    async init(){
        if(this.hasStarted) {
            throw new Error("Engine has already stated.");
        }
        debug("Starting the");
        await super.init();
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
                        // instance = await reloadInstance(machineName, versionKey, instanceKey, snapshot);
                        // instance.start();

                    } else {
                        instance = await this.addInstance(machineName, versionKey, instanceKey);
                    }
                    //Store the instance in the instanceStore
                    this.instanceStore[machineName + versionKey + instanceKey] = instance;
                }
            }

        }

        debug('Engine is running');

        this.hasStarted = true;
    }

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

    async createStateChart(documentString, snapshot) {
        //Create the SCION model from the SCXML document
        let model = await new Promise((resolve, reject) => {
            scxml.documentStringToModel(null, documentString, function (err, model) {
                if (err) {
                    reject(err);
                }
                resolve(model);
            });
        }).then();

        let execute = this.execute;
        //Define the sandbox for the v8 virtual machine
        let sandbox = {
            Date: Date,
            //The server global variables and functions
            globals: this.serverGlobals,
            //The function that will process the custom actions
            postMessage: function (message) {
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

        let vmSandbox = vm.createContext(sandbox);

        //Create the SCION-CORE fnModel to use in its interpreter
        let fnModel = await new Promise((resolve, reject) => {
            model.prepare(function (err, fnModel) {
                if (err) {
                    reject(err);
                }
                resolve(fnModel);
            }, vmSandbox);
        }).then();

        //Instantiate the interpreter
        return new scxml.scion.Statechart(fnModel, {snapshot: snapshot});
    }

    async _createStateChartFromVersion(machineName, versionKey, snapshot) {
        debug("Checking if the version is sealed");
        //Making sure the version is sealed
        let isVersionSealed = this.getVersionInfo(machineName, versionKey).isSealed;
        if(!isVersionSealed){
            throw new Error("The version is not sealed");
        }

        let documentString = this.getVersionSCXML(machineName, versionKey);
        return await this.createStateChart(documentString, snapshot);
    }

    async _makeInstance(machineName, versionKey, sc) {
        debug("Creating the instance");
        //start the interpreter
        let instanceKey = await super.addInstance(machineName, versionKey);
        let instance = new Instance(this, sc, machineName, versionKey, instanceKey);
        this.instanceStore[machineName + versionKey + instanceKey] = instance;
        return instance;
    }

    async addInstance(machineName, versionKey) {
        let sc = await this._createStateChartFromVersion(machineName, versionKey);
        return await this._makeInstance(machineName, versionKey, sc);
    }

    async reloadInstance(machineName, versionKey, instanceKey, snapshot) {
        let sc = await this._createStateChartFromVersion(machineName, versionKey, snapshot);
        return new Instance(this, sc, machineName, versionKey, instanceKey);
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


