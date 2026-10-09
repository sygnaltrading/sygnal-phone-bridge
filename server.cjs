'use strict';
// Blind relay: account capabilities are checked by SYGNAL; prices stay encrypted end-to-end.
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { WebSocketServer } = require('ws');
function createRelay({ verify, origins, maxRooms = 500 }) {
 const rooms = new Map();
 const server = http.createServer((req,res) => { res.writeHead(req.url === '/healthz' ? 200 : 404, {'Content-Type':'application/json'}); res.end(req.url === '/healthz' ? '{"ok":true}' : '{}'); });
 const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024, verifyClient: ({origin}) => origins.has(origin) });
 const send = (ws,m) => { if (ws?.readyState === 1) { if (ws.bufferedAmount > 4 * 1024 * 1024) return ws.close(4008,'slow receiver'); ws.send(JSON.stringify(m)); } };
 wss.on('connection', ws => {
  let auth, room, peerId, busy = false, frames = 0, windowAt = Date.now();
  const timer = setTimeout(() => ws.close(4001,'authorization timeout'),10000);
  const check = setInterval(async () => { if (!auth) return; if (Date.now() >= new Date(auth.expiresAt).getTime()) return ws.close(4001,'session expired'); try { if (!(await verify(auth.token,true))) ws.close(4001,'access revoked'); } catch { ws.close(4001,'verification unavailable'); } },30000);
  ws.on('message', async raw => {
   if (Date.now() - windowAt > 1000) { frames = 0; windowAt = Date.now(); }
   if (++frames > 300) return ws.close(4008,'message limit');
   let m; try { m = JSON.parse(raw); } catch { return ws.close(4000,'invalid message'); }
   if (!auth) {
    if (busy || m.type !== 'auth' || !/^[A-Za-z0-9_-]{43}$/.test(m.ticket)) return ws.close(4001,'unauthorized');
    busy = true;
    try {
     const a = await verify(m.ticket,false); if (!a || !['phone','connector'].includes(a.role) || !/^[A-Za-z0-9_-]{43}$/.test(a.room)) return ws.close(4001,'unauthorized');
     if (!rooms.has(a.room)) { if (rooms.size >= maxRooms) return ws.close(4008,'capacity'); rooms.set(a.room,{ desktop:null,phones:new Map() }); }
     room = rooms.get(a.room); auth = {...a,token:m.ticket}; clearTimeout(timer);
     if (a.role === 'connector') { room.desktop?.close(4001,'replaced'); room.desktop = ws; send(ws,{type:'ready'}); for (const p of room.phones.values()) send(p,{type:'desktop_online'}); }
     else { if (room.phones.size >= 2) return ws.close(4008,'device limit'); peerId = randomUUID(); room.phones.set(peerId,ws); send(ws,{type:'ready',id:peerId,online:room.desktop?.readyState === 1}); }
    } catch { ws.close(4001,'verification unavailable'); }
    return;
   }
   if (m.type === 'ping') return send(ws,{type:'pong'});
   if (auth.role === 'phone') {
    if (m.type === 'key' && /^[A-Za-z0-9_-]{87}$/.test(m.publicKey)) return send(room.desktop,{type:'key',id:peerId,publicKey:m.publicKey});
    if (m.type === 'encrypted') return send(room.desktop,{type:'encrypted',id:peerId,n:m.n,data:m.data});
   } else if (m.type === 'encrypted' && room.phones.has(m.id)) return send(room.phones.get(m.id),{type:'encrypted',n:m.n,data:m.data});
   ws.close(4000,'unsupported frame');
  });
  ws.on('error',()=>{});
  ws.on('close',()=>{ clearTimeout(timer);clearInterval(check);if(!auth||!room)return;if(auth.role==='connector'&&room.desktop===ws){room.desktop=null;for(const p of room.phones.values())p.close(4001,'computer offline');}else if(peerId){room.phones.delete(peerId);send(room.desktop,{type:'peer_closed',id:peerId});}if(!room.desktop&&!room.phones.size)rooms.delete(auth.room); });
 });
 return { server, close: () => { for(const ws of wss.clients)ws.terminate();wss.close();server.close(); } };
}
if (require.main === module) {
 const site = process.env.SYGNAL_SITE_ORIGIN;
 const allowed = new Set((process.env.ALLOWED_ORIGINS || '').split(','));
 if (!site || !allowed.has(site) || !site.startsWith('https://')) throw Error('Approved site configuration required');
 const verify = async (token, check) => { const r = await fetch(site+'/api/public/phone-bridge-verify',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({check}),signal:AbortSignal.timeout(8000)});return r.ok?r.json():null; };
 createRelay({verify,origins:allowed}).server.listen(Number(process.env.PORT)||8080,'0.0.0.0');
}
module.exports = { createRelay };
