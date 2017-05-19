/**
 * Created by Ricardo Morais on 19/05/2017.
 */

module.exports = function(meta){

    //Libraries
    let co = require('co');                                         //For a easier promise handling experience
    let scxml = require('scxml');                                   //The scion library
    let highLevelActions = require('./actions/highLevelActions');   //The high level actions
    let Instance = require('./instance');

    return co(function*(){
        yield meta.sequelize.sync();  //Synchronize the database with the database model definition
        //globals
        let instanceStore = {};         //Storing the Finite-state machine instances in an object

        ////////////////////////////////////
        //CONFIGURATIONS
        ////////////////////////////////////

        let serverConfig = yield meta.query.getConfig();
        //If there isn't a configuration yet
        if(serverConfig.simulateTime === void 0) {
            serverConfig.simulateTime = false;
            serverConfig.simulationCurrentDate = new Date();
            serverConfig.snapshotFrequency = 1000;
            yield meta.query.setConfig(serverConfig);
        }

        //The server global data for the sandbox
        let serverGlobal =  {
            now: function(){
                if(serverConfig.simulateTime) {
                    return serverConfig.simulationCurrentDate
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
        function _makeStateChart(versionID, snapshot) {
            return co(function*() {

                //Make sure the version is sealed
                let isVersionSealed = yield meta.query.isVersionSealed(versionID);
                if(!isVersionSealed){
                    throw new Error("The Finite-state machine version is not sealed");
                }

                let version = yield meta.model.version.findById(versionID); //Find the version with the versionID
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

                    /**
                     * The server global variables and functions
                     */
                    globals: serverGlobal,

                    /**
                     * The object that will hold the properties of the instance
                     */
                    properties: {},
                    /**
                     * The function that will process the custom actions
                     * @param message
                     */
                    postMessage: function (message) {
                        let actionName = message.data["$type"];
                        console.log("Custom action called: ", actionName);
                        let action = highLevelActions[actionName];
                        action(sandbox, message._event, message.data);
                    }
                };

                //Create the SCION-CORE fnModel to use in its interpreter
                let fnModel = yield new Promise((resolve, reject) => {
                    model.prepare(function (err, fnModel) {
                        if (err) {
                            reject(err);
                        }
                        resolve(fnModel);
                    }, sandbox);
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
        function _makeInstance(versionID, sc) {
            return co(function*() {
                //start the interpreter
                let instanceRow = yield meta.model.instance.create({
                    versionID: versionID,
                    hasStarted: false,
                    hasEnded: false
                });
                let instanceID = instanceRow.dataValues.id;
                let instance = new Instance(meta, sc, instanceID);
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
        function makeInstance(versionID) {
            return co(function*() {
                let sc = yield _makeStateChart(versionID);
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
        function remakeInstance(versionID, snapshot, instanceID) {
            return co(function*() {
                let sc = yield _makeStateChart(versionID, snapshot);        //Creates the StateChart using the snapshot
                let instance = new Instance(meta, sc, instanceID); //Creates an instance object
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
            meta.query.setConfig(serverConfig).then();
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
            meta.query.setConfig(serverConfig).then();
        }

        function disableSimulationMode() {
            serverConfig.simulateTime = false;
            serverConfig.simulationCurrentDate = null;
            meta.query.setConfig(serverConfig);
        }

        //////////////////////////////////////////////////
        //ENGINE START
        //////////////////////////////////////////////////
        let instances = yield meta.model.instance.findAll({
            where: {
                hasEnded: false
            }
        });

        //Iterating over the instances in order to restart them
        for (let instanceRow of instances) {
            let versionID = instanceRow.dataValues.versionID;   //Get the versionID
            //Find the latest Snapshot of the instance
            let latestSnapshot = yield meta.model.snapshot.findOne({
                where: {
                    instanceID: instanceRow.dataValues.id
                },
                order: [ [ 'updatedAt', 'DESC' ]]
            });

            //The snapshot is parsed as JSON or is null if none was found
            let snapshot = latestSnapshot ? JSON.parse(latestSnapshot.dataValues.snapshot) : null;
            let instance = yield remakeInstance(versionID, snapshot, instanceRow.dataValues.id);

            //If the instance was already started we need to restart it now
            if(instanceRow.dataValues.hasStarted){
                instance.startSnapshotInterval();
            }

            instanceStore[instance.id] = instance; //Store the instance in the instanceStore
        }

        //Start the engine tick events
        setInterval(()=>{
            sendGlobalEvent("100MsTick");
        }, 100);

        setInterval(()=>{
            sendGlobalEvent("500MsTick");
        }, 500);

        setInterval(()=>{
            sendGlobalEvent("1000MsTick");
        }, 1000);

        setInterval(()=>{
            sendGlobalEvent("5000MsTick");
        }, 5000);

        let engine = {
            meta: meta,
            makeInstance: makeInstance,
            remakeInstance: remakeInstance,
            getInstance: getInstance,
            sendGlobalEvent: sendGlobalEvent,
            setCurrentSimulationDate: setCurrentSimulationDate,
            getCurrentSimulationDate: getCurrentSimulationDate,
            enableSimulationMode: enableSimulationMode,
            disableSimulationMode: disableSimulationMode
        };
        return engine;

    });

};

