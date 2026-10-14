import {parentPort} from 'node:worker_threads';
import {chooseDraftPlayer} from './draft-ai.mjs';
parentPort.on('message',({id,state,team})=>{
 try{parentPort.postMessage({id,decision:chooseDraftPlayer(state,team)})}
 catch(error){parentPort.postMessage({id,error:String(error.message)})}
});
