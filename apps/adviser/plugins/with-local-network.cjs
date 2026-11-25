const {withAndroidManifest,withDangerousMod,withAppBuildGradle}=require('expo/config-plugins');
const fs=require('node:fs');const path=require('node:path');
const api=process.env.EXPO_PUBLIC_API_URL;
let apiHost='';
if(api){
  const u=new URL(api);
  if(!['http:','https:'].includes(u.protocol)) throw Error('Invalid API URL');
  apiHost=u.protocol==='http:' ? u.hostname : '';
  if(apiHost && !['localhost','127.0.0.1'].includes(apiHost) && !isPrivateIpv4(apiHost)) throw Error('HTTP API must use a local address');
}
function isPrivateIpv4(host){
  const p=host.split('.').map(Number);
  return p.length===4 && p.every(x=>Number.isInteger(x)&&x>=0&&x<=255) &&
    (p[0]===10 || (p[0]===192&&p[1]===168) || (p[0]===172&&p[1]>=16&&p[1]<=31));
}
function escapeXml(value){
  return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);
}
module.exports=config=>{config=withAppBuildGradle(config,c=>{if(!c.modResults.contents.includes('CMAKE_OBJECT_PATH_MAX')) c.modResults.contents+='\nandroid { defaultConfig { externalNativeBuild { cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=240" } } } }\n';return c;});config=withAndroidManifest(config,c=>{const app=c.modResults.manifest.application[0];app.$['android:usesCleartextTraffic']='false';app.$['android:allowBackup']='false';app.$['android:networkSecurityConfig']='@xml/lua_network';return c;});return withDangerousMod(config,['android',async c=>{const dir=path.join(c.modRequest.platformProjectRoot,'app/src/main/res/xml');fs.mkdirSync(dir,{recursive:true});const domains=[...new Set(['localhost','127.0.0.1','10.0.2.2',...(apiHost?[apiHost]:[])])].map(d=>`<domain includeSubdomains="false">${escapeXml(d)}</domain>`).join('');fs.writeFileSync(path.join(dir,'lua_network.xml'),`<network-security-config><base-config cleartextTrafficPermitted="false"/><domain-config cleartextTrafficPermitted="true">${domains}</domain-config></network-security-config>`);return c;}]);};
