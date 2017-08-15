/**
 * Created by Ricardo Morais on 17/06/2017.
 */

//Libraries
import scxml from "scxml";
import vm from "vm";
import CustomExecutableContent from "./custom";
import debugStart from "debug";
import moment from "moment-business-days";
import dateUtils from "date-utils";
let debug = debugStart("interpreter");
const REFRESH_INTERVAL = 1000;

/**
 * Represents a SCXML interpreter
 */
class Interpreter {

    /**
     * @constructor
     * @param engine
     * @param {String} documentString The SCXML
     * @param {String|null} actionDispatcherURL An optional action dispatcher URL
     * @param {string|null} actionDispatcherToken An optional access token for the action dispatcher
     * @param {string} machine The machine name
     * @param {string} versionKey The versionKey
     * @param {string} instanceKey The instanceKey
     */
    constructor(engine, machine, versionKey, instanceKey,
                documentString){
        this.engine = engine;
        this.machine = machine;
        this.versionKey = versionKey;
        this.instanceKey = instanceKey;
        this.documentString = documentString;
        this.customExecContent = new CustomExecutableContent(engine, engine.dispatcherURL, engine.dispatcherToken);
        this.hasChanged = false;
    }

    /**
     * Swaps the dispatcher
     * @param dispatcherURL The new Dispatcher URL
     * @param dispatcherToken The new Dispatcher Token
     */
    swapDispatcher(dispatcherURL, dispatcherToken) {
        this.dispatcherURL = dispatcherURL;
        this.dispatcherToken = dispatcherToken;
        this.customExecContent.swapDispatcher(dispatcherURL, dispatcherToken);
    }

    async save() {
        // override
    }


    onFinish() {
        // override
    }


}

export default Interpreter;



