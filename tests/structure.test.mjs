import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {players} from '../shared/model.mjs';

const root=path.resolve(import.meta.dirname,'..');
const text=file=>fs.readFileSync(path.join(root,file),'utf8');
function exists(relative){assert.ok(fs.existsSync(path.join(root,relative)),`Missing: ${relative}`);}

test('HTML styles, scripts, module imports and font paths resolve in the new folders',()=>{
 for(const match of text('index.html').matchAll(/(?:src|href)="([^"]+)"/g)){
  const url=match[1].split('?')[0];if(url.startsWith('./')||!url.includes(':'))exists(url);
 }
 for(const folder of ['js','shared','cloudflare-server','cloudflare-server/ai']){
  for(const name of fs.readdirSync(path.join(root,folder))){
   if(!/\.(mjs|js)$/.test(name))continue;
   const file=path.join(folder,name);
   for(const match of text(file).matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)){
    if(match[1].startsWith('.'))exists(path.join(folder,match[1].split('?')[0]));
   }
  }
 }
 for(const match of text('css/app.css').matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)){
  if(!match[1].startsWith('data:'))exists(path.join('css',match[1]));
 }
 for(const player of players)if(player.image)exists(player.image);
 assert.equal(fs.existsSync(path.join(root,'online-server')),false);
 assert.equal(fs.existsSync(path.join(root,'server.mjs')),false);
});

test('Pages entry and existing Cloudflare bindings stay compatible with deployment',()=>{
 const config=JSON.parse(text('cloudflare-server/wrangler.jsonc'));
 assert.equal(config.name,'runnerleague-online');
 exists(path.join('cloudflare-server',config.main));
 assert.deepEqual(config.durable_objects.bindings.map(b=>b.name),['ROOMS','LOBBY']);
 assert.deepEqual(config.migrations,[{tag:'v1',new_sqlite_classes:['DraftRoom','MatchLobby']}]);
 const frontend=text('js/online-config.js');
 assert.match(frontend,/export const ONLINE_SERVER_URL\s*=\s*['"]https:\/\/[^'"]+\.workers\.dev['"]/);
});

test('Server URL helper edits the moved config, not a stale root file',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'runnerleague-config-'));
 try{
  fs.mkdirSync(path.join(tmp,'cloudflare-server'));fs.mkdirSync(path.join(tmp,'js'));
  const script=path.join(tmp,'cloudflare-server/set-server-url.mjs');
  fs.writeFileSync(script,text('cloudflare-server/set-server-url.mjs'));
  execFileSync(process.execPath,[script,'https://runnerleague-online.example.workers.dev']);
  assert.ok(fs.readFileSync(path.join(tmp,'js/online-config.js'),'utf8').includes('https://runnerleague-online.example.workers.dev'));
  assert.equal(fs.existsSync(path.join(tmp,'online-config.js')),false);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
