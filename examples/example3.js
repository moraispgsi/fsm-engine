/**
 * Created by Ricardo Morais on 13/04/2017.
 */
let fsmEnginePromise = require("../index")('mysql', 'localhost', 'root', 'root', 'mydatabase');
let co = require('co');

co(function*(){
    let fsmEngine = yield fsmEnginePromise;
    yield fsmEngine.makeInstancePromise(1);
    let instance = fsmEngine.getInstance(2);
    yield instance.startPromise();
     instance.sc.gen("expired")
}).then();
