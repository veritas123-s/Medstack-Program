import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { performance } from 'node:perf_hooks';

// Provide an HTTPS origin for a server you own or are authorized to test.
if (!process.argv[2]) throw new Error('Usage: node scripts/capacity/public-probe.mjs <https-origin> [output.json]');
const target = new URL(process.argv[2]);
if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
  throw new Error('Provide an HTTPS origin without credentials, a path, query, or fragment');
}
const base = target.origin;
const output = process.argv[3] || 'test-results/server-capacity/public-probe.json';
const agent = new https.Agent({keepAlive: true, maxSockets: 40});
const quantile = (xs, p) => xs.slice().sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*p)-1)] ?? null;
async function request() {
  const started = performance.now();
  return await new Promise(resolve => {
    const req = https.get(base + '/health', {agent}, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let valid = false;
        try { valid = JSON.parse(body).ok === true; } catch {}
        resolve({status:res.statusCode,ms:performance.now()-started,valid});
      });
    });
    req.setTimeout(5000,()=>req.destroy(new Error('timeout')));
    req.on('error', () => resolve({status:0,ms:performance.now()-started,valid:false}));
  });
}
const report = {time:new Date().toISOString(),base,description:'Bounded public health/TLS burst probe; no authenticated workload',stages:[]};
try {
  for (const concurrency of [1,5,10,20,40,40]) {
    const started = performance.now();
    const samples = await Promise.all(Array.from({length:concurrency},request));
    const statuses = {};
    for (const s of samples) statuses[s.status] = (statuses[s.status] || 0) + 1;
    const row = {concurrency,requests:samples.length,statuses,p50Ms:quantile(samples.map(s=>s.ms),.5),p95Ms:quantile(samples.map(s=>s.ms),.95),elapsedMs:performance.now()-started,valid200:samples.filter(s=>s.status===200&&s.valid).length};
    report.stages.push(row);
    console.log(JSON.stringify(row));
    if (samples.some(s=>s.status===429)) {report.stopReason='Public IP rate limit reached';break;}
    if (samples.some(s=>s.status===0||s.status>=500)) {report.stopReason='Transport/server error';break;}
  }
} finally {
  agent.destroy();
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2));
}
