//Libraries
import Instance from "./instance";
import Core from "fsm-core";
import Queue from 'queue';
import debugStart from "debug";
import co from "co";
require('events').EventEmitter.defaultMaxListeners = Infinity;
let debug = debugStart("engine");

/**
 * Represents an engine that interprets SCXML
 */
class Engine extends Core {

    constructor(dispatcherURL, dispatcherToken) {
        super();
        this.hasStarted = false;
        this.dispatcherURL = dispatcherURL;
        this.dispatcherToken = dispatcherToken;
        this.instanceStore = {};
    }

    /**
     * Initialize the engine
     * @method init
     * @memberOf Engine
     * @returns {Promise}
     */
    async init(redisOptions) {

        if (this.hasStarted) {
            throw new Error("Engine has already stated.");
        }

        debug("Starting the engine");
        super.init(redisOptions);

        this.processRunInstance((job, done) => {
            let engine = this;
            let machine = job.data.machine;
            let versionKey = job.data.versionKey;
            let instanceKey = job.data.instanceKey;
            let snapshot = job.data.snapshot;
            co(function*(){
                let documentString = yield engine.getVersionSCXML(machine, versionKey);
                let instance = new Instance(engine, documentString, machine, versionKey, instanceKey);
                engine.instanceStore[machine + versionKey + instanceKey] = instance;
                yield instance.start(snapshot);

                engine.processStopInstance(machine, versionKey, instanceKey, (job, done) => {
                    instance.stop().then(()=> {
                        delete engine.instanceStore[machine + versionKey + instanceKey];
                        done();
                    });
                }, 20);

                engine.processSendEvent(machine, versionKey, instanceKey, (job, done) => {
                    instance.sendEvent(job.data.event, job.data.data);
                    delete engine.instanceStore[machine + versionKey + instanceKey];
                    done();
                }, 20);

                done();
            }).catch((err) => {
                console.log(err);
                done(err);
            });
        }, 10, () => {
            console.log('Finished');
        });

        this.instanceStore = {};

        debug("Core was initialized");

        this.hasStarted = true;
    }

    async shutdown() {
        for(let instance of this.instanceStore) {
            let snapshot = instance.getSnapshot();
            await instance.pause();
            await this.runInstance(instance.machine, instance.versionKey, instance.instanceKey, snapshot);
        }
    }

    /**
     * Returns an instance from the engine
     * @method getInstance
     * @memberOf Engine
     * @param {String} machineName The machine name
     * @param {String} versionKey The version key
     * @param {String} instanceKey The instance key
     * @returns {Instance} The instance
     */
    getInstance(machineName, versionKey, instanceKey) {
        let key = machineName + versionKey + instanceKey;
        if (!this.instanceStore[key]) {
            throw new Error("Instance not found");
        }
        return this.instanceStore[key];
    }

}

export default Engine;
