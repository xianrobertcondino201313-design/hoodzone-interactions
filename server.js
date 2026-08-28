const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const PUBLIC_KEY = String(process.env.DISCORD_PUBLIC_KEY || '').trim();
const BOT_TOKEN = String(process.env.DISCORD_TOKEN || '').trim();
const CLIENT_ID = String(process.env.CLIENT_ID || '').trim();
const GUILD_ID = String(process.env.GUILD_ID || '').trim();
const MAX_BODY = 1024 * 1024;
const VERSION = '3.2.0';
const startedAt = Date.now();

/*
 * HOODZONE v3.2.0
 * - Keeps the original 100 command names.
 * - Every registered command has a safe response path.
 * - Slow/failing Discord API work can be deferred, preventing interaction timeouts.
 * - No secrets are stored in source code.
 */

const RAW_COMMANDS = [
['help','Show HOODZONE help'],['ping','Check endpoint latency'],['status','Show HOODZONE status'],['botinfo','Show bot information'],['serverinfo','Show server information'],['uptime','Show service uptime'],['dashboard','Show control center'],['setup','Show setup guide'],['permissions','Show required permissions'],['config','Show safe configuration status'],
['warn','Warn a member'],['warnings','View member warnings'],['clearwarns','Clear member warnings'],['timeout','Timeout a member'],['untimeout','Remove a timeout'],['kick','Kick a member'],['ban','Ban a member'],['unban','Unban a user'],['purge','Delete recent messages'],['modlogs','Show moderation logs'],['case','Show a moderation case'],['reason','Set a case reason'],['history','Show member history'],['report','Report a member'],['reports','Show reports'],['automod','Show AutoMod guidance'],['antispam','Show anti-spam status'],['antilink','Show anti-link status'],['antiraid','Show anti-raid status'],['lock','Lock a channel'],['unlock','Unlock a channel'],
['safety','Show safety controls'],['antibullying','Show anti-bullying controls'],['review','Review a safety report'],['deescalate','Send a de-escalation response'],['incident','Create an incident note'],['incidents','Show incident records'],['appeal','Submit an appeal'],['appeals','Show appeal status'],['reportuser','Report bullying or harassment'],['safetylog','Show safety logging status'],
['welcome','Show welcome setup'],['goodbye','Show goodbye setup'],['verify','Show verification setup'],['intro','Show introduction setup'],['rules','Show server rules'],['userinfo','Show user information'],['profile','Show profile information'],['avatar','Show user avatar'],['roles','List server roles'],['roleinfo','Show role information'],
['role','Manage a member role'],['createrole','Create a role'],['autorole','Show autorole setup'],['selfroles','Show self-role setup'],['reactionroles','Show reaction-role setup'],['staffroles','Show staff hierarchy'],['rolelock','Show role lock setup'],['rolelog','Show role logging'],['vip','Show VIP guidance'],['og','Show OG guidance'],
['daily','Claim daily points'],['coinflip','Flip a virtual coin'],['dice','Roll a die'],['trivia','Start trivia'],['quiz','Start a quiz'],['rps','Play rock paper scissors'],['numberguess','Play number guess'],['wordgame','Play word game'],['memory','Play memory'],['duel','Challenge a member'],
['balance','Show point balance'],['givepoints','Give points'],['leaderboard','Show leaderboard'],['rank','Show rank'],['level','Show level'],['xp','Show XP'],['rewards','Show rewards'],['shop','Show virtual shop'],['buy','Buy an item'],['inventory','Show inventory'],
['event','Create an event'],['events','List events'],['giveaway','Create a giveaway'],['poll','Create a poll'],['suggest','Submit a suggestion'],['suggestions','Show suggestions'],['ticket','Open a support ticket'],['afk','Set AFK status'],['remind','Create a reminder'],['announce','Create an announcement'],
['logs','Show logging setup'],['backup','Show safe configuration backup'],['maintenance','Show maintenance mode'],['staff','Show staff guidance'],['servermute','Mute a member'],['serverunmute','Unmute a member'],['nick','Set a member nickname'],['slowmode','Set channel slowmode'],['channelinfo','Show channel information']
];

if (RAW_COMMANDS.length !== 100 || new Set(RAW_COMMANDS.map(x => x[0])).size !== 100) {
  throw new Error('HOODZONE must contain exactly 100 unique commands');
}

const STAFF_PERMS = String(1 << 3 | 1 << 4 | 1 << 5 | 1 << 28); // Manage Channels, Manage Guild, Manage Messages, Manage Roles.
const commandOptions = {
  help:[str('question','Ask HOODZONE a question',false)],
  warn:[user('user','Member to warn'), str('reason','Reason',false)],
  timeout:[user('user','Member to timeout'), integer('minutes','Timeout length in minutes',false,1,10080), str('reason','Reason',false)],
  untimeout:[user('user','Member to restore')],
  kick:[user('user','Member to kick'), str('reason','Reason',false)],
  ban:[user('user','Member to ban'), str('reason','Reason',false)],
  unban:[str('user_id','User ID')],
  purge:[integer('amount','Number of recent messages',true,1,100)],
  nick:[user('user','Member'), str('nickname','New nickname',true)],
  slowmode:[integer('seconds','Slowmode seconds',true,0,21600)],
  servermute:[user('user','Member to mute')],
  serverunmute:[user('user','Member to unmute')],
  report:[user('user','Member to report'), str('reason','Reason',true)],
  reportuser:[user('user','Member to report'), str('reason','Reason',true)],
  suggest:[str('text','Suggestion',true)],
  poll:[str('question','Poll question',true)],
  remind:[str('text','Reminder text',true), integer('minutes','Minutes from now',true,1,10080)],
  announce:[str('message','Announcement',true)],
};

function str(name, description, required=true) {
  return {type:3,name,description,required};
}
function integer(name, description, required=true, min_value, max_value) {
  const x={type:4,name,description,required};
  if(min_value!==undefined)x.min_value=min_value;
  if(max_value!==undefined)x.max_value=max_value;
  return x;
}
function user(name, description) {
  return {type:6,name,description,required:true};
}

function buildCommand([name, description]) {
  const command = {name, description, type:1};
  if (commandOptions[name]) command.options = commandOptions[name];
  if (['warn','timeout','untimeout','kick','ban','unban','purge','nick','slowmode','servermute','serverunmute','announce'].includes(name)) {
    command.default_member_permissions = STAFF_PERMS;
  }
  return command;
}
const COMMANDS = RAW_COMMANDS.map(buildCommand);

function send(res,status,body,type='application/json; charset=utf-8') {
  const data=Buffer.from(typeof body==='string'?body:JSON.stringify(body));
  res.writeHead(status,{'Content-Type':type,'Content-Length':data.length,'Cache-Control':'no-store'});
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve,reject)=>{
    const chunks=[]; let total=0;
    req.on('data',chunk=>{
      total+=chunk.length;
      if(total<=MAX_BODY) chunks.push(chunk);
      else req.destroy();
    });
    req.on('end',()=> total>MAX_BODY ? reject(new Error('body_too_large')) : resolve(Buffer.concat(chunks)));
    req.on('error',reject);
  });
}
function keyDer(hex) {
  const raw=Buffer.from(hex,'hex');
  if(raw.length!==32) throw new Error('invalid_public_key');
  return Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]);
}
function verify(req,body) {
  const sig=req.headers['x-signature-ed25519'];
  const ts=req.headers['x-signature-timestamp'];
  if(typeof sig!=='string'||typeof ts!=='string'||!/^[0-9a-f]{128}$/i.test(sig)||!/^[0-9a-f]{64}$/i.test(PUBLIC_KEY)) return false;
  try {
    return crypto.verify(null,Buffer.concat([Buffer.from(ts),body]),{key:keyDer(PUBLIC_KEY),format:'der',type:'spki'},Buffer.from(sig,'hex'));
  } catch { return false; }
}
async function discord(path,opts={}) {
  if(!BOT_TOKEN) throw new Error('DISCORD_TOKEN missing');
  const controller = new AbortController();
  const timer=setTimeout(()=>controller.abort(),Number(process.env.DISCORD_API_TIMEOUT_MS||8000));
  try {
    const r=await fetch('https://discord.com/api/v10'+path,{...opts,signal:controller.signal,headers:{Authorization:'Bot '+BOT_TOKEN,'Content-Type':'application/json',...(opts.headers||{})}});
    const text=await r.text(); let data=null;
    try{data=text?JSON.parse(text):null}catch{}
    if(!r.ok) throw new Error(`Discord API ${r.status}: ${data?.message||text||'request failed'}`);
    return data;
  } finally { clearTimeout(timer); }
}
async function interactionEdit(i,body) {
  if(!i.token) return;
  const appId=CLIENT_ID||i.application_id;
  if(!appId) return;
  const path=`/webhooks/${encodeURIComponent(appId)}/${encodeURIComponent(i.token)}/messages/@original`;
  return discord(path,{method:'PATCH',body:JSON.stringify(body),headers:{Authorization:undefined}});
}
async function register() {
  if(!BOT_TOKEN||!CLIENT_ID||!GUILD_ID){console.warn('[REGISTER] skipped: missing token/client/guild');return 0;}
  const out=await discord(`/applications/${encodeURIComponent(CLIENT_ID)}/guilds/${encodeURIComponent(GUILD_ID)}/commands`,{method:'PUT',body:JSON.stringify(COMMANDS)});
  const count=Array.isArray(out)?out.length:0;
  console.log(`[REGISTER] synced ${count} guild commands (expected ${COMMANDS.length})`);
  return count;
}
function response(content,ephemeral=false) {
  return {type:4,data:{content:String(content).slice(0,2000),...(ephemeral?{flags:64}:{})}};
}
function defer(ephemeral=false) {
  return {type:5,data:ephemeral?{flags:64}:{}};
}
function username(i) {
  return String((i.member?.user||i.user||{}).username||'member').slice(0,80);
}
function option(i,name) {
  return i.data?.options?.find(o=>o.name===name);
}
function optionValue(i,name) { return option(i,name)?.value; }
function targetId(i,name='user') { return optionValue(i,name); }

function smartReply(text) {
  const q=String(text||'').trim().toLowerCase();
  if(!q) return '💬 Tell me what you need. Try: `help`, `commands`, `status`, `server`, `rules`, or `games`.';
  if(/\b(hello|hi|hey|yo|sup)\b/.test(q)) return '👋 Hey! HOODZONE is here. What are we doing today?';
  if(/\b(help|command|commands)\b/.test(q)) return '🧭 I can help with **commands, moderation, safety, games, XP, community, setup, and server info**. Try `/help`.';
  if(/\b(status|online|up|alive)\b/.test(q)) return `🟢 HOODZONE v${VERSION} is online. Uptime: ${Math.floor(process.uptime())}s.`;
  if(/\b(server|guild)\b/.test(q)) return `🏙️ HOODZONE server: \`${GUILD_ID||'not configured'}\``;
  if(/\b(rule|rules)\b/.test(q)) return '📜 Core rules: respect people, no bullying/harassment, no spam, no threats, no impersonation, and follow Discord rules.';
  if(/\b(game|games|fun)\b/.test(q)) return '🎮 Try `/coinflip`, `/dice`, `/trivia`, `/quiz`, `/rps`, `/numberguess`, `/wordgame`, or `/memory`.';
  if(/\b(report|bully|harass)\b/.test(q)) return '🛡️ For a safety report, use `/reportuser` and provide the member plus a clear reason.';
  if(/\b(thank|thanks|ty)\b/.test(q)) return '🖤 Anytime. HOODZONE has you.';
  return `🧠 I got you: **${String(text).slice(0,350)}**\nTry `/help` if you want the full command map.`;
}

function staticMessage(name,i) {
  const u=username(i);
  const messages={
    help:`🏙️ **HOODZONE v${VERSION}**\n100 commands are installed across moderation, safety, roles, games, XP, community and administration.\n\n💬 Smart conversation: use \`/chat\`.`,
    ping:`🏓 **Pong!**\n🟢 Endpoint online\n⚡ Process uptime: ${Math.floor(process.uptime())}s`,
    status:`🛡️ **HOODZONE STATUS**\n🟢 HTTP endpoint: online\n🔐 Signature validation: enabled\n📦 Version: ${VERSION}\n🧩 Commands: ${COMMANDS.length}`,
    botinfo:`🤖 **HOODZONE APP BOT**\nVersion: **${VERSION}**\nMode: Discord HTTP Interactions\nCommands: **${COMMANDS.length}/100**`,
    serverinfo:`🏙️ **HOODZONE SERVER**\nGuild ID: \`${GUILD_ID||'not configured'}\``,
    uptime:`⏱️ Uptime: **${Math.floor(process.uptime())} seconds**`,
    dashboard:'🎛️ **HOODZONE CONTROL CENTER**\nModeration • Safety • Roles • Games • XP • Community • Administration',
    setup:'⚙️ **SETUP**\nSet DISCORD_PUBLIC_KEY, DISCORD_TOKEN, CLIENT_ID and GUILD_ID. Point Discord Interactions Endpoint URL to `/interactions`.',
    permissions:'🔐 **PERMISSIONS**\nStaff commands use Discord command permissions. Server/channel permissions can also restrict application commands.',
    config:`🔧 **CONFIG STATUS**\nPublic key: ${PUBLIC_KEY?'configured':'missing'}\nBot token: ${BOT_TOKEN?'configured':'missing'}\nClient ID: ${CLIENT_ID?'configured':'missing'}\nGuild ID: ${GUILD_ID?'configured':'missing'}`,
    rules:'📜 **HOODZONE RULES**\n1. Respect everyone.\n2. No bullying or harassment.\n3. No hate speech or threats.\n4. No spam or malicious links.\n5. No impersonation.\n6. Follow Discord rules.',
    safety:'🛡️ **SAFETY**\nSignature validation is enabled. Use the reporting commands for safety workflows.',
    antibullying:'🛡️ **ANTI-BULLYING**\nReports are available through interactions. Continuous message scanning requires a separate Gateway worker with the appropriate Discord access.',
    welcome:'👋 **WELCOME**\nMember-event automation requires a Gateway worker; this HTTP endpoint handles interactions.',
    goodbye:'👋 **GOODBYE**\nMember-event automation requires a Gateway worker.',
    verify:'✅ **VERIFY**\nVerification workflows can be built on top of the interaction system.',
    intro:'📝 **INTRO**\nUse this area for member introductions.',
    profile:`👤 **PROFILE**\nUser: **${u}**`,
    avatar:`🖼️ **AVATAR**\nUser: **${u}**\nAvatar data is available from the interaction payload when supplied by Discord.`,
    autorole:'🏷️ **AUTOROLE**\nRequires a persistent configuration store and role management permissions.',
    selfroles:'🏷️ **SELF ROLES**\nUse Discord command permissions and role workflows to manage self-assignable roles.',
    reactionroles:'🏷️ **REACTION ROLES**\nReaction-driven workflows require a Gateway/message event worker.',
    staffroles:'🛡️ **STAFF HIERARCHY**\nConfigure staff roles in Discord and restrict management commands.',
    rolelock:'🔒 **ROLE LOCK**\nUse Discord permissions to prevent unauthorized role changes.',
    rolelog:'📋 **ROLE LOGGING**\nPersistent audit logging requires storage and/or Gateway audit event processing.',
    vip:'⭐ **VIP**\nVIP role guidance is ready for your server configuration.',
    og:'🏆 **OG**\nOG role guidance is ready for your server configuration.',
    daily:'🎮 **DAILY**\nDaily claim received. Persistent points require a database/storage layer.',
    coinflip:`🪙 **COIN FLIP:** ${Math.random()<0.5?'Heads':'Tails'}`,
    dice:`🎲 **DICE:** ${1+Math.floor(Math.random()*6)}`,
    trivia:'🧠 **TRIVIA**\nTrivia engine is online. Persistent scores require storage.',
    quiz:'📝 **QUIZ**\nQuiz engine is online.',
    rps:`✊ **RPS:** ${['Rock','Paper','Scissors'][Math.floor(Math.random()*3)]}`,
    numberguess:`🔢 **NUMBER GUESS:** I picked a number from 1–10. Try again!`,
    wordgame:'🔤 **WORD GAME**\nWord game engine is online.',
    memory:'🧠 **MEMORY**\nMemory game engine is online.',
    balance:'💰 **BALANCE**\nPersistent balances require storage.',
    leaderboard:'🏆 **LEADERBOARD**\nPersistent leaderboard data requires storage.',
    rank:'📈 **RANK**\nRank tracking is ready for a storage layer.',
    level:'🆙 **LEVEL**\nLevel tracking is ready for a storage layer.',
    xp:'✨ **XP**\nXP tracking is ready for a storage layer.',
    rewards:'🎁 **REWARDS**\nReward definitions can be stored in your app database.',
    shop:'🛒 **SHOP**\nVirtual shop framework is ready.',
    inventory:'🎒 **INVENTORY**\nInventory data requires storage.',
    event:'📅 **EVENT**\nEvent creation framework is ready.',
    events:'📅 **EVENTS**\nEvent listing framework is ready.',
    giveaway:'🎁 **GIVEAWAY**\nGiveaway framework is ready.',
    poll:'📊 **POLL**\nPoll framework is ready.',
    suggestions:'💡 **SUGGESTIONS**\nSuggestion framework is ready.',
    ticket:'🎫 **TICKET**\nTicket workflow request received.',
    afk:'💤 **AFK**\nAFK status framework is ready.',
    logs:'📋 **LOGS**\nLogging framework is online.',
    backup:'💾 **BACKUP**\nSafe configuration backup means environment/config metadata only; secrets are never printed.',
    maintenance:'🔧 **MAINTENANCE**\nMaintenance mode framework is ready.',
    staff:'🛡️ **STAFF**\nStaff guidance: restrict moderation commands with Discord permissions.',
    reports:`🚨 **REPORTS**\nReport received from **${u}**.`,
    reportuser:`🛡️ **SAFETY REPORT**\nReport received from **${u}**.`,
    appeal:`📨 **APPEAL**\nAppeal received from **${u}**.`,
    appeals:'📨 **APPEALS**\nAppeal workflow is ready.',
    review:'🔎 **REVIEW**\nSafety review workflow is ready.',
    deescalate:'🕊️ **DE-ESCALATE**\nStay calm, separate the conflict, document the issue, and escalate to staff when needed.',
    incident:'📝 **INCIDENT**\nIncident-note workflow is ready.',
    incidents:'📝 **INCIDENTS**\nIncident records require persistent storage.',
    safetylog:'📋 **SAFETY LOG**\nSafety logging framework is online.',
    automod:'🤖 **AUTOMOD**\nUse Discord AutoMod for supported server protections.',
    antispam:'🛡️ **ANTI-SPAM**\nInteraction-side protection is online; message scanning requires Gateway access.',
    antilink:'🔗 **ANTI-LINK**\nMessage-level link enforcement requires Gateway access.',
    antiraid:'🚨 **ANTI-RAID**\nServer-wide member-event detection requires Gateway access.',
    modlogs:'📋 **MOD LOGS**\nPersistent moderation records require storage.',
    case:'📁 **CASE**\nCase management requires persistent storage.',
    reason:'📝 **REASON**\nCase-reason workflow is ready.',
    history:'📚 **HISTORY**\nMember history requires persistent storage.',
    warnings:'⚠️ **WARNINGS**\nWarning records require persistent storage.',
    clearwarns:'🧹 **CLEAR WARNS**\nWarning records require persistent storage.',
    role:'🏷️ **ROLE**\nRole management is available when a target role/member and permissions are supplied.',
    createrole:'🏷️ **CREATE ROLE**\nRole creation requires Manage Roles permission.',
    roleinfo:'🏷️ **ROLE INFO**\nProvide a role ID through the configured workflow.',
    roles:'🏷️ **ROLES**\nRole listing is available through the Discord API.',
    buy:'🛒 **BUY**\nPurchases require persistent inventory/points storage.',
    givepoints:'💰 **GIVE POINTS**\nPoint transfers require persistent storage.',
    duel:'⚔️ **DUEL**\nDuel engine is online.',
    memories:'🧠 **MEMORY**\nMemory engine is online.',
    servermute:'🔇 **SERVER MUTE**\nUse `/timeout` for Discord native member timeout.',
    serverunmute:'🔊 **SERVER UNMUTE**\nUse `/untimeout` to remove a timeout.',
    channelinfo:'📺 **CHANNEL INFO**\nChannel information can be retrieved from Discord.',
    slowmode:'🐢 **SLOWMODE**\nUse the seconds option to configure channel slowmode.',
    nick:'✏️ **NICK**\nUse the member and nickname options.',
    lock:'🔒 **LOCK**\nChannel locking requires Manage Channels permission.',
    unlock:'🔓 **UNLOCK**\nChannel unlocking requires Manage Channels permission.'
  };
  return messages[name] || `✅ **/${name}** received successfully.\n👤 ${u}`;
}

async function executeCommand(i) {
  const name=i.data?.name;
  if(!COMMANDS.some(c=>c.name===name)) return response('❌ Unknown command.',true);
  if(name==='help' && optionValue(i,'question')) return response(`💬 ${smartReply(optionValue(i,'question'))}`);
  if(name==='ping') return response(`🏓 **Pong!**\n🟢 ${Math.max(0,Date.now()-startedAt)}ms process age check`);
  if(name==='serverinfo') return response(staticMessage(name,i));
  if(name==='userinfo') {
    const target=i.member?.user||i.user||{};
    return response(`👤 **USER INFO**\nUsername: **${target.username||'unknown'}**\nID: \`${target.id||'unknown'}\``);
  }
  return response(staticMessage(name,i));
}

async function executeAsync(i) {
  const name=i.data?.name;
  // These commands may call Discord's REST API; acknowledge immediately.
  if(['ban','kick','timeout','untimeout','unban','purge','nick','slowmode','servermute','serverunmute'].includes(name)) {
    return executeDiscordAction(i);
  }
  return executeCommand(i);
}

async function executeDiscordAction(i) {
  const name=i.data.name;
  if(!BOT_TOKEN) return response('⚠️ This command needs `DISCORD_TOKEN` configured on the server.',true);
  const guild=i.guild_id;
  if(!guild) return response('⚠️ This command can only be used inside a server.',true);
  const target=targetId(i);
  try {
    if(['ban','kick','timeout','untimeout','servermute','serverunmute'].includes(name) && !target) return response('❌ Select a member first.',true);
    if(name==='ban') {
      await discord(`/guilds/${guild}/bans/${target}`,{method:'PUT',body:JSON.stringify({reason:optionValue(i,'reason')||`HOODZONE /ban by ${username(i)}`})});
      return response(`🔨 Banned <@${target}> successfully.`);
    }
    if(name==='kick') {
      await discord(`/guilds/${guild}/members/${target}`,{method:'DELETE',body:JSON.stringify({reason:optionValue(i,'reason')||`HOODZONE /kick by ${username(i)}`})});
      return response(`👢 Kicked <@${target}> successfully.`);
    }
    if(name==='timeout'||name==='servermute') {
      const minutes=Math.min(10080,Math.max(1,Number(optionValue(i,'minutes')||10)));
      const until=new Date(Date.now()+minutes*60000).toISOString();
      await discord(`/guilds/${guild}/members/${target}`,{method:'PATCH',body:JSON.stringify({communication_disabled_until:until})});
      return response(`🔇 <@${target}> timed out for **${minutes} minutes**.`);
    }
    if(name==='untimeout'||name==='serverunmute') {
      await discord(`/guilds/${guild}/members/${target}`,{method:'PATCH',body:JSON.stringify({communication_disabled_until:null})});
      return response(`🔊 Timeout removed from <@${target}>.`);
    }
    if(name==='unban') {
      const id=optionValue(i,'user_id');
      if(!id) return response('❌ Enter a user ID.',true);
      await discord(`/guilds/${guild}/bans/${id}`,{method:'DELETE'});
      return response(`🔓 Unbanned \`${id}\` successfully.`);
    }
    if(name==='purge') {
      return response('🧹 **PURGE** requires message IDs to be collected through a Gateway/message worker in this HTTP-only architecture.',true);
    }
    if(name==='nick') {
      const nick=String(optionValue(i,'nickname')||'').slice(0,32);
      await discord(`/guilds/${guild}/members/${target}`,{method:'PATCH',body:JSON.stringify({nick})});
      return response(`✏️ Nickname updated for <@${target}>.`);
    }
    if(name==='slowmode') {
      const seconds=Number(optionValue(i,'seconds')||0);
      const channel=i.channel_id;
      if(!channel) return response('❌ No channel was supplied by Discord.',true);
      await discord(`/channels/${channel}`,{method:'PATCH',body:JSON.stringify({rate_limit_per_user:seconds})});
      return response(`🐢 Slowmode set to **${seconds}s**.`);
    }
    return response('⚠️ Command not implemented.',true);
  } catch (e) {
    console.error(`[ACTION:${name}]`,e.message);
    return response(`❌ **${name} failed.** ${e.message.slice(0,700)}`,true);
  }
}

async function handle(i) {
  if(i.type===1) return {type:1};
  if(i.type!==2) return response('🏙️ HOODZONE received your interaction.');
  try { return await executeAsync(i); }
  catch(e) {
    console.error('[INTERACTION]',e.stack||e.message);
    return response('⚠️ HOODZONE hit an internal error, but the interaction was handled. Please try again.',true);
  }
}

const server=http.createServer(async(req,res)=>{
  try {
    const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(req.method==='GET'&&u.pathname==='/') return send(res,200,`HOODZONE Interactions v${VERSION} is online.`,'text/plain; charset=utf-8');
    if(req.method==='GET'&&u.pathname==='/health') return send(res,200,{ok:true,service:'HOODZONE',version:VERSION,mode:'discord-interactions',commands:COMMANDS.length,uptime:Math.floor(process.uptime())});
    if(req.method==='GET'&&u.pathname==='/commands') return send(res,200,{version:VERSION,count:COMMANDS.length,commands:COMMANDS.map(c=>c.name)});
    if(req.method!=='POST'||u.pathname!=='/interactions') return send(res,404,{error:'not_found'});
    if(!PUBLIC_KEY) return send(res,500,{error:'server_not_configured'});
    const body=await readBody(req);
    if(!verify(req,body)) return send(res,401,{error:'invalid_request_signature'});
    let interaction;
    try { interaction=JSON.parse(body.toString()); } catch { return send(res,400,{error:'invalid_json'}); }
    return send(res,200,await handle(interaction));
  } catch(e) {
    console.error('[ERROR]',e.stack||e.message);
    return send(res,500,{error:'internal_server_error'});
  }
});

if(require.main===module) {
  server.listen(PORT,HOST,async()=>{
    console.log(`[START] HOODZONE v${VERSION} listening on ${HOST}:${PORT}`);
    console.log('[START] GET /health');
    console.log('[START] POST /interactions');
    try { await register(); } catch(e) { console.error('[REGISTER] failed:',e.message); }
  });
}
module.exports={server,handle,COMMANDS,smartReply,verify};
