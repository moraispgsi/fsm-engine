/**
 * Created by Ricardo Morais on 19/05/2017.
 */

module.exports = function(core, actionDispatcherHost){

    //Libraries
    let co = require('co');                                    //For a easier promise handling experience
    let scxml = require('scxml');                              //The scion library
    let vm = require('vm');                              //The scion library
    let execute = require('./customExecContent')(actionDispatcherHost);   //The high level actions
    let Instance = require('./instance');
    let debug = require("debug")("engine");

    return co(function*(){
        debug('Synchronizing with the database');
        yield core.sequelize.sync();  //Synchronize the database with the database model definition

        let instanceStore = {};       //Storing the Finite-state machine instances in an object

        ////////////////////////////////////
        //CONFIGURATIONS
        ////////////////////////////////////

        debug('Loading configuration');
        let serverConfig = yield core.getConfig();
        //If there isn't a configuration yet
        if(serverConfig.simulateTime === void 0) {
            serverConfig.simulateTime = false;
            serverConfig.simulationCurrentDate = new Date();
            serverConfig.snapshotFrequency = 1000;
            yield core.setConfig(serverConfig);
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
         * @param versionID The Finite-state machine version
         * @param snapshot A snapshot of the state of the statechart
         * @returns {Promise} A Promise to create a SCION statechart and return it
         * @private
         */
        function _createStateChart(versionID, snapshot) {
            return co(function*() {

                //Make sure the version is sealed
                let isVersionSealed = yield core.isVersionSealed(versionID);
                if(!isVersionSealed){
                    throw new Error("The Finite-state machine version is not sealed");
                }

                let version = yield core.model.version.findById(versionID); //Find the version with the versionID
                let scxmlDocumentString = version.dataValues.scxml;            //Get the SCXML document from the version

                //Create the SCION model from the SCXML document
                let model = yield new Promise((resolve, reject) => {
                    scxml.documentStringToModel(null, scxmlDocumentString, function (err, model) {
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
                let sc = new scxml.scion.Statechart(fnModel, {snapshot: snapshot});
                return sc;
            });
        }

        /**
         * Creates the instance object based on a versionID and a Statechart
         * @param versionID The Finite-state machine Version ID
         * @param sc The SCION-CORE Statechart
         * @returns {Promise} A Promise that creates an instance object and returns it
         * @private
         */
        function _makeInstance(versionID, sc) {
            return co(function*() {
                //start the interpreter
                let instanceRow = yield core.model.instance.create({
                    versionID: versionID,
                    hasStarted: false,
                    hasEnded: false
                });
                let instanceID = instanceRow.dataValues.id;
                let instance = new Instance(core, sc, instanceID);
                instanceStore[instanceID] = instance;
                return instance;
            })
        }

        /**
         * Creates a new instance based on the version
         * @param versionID The Finite-state machine version to use as the model
         * @returns {Promise} A Promise that creates an instance from a Finite-state machine versin and returns an instance
         * object
         */
        function createInstance(versionID) {
            return co(function*() {
                let sc = yield _createStateChart(versionID);
                return yield _makeInstance(versionID, sc);
            });
        }

        /**
         * Recreates an instance using a snapshot
         * @param versionID The Finite-state machine version to use as the model
         * @param snapshot The instance snapshot
         * @param instanceID The id of the instance in the DataBase
         * @returns {Promise} A Promise that creates an instance from a Finite-state machine versin and returns an instance
         * object
         */
        function reloadInstance(versionID, snapshot, instanceID) {
            return co(function*() {
                let sc = yield _createStateChart(versionID, snapshot);    //Creates the StateChart using the snapshot
                let instance = new Instance(core, sc, instanceID);      //Creates an instance object
                return instance;
            });
        }

        /**
         * Gets a instance object from its ID
         * @param id The id of the instance object
         * @returns {Instance} The instance with the specified ID
         */
        function getInstance(id) {
            if (!instanceStore[id]) {
                throw new Error("Instance not found");
            }
            return instanceStore[id];
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
        debug('Getting all the instances');
        let instances = yield core.model.instance.findAll();

        debug('Reloading the instances');
        //Iterating over the instances in order to restart them
        for (let instanceRow of instances) {
            let shouldReload = instanceRow.hasStarted && instances.hasEnded;
            let versionID = instanceRow.dataValues.versionID;   //Get the versionID
            let instance;
            if(shouldReload){
                //Find the latest Snapshot of the instance
                let latestSnapshot = yield core.model.snapshot.findOne({
                    where: {
                        instanceID: instanceRow.dataValues.id
                    },
                    order: [ [ 'updatedAt', 'DESC' ]]
                });

                //The snapshot is parsed as JSON or is null if none was found
                let snapshot = latestSnapshot ? JSON.parse(latestSnapshot.dataValues.snapshot) : null;
                instance = yield reloadInstance(versionID, snapshot, instanceRow.dataValues.id);
                instance.start();
            } else {
                instance = yield createInstance(versionID);
            }

            instanceStore[instance.id] = instance; //Store the instance in the instanceStore
        }

        debug('Engine is running');
        let engine = core;
        engine.createInstance = createInstance;
        // engine.reloadInstance = reloadInstance;
        engine.getInstance = getInstance;
        engine.sendGlobalEvent = sendGlobalEvent;
        engine.setCurrentSimulationDate = setCurrentSimulationDate;
        engine.getCurrentSimulationDate = getCurrentSimulationDate;
        engine.enableSimulationMode = enableSimulationMode;
        engine.disableSimulationMode = disableSimulationMode;
        return engine;

    });

};

