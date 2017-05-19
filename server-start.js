
module.exports = function start(engine){
    let co = require('co');                                         //For a easier promise handling experience
    let Instance = require('./instance');
    return co(function*(){
        yield engine.meta.sequelize.sync();  //Synchronize the database with the database model definition
        //Find all the instances that didn't end yet in order to restart their execution process
        let instances = yield engine.meta.model.instance.findAll({
            where: {
                hasEnded: false
            }
        });

        //Iterating over the instances in order to restart them
        for (let instanceRow of instances) {
            let versionID = instanceRow.dataValues.versionID;   //Get the versionID
            //Find the latest Snapshot of the instance
            let latestSnapshot = yield engine.meta.model.snapshot.findOne({
                where: {
                    instanceID: instanceRow.dataValues.id
                },
                order: [ [ 'updatedAt', 'DESC' ]]
            });

            //The snapshot is parsed as JSON or is null if none was found
            let instance = yield engine.remakeInstance(versionID, snapshot, instanceRow.dataValues.id);

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
    });
};
