// Run the local API and Expo Go together. Secrets stay in the backend process.
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entries = Object.entries(networkInterfaces()).sort(([a],[b]) => Number(/wi-fi|wlan/i.test(b)) - Number(/wi-fi|wlan/i.test(a)));
const ip = entries.flatMap(([,v]) => v || []).find(x => x.family === 'IPv4' && !x.internal && /^(192\.168\.|172\.(1[6-9]|2\d|3[01])\.|10\.)/.test(x.address))?.address;
const expoPort = process.env.EXPO_PORT || '8082';
const env = { ...process.env, EXPO_PORT: expoPort, ...(ip ? { REACT_NATIVE_PACKAGER_HOSTNAME:ip } : {}) };
const children = [];
const launch = (args,cwd) => {
  const child = spawn(process.execPath,args,{cwd,env,stdio:'inherit'});
  children.push(child);
  child.on('error',error => { console.error(error.message); stop(); });
  child.on('exit',code => { if (code) { process.exitCode=code; stop(); } });
};
let stopping = false;
function stop() { if (stopping) return; stopping=true; for (const child of children) child.kill(); }
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,stop);
launch(['--experimental-strip-types',resolve(root,'tools/dev-server.mjs')],root);
launch([resolve(root,'apps/adviser/node_modules/expo/bin/cli'),'start','--go','--lan','--port',expoPort],resolve(root,'apps/adviser'));
console.log(`Expo Go: exp://${ip || 'localhost'}:${expoPort} | API: http://${ip || 'localhost'}:8080`);
