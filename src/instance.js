/**
 * Created by Ricardo Morais on 24/04/2017.
 */

const SNAPSHOT_DELAY = 1000 * 45; //The delay
/**
 * The instance class
 */
export default class Instance {

    constructor(core, sc, machineName, versionKey, instanceKey) {
        this.core = core;
        this.sc = sc;
        this.machineName = machineName;
        this.versionKey = versionKey;
        this.instanceKey = instanceKey;
    }

    async _save() {
        //Take a snapshot of the instance
        let snapshot = this.sc.getSnapshot();
        //Get last snapshot on the database
        let snapshotsKeys = this.core.getSnapshotsKeys(this.machineName, this.versionKey, this.instanceKey);
        if (snapshotsKeys.length > 0) {
            let lastSnapshotKey = snapshotsKeys[snapshotsKeys.length - 1];
            let info = this.core.getSnapshotInfo(this.machineName, this.versionKey, this.instanceKey, lastSnapshotKey);
            if (JSON.stringify(snapshot) === JSON.stringify(info)) {
                //No change since the latest snapshot
                return;
            }
        }
        await this.core.addSnapshot(this.machineName, this.versionKey, this.instanceKey, snapshot);
    }

    async start() {
        await this._save();  //Saves the first snapshot
        //Mark has changed
        this.sc.on("onTransition", () => {
            this.hasChanged = true
        });
        this.sc.start();                    //Start the statechart
        this.interval = setInterval(function () {
            if (this.sc === null) {
                clearInterval(this.interval);
                return;
            }
            if (this.sc.isFinal()) {
                let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
                info.hasEnded = true;
                this.core.setInstanceInfo(this.machineName, this.versionKey, this.instanceKey, info);
                return;
            }
            if (!this.sc._isStepping && this.hasChanged) {
                this._save().then();
                this.hasChanged = false;
            }
        }.bind(this), SNAPSHOT_DELAY);

        //Since it hasn't started yet mark it as started
        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        info.hasStarted = true;
        this.core.setInstanceInfo(this.machineName, this.versionKey, this.instanceKey, info);
    }

    getStateChart() {
        return this.sc;
    }

    hasStarted() {
        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        return info.hasStarted;
    }

    hasEnded() {
        let info = this.core.getInstanceInfo(this.machineName, this.versionKey, this.instanceKey);
        return info.hasEnded;
    }

    /**
     * Revert an instance to a previous snapshot
     */
    revert(snapshotKey) {
        //todo
        //kill the stateChart(HOW) > Create a new statechart > start the instance
    }

    /**
     * Send an event to the statechart
     * @param eventName The name of the event
     * @param data The data of the event
     */
    sendEvent(eventName, data) {
        //Find out if the instance has already started
        if (!(this.hasStarted())) {
            throw new Error("The instance hasn't started yet.");
        }
        data = data || {};
        data.name = eventName;
        this.sc.gen(data);
    }
}

