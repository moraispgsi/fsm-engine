/**
 * Created by Ricardo Morais on 19/05/2017.
 */
module.exports = function(meta){

    let co = require("co");
    /**
     * Gets all the instances of a Finite-state machine by Finite-state machine name
     * @param fsmName The name of the Finite-state machine
     */
    meta.query.getInstancesByFsmName = function(fsmName) {
        return co(function*(){
            let filteredInstances = [];
            let instances = yield meta.model.instance.findAll();
            for(let i = 0; i < instances.length; i++) {
                let instance = instances[i];
                let versionID = instance.dataValues.versionID;
                let version = yield meta.model.version.findById(versionID);
                let fsm = yield meta.model.fsm.findById(version.dataValues.fsmID);
                if(fsm.dataValues.name == fsmName) {
                    filteredInstances.push(instance.dataValues.id);
                }
                return filteredInstances;
            }
        });
    };

    /**
     * Gets all the instances of a Finite-state machine by Finite-state machine id
     * @param fsmId The id of the Finite-state machine
     */
    meta.query.getInstancesByFsmId = function(fsmId) {
        return co(function*(){
            let filteredInstances = [];
            let instances = yield meta.model.instance.findAll();
            for(let i = 0; i < instances.length; i++) {
                let instance = instances[i];
                let versionID = instance.dataValues.versionID;
                let version = yield meta.model.version.findById(versionID);
                if(version.dataValues.fsmID == fsmId) {
                    filteredInstances.push(instance.dataValues.id);
                }
            }
            return filteredInstances;
        });
    };

    /**
     * Gets the server configuration from the database
     */
    meta.query.getConfig = function() {
        return co(function*(){
            let pairs = yield meta.model.configuration.findAll();
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
    meta.query.setConfigValue = function(key, value) {
        return co(function*(){
            let key = yield meta.model.configuration.findOne({
                where: {
                    key: key
                }
            });
            if(key === void 0) { //The key does not exist, lets create it
                yield meta.model.configuration.create({
                    key: key,
                    value: JSON.stringify(value)
                });
            } else { //The key already exists, lets update it
                yield meta.model.configuration.update({
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
    meta.query.setConfig = function(config) {
        return co(function*(){
            yield meta.model.configuration.destroy({where: {}});
            for(let key in Object.keys(config)) {
                yield meta.model.configuration.create({
                    key: key,
                    value: JSON.stringify(config[key])
                });
            }
        });
    };
};