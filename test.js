const assert=require('assert'),crypto=require('crypto'),http=require('http');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const spki=publicKey.export({format:'der',type:'spki'});
process.env.DISCORD_PUBLIC_KEY=spki.subarray(-32).toString('hex');
process.env.DISCORD_TOKEN='';process.env.CLIENT_ID='';process.env.GUILD_ID='';process.env.PORT='18181';
const app=require('./server.js');
function req(method,path,body='',headers={}){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:18181,path,method,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),...headers}},x=>{let a=[];x.on('data',c=>a.push(c));x.on('end',()=>resolve({status:x.statusCode,body:Buffer.concat(a).toString()}))});r.on('error',reject);r.end(body)})}
(async()=>{await new Promise(r=>setTimeout(r,100));
 const h=await req('GET','/health');assert.equal(h.status,200);assert.equal(JSON.parse(h.body).ok,true);
 const pingBody=JSON.stringify({type:1,id:'test-ping'}),ts=String(Math.floor(Date.now()/1000));
 const sig=crypto.sign(null,Buffer.concat([Buffer.from(ts),Buffer.from(pingBody)]),privateKey).toString('hex');
 const ping=await req('POST','/interactions',pingBody,{'X-Signature-Ed25519':sig,'X-Signature-Timestamp':ts});
 assert.equal(ping.status,200);assert.deepEqual(JSON.parse(ping.body),{type:1});
 const bad=await req('POST','/interactions',pingBody,{'X-Signature-Ed25519':'00'.repeat(64),'X-Signature-Timestamp':ts});assert.equal(bad.status,401);
 app.close();console.log('ALL TESTS PASSED: health + Discord PING signature verification + invalid signature rejection');
})().catch(e=>{console.error(e);try{app.close()}catch{}process.exit(1)})
