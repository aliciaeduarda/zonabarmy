const $=(s)=>document.querySelector(s),$$=(s)=>document.querySelectorAll(s);
const BRL=n=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const STORE='zb_barmyzone_v5_';
const SUPABASE_URL='https://oxgkehgkndfrblgdvmvy.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_5Bq2nVQWYOjtIutu99PGKQ_qZELKw_J';
const supa=(window.supabase&&window.supabase.createClient)?window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}}):null;
let cloudCache={};
let syncingFromCloud=false;
let saveTimers={};
let saveInFlight={};
function toast(msg){console.warn(msg); const box=document.querySelector('#saveStatus')||document.querySelector('.admin-content'); if(box){let t=document.querySelector('#autoSaveToast'); if(!t){t=document.createElement('div');t.id='autoSaveToast';t.className='save-toast';document.body.appendChild(t)} t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600)}}
function setSaveStatus(msg,kind='saving'){
  const el=document.querySelector('#saveStatus');
  if(el){el.textContent=msg;el.className='save-status '+kind}
}
async function cloudSaveNow(k,v){
  if(!supa){setSaveStatus('Supabase não carregou: nada foi salvo online.','error');return false;}
  if(syncingFromCloud)return true;
  if(saveInFlight[k]){ clearTimeout(saveTimers[k]); saveTimers[k]=setTimeout(()=>cloudSaveNow(k,cloudCache[k]),700); return true; }
  saveInFlight[k]=true; setSaveStatus('Salvando no Supabase...','saving');
  try{
    const {data:{session}}=await supa.auth.getSession();
    const row={key:k,value:v,updated_at:new Date().toISOString()};
    if(session?.user?.id) row.updated_by=session.user.id;
    const {error}=await supa.from('barmy_store').upsert(row,{onConflict:'key'});
    if(error)throw error;
    setSaveStatus('Salvo no Supabase.','ok');
    return true;
  }catch(e){
    console.error('Erro ao salvar no Supabase:',e?.message||e);
    setSaveStatus('Erro ao salvar. Rode o SQL novo e confira login/Storage.','error');
    toast('Erro ao salvar no Supabase: '+(e?.message||e));
    return false;
  }finally{saveInFlight[k]=false;}
}
function cloudSave(k,v,delay=650){
  clearTimeout(saveTimers[k]);
  saveTimers[k]=setTimeout(()=>cloudSaveNow(k,v),delay);
  return true;
}
const LS={
  get(k,d){return Object.prototype.hasOwnProperty.call(cloudCache,k)?cloudCache[k]:d},
  set(k,v){cloudCache[k]=v;cloudSave(k,v)},
  saveNow(k,v){cloudCache[k]=v;return cloudSaveNow(k,v)},
  clear(){cloudCache={}; if(supa) supa.from('barmy_store').delete().neq('key','__keep__')}
};
async function syncFromSupabase(){
  if(!supa)return false;
  try{
    const {data,error}=await supa.from('barmy_store').select('key,value');
    if(error)throw error;
    syncingFromCloud=true;
    cloudCache={};
    (data||[]).forEach(row=>{cloudCache[row.key]=row.value});
    const {data:{session}}=await supa.auth.getSession();
    if(session){
      const res=await supa.from('barmy_project_submissions').select('*').order('created_at',{ascending:false});
      if(!res.error && Array.isArray(res.data)){
        const current=Array.isArray(cloudCache.projects)?cloudCache.projects:[];
        const ids=new Set(current.map(p=>String(p.id)));
        res.data.forEach(row=>{ if(!ids.has(String(row.id))) current.unshift({id:row.id,title:row.title,type:row.type,desc:row.description,date:row.event_date,time:row.event_time,address:row.address,lat:Number(row.lat),lng:Number(row.lng),link:row.link,status:row.status||'pending'}); });
        cloudCache.projects=current;
      }
    }
    syncingFromCloud=false;
    return true;
  }catch(e){console.error('Erro ao carregar Supabase:',e?.message||e);syncingFromCloud=false;return false;}
}
function seedDefaultsInCache(){
  for(const k in defaults){ if(!Object.prototype.hasOwnProperty.call(cloudCache,k)) cloudCache[k]=typeof structuredClone==='function'?structuredClone(defaults[k]):JSON.parse(JSON.stringify(defaults[k])); }
  cloudCache.mapConfig={...defaults.mapConfig,...(cloudCache.mapConfig||{})};
  if(!cloudCache.mobilityRoads) cloudCache.mobilityRoads=[
    {id:1,name:'Av. Jorge João Saad',status:'atenção',hours:'Ajustar no dia do show',desc:'Possível fluxo intenso por ser via próxima ao estádio. Confirmar bloqueios oficiais.',points:[[-23.5978,-46.7177],[-23.5991,-46.7187],[-23.6004,-46.7199]],active:true},
    {id:2,name:'Praça Roberto Gomes Pedrosa',status:'atenção',hours:'Antes e após o show',desc:'Área de grande circulação de público. Pode ter bloqueios e orientação de segurança.',points:[[-23.5990,-46.7209],[-23.6000,-46.7202],[-23.6011,-46.7197]],active:true},
    {id:3,name:'Av. Giovanni Gronchi',status:'livre',hours:'Monitorar no dia',desc:'Via importante para chegada e saída por carro de app. Status editável pelo ADM.',points:[[-23.6034,-46.7248],[-23.6024,-46.7233],[-23.6010,-46.7217]],active:true}
  ];
  if(!cloudCache.mobilityCards) cloudCache.mobilityCards=[
    {id:1,title:'Horários da estação',tag:'metrô',desc:'Atualize aqui o primeiro/último trem, funcionamento especial e avisos da Linha 4–Amarela.',active:true},
    {id:2,title:'Pontos para motorista de app',tag:'app',desc:'Recomende pontos mais afastados da porta principal, iluminados e com fluxo de pessoas.',active:true},
    {id:3,title:'Bloqueios e vias',tag:'trânsito',desc:'Use este card para informar bloqueios oficiais, desvios, interdições e ruas de atenção.',active:true}
  ];
}
function refreshCurrentPage(){
  try{
    if($('#siteTitle'))home();
    if($('#map')&&typeof map!=='undefined'&&map){renderMapMode(document.querySelector('.map-tabs .tab.active')?.dataset.mapTab||'projects')}
    if($('#mobilityMap')) mobilityPage();
    if($('#checklist'))checklist();
    if($('#calcRows'))calc();
    if($('#linksGrid'))links();
    if($('#detailTitle'))linkDetail();
    if($('#adminApp')&&!$('#adminApp').classList.contains('hidden')){renderAdmin();installMobilityAdmin();installStadiumAdmin();}
  }catch(e){console.warn('Refresh failed',e)}
}
const streetIframe=`<iframe src="https://www.google.com/maps/embed?pb=!4v1781365913365!6m8!1m7!1syTG4WNbAxDUpQLSpE7Kozw!2m2!1d-23.59951507102524!2d-46.72035254719943!3f169.35023883328154!4f0.08125900793513097!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
const morumbi=[-23.60002,-46.72016];
const defaults={
 settings:{site:'Zona BARMY',intro:'Central colaborativa para organizar projetos, rotas, checklists e todas as informações para os shows do BTS no MorumBIS.',shows:[['28/10/2026','Show 1','2026-10-28T20:00:00'],['30/10/2026','Show 2','2026-10-30T20:00:00'],['31/10/2026','Show 3','2026-10-31T20:00:00']]},
 projects:[{id:1,title:'MorumBIS',type:'Estádio',desc:'Local dos shows em São Paulo.',date:'28, 30 e 31/10',time:'20:00',address:'Praça Roberto Gomes Pedrosa, 1 - Morumbi',lat:-23.60002,lng:-46.72016,status:'approved',featured:true}],
 gates:[{id:1,name:'Portão 15-A',sectors:'Setores superiores e áreas indicadas no mapa de acesso',desc:'Entrada de referência para organização. Confirme sempre no mapa oficial do evento.',sectorDetails:'Este portão dá acesso aos setores destacados na imagem. Use como guia visual para entender a região do estádio antes de sair.',arrivalTip:'Chegue com antecedência e confira se o show usará este acesso.',gatePhoto:'assets/img/setores-portao-15a.png',sectorImage:'assets/img/setores-portao-15a.png',lat:-23.5988,lng:-46.7197,active:true},{id:2,name:'Portão 4',sectors:'Setores a confirmar no mapa oficial do evento',desc:'Portão de referência. Atualize foto e setores pelo ADM.',sectorDetails:'Adicione aqui a imagem dos setores que este portão acessa.',arrivalTip:'Use somente como referência até sair o mapa oficial.',gatePhoto:'',sectorImage:'',lat:-23.6007,lng:-46.7210,active:true},{id:3,name:'Portão 5',sectors:'Setores a confirmar no mapa oficial do evento',desc:'Portão de referência.',sectorDetails:'Adicione aqui a imagem dos setores que este portão acessa.',arrivalTip:'Confirme entrada e fluxo no dia do show.',gatePhoto:'',sectorImage:'',lat:-23.6016,lng:-46.7192,active:true}],
 stations:[{id:1,name:'São Paulo–Morumbi',line:'Linha 4–Amarela',desc:'Estação mais usada como referência para chegar ao MorumBIS.',lat:-23.5867,lng:-46.7238,active:true},{id:2,name:'Butantã',line:'Linha 4–Amarela',desc:'Estação anterior, útil para reorganizar rotas em horários cheios.',lat:-23.5719,lng:-46.7088,active:true},{id:3,name:'Vila Sônia',line:'Linha 4–Amarela',desc:'Opção para algumas rotas de chegada/saída.',lat:-23.5890,lng:-46.7377,active:true},{id:4,name:'Morumbi',line:'Linha 9–Esmeralda',desc:'Estação CPTM distante; confira integração e rota antes de usar.',lat:-23.6221,lng:-46.7016,active:true}],
 appPoints:[{id:1,name:'Ponto de app — Av. Jorge João Saad',desc:'Ponto sugerido mais afastado da porta principal. Confirme segurança e bloqueios no dia.',lat:-23.5985,lng:-46.7164,active:true},{id:2,name:'Ponto de app — Giovanni Gronchi',desc:'Sugestão para evitar multidão na saída. Ajuste conforme trânsito.',lat:-23.6029,lng:-46.7231,active:true}],
 lines:[{id:1,name:'Linha 4–Amarela',color:'#ffd400',points:[[-23.5719,-46.7088],[-23.5867,-46.7238],[-23.5890,-46.7377]],active:true},{id:2,name:'Caminhada São Paulo–Morumbi → MorumBIS (por ruas)',color:'#ff4fd8',points:[[-23.5867,-46.7238],[-23.5881,-46.7233],[-23.5906,-46.7224],[-23.5931,-46.7218],[-23.5957,-46.7212],[-23.5982,-46.7207],[-23.60002,-46.72016]],active:true}],
 checklist:['Ingresso digital salvo no celular','Documento de identidade','Power bank carregado','ARMY Bomb / lightstick','Screenshot da rota offline','Garrafa de água permitida','Capa de chuva','Cartão e dinheiro para emergências','Remédios de uso necessário'],
 links:[{title:'Itens essenciais',url:'',desc:'Lista de produtos úteis para viagem e show. Abra o card para ver foto e produtos.',img:'',products:[{name:'Powerbank',desc:'Exemplo de produto com link editável.',url:'',img:''},{name:'Capa de chuva',desc:'Item útil para fila e deslocamento.',url:'',img:''}]},{title:'Guia oficial do evento',url:'',desc:'Adicione aqui links oficiais quando saírem.',img:'',products:[]}],
 guide:{peak:'Picos costumam acontecer 2h antes da abertura dos portões, 2h antes do show e logo após o encerramento. Ajuste os horários conforme a produtora divulgar.',app:'Evite pedir carro exatamente na porta do estádio. Combine pontos em ruas mais afastadas, iluminadas e com movimento.',useful:'Leve documento, carregador, água se permitida, capa de chuva e dinheiro/cartão reserva. Confira sempre as regras oficiais do evento.',security:'Não compartilhe localização em tempo real publicamente. Ande em grupo quando possível e priorize caminhos movimentados.',routes:'Prefira metrô até a Linha 4–Amarela e finalize com caminhada. Salve rotas antes de sair.',gates:'Os portões de shows podem ser diferentes dos portões usados em jogos no MorumBIS. Use os marcadores apenas como referência até sair o mapa oficial do evento.',traffic:'Em dias de show pode haver bloqueios, filas, trânsito intenso e mudanças de acesso no entorno do estádio.'},
 mapConfig:{tabProjects:'Projetos aprovados + MorumBIS + rotas até cada localização.',tabArrival:'Metrô, linhas, estações, pontos de app, ônibus e caminhos sugeridos até o MorumBIS.',tabStreet:'Veja o MorumBIS por dentro/ao redor pelo Street View incorporado do Google Maps.',tabGeneral:'Tudo junto: projetos, MorumBIS, portões, metrô, linhas, pontos de app, avisos e legenda.',tabMobility:'Mapa separado com ruas que podem fechar, pontos de app, estações, status de trânsito e avisos em cards.',sideProjects:'Projetos aprovados e estádio com botões de rota.',sideArrival:'Chegada ao MorumBIS com metrô, portões de referência, pontos de app e caminhada.',sideStreet:'Tour 360° do MorumBIS dentro do site.',sideGeneral:'Visão completa para planejar o dia do show.',sideMobility:'Mobilidade e trânsito com ruas de atenção, pontos de app, estações, cards editáveis e avisos rápidos.',streetIframe,metroInfo:'Linha 4–Amarela: use a Estação São Paulo–Morumbi como referência principal. Confira operação e horários oficiais antes de sair.',gatesInfo:'Portões marcados são referências aproximadas. Shows podem usar acessos diferentes dos jogos; atualize assim que o mapa oficial for divulgado.',appInfo:'Prefira chamar motorista de app longe da porta principal, em vias iluminadas e com movimento.'},
 stadiumMedia:{intro:'Veja as visões 360° do MorumBIS por dentro. Escolha uma visão e navegue pelo Street View dentro do site.',views:[{id:1,title:'Visão 1',desc:'Arquibancada / visão 360°',iframe:'<iframe src="https://www.google.com/maps/embed?pb=!4v1781549679704!6m8!1m7!1sCAoSHENJQUJJaERRaUFlR1JqclY3TTFpM1BfM2RIakI.!2m2!1d-23.60008396757206!2d-46.72003697192446!3f139.49311776319743!4f-3.8641571725345187!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>',active:true},{id:2,title:'Visão 2',desc:'Arquibancada / visão 360°',iframe:'<iframe src="https://www.google.com/maps/embed?pb=!4v1781549735795!6m8!1m7!1sCAoSFkNJSE0wb2dLRUlDQWdJREU5dWZTVUE.!2m2!1d-23.60056921817801!2d-46.72086430109309!3f38.29015291437895!4f-12.713332617144403!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>',active:true},{id:3,title:'Visão 3',desc:'Arquibancada / visão 360°',iframe:'<iframe src="https://www.google.com/maps/embed?pb=!4v1781549791922!6m8!1m7!1sCAoSF0NJSE0wb2dLRUlDQWdJREUzNTIzMWdF!2m2!1d-23.59951250224981!2d-46.71960118778829!3f153.72671143655728!4f-9.966227417516052!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>',active:true},{id:4,title:'Visão 4',desc:'Arquibancada / visão 360°',iframe:'<iframe src="https://www.google.com/maps/embed?pb=!4v1781549844598!6m8!1m7!1sCAoSFkNJSE0wb2dLRUlDQWdJRDJ6ZHlDYkE.!2m2!1d-23.59920657215923!2d-46.7202723810088!3f171.0001456968817!4f5.23110623126594!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>',active:true},{id:5,title:'Visão 5',desc:'Arquibancada / visão 360°',iframe:'<iframe src="https://www.google.com/maps/embed?pb=!4v1781549931895!6m8!1m7!1sCAoSFkNJSE0wb2dLRUlDQWdJQ0VxTWF0S0E.!2m2!1d-23.60045222954539!2d-46.72099823264786!3f56.065582479789285!4f-6.9885201281084335!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>',active:true},{id:6,title:'Visão 6',desc:'Arquibancada / visão 360°',iframe:'<iframe src="https://www.google.com/maps/embed?pb=!4v1781550003865!6m8!1m7!1sCAoSF0NJSE0wb2dLRUlDQWdJQzhrS2llcGdF!2m2!1d-23.59820082556567!2d-46.71979957271793!3f305.7632267472721!4f-20.078976336792763!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>',active:true},{id:7,title:'Visão 7',desc:'Arquibancada / visão 360°',iframe:'<iframe src="https://www.google.com/maps/embed?pb=!4v1781550056479!6m8!1m7!1sCAoSF0NJSE0wb2dLRUlDQWdJRDJ6ZHpzaFFF!2m2!1d-23.59915902071402!2d-46.71998999348957!3f180.10993800558037!4f-7.995697182190682!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>',active:true},{id:8,title:'Visão 8',desc:'Arquibancada / visão 360°',iframe:'<iframe src="https://www.google.com/maps/embed?pb=!4v1781550238158!6m8!1m7!1sCAoSFkNJSE0wb2dLRUlDQWdJRHFnTi1LVGc.!2m2!1d-23.60024586227103!2d-46.72095287583124!3f260.95780398912393!4f-3.278765597544762!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>',active:true},{id:9,title:'Visão 9',desc:'Arquibancada / visão 360°',iframe:'<iframe src="https://www.google.com/maps/embed?pb=!4v1781550343374!6m8!1m7!1sCAoSF0NJSE0wb2dLRUlDQWdJRGNsNnoyaGdF!2m2!1d-23.60047486435177!2d-46.71983526733883!3f199.56970340221554!4f-5.953265220646728!5f0.7820865974627469" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>',active:true}]}
};
seedDefaultsInCache();
function esc(v){return String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function nav(){let p=location.pathname.split('/').pop()||'index.html';$$('.menu a').forEach(a=>{if(a.getAttribute('href')===p)a.classList.add('active')})}nav();
function renderCountdowns(){const el=$('#countdowns');if(!el)return;const s=LS.get('settings',defaults.settings);function tick(){el.innerHTML=s.shows.map(([date,name,iso])=>{let diff=Math.max(0,new Date(iso)-new Date()),d=Math.floor(diff/864e5),h=Math.floor(diff/36e5)%24,m=Math.floor(diff/6e4)%60,sec=Math.floor(diff/1e3)%60;return `<div class="count-card"><div class="date">${esc(date.replace('/2026',''))}</div><h3>${esc(name)} 💜</h3><div class="timer"><div class="timebox"><b>${d}</b><span>dias</span></div><div class="timebox"><b>${String(h).padStart(2,'0')}</b><span>horas</span></div><div class="timebox"><b>${String(m).padStart(2,'0')}</b><span>min</span></div><div class="timebox"><b>${String(sec).padStart(2,'0')}</b><span>seg</span></div></div><p class="muted">${esc(date)} às 20h</p></div>`}).join('')}tick();setInterval(tick,1000)}renderCountdowns();
function home(){if(!$('#homeIntro'))return;let s=LS.get('settings',defaults.settings);$('#homeIntro').textContent=s.intro;$('#siteTitle').textContent=s.site;}home();
let map;function purpleIcon(emoji='💜'){return L.divIcon({className:'',html:`<div class="zb-pin"><span>${emoji}</span></div>`,iconSize:[38,38],iconAnchor:[19,38],popupAnchor:[0,-32]})}function metroIcon(txt='M'){return L.divIcon({className:'',html:`<div class="metro-pin">${txt}</div>`,iconSize:[30,30],iconAnchor:[15,15]})}function gateIcon(txt){return L.divIcon({className:'',html:`<div class="gate-pin">${esc(txt)}</div>`,iconSize:[54,30],iconAnchor:[27,15]})}function appIcon(){return L.divIcon({className:'',html:`<div class="app-pin">🚗</div>`,iconSize:[32,32],iconAnchor:[16,16]})}
function activeList(k){return LS.get(k,defaults[k]).filter(x=>x.active!==false)}
function initMap(){if(!$('#map'))return;map=L.map('map').setView(morumbi,14);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);renderMapMode('projects')}
function clearMap(){map.eachLayer(l=>{if(l instanceof L.Marker||l instanceof L.Polyline||l instanceof L.Polygon||l instanceof L.CircleMarker)map.removeLayer(l)})}
function approvedProjects(){return LS.get('projects',defaults.projects).filter(p=>p.status==='approved')}
function routeLink(lat,lng){return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
function addProjects(){approvedProjects().forEach(p=>L.marker([+p.lat,+p.lng],{icon:purpleIcon(p.featured?'🏟️':'💜')}).addTo(map).bindPopup(`<b>${esc(p.title)}</b><br>${esc(p.type||'Projeto')}<br>${esc(p.address||'')}<br><a target="_blank" href="${routeLink(p.lat,p.lng)}">Abrir rota</a>`))}
function addArrival(){activeList('stations').forEach(m=>L.marker([+m.lat,+m.lng],{icon:metroIcon('M')}).addTo(map).bindPopup(`<b>${esc(m.name)}</b><br>${esc(m.line||'')}`));activeList('gates').forEach(g=>L.marker([+g.lat,+g.lng],{icon:gateIcon(g.name.replace('Portão','P'))}).addTo(map).bindPopup(`<b>${esc(g.name)}</b><br>${esc(g.sectors||'')}<br><small>${esc(g.desc||'Shows podem ter portões diferentes de jogos.')}</small>`));activeList('appPoints').forEach(a=>L.marker([+a.lat,+a.lng],{icon:appIcon()}).addTo(map).bindPopup(`<b>${esc(a.name)}</b><br><small>${esc(a.desc||'Ponto sugerido de app.')}</small>`));activeList('lines').forEach(line=>{if(Array.isArray(line.points)&&line.points.length>1)L.polyline(line.points,{color:line.color||'#ff4fd8',weight:5,dashArray:line.name?.includes('Caminhada')?'8,8':null}).addTo(map).bindPopup(esc(line.name))})}
function legendHtml(mode){return `<div class="legend"><span><i class="dot purple"></i>Projeto</span><span><i class="dot stadium"></i>MorumBIS</span>${mode!=='projects'?`<span><i class="dot metro"></i>Estação</span><span><i class="dot gate-dot"></i>Portões</span><span><i class="dot app-dot"></i>Pontos de app</span><span><i class="line yellow-line"></i>Linhas/rotas</span>`:''}</div>`}
function updateSide(mode){const mc=LS.get('mapConfig',defaults.mapConfig);let titles={projects:'Projetos aprovados',arrival:'Mapa de chegada',street:'Street View do Estádio',general:'Mapa geral completo',mobility:'Mobilidade & Trânsito'};let desc={projects:mc.sideProjects,arrival:mc.sideArrival,street:mc.sideStreet,general:mc.sideGeneral,mobility:mc.sideMobility};$('#sideTitle')&&( $('#sideTitle').textContent=titles[mode] );$('#sideDescription')&&( $('#sideDescription').textContent=desc[mode]||'' );let tab={projects:mc.tabProjects,arrival:mc.tabArrival,street:mc.tabStreet,general:mc.tabGeneral,mobility:mc.tabMobility};$('#mapDescription')&&( $('#mapDescription').innerHTML=`<b>${titles[mode]}</b><p>${esc(tab[mode]||'')}</p>` );$('#metroInfoText')&&( $('#metroInfoText').textContent=mc.metroInfo||'' );$('#gatesInfoText')&&( $('#gatesInfoText').textContent=mc.gatesInfo||'' );$('#appInfoText')&&( $('#appInfoText').textContent=mc.appInfo||'' );let g=LS.get('guide',defaults.guide);$('#gateWarningText')&&( $('#gateWarningText').textContent=g.gates||'' )}
function renderMobilityInfoList(){
  const roads=LS.get('mobilityRoads',[]).filter(x=>x.active!==false);
  const cards=LS.get('mobilityCards',[]).filter(x=>x.active!==false);
  const roadCards=roads.map(r=>`<article class="mobility-alert-card"><div class="pill ${statusClass(r.status)}">${statusLabel(r.status)}</div><h3>${esc(r.name)}</h3><p>${esc(r.desc||'')}</p>${r.hours?`<small>${esc(r.hours)}</small>`:''}</article>`).join('');
  const extraCards=cards.map(c=>`<article class="mobility-alert-card"><div class="pill">${esc(c.tag||'aviso')}</div><h3>${esc(c.title)}</h3><p>${esc(c.desc||'')}</p></article>`).join('');
  return roadCards+extraCards || '<div class="mobility-alert-empty">Nenhum aviso ativo no momento. Adicione cards pelo ADM.</div>';
}
function renderProjectList(mode){if(!$('#projectList'))return;const projects=approvedProjects(),gates=activeList('gates'),stations=activeList('stations'),apps=activeList('appPoints');if(mode==='projects'){$('#projectList').innerHTML=projects.map(p=>`<div class="project-card"><span class="tag">${esc(p.type||'Projeto')}</span><h3>${esc(p.title)}</h3><p>${esc(p.desc||'')}</p><p><b>${esc(p.date||'')}</b> ${esc(p.time||'')}</p><p>${esc(p.address||'')}</p><a class="btn" target="_blank" href="${routeLink(p.lat,p.lng)}">Google Maps</a></div>`).join('');return}if(mode==='arrival'){$('#projectList').innerHTML=[...stations.map(s=>`<div class="project-card"><span class="tag">${esc(s.line||'Metrô')}</span><h3>${esc(s.name)}</h3><p>${esc(s.desc||'')}</p><a class="btn" target="_blank" href="${routeLink(s.lat,s.lng)}">Rota</a></div>`),...gates.map(g=>`<div class="project-card"><span class="tag">Portão</span><h3>${esc(g.name)}</h3><p>${esc(g.sectors||'')}</p><p>${esc(g.desc||'')}</p></div>`),...apps.map(a=>`<div class="project-card"><span class="tag">App</span><h3>${esc(a.name)}</h3><p>${esc(a.desc||'')}</p><a class="btn" target="_blank" href="${routeLink(a.lat,a.lng)}">Rota</a></div>`)].join('');return}if(mode==='street'){$('#projectList').innerHTML='';return}if(mode==='mobility'){$('#projectList').innerHTML=renderMobilityInfoList();return}$('#projectList').innerHTML=`<div class="project-card"><h3>Mapa Geral</h3><p>Projetos: ${projects.length}<br>Portões: ${gates.length}<br>Estações: ${stations.length}<br>Pontos de app: ${apps.length}</p></div>`}
function addMobilityLayer(){
  const roads=LS.get('mobilityRoads',[]).filter(x=>x.active!==false);
  const colors={free:'#41f59b',warn:'#ffd166',busy:'#ff8a3d',closed:'#ff3864'};
  activeList('stations').forEach(m=>L.marker([+m.lat,+m.lng],{icon:metroIcon('M')}).addTo(map).bindPopup(`<b>${esc(m.name)}</b><br>${esc(m.line||'')}`));
  activeList('appPoints').forEach(a=>L.marker([+a.lat,+a.lng],{icon:appIcon()}).addTo(map).bindPopup(`<b>${esc(a.name)}</b><br><small>${esc(a.desc||'Ponto sugerido de app.')}</small>`));
  roads.forEach(r=>{ if(Array.isArray(r.points)&&r.points.length>1){L.polyline(r.points,{color:colors[statusClass(r.status)]||'#ffd166',weight:7,opacity:.9}).addTo(map).bindPopup(`<b>${esc(r.name)}</b><br>Status: ${statusLabel(r.status)}<br>${esc(r.hours||'')}`)} else if(r.lat&&r.lng){L.marker([+r.lat,+r.lng],{icon:mobilityIcon()}).addTo(map).bindPopup(`<b>${esc(r.name)}</b><br>Status: ${statusLabel(r.status)}`)} });
}

function embedVideo(url){
  url=String(url||'').trim();
  if(!url)return '';
  let yt=url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/);
  if(yt)return `<iframe src="https://www.youtube.com/embed/${yt[1]}" title="Vídeo" allowfullscreen loading="lazy"></iframe>`;
  return `<a class="btn secondary" target="_blank" rel="noopener" href="${esc(url)}">Abrir vídeo</a>`;
}
function renderStadiumView(mc){
  const sm=LS.get('stadiumMedia',defaults.stadiumMedia);
  const views=(Array.isArray(sm.views)?sm.views:[]).filter(v=>v.active!==false);
  const photos=(Array.isArray(sm.photos)?sm.photos:[]).filter(p=>p.active!==false);
  const first=views[0]||{};
  return `<div class="stadium-view-page stadium-360-page wide-stadium-page">
    <div class="stadium-media-intro compact-intro">
      <div><span class="tag">Visão do MorumBIS</span><h2>Visões 360° do estádio</h2><p>${esc(sm.intro||'')}</p></div>
    </div>
    <div class="stadium-360-layout wide-360">
      <aside class="stadium-360-list">
        ${views.length?views.map((v,i)=>`<button class="view360-btn ${i===0?'active':''}" data-view360="${i}"><b>${esc(v.title||('Visão '+(i+1)))}</b><small>${esc(v.desc||'')}</small></button>`).join(''):'<p class="muted">Nenhuma visão 360 cadastrada.</p>'}
      </aside>
      <section class="stadium-360-main">
        <div class="view360-title"><h3 id="view360Title">${esc(first.title||'Visão 360°')}</h3><p id="view360Desc">${esc(first.desc||'')}</p></div>
        <div id="view360Frame" class="view360-frame">${first.iframe||''}</div>
      </section>
    </div>
    ${photos.length?`<div class="stadium-photo-gallery"><h3>Fotos extras do estádio</h3><div class="stadium-photo-grid">${photos.map(p=>`<article class="stadium-photo-card">${p.img?`<img src="${p.img}" alt="${esc(p.title||'Foto do estádio')}">`:'<div class="photo-placeholder">📸</div>'}<div><b>${esc(p.title||'Foto')}</b><p>${esc(p.desc||'')}</p></div></article>`).join('')}</div></div>`:''}
  </div>`;
}
document.addEventListener('click',e=>{const btn=e.target.closest('[data-view360]');if(btn){let sm=LS.get('stadiumMedia',defaults.stadiumMedia);let views=(Array.isArray(sm.views)?sm.views:[]).filter(v=>v.active!==false);let v=views[+btn.dataset.view360];if(!v)return;$$('.view360-btn').forEach(b=>b.classList.toggle('active',b===btn));$('#view360Title').textContent=v.title||'Visão 360°';$('#view360Desc').textContent=v.desc||'';$('#view360Frame').innerHTML=v.iframe||'';}});


function ensureMobilityBelowCards(mode){
  const layout=document.querySelector('.map-layout');
  if(!layout)return;
  let old=document.getElementById('mapMobilityCardsBelow');
  if(mode!=='mobility'){
    layout.classList.remove('mobility-mode');
    old&&old.remove();
    return;
  }
  layout.classList.add('mobility-mode');
  if(!old){
    old=document.createElement('section');
    old.id='mapMobilityCardsBelow';
    old.className='mobility-alerts-under-map';
    old.innerHTML='<div class="eyebrow">Avisos editáveis</div><h2>Avisos de mobilidade</h2><p class="sub mobility-sub">Cards pequenos abaixo do mapa, um ao lado do outro, sem linha do tempo.</p><div id="mapMobilityCardsGrid" class="mobility-alert-cards"></div>';
    layout.appendChild(old);
  }
  const grid=document.getElementById('mapMobilityCardsGrid');
  if(grid)grid.innerHTML=renderMobilityInfoList();
}

function renderMapMode(mode){
  const layout=document.querySelector('.map-layout');
  const mapEl=$('#map');
  const streetEl=$('#streetViewBox');
  $$('.map-tabs .tab').forEach(b=>b.classList.toggle('active',b.dataset.mapTab===mode));
  updateSide(mode);
  renderProjectList(mode);
  ensureMobilityBelowCards(mode);
  document.querySelectorAll('.map-wrap .legend').forEach(x=>x.remove());
  if(mode==='street'){
    layout?.classList.add('street-wide');
    mapEl?.classList.add('hidden');
    if(streetEl){
      streetEl.classList.remove('hidden');
      streetEl.innerHTML=renderStadiumView(LS.get('mapConfig',defaults.mapConfig));
    }
    return;
  }
  layout?.classList.remove('street-wide');
  if(streetEl){streetEl.classList.add('hidden'); streetEl.innerHTML='';}
  mapEl?.classList.remove('hidden');
  if(!map)return;
  setTimeout(()=>map.invalidateSize(),80);
  clearMap();
  document.querySelectorAll('.map-wrap .legend').forEach(x=>x.remove());
  if(mode==='projects'){
    addProjects();
    L.marker(morumbi,{icon:purpleIcon('🏟️')}).addTo(map).bindPopup('<b>MorumBIS</b><br>Estádio dos shows');
  }else if(mode==='arrival'){
    L.marker(morumbi,{icon:purpleIcon('🏟️')}).addTo(map).bindPopup('<b>MorumBIS</b><br>Estádio dos shows');
    addArrival();
  }else if(mode==='general'){
    addProjects();
    addArrival();
    addMobilityLayer();
    L.marker(morumbi,{icon:purpleIcon('🏟️')}).addTo(map).bindPopup('<b>MorumBIS</b><br>Estádio dos shows');
  }else if(mode==='mobility'){
    L.marker(morumbi,{icon:purpleIcon('🏟️')}).addTo(map).bindPopup('<b>MorumBIS</b><br>Estádio dos shows');
    addMobilityLayer();
  }
  hideMapDynamicLegend();
}
function bindMapTabs(){
  $$('.map-tabs [data-map-tab]').forEach(btn=>btn.addEventListener('click',()=>renderMapMode(btn.dataset.mapTab)));
}
function bootMapPage(){
  if($('#map')){initMap();bindMapTabs();}
}
bootMapPage();

function checklist(){
  const root=$('#checklist'); if(!root)return;
  const suggested=LS.get('checklist',defaults.checklist);
  const personalKey='zb_personal_checklist_v1';
  const checkedKey='zb_personal_checklist_checked_v1';
  let items=[];
  try{items=JSON.parse(localStorage.getItem(personalKey)||'null')||suggested.map((text,i)=>({id:'base-'+i,text}))}catch{items=suggested.map((text,i)=>({id:'base-'+i,text}))}
  let checked={}; try{checked=JSON.parse(localStorage.getItem(checkedKey)||'{}')}catch{}
  const save=()=>{localStorage.setItem(personalKey,JSON.stringify(items));localStorage.setItem(checkedKey,JSON.stringify(checked))};
  const draw=()=>{root.innerHTML=`<div class="personal-checklist-toolbar"><div><h2>Minha checklist</h2><p>Adicione, edite, marque e exclua os itens do jeito que preferir. A lista fica salva neste aparelho.</p></div><button class="btn secondary" id="resetChecklist" type="button">Restaurar sugestões</button></div><div class="personal-add-row"><input id="newChecklistItem" class="input" placeholder="Ex.: Separar ingresso, roupa, documento..."><button id="addChecklistItem" class="btn" type="button">Adicionar item</button></div><div class="personal-checklist-list">${items.map((it,i)=>`<div class="check-item personal-check-item"><input class="personal-check-toggle" type="checkbox" ${checked[it.id]?'checked':''} data-check-id="${esc(it.id)}"><span class="personal-check-label ${checked[it.id]?'done':''}">${esc(it.text)}</span><button class="check-edit" type="button" data-check-edit="${i}">Editar</button><button class="check-delete" type="button" data-check-del="${i}">Excluir</button></div>`).join('')||'<div class="empty-personal-checklist">Sua checklist está vazia. Adicione o primeiro item acima.</div>'}</div>`};
  draw();
  root.onclick=e=>{
    if(e.target.id==='addChecklistItem'){const input=$('#newChecklistItem'),text=input.value.trim();if(!text)return;items.push({id:'custom-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),text});save();draw()}
    if(e.target.dataset.checkEdit!==undefined){const i=Number(e.target.dataset.checkEdit),current=items[i]?.text||'';const next=prompt('Editar item:',current);if(next!==null&&next.trim()){items[i].text=next.trim();save();draw()}}
    if(e.target.dataset.checkDel!==undefined){const i=Number(e.target.dataset.checkDel);delete checked[items[i]?.id];items.splice(i,1);save();draw()}
    if(e.target.id==='resetChecklist'&&confirm('Restaurar a lista sugerida pelo site?')){items=suggested.map((text,i)=>({id:'base-'+i,text}));checked={};save();draw()}
  };
  root.onchange=e=>{if(e.target.dataset.checkId){checked[e.target.dataset.checkId]=e.target.checked;save()}};
  root.onkeydown=e=>{if(e.target.id==='newChecklistItem'&&e.key==='Enter'){e.preventDefault();$('#addChecklistItem').click()}};
}checklist();
function calc(){if(!$('#calcRows'))return;let rows=LS.get('calc',[{name:'Ingresso',value:408,paid:true},{name:'Transporte',value:150,paid:false}]);function draw(){let total=rows.reduce((a,r)=>a+Number(r.value||0),0),paid=rows.filter(r=>r.paid).reduce((a,r)=>a+Number(r.value||0),0);$('#sumTotal').textContent=BRL(total);$('#sumPaid').textContent=BRL(paid);$('#sumOpen').textContent=BRL(total-paid);$('#calcRows').innerHTML=rows.map((r,i)=>`<div class="calc-row"><input class="input" data-k="name" data-i="${i}" value="${esc(r.name||'')}" placeholder="Título do gasto"><input class="input" data-k="value" data-i="${i}" type="number" value="${r.value||0}" placeholder="Valor"><label><input type="checkbox" data-k="paid" data-i="${i}" ${r.paid?'checked':''}> Pago</label><button class="btn secondary" data-del="${i}">Excluir</button></div>`).join('')}draw();$('#addCalc').onclick=()=>{rows.push({name:'Novo gasto',value:0,paid:false});LS.set('calc',rows);draw()};$('#calcRows').oninput=e=>{let i=e.target.dataset.i,k=e.target.dataset.k;if(k){rows[i][k]=k==='value'?Number(e.target.value):e.target.value;LS.set('calc',rows);draw()}};$('#calcRows').onchange=e=>{if(e.target.dataset.k==='paid'){rows[e.target.dataset.i].paid=e.target.checked;LS.set('calc',rows);draw()}};$('#calcRows').onclick=e=>{if(e.target.dataset.del){rows.splice(e.target.dataset.del,1);LS.set('calc',rows);draw()}}}calc();
function links(){if(!$('#linksGrid'))return;let links=LS.get('links',defaults.links);$('#linksGrid').innerHTML=links.map((l,i)=>`<a class="link-card" href="link-detalhe.html?id=${i}">${l.img?`<img src="${l.img}">`:'<div class="icon">🔗</div>'}<h3>${esc(l.title)}</h3><p class="preserve-lines">${esc(l.desc)}</p><span class="open-card">Abrir card completo →</span></a>`).join('')}links();
function linkDetail(){
  if(!$('#detailTitle'))return;
  const links=LS.get('links',defaults.links),i=Number(new URLSearchParams(location.search).get('id')||0),l=links[i]||links[0]||{};
  const items=Array.isArray(l.items)?l.items:(Array.isArray(l.products)?l.products.map(p=>({...p,type:'product'})):[]);
  const gallery=Array.isArray(l.gallery)?l.gallery.filter(Boolean):[];
  $('#detailTitle').textContent=l.title||'Link';$('#detailTitle2').textContent=l.title||'Link';$('#detailDesc').textContent=l.desc||'';$('#detailDesc2').textContent=l.desc||'';
  $('#detailImage').innerHTML=l.img?`<img src="${l.img}" alt="${esc(l.title||'Imagem do link')}">`:`<div class="detail-placeholder">🔗</div>`;
  const gal=$('#detailGallery');
  if(gal&&gallery.length){gal.classList.remove('hidden');gal.innerHTML=`<div class="detail-gallery-head"><h3>Mais fotos</h3><span>${gallery.length} ${gallery.length===1?'foto':'fotos'}</span></div><div class="detail-gallery-grid">${gallery.map((src,gi)=>`<button class="detail-gallery-thumb" type="button" data-gallery-open="${gi}" aria-label="Abrir foto ${gi+1}"><img src="${src}" alt="Foto adicional ${gi+1}"></button>`).join('')}</div>`;gal.onclick=e=>{const b=e.target.closest('[data-gallery-open]');if(!b)return;const src=gallery[Number(b.dataset.galleryOpen)];const modal=document.createElement('div');modal.className='image-lightbox';modal.innerHTML=`<button type="button" aria-label="Fechar">×</button><img src="${src}" alt="Foto ampliada">`;modal.onclick=ev=>{if(ev.target===modal||ev.target.tagName==='BUTTON')modal.remove()};document.body.appendChild(modal)}}else if(gal){gal.classList.add('hidden');gal.innerHTML=''}
  const a=$('#detailExternal');if(l.url&&l.url!=='#'){a.href=l.url;a.classList.remove('hidden')}else a.classList.add('hidden');
  const ps=$('#productSection');if(!ps)return;
  const cards=items.map(item=>{if(item.type==='list'){const bullets=String(item.list||item.desc||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);return `<article class="content-list-card">${item.img?`<img src="${item.img}" alt="${esc(item.name||'Imagem')}">`:''}<div><span class="content-kind">Lista / informação</span><h4>${esc(item.name||'Informações')}</h4>${bullets.length?`<ul>${bullets.map(b=>`<li>${esc(b.replace(/^[-•›]\s*/,''))}</li>`).join('')}</ul>`:''}${item.url?`<a class="btn secondary" target="_blank" rel="noopener" href="${item.url}">Abrir link</a>`:''}</div></article>`}if(item.type==='video'){return `<article class="content-video-card"><div><span class="content-kind">Vídeo</span><h4>${esc(item.name||'Vídeo')}</h4><p class="preserve-lines">${esc(item.desc||'')}</p>${item.url?embedVideo(item.url):'<p class="muted">Nenhum link de vídeo cadastrado.</p>'}</div></article>`}if(item.type==='text'){return `<article class="content-text-card"><div><span class="content-kind">Texto</span><h4>${esc(item.name||'Texto')}</h4><p class="preserve-lines">${esc(item.desc||'')}</p>${item.url?`<a class="btn secondary" target="_blank" rel="noopener" href="${item.url}">Abrir link</a>`:''}</div></article>`}if(item.type==='image'){return `<figure class="content-image-card">${item.img?`<img src="${item.img}" alt="${esc(item.name||item.caption||'Imagem')}">`:'<div class="image-card-placeholder">🖼️</div>'}${item.name||item.caption?`<figcaption>${item.name?`<h4>${esc(item.name)}</h4>`:''}${item.caption?`<p class="preserve-lines">${esc(item.caption)}</p>`:''}</figcaption>`:''}</figure>`}return `<article class="product-card">${item.img?`<img src="${item.img}" alt="${esc(item.name||'Produto')}">`:'<div class="product-ph">🛍️</div>'}<div><span class="content-kind">Produto</span><h4>${esc(item.name||'Produto')}</h4><p class="preserve-lines">${esc(item.desc||'')}</p>${item.url?`<a class="btn secondary" target="_blank" rel="noopener" href="${item.url}">Abrir link</a>`:''}</div></article>`}).join('');
  ps.innerHTML=`<div class="detail-content-head"><h3>Lista e produtos</h3><p>Todos os itens aparecem abaixo da apresentação do card.</p></div><div class="detail-content-grid">${cards||'<p class="muted">Nenhum conteúdo cadastrado ainda.</p>'}</div>`;
}linkDetail();
function envio(){if(!$('#projectForm'))return;$('#projectForm').onsubmit=async e=>{e.preventDefault();if(!supa){alert('Supabase não carregou. Tente novamente.');return;}let f=new FormData(e.target),item={title:f.get('title'),type:f.get('type'),description:f.get('desc'),event_date:f.get('date'),event_time:f.get('time'),address:f.get('address'),lat:+f.get('lat'),lng:+f.get('lng'),link:f.get('link'),status:'pending'};const {error}=await supa.from('barmy_project_submissions').insert(item);if(error){alert('Erro ao enviar para o Supabase: '+error.message);return;}alert('Projeto enviado! Ele foi salvo no Supabase e ficará pendente até aprovação no ADM.');e.target.reset()}}envio();
async function imageFileToSmallDataUrl(file,max=1600,quality=.82){
  return new Promise(resolve=>{
    if(!file || !file.type || !file.type.startsWith('image/')){const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(file);return;}
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height;
      const ratio=Math.min(1,max/Math.max(w,h));
      w=Math.max(1,Math.round(w*ratio)); h=Math.max(1,Math.round(h*ratio));
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      resolve(c.toDataURL('image/jpeg',quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror=()=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(file)};
    img.src=URL.createObjectURL(file);
  });
}
function dataUrlToBlob(dataUrl){
  const [head,body]=String(dataUrl).split(',');
  const mime=(head.match(/data:(.*?);/)||[])[1]||'image/jpeg';
  const bin=atob(body||''), arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}
async function uploadImageFile(file,folder='uploads'){
  const small=await imageFileToSmallDataUrl(file,1600,.82);
  if(!supa){alert('Supabase não carregou. A imagem não foi enviada.'); return '';}
  try{
    const {data:{session}}=await supa.auth.getSession();
    if(!session)return small;
    const safe=(file.name||'imagem').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,42)||'imagem';
    const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}.jpg`;
    const blob=dataUrlToBlob(small);
    const {error}=await supa.storage.from('barmy-images').upload(path,blob,{contentType:'image/jpeg',upsert:false,cacheControl:'31536000'});
    if(error)throw error;
    const {data}=supa.storage.from('barmy-images').getPublicUrl(path);
    return data.publicUrl;
  }catch(e){
    console.error('Upload no Storage falhou:',e?.message||e);
    alert('Não consegui enviar a imagem para o Supabase Storage. Rode o SQL novo e confira o bucket barmy-images.');
    return '';
  }
}
async function fileToBase64(file,cb){
  const url=await uploadImageFile(file,'admin');
  if(url) cb(url);
}
async function admin(){
  if(!$('#adminApp'))return;
  if(!supa){$('#loginBox').classList.remove('hidden');$('#loginBox').innerHTML='<h1>Supabase não carregou</h1><p class="muted">Confira a internet/CDN do Supabase.</p>';return;}
  const {data:{session}}=await supa.auth.getSession();
  if(!session){
    $('#loginBox').classList.remove('hidden');$('#adminApp').classList.add('hidden');
    const pass=$('#pass'); if(pass) pass.setAttribute('autocomplete','current-password');
    const p=$('#loginBox .muted'); if(p) p.textContent='Entre com o e-mail e senha criados em Authentication > Users no Supabase.';
    if(!$('#adminEmail')) pass.insertAdjacentHTML('beforebegin','<input id="adminEmail" class="input" type="email" placeholder="E-mail do ADM" autocomplete="username"><br><br>');
    $('#loginBtn').onclick=async()=>{const email=$('#adminEmail').value.trim(),password=$('#pass').value;const {error}=await supa.auth.signInWithPassword({email,password});if(error){alert('Login não autorizado pelo Supabase: '+error.message)}else location.reload()};
    return;
  }
  $('#loginBox').classList.add('hidden');$('#adminApp').classList.remove('hidden');$$('[data-admin-tab]').forEach(b=>b.onclick=()=>{showAdminTab(b.dataset.adminTab)});renderAdmin();showAdminTab('admDashboard')
}
function showAdminTab(id){$$('[data-admin-tab]').forEach(x=>x.classList.toggle('active',x.dataset.adminTab===id));$$('.admin-section').forEach(s=>s.classList.add('hidden'));$('#'+id)?.classList.remove('hidden')}
function field(label,html){return `<label class="field"><span>${label}</span>${html}</label>`}
function renderAdmin(){let s=LS.get('settings',defaults.settings),g=LS.get('guide',defaults.guide),mc=LS.get('mapConfig',defaults.mapConfig),ps=LS.get('projects',defaults.projects),cl=LS.get('checklist',defaults.checklist),ln=LS.get('links',defaults.links),gates=LS.get('gates',defaults.gates),stations=LS.get('stations',defaults.stations),apps=LS.get('appPoints',defaults.appPoints),lines=LS.get('lines',defaults.lines);
$('#admDashboard').innerHTML=`<div class="dash-grid"><div class="dash-card"><b>${ps.filter(p=>p.status==='pending').length}</b><span>Projetos pendentes</span></div><div class="dash-card"><b>${ps.filter(p=>p.status==='approved').length}</b><span>Projetos aprovados</span></div><div class="dash-card"><b>${gates.length}</b><span>Portões</span></div><div class="dash-card"><b>${stations.length}</b><span>Estações</span></div><div class="dash-card"><b>${apps.length}</b><span>Pontos de app</span></div><div class="dash-card"><b>${ln.length}</b><span>Links</span></div></div><div class="admin-box"><div id="saveStatus" class="save-status ok">Pronto para editar.</div><h3>Organização do painel</h3><p class="muted">Agora cada coisa fica separada: projetos em Projetos, portões em Portões, estações em Estações, pontos de app em Pontos de App e textos em Mapa & Guia.</p><button class="btn secondary" id="logoutAdmin">Sair do ADM</button> <button class="btn secondary danger" id="resetAll">Resetar dados desta versão</button></div>`;$('#logoutAdmin').onclick=async()=>{if(supa) await supa.auth.signOut();location.reload()};$('#resetAll').onclick=()=>{if(confirm('Resetar todos os dados salvos desta versão?')){LS.clear();location.reload()}};
$('#admHome').innerHTML=`<div class="admin-box"><h3>Home</h3>${field('Nome do site',`<input class="input" id="admSite" value="${esc(s.site)}">`)}${field('Texto de apresentação',`<textarea id="admIntro">${esc(s.intro)}</textarea>`)}<div class="form-grid">${s.shows.map((sh,i)=>`<div class="admin-mini"><b>Show ${i+1}</b>${field('Data exibida',`<input class="input" data-show="date" data-i="${i}" value="${esc(sh[0])}">`)}${field('Nome',`<input class="input" data-show="name" data-i="${i}" value="${esc(sh[1])}">`)}${field('Data/hora técnica',`<input class="input" data-show="iso" data-i="${i}" value="${esc(sh[2])}">`)}</div>`).join('')}</div><button class="btn" id="saveHome">Salvar home</button></div>`;$$('[data-show]').forEach(inp=>inp.oninput=()=>{let idx=+inp.dataset.i,pos={date:0,name:1,iso:2}[inp.dataset.show];s.shows[idx][pos]=inp.value});$('#saveHome').onclick=()=>{s.site=$('#admSite').value;s.intro=$('#admIntro').value;LS.set('settings',s);alert('Home salva')};
const guideLabels={routes:'Como chegar / metrô e linhas',peak:'Horários movimentados',app:'Melhores lugares para app',useful:'Informações úteis',security:'Dicas de segurança',traffic:'Trânsito, bloqueios e mudanças'};$('#admGuide').innerHTML=`<div class="admin-box"><h3>Textos do Mapa & Guia</h3>${Object.keys(guideLabels).map(k=>field(guideLabels[k],`<textarea data-g="${k}">${esc(g[k]||'')}</textarea>`)).join('')}<h3>Descrições das abas</h3>${['tabProjects','tabArrival','tabStreet','tabGeneral','tabMobility','sideProjects','sideArrival','sideStreet','sideGeneral','sideMobility','metroInfo','gatesInfo','appInfo'].map(k=>field(k,`<textarea data-mc="${k}">${esc(mc[k]||'')}</textarea>`)).join('')}${field('Iframe do Street View',`<textarea data-mc="streetIframe" style="min-height:160px">${esc(mc.streetIframe||'')}</textarea>`)}<button class="btn" id="saveGuideAll">Salvar textos e abas</button></div>`;$('#saveGuideAll').onclick=()=>{$$('[data-g]').forEach(t=>g[t.dataset.g]=t.value);$$('[data-mc]').forEach(t=>mc[t.dataset.mc]=t.value);LS.set('guide',g);LS.set('mapConfig',mc);alert('Mapa & Guia salvo')};
function renderListAdmin(containerId,items,key,cols,blankTitle){
let inputFor=(c,it,i)=>{
  if(c.type==='textarea')return `<textarea data-list="${key}" data-i="${i}" data-k="${c.k}">${esc(it[c.k]||'')}</textarea>`;
  if(c.type==='check')return `<select data-list="${key}" data-i="${i}" data-k="${c.k}"><option value="true" ${it[c.k]!==false?'selected':''}>ativo</option><option value="false" ${it[c.k]===false?'selected':''}>oculto</option></select>`;
  if(c.type==='status')return `<select data-list="${key}" data-i="${i}" data-k="${c.k}"><option value="pending" ${it[c.k]==='pending'?'selected':''}>Pendente</option><option value="approved" ${it[c.k]==='approved'?'selected':''}>Aprovado</option><option value="rejected" ${it[c.k]==='rejected'?'selected':''}>Rejeitado</option></select>`;
  if(c.type==='image')return `<input type="file" accept="image/*" data-list-file="${key}" data-i="${i}" data-k="${c.k}"><input class="input" data-list="${key}" data-i="${i}" data-k="${c.k}" value="${esc(it[c.k]??'')}" placeholder="Ou cole a URL/base64 da imagem">${it[c.k]?`<img class="admin-preview" src="${esc(it[c.k])}" alt="preview">`:''}`;
  return `<input class="input" data-list="${key}" data-i="${i}" data-k="${c.k}" value="${esc(it[c.k]??'')}">`;
};
let html=`<div class="admin-toolbar"><button class="btn" data-add-list="${key}">Adicionar ${blankTitle}</button><button class="btn secondary" data-save-list="${key}">Salvar</button></div>`+items.map((it,i)=>`<div class="admin-box clean-card"><div class="admin-card-head"><h3>${esc(it.name||it.title||blankTitle)} <small>#${i+1}</small></h3><button class="btn secondary" data-del-list="${key}" data-i="${i}">Excluir</button></div><div class="form-grid">${cols.map(c=>field(c.label,inputFor(c,it,i))).join('')}</div></div>`).join('');$('#'+containerId).innerHTML=html}

renderListAdmin('admProjects',ps,'projects',[{k:'title',label:'Nome do projeto'},{k:'type',label:'Tipo escrito pelo usuário'},{k:'desc',label:'Descrição',type:'textarea'},{k:'date',label:'Data'},{k:'time',label:'Horário'},{k:'address',label:'Endereço'},{k:'lat',label:'Latitude'},{k:'lng',label:'Longitude'},{k:'status',label:'Status do projeto',type:'status'}],'projeto');
renderListAdmin('admGates',gates,'gates',[{k:'name',label:'Nome do portão'},{k:'sectors',label:'Resumo dos setores atendidos'},{k:'desc',label:'Descrição/observação',type:'textarea'},{k:'sectorDetails',label:'Texto explicando os setores',type:'textarea'},{k:'arrivalTip',label:'Dica de chegada',type:'textarea'},{k:'gatePhoto',label:'Foto do portão (enviar do computador)',type:'image'},{k:'sectorImage',label:'Imagem dos setores (enviar do computador)',type:'image'},{k:'lat',label:'Latitude'},{k:'lng',label:'Longitude'},{k:'active',label:'Status',type:'check'}],'portão');
renderListAdmin('admStations',stations,'stations',[{k:'name',label:'Nome da estação'},{k:'line',label:'Linha'},{k:'desc',label:'Descrição',type:'textarea'},{k:'lat',label:'Latitude'},{k:'lng',label:'Longitude'},{k:'active',label:'Status',type:'check'}],'estação');
renderListAdmin('admAppPoints',apps,'appPoints',[{k:'name',label:'Nome do ponto de app'},{k:'desc',label:'Descrição',type:'textarea'},{k:'lat',label:'Latitude'},{k:'lng',label:'Longitude'},{k:'active',label:'Status',type:'check'}],'ponto de app');
$('#admLines').innerHTML=`<div class="admin-box"><h3>Linhas e rotas públicas</h3><p class="muted">Para a rota seguir as ruas, coloque pontos intermediários no caminho. Formato: latitude,longitude | latitude,longitude | latitude,longitude. Quanto mais pontos, mais a linha acompanha ruas e calçadas. Para rota automática real, use o botão Google Maps dos cards.</p></div><div class="admin-toolbar"><button class="btn" id="addLine">Adicionar linha</button><button class="btn secondary" id="saveLines">Salvar linhas</button></div>`+lines.map((l,i)=>`<div class="admin-box clean-card"><div class="admin-card-head"><h3>${esc(l.name)} <small>#${i+1}</small></h3><button class="btn secondary" data-del-line="${i}">Excluir</button></div><div class="form-grid">${field('Nome',`<input class="input" data-line="name" data-i="${i}" value="${esc(l.name)}">`)}${field('Cor HEX',`<input class="input" data-line="color" data-i="${i}" value="${esc(l.color)}">`)}${field('Status',`<select data-line="active" data-i="${i}"><option value="true" ${l.active!==false?'selected':''}>ativo</option><option value="false" ${l.active===false?'selected':''}>oculto</option></select>`)}${field('Pontos da rota',`<textarea data-line="points" data-i="${i}">${(l.points||[]).map(p=>p.join(',')).join(' | ')}</textarea>`)}</div></div>`).join('');
function listHandler(e){let key=e.target.dataset.addList||e.target.dataset.saveList||e.target.dataset.delList;if(!key)return;let data={projects:ps,gates,stations,appPoints:apps}[key];if(e.target.dataset.addList){let blanks={projects:{id:Date.now(),title:'Novo projeto',type:'',desc:'',date:'',time:'',address:'',lat:morumbi[0],lng:morumbi[1],status:'pending'},gates:{id:Date.now(),name:'Novo portão',sectors:'',desc:'',sectorDetails:'',arrivalTip:'',gatePhoto:'',sectorImage:'',lat:morumbi[0],lng:morumbi[1],active:true},stations:{id:Date.now(),name:'Nova estação',line:'',desc:'',lat:morumbi[0],lng:morumbi[1],active:true},appPoints:{id:Date.now(),name:'Novo ponto de app',desc:'',lat:morumbi[0],lng:morumbi[1],active:true}};data.push(blanks[key]);LS.set(key,data);renderAdmin();showAdminTab({projects:'admProjects',gates:'admGates',stations:'admStations',appPoints:'admAppPoints'}[key])} if(e.target.dataset.delList){data.splice(+e.target.dataset.i,1);LS.set(key,data);renderAdmin();showAdminTab({projects:'admProjects',gates:'admGates',stations:'admStations',appPoints:'admAppPoints'}[key])} if(e.target.dataset.saveList){LS.set(key,data);alert('Salvo')}}
['admProjects','admGates','admStations','admAppPoints'].forEach(id=>{
  $('#'+id).oninput=e=>{let key=e.target.dataset.list,i=e.target.dataset.i,k=e.target.dataset.k;if(key){let data={projects:ps,gates,stations,appPoints:apps}[key];let val=e.target.value;if(['lat','lng'].includes(k))val=Number(val);if(k==='active')val=val==='true';data[i][k]=val}};
  $('#'+id).onchange=e=>{
    if(e.target.dataset.listFile){
      let key=e.target.dataset.listFile,i=e.target.dataset.i,k=e.target.dataset.k,file=e.target.files&&e.target.files[0];
      let data={projects:ps,gates,stations,appPoints:apps}[key];
      if(file&&data&&data[i]) fileToBase64(file,b=>{data[i][k]=b;LS.set(key,data);renderAdmin();showAdminTab({projects:'admProjects',gates:'admGates',stations:'admStations',appPoints:'admAppPoints'}[key])});
      return;
    }
    $('#'+id).oninput(e);
  };
  $('#'+id).onclick=listHandler
});
$('#admLines').oninput=e=>{let i=e.target.dataset.i,k=e.target.dataset.line;if(!k)return;if(k==='active')lines[i][k]=e.target.value==='true';else if(k==='points')lines[i].points=e.target.value.split('|').map(x=>x.trim().split(',').map(Number)).filter(p=>p.length===2&&!p.some(isNaN));else lines[i][k]=e.target.value};$('#admLines').onchange=$('#admLines').oninput;$('#admLines').onclick=e=>{if(e.target.id==='addLine'){lines.push({id:Date.now(),name:'Nova linha',color:'#ff4fd8',points:[morumbi],active:true});LS.set('lines',lines);renderAdmin();showAdminTab('admLines')}if(e.target.id==='saveLines'){LS.set('lines',lines);alert('Linhas salvas')}if(e.target.dataset.delLine){lines.splice(+e.target.dataset.delLine,1);LS.set('lines',lines);renderAdmin();showAdminTab('admLines')}};
$('#admChecklist').innerHTML=`<div class="admin-toolbar"><button class="btn" id="addCl">Adicionar item</button><button class="btn secondary" id="saveCl">Salvar checklist</button></div>`+cl.map((it,i)=>`<div class="calc-row"><input class="input" data-cl="${i}" value="${esc(it)}"><button class="btn secondary" data-del-cl="${i}">Excluir</button></div>`).join('');$('#admChecklist').oninput=e=>{if(e.target.dataset.cl!==undefined)cl[e.target.dataset.cl]=e.target.value};$('#admChecklist').onclick=e=>{if(e.target.id==='addCl'){cl.push('Novo item');LS.set('checklist',cl);renderAdmin();showAdminTab('admChecklist')}if(e.target.dataset.delCl!==undefined){cl.splice(+e.target.dataset.delCl,1);LS.set('checklist',cl);renderAdmin();showAdminTab('admChecklist')}if(e.target.id==='saveCl'){LS.set('checklist',cl);alert('Checklist salva')}};
$('#admLinks').innerHTML=`<div class="admin-box"><h2>Cards principais da página Links</h2><p class="muted">Use os botões <b>Subir card</b> e <b>Descer card</b> para alterar a ordem dos cards inteiros. Todo o conteúdo interno acompanha o card.</p><div class="admin-toolbar"><button class="btn" id="addLn">Adicionar card principal</button><button class="btn secondary" id="saveLn">Salvar links</button></div></div>`+ln.map((l,i)=>{l.items=Array.isArray(l.items)?l.items:(Array.isArray(l.products)?l.products.map(p=>({...p,type:'product'})):[]);l.gallery=Array.isArray(l.gallery)?l.gallery:[];return `<div class="admin-box clean-card"><div class="admin-card-head"><h3>${esc(l.title)} <small>#${i+1}</small></h3><div class="admin-order-actions"><button class="btn secondary" type="button" data-card-up="${i}" ${i===0?'disabled':''} title="Mover este card principal para cima">↑ Subir card</button><button class="btn secondary" type="button" data-card-down="${i}" ${i===ln.length-1?'disabled':''} title="Mover este card principal para baixo">↓ Descer card</button><button class="btn secondary" data-del-l="${i}">Excluir card</button></div></div><div class="form-grid">${field('Título do card principal',`<input class="input" data-l="title" data-i="${i}" value="${esc(l.title)}">`)}${field('Link externo opcional',`<input class="input" data-l="url" data-i="${i}" placeholder="https://..." value="${esc(l.url||'')}">`)}${field('Descrição',`<textarea data-l="desc" data-i="${i}">${esc(l.desc)}</textarea>`)}${field('Capa principal (foto do PC)',`<input type="file" accept="image/*" data-img="${i}">${l.img?'<p class="muted">Capa carregada</p>':''}`)}</div><div class="admin-gallery-box"><div class="admin-card-head"><div><h4>Fotos adicionais do card</h4><p class="muted">Selecione várias fotos de uma vez. Elas aparecem em uma galeria abaixo da foto principal.</p></div><label class="btn secondary file-button">Adicionar fotos<input type="file" accept="image/*" multiple data-gallery-img="${i}"></label></div><div class="admin-gallery-grid">${l.gallery.map((src,gi)=>`<div class="admin-gallery-item"><img src="${src}" alt="Foto adicional"><button type="button" data-remove-gallery="${i}" data-gi="${gi}">Remover</button></div>`).join('')||'<p class="muted">Nenhuma foto adicional.</p>'}</div></div><h4>Conteúdo abaixo da capa</h4><div class="admin-toolbar"><button class="btn secondary" data-add-prod="${i}">Adicionar produto</button><button class="btn secondary" data-add-list="${i}">Adicionar card de lista</button><button class="btn secondary" data-add-video="${i}">Adicionar vídeo</button><button class="btn secondary" data-add-text="${i}">Adicionar card de texto</button><button class="btn secondary" data-add-image="${i}">Adicionar imagem com legenda</button></div>${l.items.map((item,pi)=>{const type=['list','video','text','image'].includes(item.type)?item.type:'product';const label=type==='list'?'📋 Card de lista':type==='video'?'🎬 Vídeo':type==='text'?'📝 Card de texto':type==='image'?'🖼️ Imagem com legenda':'🛍️ Produto';return `<div class="admin-mini product-admin"><div class="admin-card-head"><b>${label} — ${esc(item.name||'Novo item')}</b><div class="admin-order-actions"><button class="btn secondary" type="button" data-item-up="${i}" data-pi="${pi}" ${pi===0?'disabled':''}>↑</button><button class="btn secondary" type="button" data-item-down="${i}" data-pi="${pi}" ${pi===l.items.length-1?'disabled':''}>↓</button><button class="btn secondary" data-del-item="${i}" data-pi="${pi}">Excluir</button></div></div><div class="form-grid">${field(type==='list'?'Título da lista':type==='video'?'Título do vídeo':type==='text'?'Título do texto':type==='image'?'Título opcional':'Nome do produto',`<input class="input" data-item="name" data-i="${i}" data-pi="${pi}" value="${esc(item.name||'')}">`)}${field(type==='video'?'Link do vídeo (YouTube ou outro)':type==='image'?'Link opcional da imagem':'Link opcional',`<input class="input" data-item="url" data-i="${i}" data-pi="${pi}" value="${esc(item.url||'')}">`)}${field(type==='list'?'Itens da lista (um por linha)':type==='video'?'Descrição do vídeo':type==='text'?'Texto do card':type==='image'?'Legenda da imagem':'Descrição do produto',`<textarea data-item="${type==='list'?'list':type==='image'?'caption':'desc'}" data-i="${i}" data-pi="${pi}">${esc(type==='list'?(item.list||''):type==='image'?(item.caption||''):(item.desc||''))}</textarea>`)}${type==='video'||type==='text'?'':field(type==='list'?'Imagem opcional':type==='image'?'Selecionar imagem':'Foto do produto',`<input type="file" accept="image/*" data-item-img="${i}" data-pi="${pi}">${item.img?'<p class="muted">Imagem carregada</p>':''}`)}</div></div>`}).join('')}</div>`}).join('');
$('#admLinks').oninput=e=>{const i=e.target.dataset.i,k=e.target.dataset.l;if(k)ln[i][k]=e.target.value;const itemKey=e.target.dataset.item;if(itemKey){const pi=e.target.dataset.pi;ln[i].items=ln[i].items||[];ln[i].items[pi][itemKey]=e.target.value}};
$('#admLinks').onchange=async e=>{if(e.target.dataset.img!==undefined&&e.target.files[0]){const i=Number(e.target.dataset.img);ln[i].img=await uploadImageFile(e.target.files[0],'links/capas');await LS.saveNow('links',ln);renderAdmin();showAdminTab('admLinks')}if(e.target.dataset.galleryImg!==undefined&&e.target.files.length){const i=Number(e.target.dataset.galleryImg);ln[i].gallery=Array.isArray(ln[i].gallery)?ln[i].gallery:[];setSaveStatus('Enviando fotos adicionais...','saving');for(const file of Array.from(e.target.files)){const url=await uploadImageFile(file,'links/galeria');if(url)ln[i].gallery.push(url)}await LS.saveNow('links',ln);renderAdmin();showAdminTab('admLinks')}if(e.target.dataset.itemImg!==undefined&&e.target.files[0]){const i=Number(e.target.dataset.itemImg),pi=Number(e.target.dataset.pi);ln[i].items[pi].img=await uploadImageFile(e.target.files[0],'links/conteudo');await LS.saveNow('links',ln);renderAdmin();showAdminTab('admLinks')}};
$('#admLinks').onclick=e=>{if(e.target.dataset.cardUp!==undefined){const i=Number(e.target.dataset.cardUp);if(i>0){[ln[i-1],ln[i]]=[ln[i],ln[i-1]];LS.saveNow('links',ln).then(()=>{renderAdmin();showAdminTab('admLinks')})}return}if(e.target.dataset.cardDown!==undefined){const i=Number(e.target.dataset.cardDown);if(i<ln.length-1){[ln[i+1],ln[i]]=[ln[i],ln[i+1]];LS.saveNow('links',ln).then(()=>{renderAdmin();showAdminTab('admLinks')})}return}if(e.target.id==='addLn'){ln.push({title:'Novo card',url:'',desc:'Descrição',img:'',gallery:[],items:[]});LS.set('links',ln);renderAdmin();showAdminTab('admLinks')}if(e.target.dataset.delL!==undefined){ln.splice(Number(e.target.dataset.delL),1);LS.set('links',ln);renderAdmin();showAdminTab('admLinks')}if(e.target.dataset.addProd!==undefined){const i=Number(e.target.dataset.addProd);ln[i].items=ln[i].items||[];ln[i].items.push({type:'product',name:'Novo produto',url:'',desc:'Descrição do produto',img:''});LS.set('links',ln);renderAdmin();showAdminTab('admLinks')}if(e.target.dataset.addList!==undefined){const i=Number(e.target.dataset.addList);ln[i].items=ln[i].items||[];ln[i].items.push({type:'list',name:'Nova lista',url:'',list:'Primeiro item\nSegundo item',img:''});LS.set('links',ln);renderAdmin();showAdminTab('admLinks')}if(e.target.dataset.addVideo!==undefined){const i=Number(e.target.dataset.addVideo);ln[i].items=ln[i].items||[];ln[i].items.push({type:'video',name:'Novo vídeo',url:'',desc:''});LS.set('links',ln);renderAdmin();showAdminTab('admLinks')}if(e.target.dataset.addText!==undefined){const i=Number(e.target.dataset.addText);ln[i].items=ln[i].items||[];ln[i].items.push({type:'text',name:'Novo texto',url:'',desc:'Escreva o texto aqui.'});LS.set('links',ln);renderAdmin();showAdminTab('admLinks')}if(e.target.dataset.addImage!==undefined){const i=Number(e.target.dataset.addImage);ln[i].items=ln[i].items||[];ln[i].items.push({type:'image',name:'',url:'',caption:'Legenda da imagem',img:''});LS.set('links',ln);renderAdmin();showAdminTab('admLinks')}if(e.target.dataset.itemUp!==undefined){const i=Number(e.target.dataset.itemUp),pi=Number(e.target.dataset.pi);if(pi>0){[ln[i].items[pi-1],ln[i].items[pi]]=[ln[i].items[pi],ln[i].items[pi-1]];LS.set('links',ln);renderAdmin();showAdminTab('admLinks')}}if(e.target.dataset.itemDown!==undefined){const i=Number(e.target.dataset.itemDown),pi=Number(e.target.dataset.pi);if(pi<ln[i].items.length-1){[ln[i].items[pi+1],ln[i].items[pi]]=[ln[i].items[pi],ln[i].items[pi+1]];LS.set('links',ln);renderAdmin();showAdminTab('admLinks')}}if(e.target.dataset.removeGallery!==undefined){const i=Number(e.target.dataset.removeGallery),gi=Number(e.target.dataset.gi);ln[i].gallery.splice(gi,1);LS.set('links',ln);renderAdmin();showAdminTab('admLinks')}if(e.target.dataset.delItem!==undefined){const i=Number(e.target.dataset.delItem),pi=Number(e.target.dataset.pi);ln[i].items.splice(pi,1);LS.set('links',ln);renderAdmin();showAdminTab('admLinks')}if(e.target.id==='saveLn'){LS.saveNow('links',ln).then(ok=>alert(ok?'Links salvos no Supabase':'Não foi possível salvar'))}};
}
admin();


// ===== Mobilidade & Trânsito =====
function statusClass(st){st=(st||'').toLowerCase(); if(st.includes('fech'))return 'closed'; if(st.includes('cheio'))return 'busy'; if(st.includes('aten'))return 'warn'; return 'free'}
function statusLabel(st){return esc(st||'livre')}
function mobilityIcon(){return L.divIcon({className:'',html:`<div class="traffic-pin">🚦</div>`,iconSize:[34,34],iconAnchor:[17,17]})}
function renderMobilityPage(){
  if(!$('#mobilityMap'))return;
  const roads=LS.get('mobilityRoads',[]).filter(x=>x.active!==false), cards=LS.get('mobilityCards',[]).filter(x=>x.active!==false);
  const mm=L.map('mobilityMap').setView(morumbi,14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(mm);
  L.marker(morumbi,{icon:stadiumIcon()}).addTo(mm).bindPopup('<b>MorumBIS</b><br>Referência central');
  activeList('stations').forEach(s=>L.marker([+s.lat,+s.lng],{icon:metroIcon()}).addTo(mm).bindPopup(`<b>${esc(s.name)}</b><br>${esc(s.line||'')}`));
  activeList('appPoints').forEach(a=>L.marker([+a.lat,+a.lng],{icon:appIcon()}).addTo(mm).bindPopup(`<b>${esc(a.name)}</b><br>${esc(a.desc||'')}`));
  const colors={free:'#41f59b',warn:'#ffd166',busy:'#ff8a3d',closed:'#ff3864'};
  roads.forEach(r=>{ if(Array.isArray(r.points)&&r.points.length>1){L.polyline(r.points,{color:colors[statusClass(r.status)]||'#ff4fd8',weight:7,opacity:.9}).addTo(mm).bindPopup(`<b>${esc(r.name)}</b><br>Status: ${statusLabel(r.status)}<br>${esc(r.hours||'')}`)} else if(r.lat&&r.lng){L.marker([+r.lat,+r.lng],{icon:mobilityIcon()}).addTo(mm).bindPopup(`<b>${esc(r.name)}</b><br>Status: ${statusLabel(r.status)}`)} });
  const wrap=$('#mobilityCards');
  if(wrap){
    wrap.innerHTML=cards.length?cards.map(c=>`<article class="mobility-alert-card"><div class="pill">${esc(c.tag||'aviso')}</div><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p></article>`).join(''):`<div class="mobility-alert-empty">Nenhum aviso ativo no momento. Adicione cards pelo ADM.</div>`;
  }
}
renderMobilityPage();

function installMobilityAdmin(){
  if(!$('#adminApp') || $('#adminApp').classList.contains('hidden') || $('#admMobility')) return;
  const btn=document.createElement('button'); btn.dataset.adminTab='admMobility'; btn.textContent='🚦 Mobilidade & Trânsito';
  $('.admin-side').appendChild(btn);
  const sec=document.createElement('div'); sec.id='admMobility'; sec.className='admin-section hidden'; $('.admin-content').appendChild(sec);
  $$('[data-admin-tab]').forEach(b=>b.onclick=()=>{showAdminTab(b.dataset.adminTab)});
  renderMobilityAdmin();
}
function renderMobilityAdmin(){
  const sec=$('#admMobility'); if(!sec)return;
  let roads=LS.get('mobilityRoads',[]), cards=LS.get('mobilityCards',[]);
  const roadForm=roads.map((r,i)=>`<div class="admin-box clean-card"><div class="admin-card-head"><h3>${esc(r.name)} <small>#${i+1}</small></h3><button class="btn secondary" data-del-road="${i}">Excluir</button></div><div class="form-grid">${field('Rua/área',`<input class="input" data-road="name" data-i="${i}" value="${esc(r.name)}">`)}${field('Status',`<select data-road="status" data-i="${i}"><option ${r.status==='livre'?'selected':''}>livre</option><option ${r.status==='atenção'?'selected':''}>atenção</option><option ${r.status==='cheio'?'selected':''}>cheio</option><option ${r.status==='fechado'?'selected':''}>fechado</option></select>`)}${field('Horário previsto',`<input class="input" data-road="hours" data-i="${i}" value="${esc(r.hours||'')}">`)}${field('Descrição',`<textarea data-road="desc" data-i="${i}">${esc(r.desc||'')}</textarea>`)}${field('Status no mapa',`<select data-road="active" data-i="${i}"><option value="true" ${r.active!==false?'selected':''}>ativo</option><option value="false" ${r.active===false?'selected':''}>oculto</option></select>`)}${field('Pontos da rua/rota',`<textarea data-road="points" data-i="${i}" placeholder="lat,lng | lat,lng | lat,lng">${(r.points||[]).map(p=>p.join(',')).join(' | ')}</textarea>`)}</div></div>`).join('');
  const cardForm=cards.map((c,i)=>`<div class="admin-box clean-card"><div class="admin-card-head"><h3>${esc(c.title)} <small>#${i+1}</small></h3><button class="btn secondary" data-del-card="${i}">Excluir</button></div><div class="form-grid">${field('Título',`<input class="input" data-card="title" data-i="${i}" value="${esc(c.title)}">`)}${field('Etiqueta',`<input class="input" data-card="tag" data-i="${i}" value="${esc(c.tag||'')}">`)}${field('Descrição',`<textarea data-card="desc" data-i="${i}">${esc(c.desc||'')}</textarea>`)}${field('Status',`<select data-card="active" data-i="${i}"><option value="true" ${c.active!==false?'selected':''}>ativo</option><option value="false" ${c.active===false?'selected':''}>oculto</option></select>`)}</div></div>`).join('');
  sec.innerHTML=`<div class="admin-box"><h3>Mobilidade & Trânsito</h3><p class="muted">Edite ruas/áreas do mapa e cards pequenos de avisos que aparecem lado a lado abaixo do mapa.</p></div><h2>Ruas/áreas no mapa</h2><div class="admin-toolbar"><button class="btn" id="addRoad">Adicionar rua/área</button><button class="btn secondary" id="saveMobility">Salvar mobilidade</button></div>${roadForm}<h2>Cards dinâmicos</h2><div class="admin-toolbar"><button class="btn" id="addMobCard">Adicionar card</button></div>${cardForm}`;
  sec.oninput=e=>{let i=e.target.dataset.i;if(e.target.dataset.road){let k=e.target.dataset.road,v=e.target.value;if(k==='active')v=v==='true'; if(k==='points')v=v.split('|').map(x=>x.trim().split(',').map(Number)).filter(p=>p.length===2&&!p.some(isNaN)); roads[i][k]=v} if(e.target.dataset.card){let k=e.target.dataset.card,v=e.target.value;if(k==='active')v=v==='true'; cards[i][k]=v} if(e.target.dataset.time){let k=e.target.dataset.time,v=e.target.value;if(k==='active')v=v==='true'; timeline[i][k]=v}};
  sec.onchange=sec.oninput;
  sec.onclick=e=>{ if(e.target.id==='addRoad'){roads.push({id:Date.now(),name:'Nova rua/área',status:'atenção',hours:'',desc:'',points:[morumbi],active:true}); LS.set('mobilityRoads',roads); renderMobilityAdmin()} if(e.target.id==='addMobCard'){cards.push({id:Date.now(),title:'Novo card',tag:'info',desc:'Descrição',active:true}); LS.set('mobilityCards',cards); renderMobilityAdmin()} if(e.target.dataset.delRoad!==undefined){roads.splice(+e.target.dataset.delRoad,1); LS.set('mobilityRoads',roads); renderMobilityAdmin()} if(e.target.dataset.delCard!==undefined){cards.splice(+e.target.dataset.delCard,1); LS.set('mobilityCards',cards); renderMobilityAdmin()} if(e.target.id==='saveMobility'){LS.saveNow('mobilityRoads',roads); LS.saveNow('mobilityCards',cards); alert('Mobilidade salva')}};
}
setTimeout(installMobilityAdmin,50);


// Menu mobile controlado por assets/js/menu.js.

// ===== V17 - Visões 360° e fotos do MorumBIS editáveis =====
function installStadiumAdmin(){
  if(!$('#adminApp') || $('#adminApp').classList.contains('hidden') || $('#admStadium')) return;
  const btn=document.createElement('button');
  btn.dataset.adminTab='admStadium';
  btn.textContent='🏟️ MorumBIS 360° e fotos';
  const guideBtn=document.querySelector('[data-admin-tab="admGuide"]');
  if(guideBtn && guideBtn.parentNode) guideBtn.insertAdjacentElement('afterend',btn); else $('.admin-side')?.appendChild(btn);
  const sec=document.createElement('div');
  sec.id='admStadium';
  sec.className='admin-section hidden';
  $('.admin-content')?.appendChild(sec);
  $$('[data-admin-tab]').forEach(b=>b.onclick=()=>{showAdminTab(b.dataset.adminTab)});
  renderStadiumAdmin();
}
function renderStadiumAdmin(){
  const sec=$('#admStadium'); if(!sec)return;
  let sm=LS.get('stadiumMedia',defaults.stadiumMedia);
  sm.views=Array.isArray(sm.views)?sm.views:[];
  sm.photos=Array.isArray(sm.photos)?sm.photos:[];
  sec.innerHTML=`<div class="admin-box"><h3>Visões 360° e fotos do MorumBIS</h3><p class="muted">Essa área controla a aba 3 do Mapa & Guia. Você pode colar novos iframes do Google Maps/Street View e também cadastrar fotos extras do estádio.</p>${field('Texto de introdução',`<textarea data-sm="intro">${esc(sm.intro||'')}</textarea>`)}<div class="admin-toolbar"><button class="btn" id="add360View">Adicionar visão 360°</button><button class="btn secondary" id="addStadiumPhoto">Adicionar foto</button><button class="btn" id="saveStadiumAll">Salvar tudo</button></div></div>
  <div class="admin-box"><h3>Visões 360° cadastradas</h3><p class="muted">Cole o iframe completo do Google Maps. Você pode ocultar uma visão sem excluir.</p></div>
  ${sm.views.map((v,i)=>`<div class="admin-box clean-card"><div class="admin-card-head"><h3>${esc(v.title||'Visão 360°')} <small>#${i+1}</small></h3><button class="btn secondary" data-del-view360="${i}">Excluir</button></div><div class="form-grid">${field('Título',`<input class="input" data-view="title" data-i="${i}" value="${esc(v.title||'')}">`)}${field('Descrição curta',`<textarea data-view="desc" data-i="${i}">${esc(v.desc||'')}</textarea>`)}${field('Status',`<select data-view="active" data-i="${i}"><option value="true" ${v.active!==false?'selected':''}>ativo</option><option value="false" ${v.active===false?'selected':''}>oculto</option></select>`)}</div>${field('Iframe do Google Maps / Street View',`<textarea class="iframe-input" data-view="iframe" data-i="${i}" style="min-height:150px">${esc(v.iframe||'')}</textarea>`)}</div>`).join('')}
  <div class="admin-box"><h3>Fotos extras do estádio</h3><p class="muted">Use para fotos de setores, arquibancada ou referências visuais. O upload fica salvo no navegador/painel local.</p></div>
  ${sm.photos.map((p,i)=>`<div class="admin-box clean-card"><div class="admin-card-head"><h3>${esc(p.title||'Foto do estádio')} <small>#${i+1}</small></h3><button class="btn secondary" data-del-stadium-photo="${i}">Excluir</button></div><div class="form-grid">${field('Título',`<input class="input" data-photo="title" data-i="${i}" value="${esc(p.title||'')}">`)}${field('Status',`<select data-photo="active" data-i="${i}"><option value="true" ${p.active!==false?'selected':''}>ativo</option><option value="false" ${p.active===false?'selected':''}>oculto</option></select>`)}${field('Descrição',`<textarea data-photo="desc" data-i="${i}">${esc(p.desc||'')}</textarea>`)}${field('Imagem',`<input type="file" accept="image/*" data-photo-file="${i}"><input class="input" data-photo="img" data-i="${i}" value="${esc(p.img||'')}" placeholder="Ou cole a URL/base64 da imagem">`)}</div>${p.img?`<img class="admin-preview" src="${p.img}" alt="preview">`:''}</div>`).join('')}`;
  sec.oninput=e=>{
    if(e.target.dataset.sm==='intro') sm.intro=e.target.value;
    if(e.target.dataset.view){let i=+e.target.dataset.i; if(sm.views[i]) sm.views[i][e.target.dataset.view]=e.target.value;}
    if(e.target.dataset.photo){let i=+e.target.dataset.i; if(sm.photos[i]) sm.photos[i][e.target.dataset.photo]=e.target.value;}
  };
  sec.onchange=e=>{
    if(e.target.dataset.view==='active'){let i=+e.target.dataset.i; if(sm.views[i]) sm.views[i].active=e.target.value==='true';}
    if(e.target.dataset.photo==='active'){let i=+e.target.dataset.i; if(sm.photos[i]) sm.photos[i].active=e.target.value==='true';}
    if(e.target.dataset.photoFile!==undefined){let i=+e.target.dataset.photoFile;const file=e.target.files&&e.target.files[0];if(file&&sm.photos[i]){fileToBase64(file,b=>{sm.photos[i].img=b;LS.set('stadiumMedia',sm);renderStadiumAdmin();showAdminTab('admStadium')});}}
  };
  sec.onclick=e=>{
    if(e.target.id==='add360View'){sm.views.push({id:Date.now(),title:'Nova visão 360°',desc:'Descrição da visão',iframe:'',active:true});LS.set('stadiumMedia',sm);renderStadiumAdmin();showAdminTab('admStadium')}
    if(e.target.id==='addStadiumPhoto'){sm.photos.push({id:Date.now(),title:'Nova foto',desc:'Descrição da foto',img:'',active:true});LS.set('stadiumMedia',sm);renderStadiumAdmin();showAdminTab('admStadium')}
    if(e.target.dataset.delView360!==undefined){sm.views.splice(+e.target.dataset.delView360,1);LS.set('stadiumMedia',sm);renderStadiumAdmin();showAdminTab('admStadium')}
    if(e.target.dataset.delStadiumPhoto!==undefined){sm.photos.splice(+e.target.dataset.delStadiumPhoto,1);LS.set('stadiumMedia',sm);renderStadiumAdmin();showAdminTab('admStadium')}
    if(e.target.id==='saveStadiumAll'){LS.set('stadiumMedia',sm);alert('Visões e fotos salvas')}
  };
}
setTimeout(installStadiumAdmin,80);


// Carrega dados do Supabase e redesenha a página atual quando houver conteúdo salvo na nuvem.
syncFromSupabase().then(()=>{seedDefaultsInCache();refreshCurrentPage();});

function mobilityPage(){renderMobilityPage()}


// ===== V18 - Cards clicáveis de portões no Mapa de Chegada =====
function gateShortName(g){return String(g?.name||'Portão').replace(/^Portão\s*/i,'P ')}
function gateImageHtml(src,alt,cls='gate-modal-img'){
  return src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt||'Imagem do portão')}">` : `<div class="gate-image-placeholder ${cls}">🚪</div>`;
}
function addArrival(){
  activeList('stations').forEach(m=>L.marker([+m.lat,+m.lng],{icon:metroIcon('M')}).addTo(map).bindPopup(`<b>${esc(m.name)}</b><br>${esc(m.line||'')}`));
  activeList('gates').forEach((g,idx)=>L.marker([+g.lat,+g.lng],{icon:gateIcon(gateShortName(g))}).addTo(map).bindPopup(`<b>${esc(g.name)}</b><br>${esc(g.sectors||'')}<br><button class="gate-popup-btn" data-open-gate="${idx}">Ver detalhes do portão</button>`));
  activeList('appPoints').forEach(a=>L.marker([+a.lat,+a.lng],{icon:appIcon()}).addTo(map).bindPopup(`<b>${esc(a.name)}</b><br><small>${esc(a.desc||'Ponto sugerido de app.')}</small>`));
  activeList('lines').forEach(line=>{if(Array.isArray(line.points)&&line.points.length>1)L.polyline(line.points,{color:line.color||'#ff4fd8',weight:5,dashArray:line.name?.includes('Caminhada')?'8,8':null}).addTo(map).bindPopup(esc(line.name))})
}
function renderGateCards(){
  const gates=activeList('gates');
  if(!gates.length)return '<p class="muted">Nenhum portão ativo cadastrado.</p>';
  return gates.map((g,i)=>`<button class="gate-entry-card" type="button" data-open-gate="${i}">
    <span class="gate-entry-chip">${esc(gateShortName(g))}</span>
    <b>${esc(g.name||'Portão')}</b>
    <small>${esc(g.sectors||'Setores a confirmar')}</small>
    <em>Ver foto e setores</em>
  </button>`).join('');
}
function ensureGateCardsSection(mode){
  const infoSection=document.getElementById('arrivalGateCardsSection');
  if(!infoSection)return;
  infoSection.classList.toggle('hidden', mode!=='arrival' && mode!=='general');
  const grid=document.getElementById('arrivalGateCards');
  if(grid) grid.innerHTML=renderGateCards();
}
function openGateModalByIndex(i){
  const gates=activeList('gates');
  const g=gates[Number(i)];
  if(!g)return;
  let modal=document.getElementById('gateInfoModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='gateInfoModal';
    modal.className='gate-modal hidden';
    modal.innerHTML='<div class="gate-modal-backdrop" data-close-gate></div><article class="gate-modal-card"></article>';
    document.body.appendChild(modal);
  }
  modal.querySelector('.gate-modal-card').innerHTML=`
    <button class="gate-modal-close" type="button" data-close-gate>×</button>
    <div class="gate-modal-head"><span class="tag">Mapa de chegada</span><h2>${esc(g.name||'Portão')}</h2><p>${esc(g.desc||'Entrada de referência para organização.')}</p></div>
    <div class="gate-modal-grid">
      <section><h3>Foto / referência do portão</h3>${gateImageHtml(g.gatePhoto||g.img||g.sectorImage, g.name)}</section>
      <section><h3>Setores que esse portão acessa</h3>${gateImageHtml(g.sectorImage||g.gatePhoto||g.img, 'Setores do '+(g.name||'portão'),'gate-modal-img sectors-img')}<p class="gate-sector-text">${esc(g.sectorDetails||g.sectors||'Atualize no ADM com a imagem e descrição dos setores.')}</p></section>
    </div>
    <div class="gate-modal-info"><div><b>Setores</b><p>${esc(g.sectors||'A confirmar')}</p></div><div><b>Dica de chegada</b><p>${esc(g.arrivalTip||'Confira o mapa oficial do evento antes de sair.')}</p></div></div>`;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeGateModal(){document.getElementById('gateInfoModal')?.classList.add('hidden');document.body.classList.remove('modal-open')}
document.addEventListener('click',e=>{
  const open=e.target.closest('[data-open-gate]');
  if(open){e.preventDefault();openGateModalByIndex(open.dataset.openGate);return;}
  if(e.target.closest('[data-close-gate]')) closeGateModal();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeGateModal()});
const oldRenderMapModeForGates=renderMapMode;
renderMapMode=function(mode){ oldRenderMapModeForGates(mode); ensureGateCardsSection(mode); };
setTimeout(()=>ensureGateCardsSection(document.querySelector('.map-tabs .tab.active')?.dataset.mapTab||'projects'),120);


// ===== Redesign: legenda contextual somente após clique no marcador =====
function showMapDynamicLegend(html){
  const box=document.getElementById('mapDynamicLegend');
  if(!box)return;
  const content=box.querySelector('.map-legend-content');
  if(content)content.innerHTML=html||'';
  box.classList.remove('hidden');
}
function hideMapDynamicLegend(){document.getElementById('mapDynamicLegend')?.classList.add('hidden')}
function installDynamicMapLegend(){
  if(!map || map._zonaDynamicLegendInstalled)return;
  map._zonaDynamicLegendInstalled=true;
  map.on('popupopen',e=>{
    const node=e.popup?.getElement()?.querySelector('.leaflet-popup-content');
    showMapDynamicLegend(node?node.innerHTML:'');
  });
  map.on('popupclose',hideMapDynamicLegend);
  map.on('click',e=>{if(!e.originalEvent?.target?.closest?.('.leaflet-marker-icon'))hideMapDynamicLegend()});
  document.querySelector('.map-legend-close')?.addEventListener('click',()=>{hideMapDynamicLegend();map.closePopup()});
}
const originalInitMap=initMap;
initMap=function(){originalInitMap();installDynamicMapLegend()};
function ensureGateCardsSection(){const el=document.getElementById('arrivalGateCardsSection');if(el)el.classList.add('hidden')}
// Página pode já ter iniciado antes da sobreposição acima.
if(document.getElementById('map')) setTimeout(installDynamicMapLegend,0);


// ===== Consolidação 2026-08-05: formatação, cards do mapa e Avisos =====
(function(){
  const officialShows=[
    ['28/10/2026','Show — 28 de outubro','2026-10-28T20:00:00-03:00'],
    ['30/10/2026','Show — 30 de outubro','2026-10-30T20:00:00-03:00'],
    ['31/10/2026','Show — 31 de outubro','2026-10-31T20:00:00-03:00']
  ];
  const countdownEl=document.getElementById('countdowns');
  if(countdownEl){
    const tick=()=>{countdownEl.innerHTML=officialShows.map(([date,name,iso])=>{const diff=Math.max(0,new Date(iso).getTime()-Date.now()),d=Math.floor(diff/86400000),h=Math.floor(diff/3600000)%24,m=Math.floor(diff/60000)%60,sec=Math.floor(diff/1000)%60;return `<article class="show-count-card"><div class="show-count-date">${esc(date)} • 20:00</div><h3>${esc(name)}</h3><div class="show-timer"><span><b>${d}</b><small>dias</small></span><span><b>${String(h).padStart(2,'0')}</b><small>horas</small></span><span><b>${String(m).padStart(2,'0')}</b><small>min</small></span><span><b>${String(sec).padStart(2,'0')}</b><small>seg</small></span></div></article>`}).join('')}; tick(); setInterval(tick,1000);
  }

  window.renderMapContentCards=function(mode){
    const el=document.getElementById('mapContentCards'); if(!el)return;
    let items=[];
    if(mode==='projects') items=approvedProjects().map(p=>({tag:p.type||'Projeto',title:p.title,desc:p.desc,meta:[p.date,p.time,p.address].filter(Boolean).join(' • '),lat:p.lat,lng:p.lng}));
    else if(mode==='arrival') items=[...activeList('stations').map(x=>({tag:x.line||'Estação',title:x.name,desc:x.desc,lat:x.lat,lng:x.lng})),...activeList('gates').map(x=>({tag:'Portão',title:x.name,desc:[x.sectors,x.desc].filter(Boolean).join('\n')})),...activeList('appPoints').map(x=>({tag:'Ponto de app',title:x.name,desc:x.desc,lat:x.lat,lng:x.lng}))];
    else if(mode==='mobility') items=(LS.get('mobilityCards',[])||[]).filter(x=>x.active!==false).map(x=>({tag:x.tag||'Aviso',title:x.title,desc:x.desc}));
    else if(mode==='general') items=[...approvedProjects().map(p=>({tag:p.type||'Projeto',title:p.title,desc:p.desc,lat:p.lat,lng:p.lng})),...activeList('gates').map(x=>({tag:'Portão',title:x.name,desc:x.desc})),...activeList('stations').map(x=>({tag:x.line||'Estação',title:x.name,desc:x.desc,lat:x.lat,lng:x.lng}))];
    else {el.innerHTML='<div class="map-empty-card">Use as opções acima para visualizar o conteúdo cadastrado.</div>';return}
    el.innerHTML=items.length?items.map(x=>`<article class="project-card map-content-card"><span class="tag">${esc(x.tag||'Informação')}</span><h3>${esc(x.title||'')}</h3><p class="preserve-lines">${esc(x.desc||'')}</p>${x.meta?`<p class="muted preserve-lines">${esc(x.meta)}</p>`:''}${Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lng))?`<a class="btn secondary" target="_blank" rel="noopener" href="${routeLink(x.lat,x.lng)}">Abrir rota</a>`:''}</article>`).join(''):'<div class="map-empty-card">Nenhum card cadastrado nesta aba.</div>';
  };
  if(document.getElementById('mapContentCards')){
    document.querySelectorAll('[data-map-tab]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>renderMapContentCards(btn.dataset.mapTab),0)));
    renderMapContentCards(document.querySelector('[data-map-tab].active')?.dataset.mapTab||'projects');
  }

  const defaultNotices=[];
  window.renderNotices=function(){
    const el=document.getElementById('noticeGrid'); if(!el)return;
    const notices=(LS.get('notices',defaultNotices)||[]).filter(n=>n.active!==false).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    el.innerHTML=notices.length?notices.map(n=>`<article class="notice-card">${n.img?`<img src="${n.img}" alt="${esc(n.title||'Aviso')}">`:''}<div class="notice-body"><div class="notice-meta">${esc(n.date||'Comunicado')}</div><h2>${esc(n.title||'Aviso')}</h2><p class="preserve-lines">${esc(n.text||'')}</p>${n.url?`<a class="btn secondary" target="_blank" rel="noopener" href="${esc(n.url)}">Abrir link</a>`:''}</div></article>`).join(''):'<div class="panel notice-empty"><h2>Nenhum aviso publicado</h2><p>Os comunicados aparecerão aqui assim que forem cadastrados no painel ADM.</p></div>';
  }; renderNotices();

  function installNoticeAdmin(){
    const sec=document.getElementById('admNotices'); if(!sec||sec.dataset.ready)return; sec.dataset.ready='1';
    let notices=LS.get('notices',defaultNotices)||[];
    const draw=()=>{
      sec.innerHTML=`<div class="admin-box"><h2>Avisos e comunicados</h2><p class="muted">Publique textos, fotos e links. Parágrafos e quebras de linha serão preservados.</p><div class="admin-toolbar"><button class="btn" id="addNotice">Adicionar aviso</button><button class="btn secondary" id="saveNotices">Salvar avisos</button></div></div>`+notices.map((n,i)=>`<div class="admin-box clean-card"><div class="admin-card-head"><h3>${esc(n.title||'Novo aviso')} <small>#${i+1}</small></h3><button class="btn secondary" data-del-notice="${i}">Excluir</button></div><div class="form-grid">${field('Título',`<input class="input" data-notice="title" data-i="${i}" value="${esc(n.title||'')}">`)}${field('Data / etiqueta',`<input class="input" data-notice="date" data-i="${i}" value="${esc(n.date||'')}">`)}${field('Texto',`<textarea data-notice="text" data-i="${i}">${esc(n.text||'')}</textarea>`)}${field('Link opcional',`<input class="input" data-notice="url" data-i="${i}" value="${esc(n.url||'')}">`)}${field('Foto',`<input type="file" accept="image/*" data-notice-img="${i}">${n.img?'<p class="muted">Foto carregada</p>':''}`)}${field('Status',`<select data-notice="active" data-i="${i}"><option value="true" ${n.active!==false?'selected':''}>publicado</option><option value="false" ${n.active===false?'selected':''}>oculto</option></select>`)}</div></div>`).join('');
      sec.oninput=e=>{const k=e.target.dataset.notice;if(!k)return;const i=Number(e.target.dataset.i);notices[i][k]=k==='active'?e.target.value==='true':e.target.value};
      sec.onchange=async e=>{if(e.target.dataset.noticeImg!==undefined&&e.target.files?.[0]){const i=Number(e.target.dataset.noticeImg);notices[i].img=await uploadImageFile(e.target.files[0],'avisos');await LS.saveNow('notices',notices);draw()}else sec.oninput(e)};
      sec.onclick=e=>{if(e.target.id==='addNotice'){notices.unshift({id:Date.now(),title:'Novo aviso',date:new Date().toLocaleDateString('pt-BR'),text:'Escreva o comunicado aqui.',url:'',img:'',active:true});draw()}if(e.target.dataset.delNotice!==undefined){notices.splice(Number(e.target.dataset.delNotice),1);draw()}if(e.target.id==='saveNotices'){LS.saveNow('notices',notices).then(ok=>alert(ok?'Avisos salvos no Supabase':'Não foi possível salvar'))}};
    }; draw();
  }
  if(document.getElementById('admNotices')) installNoticeAdmin();
})();

// ===== Estatísticas de acesso no painel ADM =====
(function(){
  const labels={index:'Home',mapa:'Mapa & Guia',checklist:'Checklist',links:'Links',avisos:'Avisos',envio:'Enviar projeto',mobilidade:'Mobilidade',calculadora:'Calculadora','link-detalhe':'Detalhe de link'};
  const fmt=n=>(Number(n)||0).toLocaleString('pt-BR');
  const dateLabel=iso=>new Date(iso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
  const countBy=(rows,key)=>rows.reduce((a,r)=>{const v=r[key]||'Não informado';a[v]=(a[v]||0)+1;return a},{});
  const bars=(obj,labeler=x=>x)=>{const entries=Object.entries(obj).sort((a,b)=>b[1]-a[1]),max=Math.max(1,...entries.map(x=>x[1]));return entries.length?entries.map(([k,v])=>`<div class="stats-row"><span>${esc(labeler(k))}</span><div class="stats-bar"><i style="width:${Math.max(4,v/max*100)}%"></i></div><b>${fmt(v)}</b></div>`).join(''):'<p class="muted">Sem dados no período.</p>'};
  async function loadStats(days=30){
    const sec=document.getElementById('admAnalytics'); if(!sec||!supa)return;
    sec.innerHTML='<div class="admin-box stats-empty"><h2>Carregando estatísticas…</h2></div>';
    const since=new Date(Date.now()-Number(days)*86400000).toISOString();
    const {data,error}=await supa.from('barmy_page_views').select('session_id,page_name,page_path,referrer_host,device_type,visited_at').gte('visited_at',since).order('visited_at',{ascending:false}).limit(10000);
    if(error){sec.innerHTML=`<div class="admin-box"><h2>Estatísticas ainda não ativadas</h2><p class="preserve-lines">${esc(error.message)}\n\nRode o bloco “ESTATÍSTICAS DE ACESSO” do arquivo SUPABASE_SETUP.sql no SQL Editor do Supabase.</p></div>`;return}
    const rows=data||[],sessions=new Set(rows.map(r=>r.session_id)).size,today=new Date().toISOString().slice(0,10),todayRows=rows.filter(r=>String(r.visited_at).slice(0,10)===today),todaySessions=new Set(todayRows.map(r=>r.session_id)).size;
    const pages=countBy(rows,'page_name'),devices=countBy(rows,'device_type'),refs=countBy(rows,'referrer_host'); delete refs['Não informado']; delete refs[''];
    sec.innerHTML=`<div class="admin-box"><div class="admin-card-head"><div><h2>Estatísticas de acesso</h2><p class="muted">Visualizações e sessões guardadas no Supabase. Não registra nome, e-mail ou texto digitado.</p></div></div><div class="stats-toolbar"><select id="statsPeriod"><option value="7" ${days==7?'selected':''}>Últimos 7 dias</option><option value="30" ${days==30?'selected':''}>Últimos 30 dias</option><option value="90" ${days==90?'selected':''}>Últimos 90 dias</option><option value="365" ${days==365?'selected':''}>Últimos 12 meses</option></select><button class="btn secondary" id="refreshStats">Atualizar</button><button class="btn secondary danger" id="clearStats">Apagar estatísticas</button></div><div class="stats-summary"><div class="stats-card"><b>${fmt(rows.length)}</b><span>Visualizações</span></div><div class="stats-card"><b>${fmt(sessions)}</b><span>Sessões</span></div><div class="stats-card"><b>${fmt(todayRows.length)}</b><span>Acessos hoje</span></div><div class="stats-card"><b>${fmt(todaySessions)}</b><span>Sessões hoje</span></div></div></div><div class="stats-columns"><div class="admin-box"><h3>Páginas mais acessadas</h3><div class="stats-list">${bars(pages,k=>labels[k]||k)}</div></div><div class="admin-box"><h3>Dispositivos</h3><div class="stats-list">${bars(devices)}</div></div><div class="admin-box"><h3>Origem dos acessos</h3><div class="stats-list">${bars(refs,k=>k||'Acesso direto')}</div></div><div class="admin-box"><h3>Acessos recentes</h3><div style="overflow:auto"><table class="stats-table"><thead><tr><th>Data</th><th>Página</th><th>Dispositivo</th></tr></thead><tbody>${rows.slice(0,20).map(r=>`<tr><td>${esc(dateLabel(r.visited_at))}</td><td>${esc(labels[r.page_name]||r.page_name)}</td><td>${esc(r.device_type)}</td></tr>`).join('')||'<tr><td colspan="3">Nenhum acesso registrado.</td></tr>'}</tbody></table></div></div></div>`;
    document.getElementById('statsPeriod').onchange=e=>loadStats(e.target.value);
    document.getElementById('refreshStats').onclick=()=>loadStats(document.getElementById('statsPeriod').value);
    document.getElementById('clearStats').onclick=async()=>{if(!confirm('Apagar definitivamente todas as estatísticas de acesso?'))return;const {error}=await supa.from('barmy_page_views').delete().gte('id',0);if(error)alert('Não foi possível apagar: '+error.message);else loadStats(days)};
  }
  const previous=window.showAdminTab;
  window.showAdminTab=function(id){previous(id);if(id==='admAnalytics')loadStats(30)};
})();
