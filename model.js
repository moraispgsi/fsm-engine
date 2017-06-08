/**
 * Created by Ricardo Morais on 19/05/2017.
 */

module.exports = function(Sequelize, core){
    let debug = require("debug")("engine model");

    let co = require('co');
    let tablePrefix = "FsmEngine";  //The prefix of every table in the database


    debug("Constructing the instance model definition");
    //The instance table that holds all the Finite-state machine instances
    core.model.instance = core.sequelize.define(tablePrefix + 'Instance', {
        versionID: {type: Sequelize.INTEGER, allowNull: false},
        hasStarted: {type: Sequelize.BOOLEAN, allowNull: false, default: false},
        hasEnded: {type: Sequelize.BOOLEAN, allowNull: false, default: false}
    }, {
        freezeTableName: true,
        underscoredAll: false
    });

    debug("Constructing the snapshot model definition");
    //The instance snapshot table holds the snapshots taken from the instance
    core.model.snapshot = core.sequelize.define(tablePrefix + 'Snapshot', {
        instanceID: {type: Sequelize.INTEGER, allowNull: false},
        snapshot: {type: Sequelize.TEXT, allowNull: false}
    }, {
        freezeTableName: true,
        underscoredAll: false
    });

    debug("Constructing the configuration model definition");
    //The configuration table
    core.model.configuration = core.sequelize.define(tablePrefix + 'Configuration', {
        key: {type: Sequelize.TEXT, allowNull: false},
        value: {type: Sequelize.TEXT, allowNull: false},
    }, {
        freezeTableName: true,
        underscoredAll: false
    });

    debug("Defining the association between the version and the instance");
    //The relationship between the instance and the Finite-state machine model version
    core.model.instance.belongsTo(core.model.version, {
        foreignKey: 'versionID',
        constraints: false,
        onDelete: 'CASCADE'
    });

    debug("Defining the association between the snapshot and the instance");
    //The relationship between snapshots and instances
    core.model.snapshot.belongsTo(core.model.instance, {
        foreignKey: 'instanceID',
        constraints: false,
        onDelete: 'CASCADE'
    });

    debug("Defining model functions");
    /**
     * Gets all the instances of a Finite-state machine by Finite-state machine name
     * @param fsmName The name of the Finite-state machine
     */
    core.getInstancesByFsmName = function(fsmName) {
        return co(function*(){
            let filteredInstances = [];
            let instances = yield core.model.instance.findAll();
            for(let i = 0; i < instances.length; i++) {
                let instance = instances[i];
                let versionID = instance.dataValues.versionID;
                let version = yield core.model.version.findById(versionID);
                let fsm = yield core.model.fsm.findById(version.dataValues.fsmID);
                if(fsm.dataValues.name === fsmName) {
                    filteredInstances.push(instance.dataValues.id);
                }
            }
            if(!filteredInstances) {
                filteredInstances = [];
            }
            return filteredInstances;
        });
    };

    /**
     * Gets all the instances of a finite-state machine version
     * @param versionID the id of the finite-state machine version
     * @returns {*} A Promise to return all the instances of a finite-state machine version
     */
    core.getInstancesByVersionId = function(versionID) {
        return co(function*(){
            let instances = yield core.model.instance.findAll({
                versionID: versionID
            });
            return instances ? instances : [];
        });
    };

    /**
     * Gets all the instances of a Finite-state machine by Finite-state machine id
     * @param fsmId The id of the Finite-state machine
     */
    core.getInstancesByFsmId = function(fsmId) {
        return co(function*(){
            let filteredInstances = [];
            let instances = yield core.model.instance.findAll();
            for(let i = 0; i < instances.length; i++) {
                let instance = instances[i];
                let versionID = instance.dataValues.versionID;
                let version = yield core.model.version.findById(versionID);
                if(version.dataValues.fsmID === fsmId) {
                    filteredInstances.push(instance.dataValues.id);
                }
            }
            if(!filteredInstances) {
                filteredInstances = [];
            }
            return filteredInstances;
        });
    };

    /**
     * Gets all existing instances
     * @returns {*} A Promise to return all the existing instances
     */
    core.getAllInstances = function() {
        return co(function*(){
            let instances = yield core.model.instance.findAll();
            if(!instances) {
                instances = [];
            }
            instances = instances.map((instance)=> {
                return instance.dataValues;
            });
            return instances;
        });
    };
    /**
     * Gets an instance by its id
     * @param instanceId the id of the instance
     * @returns {*} A promise to return the
     */
    core.getInstanceById = function(instanceId) {
        return co(function*(){
            let instance = yield core.model.instance.findById(instanceId);
            return instance.dataValues;
        });
    };

    /**
     * Gets the server configuration from the database
     */
    core.getConfig = function() {
        return co(function*(){
            let pairs = yield core.model.configuration.findAll();
            let config = {};
            for(let i = 0; i < pairs.length; i++) {
                let pair = pairs[i];
                config[pair.dataValues.key] = JSON.parse(pair.dataValues.value);
            }
            return config;
        });
    };

    /**
     * Sets a value in a configuration key
     * @param key the key of the configuration
     * @param value the value
     */
    core.setConfigValue = function(key, value) {
        return co(function*(){
            let key = yield core.model.configuration.findOne({
                where: {
                    key: key
                }
            });
            if(key === void 0) { //The key does not exist, lets create it
                yield core.model.configuration.create({
                    key: key,
                    value: JSON.stringify(value)
                });
            } else { //The key already exists, lets update it
                yield core.model.configuration.update({
                    value: JSON.stringify(value)
                }, {
                    where: {
                        key: key
                    }
                });
            }
        });
    };

    /**
     * Sets the configuration with a config object
     * @param config the object with the key value pairs
     */
    core.setConfig = function(config) {
        return co(function*(){
            yield core.model.configuration.destroy({where: {}});
            for(let key of Object.keys(config)) {
                yield core.model.configuration.create({
                    key: key,
                    value: JSON.stringify(config[key])
                });
            }
        });
    };

};
