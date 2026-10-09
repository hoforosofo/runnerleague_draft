import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {players,initialOrder,eligible} from './model.mjs';
const origin='http://127.0.0.1:8766',port=8791,base=`http://127.0.0.1:${port}`;
const dir=mkdtempSync(path.join(tmpdir(),'runnerleague-test-'));
let processServer;
async function start(){processServer=spawn(process.execPath,['server.mjs'],{cwd:import.meta.dirname,env:{...process.env,PORT:String(port),DATA_DIR:dir}});await new Promise((resolve,reject)=>{processServer.stdout.once('data',resolve);processServer.once('error',reject)})}
async function stop(){if(!processServer)return;const promise=new Promise(resolve=>processServer.once('exit',resolve));processServer.kill();await promise;processServer=null}
async function post(url,data){const response=await fetch(base+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});const json=await response.json();assert.ok(response.ok,JSON.stringify(json));return json}
async function client(credentials){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin});let room;await new Promise((resolve,reject)=>{ws.once('open',()=>ws.send(JSON.stringify({type:'auth',code:credentials.code,token:credentials.token})));ws.once('error',reject);ws.on('message',raw=>{const msg=JSON.parse(raw);if(msg.type==='state'){room=msg.room;resolve()}})});return {ws,get room(){return room},async cmd(action,data={}){await new Promise(resolve=>setTimeout(resolve,10));const revision=room.revision,requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{ws.off('message',listener);reject(Error('response timeout'))},3000);function listener(raw){const msg=JSON.parse(raw);if(msg.requestId===requestId&&(msg.type==='error'||msg.type==='ack')){clearTimeout(timeout);ws.off('message',listener);resolve(msg)}}ws.on('message',listener);ws.send(JSON.stringify({type:'command',action,data,revision,requestId}))})}}}
const good=msg=>assert.equal(msg.type,'ack',JSON.stringify(msg));
const denied=msg=>assert.equal(msg.type,'error',JSON.stringify(msg));
test('Online authority, sequential claims, complete draft and server restart',async()=>{
 const clients=[];
 try{await start();const owner=await post('/rooms',{name:'방장'}),host=await client(owner);clients.push(host);good(await host.cmd('spectate'));const credentials=[];
 for(let i=0;i<5;i++){const c=await post(`/rooms/${owner.code}/join`,{name:'팀장'+i});credentials.push(c);clients.push(await client(c))}
 denied(await clients[2].cmd('claim',{team:initialOrder[1]}));denied(await clients[1].cmd('start'));denied(await host.cmd('start'));
 for(let i=0;i<5;i++)good(await clients[i+1].cmd('claim',{team:initialOrder[i]}));assert.equal(host.room.state.coachMode,false);assert.equal(host.room.state.turnOwners.length,20);good(await host.cmd('coachMode',{enabled:true}));good(await host.cmd('start'));denied(await host.cmd('pick',{player:'김뿡'}));denied(await clients[2].cmd('pick',{player:'김뿡'}));denied(await clients[1].cmd('order',{from:0,to:4}));
 const staleRevision=clients[1].room.revision;good(await clients[1].cmd('pick',{player:'김뿡'}));const stale=await new Promise(resolve=>{clients[1].ws.once('message',raw=>resolve(JSON.parse(raw)));clients[1].ws.send(JSON.stringify({type:'command',action:'pick',data:{player:'디디디용'},revision:staleRevision,requestId:'stale-test'}))});denied(stale);assert.equal(host.room.state.picks.filter(Boolean).length,1);
 for(let idx=1;idx<25;idx++){const r=host.room,s=r.state,team=s.turnOwners[idx],c=clients[initialOrder.indexOf(team)+1],picked=s.picks.filter(Boolean),p=players.find(p=>eligible(p,team,picked,true));good(await c.cmd('pick',{player:p.id}))}
 assert.equal(host.room.state.picks.filter(Boolean).length,25);denied(await host.cmd('swap',{from:0,to:11}));denied(await clients[1].cmd('reset'));denied(await clients[1].cmd('confirm'));good(await host.cmd('confirm'));good(await host.cmd('tankSwap',{from:initialOrder[0],to:initialOrder[4]}));const final=structuredClone(host.room.state);
 for(const c of clients)c.ws.close();await stop();await start();const restored=await client(owner);clients.push(restored);assert.deepEqual(restored.room.state,final);good(await restored.cmd('edit'));good(await restored.cmd('undo'));assert.equal(restored.room.state.picks.filter(Boolean).length,24);good(await restored.cmd('reset'));assert.equal(restored.room.state.coachMode,false);for(let i=0;i<5;i++)clients.push(await client(credentials[i]));good(await restored.cmd('start'));denied(await clients.at(-5).cmd('pick',{player:'짜누'}));for(let idx=0;idx<20;idx++){const state=restored.room.state,team=state.turnOwners[idx],p=players.find(p=>eligible(p,team,state.picks.filter(Boolean),false));good(await clients.at(-5+initialOrder.indexOf(team)).cmd('pick',{player:p.id}))}good(await restored.cmd('confirm'));assert.equal(restored.room.state.resultsConfirmed,true);
 }finally{for(const c of clients)c.ws.terminate();await stop();rmSync(dir,{recursive:true,force:true})}
});
