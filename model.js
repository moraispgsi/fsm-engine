/**
 * Created by Ricardo Morais on 19/05/2017.
 */

module.exports = function(Sequelize, meta){

    let tablePrefix = "FsmEngine";  //The prefix of every table in the database
    //The instance table that holds all the Finite-state machine instances
    meta.model.instance = meta.sequelize.define(tablePrefix + 'Instance', {
        versionID: {type: Sequelize.INTEGER, allowNull: false},
        hasStarted: {type: Sequelize.BOOLEAN, allowNull: false, default: false},
        hasEnded: {type: Sequelize.BOOLEAN, allowNull: false, default: false}
    }, {
        freezeTableName: true,
        underscoredAll: false
    });

    //The instance snapshot table holds the snapshots taken from the instance
    meta.model.snapshot = meta.sequelize.define(tablePrefix + 'Snapshot', {
        instanceID: {type: Sequelize.INTEGER, allowNull: false},
        snapshot: {type: Sequelize.TEXT, allowNull: false}
    }, {
        freezeTableName: true,
        underscoredAll: false
    });

    //The configuration table
    meta.model.configuration = meta.sequelize.define(tablePrefix + 'Configuration', {
        key: {type: Sequelize.TEXT, allowNull: false},
        value: {type: Sequelize.TEXT, allowNull: false},
    }, {
        freezeTableName: true,
        underscoredAll: false
    });

    //The relationship between the instance and the Finite-state machine model version
    meta.model.instance.belongsTo(meta.model.version, {
        foreignKey: 'versionID',
        constraints: false,
        onDelete: 'CASCADE'
    });

    //The relationship between snapshots and instances
    meta.model.snapshot.belongsTo(meta.model.instance, {
        foreignKey: 'instanceID',
        constraints: false,
        onDelete: 'CASCADE'
    });

};
