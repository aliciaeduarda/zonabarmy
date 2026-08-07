/* Zona BARMY — estatísticas próprias e simples, armazenadas no Supabase. */
(function(){
  'use strict';
  const URL='https://oxgkehgkndfrblgdvmvy.supabase.co';
  const KEY='sb_publishable_5Bq2nVQWYOjtIutu99PGKQ_qZELKw_J';
  if(!window.supabase?.createClient || location.protocol==='file:') return;
  const client=window.supabase.createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const sessionKey='zb_analytics_session';
  const lastKey='zb_analytics_last';
  function id(){
    let value=sessionStorage.getItem(sessionKey);
    if(!value){value=(crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`);sessionStorage.setItem(sessionKey,value)}
    return value;
  }
  function device(){
    const w=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
    return w<768?'celular':w<1100?'tablet':'computador';
  }
  function page(){
    const name=(location.pathname.split('/').pop()||'index.html').replace('.html','');
    return name||'home';
  }
  async function track(){
    const signature=`${page()}|${location.pathname}`;
    const previous=JSON.parse(sessionStorage.getItem(lastKey)||'{}');
    if(previous.signature===signature && Date.now()-Number(previous.time||0)<30000) return;
    sessionStorage.setItem(lastKey,JSON.stringify({signature,time:Date.now()}));
    const ref=document.referrer?(()=>{try{return new URL(document.referrer).hostname}catch{return ''}})():'';
    const {error}=await client.from('barmy_page_views').insert({
      session_id:id(),page_name:page(),page_path:location.pathname||'/',referrer_host:ref,device_type:device()
    });
    if(error) console.warn('Estatísticas não registradas. Rode o SQL atualizado no Supabase.',error.message);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',track,{once:true});else track();
})();
