
(() => {
  'use strict';
  let websocket = null;
  let uuid = null;
  let action = null;
  let context = null;
  const $ = id => document.getElementById(id);
  function parseArgs(){
    const qs = new URLSearchParams(location.search);
    let actionInfo = {};
    try{ actionInfo = JSON.parse(decodeURIComponent(qs.get('actionInfo') || '{}')); }catch(_){}
    return {
      port: qs.get('port') || qs.get('inPort'),
      pluginUUID: qs.get('pluginUUID') || qs.get('uuid'),
      registerEvent: qs.get('registerEvent') || 'registerPropertyInspector',
      action: actionInfo.action || qs.get('action'),
      context: actionInfo.context || qs.get('context') || qs.get('uuid')
    };
  }
  function send(obj){ if(websocket && websocket.readyState === 1) websocket.send(JSON.stringify(obj)); }
  function fill(config){ config=config||{}; $('obsHost').value=config.obsHost||'127.0.0.1'; $('obsPort').value=config.obsPort||'4455'; $('obsPassword').value=config.obsPassword||''; $('commandBusSource').value=config.commandBusSource||'PEPS_CommandBus'; }
  function read(){ return {obsHost:$('obsHost').value.trim()||'127.0.0.1', obsPort:$('obsPort').value.trim()||'4455', obsPassword:$('obsPassword').value, commandBusSource:$('commandBusSource').value.trim()||'PEPS_CommandBus'}; }
  function save(){
    const config = read();
    send({event:'sendToPlugin', action, context, payload:{type:'saveConfig', config}});
    $('status').textContent='บันทึกแล้ว'; $('status').className='ok';
  }
  function handle(msg){
    if(msg.event === 'sendToPropertyInspector' && msg.payload && msg.payload.type === 'config'){
      fill(msg.payload.config);
      if(msg.payload.saved){ $('status').textContent='บันทึกแล้ว'; $('status').className='ok'; }
    }
  }
  window.connectElgatoStreamDeckSocket = function(inPort, inUUID, inRegisterEvent, inInfo, inActionInfo){
    uuid = inUUID;
    websocket = new WebSocket('ws://127.0.0.1:' + inPort);
    websocket.onopen = () => {
      send({event:inRegisterEvent, uuid:inUUID});
      send({event:'sendToPlugin', action, context, payload:{type:'requestConfig'}});
    };
    websocket.onmessage = ev => { try{ handle(JSON.parse(ev.data)); }catch(e){ console.warn(e); } };
  };
  $('save').onclick = save;
  const a = parseArgs(); action=a.action; context=a.context;
  if(a.port && a.pluginUUID) window.connectElgatoStreamDeckSocket(a.port, a.pluginUUID, a.registerEvent);
})();
