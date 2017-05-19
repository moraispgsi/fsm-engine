
module.exports = function start(engine){
    let co = require('co');                                         //For a easier promise handling experience
    return co(function*(){
        yield engine.meta.sequelize.sync();  //Synchronize the database with the database model definition
        //Find all the instances that didn't end yet in order to restart their execution process
    });
};
