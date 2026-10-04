// Run with Node >=24 against the deployed repository; uses only a fresh test DB.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

const repo = path.resolve(process.argv[2] || '.');
const output = path.resolve(process.argv[3] || 'test-results/server-capacity/isolated');
const smallRun = process.argv.includes('--smoke');
const origin = 'https://capacity.synthetic.invalid';
const secret = 'isolated-capacity-only-0000000000000000000000';
const password = 'SyntheticCapacity123!';
const port = Number(process.env.CAPACITY_PORT || 4319);
const users = smallRun ? 10 : 400;
const imports = async relative => import(pathToFileURL(path.join(repo,relative)).href);
const q = (xs,p) => xs.slice().sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*p)-1)] || 0;
const cpuSnapshot = () => os.cpus().map(x=>x.times);
function cpuPercent(a,b) {
  let idle=0,total=0;
  for(let i=0;i<b.length;i++) for(const key of Object.keys(b[i])) {const d=b[i][key]-a[i][key];total+=d;if(key==='idle')idle+=d;}
  return Math.round(1000*(1-idle/total))/10;
}
if (process.argv.includes('--worker')) {
  fs.mkdirSync(output,{recursive:true});
  const database=path.join(output,'synthetic.sqlite');
  if(fs.existsSync(database)) throw Error('Use a new output directory; never reuse a database');
  const {createBackend}=await imports('server/backend.mjs');
  const {cloudDocument}=await imports('src/cloud-data.mjs');
  const {initialState,taskInput}=await imports('src/domain.mjs');
  const b=await createBackend({database,baseURL:origin,secret,sendEmail:async()=>{throw Error('Real mail forbidden in capacity test');}});
  const doc=cloudDocument(initialState());
  doc.tasks=Array.from({length:160},(_,i)=>taskInput({title:'Synthetic task '+i,quadrant:'plan',notes:'x'.repeat(280)}));
  const document=JSON.stringify(doc);
  const context=await b.auth.$context;
  const hash=await context.password.hash(password);
  const tokens=[];
  const now=Date.now();
  b.db.exec('BEGIN');
  try {
    const user=b.db.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)');
    const session=b.db.prepare('INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)');
    const account=b.db.prepare('INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)');
    const snapshot=b.db.prepare('INSERT INTO medstack_snapshots(uid,version,document,updated_at) VALUES(?,1,?,?)');
    for(let i=0;i<users;i++) {
      const id='capacity-'+i,token=crypto.randomBytes(24).toString('hex');
      user.run(id,'Synthetic',id+'@synthetic.invalid',now,now);
      session.run('session-'+i,now+3600000,token,now,now,id);
      account.run('account-'+i,id,'credential',id,hash,now,now);
      snapshot.run(id,document,now-10000);
      tokens.push(encodeURIComponent(token+'.'+crypto.createHmac('sha256',secret).update(token).digest('base64')));
    }
    b.db.exec('COMMIT');
  } catch(e) {b.db.exec('ROLLBACK');throw e;}
  const loop=monitorEventLoopDelay({resolution:20});loop.enable();
  let finished=0;
  const counts=new Map();
  const server=http.createServer(async(req,res)=>{
    try {
      const client=req.headers['x-medstack-client-ip']||req.socket.remoteAddress;
      const t=Date.now();let entry=counts.get(client);
      if(!entry||t-entry.t>60000){entry={t,n:0};counts.set(client,entry);}
      if(++entry.n>100){res.writeHead(429);res.end('{}');return;}
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>850*1024){res.writeHead(413);res.end('{}');return;}chunks.push(chunk);}
      const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(typeof v==='string'&&!['host','connection','content-length'].includes(k))headers.set(k,v);
      const r=await b.handle(new Request(origin+req.url,{method:req.method,headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})}));
      res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));finished++;
    }catch{res.writeHead(500);res.end('{}');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  process.on('message',m=>{
    if(m==='stats'){process.send({type:'stats',rssMB:Math.round(process.memoryUsage().rss/1048576),loopP95Ms:Math.round(loop.percentile(95)/1e6),loopMaxMs:Math.round(loop.max/1e6),finished});loop.reset();}
    if(m==='stop'){server.close(()=>{loop.disable();b.close();process.exit(0);});server.closeAllConnections();}
  });
  process.send({type:'ready',tokens,doc,documentBytes:Buffer.byteLength(document)});
} else {
  fs.mkdirSync(output,{recursive:true});
  const report={time:new Date().toISOString(),host:os.hostname(),node:process.version,cpus:os.cpus().length,totalMemoryMB:Math.round(os.totalmem()/1048576),baselineFreeMB:Math.round(os.freemem()/1048576),method:'Deployed backend, production testMode=false; isolated synthetic DB; HTTP loopback; separate generator on same host; no TLS/public bandwidth or real SMTP',stages:[]};
  const hashes={};for(const f of ['server/backend.mjs','server/index.mjs','server/package-lock.json'])if(fs.existsSync(path.join(repo,f)))hashes[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,f))).digest('hex');report.sourceHashes=hashes;
  const child=fork(fileURLToPath(import.meta.url),[repo,output,'--worker',...(smallRun?['--smoke']:[])],{stdio:['ignore','ignore','pipe','ipc']});
  const emergency=setTimeout(()=>child.kill(),360000);emergency.unref();
  let childError='';child.stderr.on('data',c=>childError+=c.toString());
  const agent=new http.Agent({keepAlive:true,maxSockets:users+4});
  const waitMessage=type=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.off('message',listener);reject(Error('Worker timeout: '+type));},30000);const listener=m=>{if(m.type===type){clearTimeout(timer);child.off('message',listener);resolve(m);}};child.on('message',listener);child.once('exit',code=>{clearTimeout(timer);reject(Error('Worker exited '+code));});});
  const request=async(route,body,token,ip)=>{
    const start=performance.now();return new Promise(resolve=>{
      const data=body===undefined?undefined:JSON.stringify(body);
      const req=http.request({hostname:'127.0.0.1',port,path:route,method:data?'POST':'GET',agent,headers:{Origin:origin,'Content-Type':'application/json',...(data?{'Content-Length':Buffer.byteLength(data)}:{}),...(token?{Authorization:'Bearer '+token}:{}),'x-medstack-client-ip':ip?.startsWith('user-') ? '10.20.'+Math.floor(Number(ip.slice(5))/250)+'.'+(Number(ip.slice(5))%250+1) : ip?.startsWith('login-') ? '10.21.'+Math.floor(Number(ip.slice(6))/250)+'.'+(Number(ip.slice(6))%250+1) : '10.22.0.1'}},res=>{
        const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{let parsed;try{parsed=JSON.parse(Buffer.concat(chunks));}catch{}resolve({status:res.statusCode,ms:performance.now()-start,data:parsed,bytes:chunks.reduce((s,c)=>s+c.length,0)});});
      });req.setTimeout(5000,()=>req.destroy());req.on('error',()=>resolve({status:0,ms:performance.now()-start}));if(data)req.write(data);req.end();
    });
  };
  async function productionHealth(){try{const t=performance.now();const r=await fetch('http://127.0.0.1:4318/health',{signal:AbortSignal.timeout(2000)});const d=await r.json();return {ok:r.status===200&&d.ok===true,ms:Math.round(performance.now()-t),version:d.version};}catch{return {ok:false};}}
  try {
    const ready=await waitMessage('ready');report.documentBytes=ready.documentBytes;
    const check=await request('/api/sync',{action:'pull'},ready.tokens[0],'fixture');
    if(check.status!==200||check.data?.version!==1||check.data?.document?.tasks?.length!==160)throw Error('Signed synthetic session fixture failed: '+check.status+' '+(check.data?.error||check.data?.code||'unexpected shape'));
    const unauth=await request('/api/sync',{action:'pull'},undefined,'unauth');if(unauth.status!==401)throw Error('Authentication bypass detected');
    report.fixtureChecks={signedSession:true,anonymousRejected:true};
    report.productionBefore=await productionHealth();
    const versions=Array(users).fill(1);
    for(const n of (smallRun?[10]:[10,25,50,100,200,400])) {
      if(!smallRun&&os.freemem()<128*1048576){report.stopReason='Free memory below 128 MB';break;}
      const duration=smallRun?16000:16000;
      const samples=[],resources=[],health=[];const before=cpuSnapshot(),start=performance.now();let stop=false;
      const probe=setInterval(async()=>{resources.push(Math.round(os.freemem()/1048576));const h=await productionHealth();health.push(h);if(!smallRun&&(!h.ok||h.ms>1000))stop=true;},2000);
      await Promise.all(Array.from({length:n},async(_,i)=>{
        await sleep((i/n)*1000);let cycle=0;
        while(performance.now()-start<duration&&!stop){
          const tick=performance.now();const phase=cycle++%4;
          const r=phase===1?await request('/api/auth/get-session',undefined,ready.tokens[i],'user-'+i):await request('/api/sync',phase===3?{action:'push',version:versions[i],document:ready.doc}:{action:'pull'},ready.tokens[i],'user-'+i);
          const valid=r.status===200&&(phase===1?!!r.data?.user?.id:phase===3?Number.isInteger(r.data?.version)&&!r.data?.conflict:r.data?.document?.tasks?.length===160);
          if(valid&&phase===3)versions[i]=r.data.version;
          samples.push({ms:r.ms,status:r.status,valid,phase,bytes:r.bytes||0});
          await sleep(Math.max(0,1000-(performance.now()-tick)));
        }
      }));clearInterval(probe);
      const statsPromise=waitMessage('stats');child.send('stats');const stats=await statsPromise;
      const elapsed=performance.now()-start;const statuses={};for(const s of samples)statuses[s.status]=(statuses[s.status]||0)+1;
      const errors=samples.filter(s=>!s.valid).length;
      const row={scenario:'mixed-sync',users:n,seconds:Math.round(elapsed/100)/10,requests:samples.length,rps:Math.round(samples.length/elapsed*10000)/10,p50Ms:Math.round(q(samples.map(s=>s.ms),.5)),p95Ms:Math.round(q(samples.map(s=>s.ms),.95)),p99Ms:Math.round(q(samples.map(s=>s.ms),.99)),errors,statuses,cpuPercent:cpuPercent(before,cpuSnapshot()),minFreeMB:Math.min(Math.round(os.freemem()/1048576),...resources),responseMB:Math.round(samples.reduce((s,x)=>s+x.bytes,0)/1048576*10)/10,worker:stats,productionHealthMaxMs:Math.max(0,...health.map(x=>x.ms||2000)),productionHealthOk:health.every(x=>x.ok)};
      report.stages.push(row);console.log(JSON.stringify(row));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
      if(stop||errors/samples.length>.01||row.p95Ms>1000||row.minFreeMB<128){report.stopReason='Capacity or service-protection threshold reached';break;}
      await sleep(smallRun?0:3500);
    }
    // Bounded password-hashing bursts; each synthetic user has a unique test IP.
    for(const n of (smallRun?[1]:[1,5,10,20])){
      const start=performance.now(),before=cpuSnapshot();
      const results=await Promise.all(Array.from({length:n},(_,i)=>request('/api/auth/sign-in/email',{email:'capacity-'+i+'@synthetic.invalid',password},undefined,'login-'+(n*100+i))));
      const row={scenario:'login-burst',users:n,requests:n,elapsedMs:Math.round(performance.now()-start),p50Ms:Math.round(q(results.map(x=>x.ms),.5)),p95Ms:Math.round(q(results.map(x=>x.ms),.95)),errors:results.filter(x=>x.status!==200||!x.data?.user?.id).length,statuses:results.map(x=>x.status),cpuPercent:cpuPercent(before,cpuSnapshot()),freeMB:Math.round(os.freemem()/1048576)};
      report.stages.push(row);console.log(JSON.stringify(row));if(row.errors||row.p95Ms>3000||row.freeMB<128)break;await sleep(2000);
    }
  } catch(e){report.error=e.message;console.log(JSON.stringify({error:e.message}));process.exitCode=1;}
  finally {
    agent.destroy();if(child.connected)child.send('stop');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(3000)]);if(child.exitCode===null)child.kill();clearTimeout(emergency);
    report.productionAfter=await productionHealth();report.finishedAt=new Date().toISOString();
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({complete:!report.error,stopReason:report.stopReason,productionAfter:report.productionAfter}));
  }
}
