
(() => {
  'use strict';
  const DEFAULT_CONFIG = { obsHost:'127.0.0.1', obsPort:'4455', obsPassword:'', commandBusSource:'PEPS_CommandBus' };
  let websocket = null;
  let pluginUUID = null;
  let seq = 0;
  let globalSettings = { ...DEFAULT_CONFIG };
  let obs = { ws:null, connected:false, identified:false, req:0, pending:new Map() };

  function parseArgs(){
    const qs = new URLSearchParams(location.search);
    return {
      port: qs.get('port') || qs.get('inPort'),
      pluginUUID: qs.get('pluginUUID') || qs.get('uuid'),
      registerEvent: qs.get('registerEvent') || 'registerPlugin',
      info: qs.get('info')
    };
  }
  function sdSend(obj){ if(websocket && websocket.readyState === 1) websocket.send(JSON.stringify(obj)); }
  function setTitle(context, title){ sdSend({event:'setTitle', context, payload:{title:String(title||'')}}); }
  function showOk(context){ sdSend({event:'showOk', context}); }
  function showAlert(context){ sdSend({event:'showAlert', context}); }
  function mergeConfig(cfg){ globalSettings = { ...DEFAULT_CONFIG, ...(globalSettings||{}), ...(cfg||{}) }; try{localStorage.setItem('pepslive_streamdeck_config', JSON.stringify(globalSettings));}catch(_){} }
  function loadLocalConfig(){ try{ mergeConfig(JSON.parse(localStorage.getItem('pepslive_streamdeck_config')||'{}')); }catch(_){} }

  async function sha256base64(text){
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  }
  async function obsAuth(password, salt, challenge){
    const secret = await sha256base64(String(password||'') + salt);
    return await sha256base64(secret + challenge);
  }
  function obsUrl(){ return `ws://${globalSettings.obsHost || '127.0.0.1'}:${globalSettings.obsPort || '4455'}`; }
  function obsSend(op,d){ if(!obs.ws || obs.ws.readyState !== 1) throw new Error('OBS not connected'); obs.ws.send(JSON.stringify({op,d})); }
  function obsRequest(requestType, requestData={}){
    return new Promise((resolve,reject)=>{
      const requestId = 'sd_' + (++obs.req) + '_' + Date.now();
      obs.pending.set(requestId, {resolve,reject,t:setTimeout(()=>{obs.pending.delete(requestId);reject(new Error('OBS timeout: '+requestType));}, 5000)});
      obsSend(6,{requestType,requestId,requestData});
    });
  }
  async function connectObs(){
    if(obs.connected && obs.ws && obs.ws.readyState === 1) return true;
    if(obs.ws) try{obs.ws.close();}catch(_){}
    obs.connected=false; obs.identified=false;
    return new Promise((resolve,reject)=>{
      const ws = new WebSocket(obsUrl()); obs.ws = ws;
      ws.onerror = () => reject(new Error('OBS connection error'));
      ws.onclose = () => { obs.connected=false; obs.identified=false; };
      ws.onmessage = async ev => {
        try{
          const msg = JSON.parse(ev.data);
          if(msg.op === 0){
            const identify = {rpcVersion:1};
            const auth = msg.d && msg.d.authentication;
            if(auth && auth.challenge) identify.authentication = await obsAuth(globalSettings.obsPassword||'', auth.salt, auth.challenge);
            obsSend(1, identify);
          }else if(msg.op === 2){
            obs.connected=true; obs.identified=true; resolve(true);
          }else if(msg.op === 7){
            const p = obs.pending.get(msg.d.requestId);
            if(p){
              clearTimeout(p.t); obs.pending.delete(msg.d.requestId);
              const ok = msg.d.requestStatus && msg.d.requestStatus.result;
              ok ? p.resolve(msg.d.responseData || {}) : p.reject(new Error((msg.d.requestStatus && msg.d.requestStatus.comment) || 'OBS request failed'));
            }
          }
        }catch(e){ console.warn(e); }
      };
      setTimeout(()=>{ if(!obs.identified) reject(new Error('OBS identify timeout')); }, 7000);
    });
  }
  async function ensureCommandBus(){
    const name = globalSettings.commandBusSource || 'PEPS_CommandBus';
    try{ await obsRequest('GetInputSettings', {inputName:name}); return; }catch(_){ }
    let sceneName = '';
    try{ const r = await obsRequest('GetCurrentProgramScene'); sceneName = r.currentProgramSceneName || r.sceneName || ''; }catch(_){ }
    if(!sceneName) throw new Error('No current scene');
    try{ await obsRequest('CreateInput',{sceneName,inputName:name,inputKind:'text_gdiplus_v3',inputSettings:{text:''},sceneItemEnabled:false}); }
    catch(e){ /* source may already exist or text kind may differ */ }
  }
  async function sendCommandToDock(command){
    await connectObs();
    await ensureCommandBus();
    const payload = { id:'sd-' + Date.now() + '-' + (++seq), source:'streamdeck', ...command };
    await obsRequest('SetInputSettings', {inputName:globalSettings.commandBusSource || 'PEPS_CommandBus', inputSettings:{text:JSON.stringify(payload)}, overlay:true});
    return payload;
  }
  async function handleKeyUp(ev){
    const meta = (window.PEPSLIVE_ACTIONS || {})[ev.action];
    if(!meta){ showAlert(ev.context); return; }
    try{
      const payload = await sendCommandToDock(meta.command);
      setTitle(ev.context, meta.title || 'OK');
      showOk(ev.context);
      console.log('PepsLive command sent', payload);
    }catch(e){
      console.error(e);
      setTitle(ev.context, 'OBS ERR');
      showAlert(ev.context);
    }
  }
  function handleMessage(msg){
    if(msg.event === 'keyUp') handleKeyUp(msg);
    else if(msg.event === 'didReceiveGlobalSettings') mergeConfig(msg.payload && msg.payload.settings);
    else if(msg.event === 'sendToPlugin'){
      const p = msg.payload || {};
      if(p.type === 'saveConfig'){
        mergeConfig(p.config || {});
        sdSend({event:'setGlobalSettings', context:pluginUUID, payload:globalSettings});
        sdSend({event:'sendToPropertyInspector', action:msg.action, context:msg.context, payload:{type:'config', config:globalSettings, saved:true}});
      }else if(p.type === 'requestConfig'){
        sdSend({event:'sendToPropertyInspector', action:msg.action, context:msg.context, payload:{type:'config', config:globalSettings}});
      }
    }
  }
  window.connectElgatoStreamDeckSocket = function(inPort, inPluginUUID, inRegisterEvent, inInfo){
    pluginUUID = inPluginUUID;
    websocket = new WebSocket('ws://127.0.0.1:' + inPort);
    websocket.onopen = () => {
      sdSend({event:inRegisterEvent, uuid:inPluginUUID});
      sdSend({event:'getGlobalSettings', context:inPluginUUID});
    };
    websocket.onmessage = ev => { try{ handleMessage(JSON.parse(ev.data)); }catch(e){ console.warn(e); } };
  };
  loadLocalConfig();
  const a = parseArgs();
  if(a.port && a.pluginUUID) window.connectElgatoStreamDeckSocket(a.port, a.pluginUUID, a.registerEvent, a.info);
})();
