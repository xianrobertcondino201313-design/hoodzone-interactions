const assert = require('assert');
const crypto = require('crypto');
const http = require('http');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const spki = publicKey.export({format:'der',type:'spki'});
process.env.DISCORD_PUBLIC_KEY = spki.subarray(-32).toString('hex');
process.env.DISCORD_TOKEN = '';
process.env.CLIENT_ID = '';
process.env.GUILD_ID = 'test-guild';
process.env.PORT = '18181';

const { server, handle, COMMANDS, smartReply } = require('./server.js');

function req(method,path,body='',headers={}) {
  return new Promise((resolve,reject)=>{
    const r=http.request({
      host:'127.0.0.1',port:18181,path,method,
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),...headers}
    },x=>{
      const a=[]; x.on('data',c=>a.push(c)); x.on('end',()=>resolve({status:x.statusCode,body:Buffer.concat(a).toString()}));
    });
    r.on('error',reject); r.end(body);
  });
}

(async()=>{
  await new Promise(r=>server.listen(18181,'127.0.0.1',r));

  assert.strictEqual(COMMANDS.length,100,'must keep exactly 100 commands');
  assert.strictEqual(new Set(COMMANDS.map(x=>x.name)).size,100,'commands must be unique');

  const health=await req('GET','/health');
  assert.strictEqual(health.status,200);
  assert.strictEqual(JSON.parse(health.body).commands,100);

  const commandList=await req('GET','/commands');
  assert.strictEqual(commandList.status,200);
  assert.strictEqual(JSON.parse(commandList.body).count,100);

  const pingBody=JSON.stringify({type:1,id:'test-ping'});
  const ts=String(Math.floor(Date.now()/1000));
  const sig=crypto.sign(null,Buffer.concat([Buffer.from(ts),Buffer.from(pingBody)]),privateKey).toString('hex');
  const ping=await req('POST','/interactions',pingBody,{'X-Signature-Ed25519':sig,'X-Signature-Timestamp':ts});
  assert.strictEqual(ping.status,200);
  assert.deepStrictEqual(JSON.parse(ping.body),{type:1});

  const bad=await req('POST','/interactions',pingBody,{'X-Signature-Ed25519':'00'.repeat(64),'X-Signature-Timestamp':ts});
  assert.strictEqual(bad.status,401);

  // Every command must have a valid Discord interaction response in the local handler.
  for (const command of COMMANDS) {
    const interaction={
      type:2,
      id:'test',
      guild_id:'test-guild',
      token:'test-token',
      data:{name:command.name,options: command.name==='help' ? [{name:'question',type:3,value:'hello'}] : []},
      member:{user:{id:'123',username:'tester'}}
    };
    const out=await handle(interaction);
    assert.ok(out && [4,5].includes(out.type), `/${command.name} did not return a valid interaction response`);
    if(command.name==='help') assert.match(out.data.content,/Hey/i);
  }

  assert.match(smartReply('hello'),/Hey/i);
  assert.match(smartReply('what games can I play'),/coinflip/i);

  server.close();
  console.log('ALL TESTS PASSED: 100 commands + signature verification + command response sweep + smart conversation + diagnostics');
})().catch(e=>{
  console.error(e);
  try{server.close()}catch{}
  process.exit(1);
});
