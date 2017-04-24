/**
 * Created by Ricardo Morais on 24/04/2017.
 */

let co = require('co');
let SNAPSHOT_DELAY = 100;       //The delay
/**
 * The instance class
 */
class Instance {

    constructor(meta, sc, id) {
        this.sc = sc;
        this.id = id;
        this.meta = meta;
    }

    /**
     * Creates a instance snapshot
     * @returns {Promise} A Promise to save a snapshot of the instance in the database
     * @private
     */
    _saveInstancePromise() {
        return co(function*() {
            yield this.meta.model.snapshot.create({
                instanceID: this.id,
                snapshot: JSON.stringify(this.sc.getSnapshot())
            });
        }.bind(this));
    }

    /**
     * Starts the interval timer that will create the snapshots every t milliseconds
     */
    startSnapshotInterval(){

        if(this.interval){
            clearInterval(this.interval);
        }
        this.interval = setInterval(function(){
            if(this.sc === null) {
                clearInterval(interval);
                return;
            }

            if(!this.sc._isStepping){
                this._saveInstancePromise().then();
            }
        }.bind(this), SNAPSHOT_DELAY);

    }

    /**
     * Starts the instance if it hasn't already started
     * @returns {Promise} A Promise that starts the instance
     */
    startPromise() {
        return co(function*() {
            let instance = yield this.meta.model.instance.findById(this.id);
            //Find out if the instance has already started
            if(instance.dataValues.hasStarted) {
                throw new Error("The instance has already started.");
            }
            yield this._saveInstancePromise();  //Saves the first snapshot
            this.startSnapshotInterval();       //Start the snapshot service
            this.sc.start();                    //Start the statechart
            //Since it hasn't started yet mark it as started
            yield this.meta.model.instance.update({hasStarted: true}, {where: {id: this.id}});
        }.bind(this));
    }
}

module.exports = Instance;
