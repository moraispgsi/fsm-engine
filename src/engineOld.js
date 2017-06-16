/**
 * Created by Ricardo Morais on 19/05/2017.
 */

module.exports = function(actionDispatcherHost, repositoryPath){

    //Libraries
    let co = require('co');
    let core = require('fsm-core')(repositoryPath);
    let scxml = require('scxml');
    let vm = require('vm');
    let execute = require('./customExecContent')(actionDispatcherHost);
    let Instance = require('./instance');
    let debug = require("debug")("engine");

    return co(function*(){


        debug("Starting the core");
        yield core.init()
        debug("Core was initialized");

        let instanceStore = {};

        ////////////////////////////////////
        //CONFIGURATIONS
        ////////////////////////////////////

        debug('Loading configuration');
        let serverConfig = core.getConfig();
        //If there isn't a configuration yet
        if(!serverConfig.simulateTime) {
            serverConfig.simulateTime = false;
            serverConfig.simulationCurrentDate = new Date();
            serverConfig.snapshotFrequency = 1000;
            core.setConfig(serverConfig);
        }

        debug('Creating the global repo for the sandbox');
        //The server global data for the sandbox
        let serverGlobal =  {
            now: function(){
                if(serverConfig.simulateTime) {
                    return new Date(serverConfig.simulationCurrentDate);
                } else {
                    return new Date();
                }
            }
        };

        ////////////////////////////////////
        //INSTANCES
        ////////////////////////////////////
        /**
         * Creates a SCION state chart with the versionID and optionally with a snapshot
         * @param snapshot A snapshot of the state of the statechart
         * @returns {Promise} A Promise to create a SCION statechart and return it
         * @private
         */
        function _createStateChart(machineName, versionKey, snapshot) {
            return co(function*() {

                debug("Checking if the version is sealed");
                //Make sure the version is sealed
                let isVersionSealed = core.getVersionInfo(machineName, versionKey).isSealed;
                if(!isVersionSealed){
                    throw new Error("The version is not sealed");
                }

                let documentString = core.getVersionSCXML(machineName, versionKey);
                //Create the SCION model from the SCXML document
                let model = yield new Promise((resolve, reject) => {
                    scxml.documentStringToModel(null, documentString, function (err, model) {
                        if (err) {
                            reject(err);
                        }
                        resolve(model);
                    });
                }).then();

                //Define the sandbox for the v8 virtual machine
                let sandbox = {
                    Date: Date,
                    //The server global variables and functions
                    globals: serverGlobal,
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
                let fnModel = yield new Promise((resolve, reject) => {
                    model.prepare(function (err, fnModel) {
                        if (err) {
                            reject(err);
                        }
                        resolve(fnModel);
                    }, vmSandbox);
                }).then();

                //Instantiate the interpreter
                return new scxml.scion.Statechart(fnModel, {snapshot: snapshot});
            });
        }

        /**
         * Creates the instance object based on a versionID and a Statechart
         * @param versionID The Finite-state machine Version ID
         * @param sc The SCION-CORE Statechart
         * @returns {Promise} A Promise that creates an instance object and returns it
         * @private
         */
        function _makeInstance(machineName, versionKey, sc) {
            return co(function*() {
                debug("Creating the instance");
                //start the interpreter
                let instanceKey = yield core.addInstance(machineName, versionKey);
                let instance = new Instance(core, sc, machineName, versionKey, instanceKey);
                instanceStore[machineName + versionKey + instanceKey] = instance;
                return instance;
            })
        }

        /**
         * Creates a new instance based on the version
         * @param versionID The Finite-state machine version to use as the model
         * @returns {Promise} A Promise that creates an instance from a Finite-state machine versin and returns an instance
         * object
         */
        function addInstance(machineName, versionKey, instanceKey) {
            return co(function*() {
                let sc = yield _createStateChart(machineName, versionKey);
                return yield _makeInstance(machineName, versionKey, sc);
            });
        }

        /**
         * Recreates an instance using a snapshot
         * @param snapshot The instance snapshot
         * @returns {Promise} A Promise that creates an instance from a Finite-state machine versin and returns an instance
         * object
         */
        function reloadInstance(machineName, versionKey, instanceKey, snapshot) {
            return co(function*() {
                let sc = yield _createStateChart(machineName, versionKey, snapshot); //Creates the StateChart using the snapshot
                return new Instance(core, sc, machineName, versionKey, instanceKey); //Creates an instance object
            });
        }

        /**
         * Gets a instance object from its ID
         * @returns {Instance} The instance with the specified ID
         */
        function getInstance(machineName, versionKey, instanceKey) {
            let key = machineName + versionKey + instanceKey;
            if (!instanceStore[key]) {
                throw new Error("Instance not found");
            }
            return instanceStore[key];
        }

        /**
         * Send a global event to all the instances
         * @param eventName The name of the event to send
         * @param data The data to send
         * @returns {Promise} A Promise to send the global event
         */
        function sendGlobalEvent(eventName, data) {
            return co(function*(){
                for (let property in instanceStore) {
                    if (instanceStore.hasOwnProperty(property)) {
                        let instance = instanceStore[property];
                        if(yield instance.hasStarted()){
                            yield instance.sendEvent(eventName, data);
                        }
                    }
                }
            });
        }

        /////////////////////////////////////////
        //SIMULATION
        /////////////////////////////////////////
        function setCurrentSimulationDate(date) {
            if(!serverConfig.simulateTime) {
                throw new Error("The server is not currently simulating time");
            }
            serverConfig.simulationCurrentDate = date;
            core.setConfig(serverConfig).then();
        }

        function getCurrentSimulationDate() {
            if(!serverConfig.simulateTime) {
                throw new Error("The server is not currently simulating time");
            }
            return serverConfig.simulationCurrentDate;
        }

        function enableSimulationMode(date) {
            serverConfig.simulationCurrentDate = date;
            serverConfig.simulateTime = true;
            core.setConfig(serverConfig).then();
        }

        function disableSimulationMode() {
            serverConfig.simulateTime = false;
            serverConfig.simulationCurrentDate = null;
            core.setConfig(serverConfig);
        }


        //////////////////////////////////////////////////
        //ENGINE START
        //////////////////////////////////////////////////
        debug('Attepting to reload instances');
        for(let machineName of core.getMachinesNames()) {
            for(let versionKey of core.getVersionsKeys(machineName)) {
                for(let instanceKey of core.getInstancesKeys(machineName, versionKey)) {
                    let info = core.getInstanceInfo(machineName, versionKey, instanceKey);
                    let shouldReload  = false;//= info.hasStarted && info.hasEnded;
                    let instance = null;
                    if(shouldReload){
                        //todo - change the core to allow snapshots

                        //The snapshot is parsed as JSON or is null if none was found
                        // instance = yield reloadInstance(machineName, versionKey, instanceKey, snapshot);
                        // instance.start();

                    } else {
                        instance = yield addInstance(machineName, versionKey, instanceKey);
                    }

                    instanceStore[machineName + versionKey + instanceKey] = instance; //Store the instance in the instanceStore
                }
            }

        }

        debug('Engine is running');
        return {
            getRepositoryPath        :core.getRepositoryPath,
            getManifest              :core.getManifest,
            getConfig                :core.getConfig,
            setConfig                :core.setConfig,
            //////////////////////////////
            getMachinesNames         :core.getMachinesNames,
            addMachine               :core.addMachine,
            removeMachine            :core.removeMachine,
            //////////////////////////////
            getVersionsKeys          :core.getVersionsKeys,
            getVersionRoute          :core.getVersionRoute,
            getVersionInfoRoute      :core.getVersionInfoRoute,
            getVersionModelRoute     :core.getVersionModelRoute,
            getVersionInfo           :core.getVersionInfo,
            setVersionInfo           :core.setVersionInfo,
            addVersion               :core.addVersion,
            sealVersion              :core.sealVersion,
            isSCXMLValid             :core.isSCXMLValid,
            getVersionSCXML          :core.getVersionSCXML,
            setVersionSCXML          :core.setVersionSCXML,
            //////////////////////////////
            getInstancesKeys         :core.getInstancesKeys,
            getInstanceRoute         :core.getInstanceRoute,
            getInstanceInfoRoute     :core.getInstanceInfoRoute,
            getInstanceInfo          :core.getInstanceInfo,
            setInstanceInfo          :core.setInstanceInfo,
            addInstance              :addInstance,
            //////////////////////////////
            getSnapshotsKeys         :core.getSnapshotsKeys,
            getSnapshotRoute         :core.getSnapshotRoute,
            getSnapshotInfoRoute     :core.getSnapshotInfoRoute,
            getSnapshotInfo          :core.getSnapshotInfo,
            addSnapshot              :core.addSnapshot,
            //////////////////////////////
            getInstance              :getInstance,
            // reloadInstance           :reloadInstance,
            sendGlobalEvent          :sendGlobalEvent,
            setCurrentSimulationDate :setCurrentSimulationDate,
            getCurrentSimulationDate :getCurrentSimulationDate,
            enableSimulationMode     :enableSimulationMode,
            disableSimulationMode    :disableSimulationMode
        };
    });
};

