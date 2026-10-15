'use strict';
const $=id=>document.getElementById(id);let db,loans=[],filter='active',editing=null,selectedCatalog=null,catalog=[],catalogSearchTimer;
const CATALOG_URL='https://raw.githubusercontent.com/slimtreble/Riftbound-card-data/main/cards.json';
const RELEASE_API='https://api.github.com/repos/LouisCourrian/riftbound-cards/releases/latest';
const MIRROR_URL='https://huggingface.co/datasets/Wysme/riftbound-cards/resolve/main/cards.json';
const CATALOG_SCHEMA=4;
const today=()=>new Date().toLocaleDateString('en-CA');
const niceDate=d=>{if(!d)return '';const [y,m,day]=d.split('-');return `${day}/${m}/${y}`};
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2800)}
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('riftbound-vault',2);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('loans'))req.result.createObjectStore('loans',{keyPath:'id'});if(!req.result.objectStoreNames.contains('catalog'))req.result.createObjectStore('catalog',{keyPath:'key'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function all(){return new Promise((res,rej)=>{const tx=db.transaction('loans','readonly');const req=tx.objectStore('loans').getAll();req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)})}
function put(record){return new Promise((res,rej)=>{const tx=db.transaction('loans','readwrite');tx.objectStore('loans').put(record);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function remove(id){return new Promise((res,rej)=>{const tx=db.transaction('loans','readwrite');tx.objectStore('loans').delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function catalogStore(mode='readonly'){return db.transaction('catalog',mode).objectStore('catalog')}
function catalogRead(){return new Promise((resolve,reject)=>{const req=catalogStore().get('cards');req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}
function catalogWrite(cards,schema=CATALOG_SCHEMA){return new Promise((resolve,reject)=>{const tx=db.transaction('catalog','readwrite');tx.objectStore('catalog').put({key:'cards',cards,schema,updatedAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
const safeImage=url=>{try{const u=new URL(url);return u.protocol==='https:'&&['cmsassets.rgpub.io','cdn.rgpub.io'].includes(u.hostname)?u.href:''}catch{return ''}};
function imageThumb(url){const valid=safeImage(url);if(!valid)return '';const u=new URL(valid);u.searchParams.set('w','240');u.searchParams.set('fm','webp');u.searchParams.set('q','75');return u.href}
const SET_NAMES={OGN:'Origins',OGS:'Proving Grounds',SFD:'Spiritforged',UNL:'Unleashed',VEN:'Vendetta',RAD:'Radiance',PRM:'Promo'};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’‘]/g,"'");
function normalizeCard(c){
 const setCode=String(c.setCode||c.set||c.code?.split('-')[0]||'').toUpperCase();
 const sourceName=String(c.cardSet||c.setName||c.expansion||'');
 const expansion=SET_NAMES[setCode]||(/proving grounds/i.test(sourceName)?'Proving Grounds':sourceName);
 const name=String(c.fullName||[c.name,c.subtitle].filter(Boolean).join(', '));
 const code=String(c.code||c.publicCode||c.cardCode||'').toUpperCase();
 const id=String(c.id||c.cardCode||code).toLowerCase();
 const tags=Array.isArray(c.tags)?c.tags.map(String).filter(Boolean):[];
 return {id,code,publicCode:String(c.publicCode||code),name,expansion,image:safeImage(c.imageUrl),rarity:String(c.rarity||''),type:String(c.type||c.cardType||''),tags,variant:Boolean(c.isVariant||c.isAltArt||/a\/?\d|\*/i.test(code)),signed:Boolean(c.isSigned||code.includes('*'))};
}
async function getPrimaryCards(){
 try {const mirror=await fetch(MIRROR_URL,{cache:'no-store'});if(mirror.ok){const rows=await mirror.json();if(Array.isArray(rows)&&rows.length>=100)return rows.map(normalizeCard).filter(c=>c.id&&c.name)}}catch(e){/* try GitHub release */}
 const metaResponse=await fetch(RELEASE_API,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
 if(!metaResponse.ok)throw Error('GitHub release HTTP '+metaResponse.status);
 const meta=await metaResponse.json();
 const asset=meta.assets?.find(a=>a.name==='cards.json');
 if(!asset)throw Error('Ultima release senza cards.json');
 // Release assets are hosted on GitHub; the browser follows the redirect to their CDN.
 const response=await fetch(asset.browser_download_url,{cache:'no-store'});
 if(!response.ok)throw Error('Catalogo HTTP '+response.status);
 const payload=await response.json();
 const data=Array.isArray(payload)?payload:(payload.cards||payload.data||[]);
 if(!Array.isArray(data)||data.length<100)throw Error('Catalogo principale incompleto');
 return data.map(normalizeCard).filter(c=>c.id&&c.name);
}
async function getFallbackCards(){const response=await fetch(CATALOG_URL,{cache:'no-store'});if(!response.ok)throw Error('Fallback HTTP '+response.status);const data=await response.json();return data.map(normalizeCard).filter(c=>c.id&&c.name)}
async function loadCatalog(force=false){
 const status=$('catalogStatus');status.textContent='Caricamento catalogo...';
 const saved=await catalogRead();
 if(saved?.cards?.length){catalog=saved.cards;searchCatalog()}
 if(!force&&saved?.schema===CATALOG_SCHEMA&&saved.cards.length){status.textContent=`${catalog.length} stampe disponibili • catalogo salvato`;return}
 let primary=[],fallback=[];const errors=[];
 try{primary=await getPrimaryCards()}catch(e){errors.push('fonte aggiornata: '+e.message)}
 if(!primary.length){try{fallback=await getFallbackCards()}catch(e){errors.push('fonte alternativa: '+e.message)}}
 if(primary.length||fallback.length){
   // Never overwrite a richer cached catalog with an older incomplete source.
   const merged=new Map((saved?.cards||[]).map(c=>[c.id,c]));
   for(const c of fallback)merged.set(c.id,{...merged.get(c.id),...c,tags:c.tags.length?c.tags:(merged.get(c.id)?.tags||[])});
   for(const c of primary)merged.set(c.id,{...merged.get(c.id),...c,tags:c.tags.length?c.tags:(merged.get(c.id)?.tags||[])});
   catalog=[...merged.values()];
   const isCurrent=primary.length>0;
   if(isCurrent)await catalogWrite(catalog,CATALOG_SCHEMA);
   status.textContent=`${catalog.length} stampe • Radiance: ${catalog.filter(c=>c.expansion==='Radiance').length} • ${isCurrent?'catalogo aggiornato':'fonte alternativa (aggiornamento parziale)'}`;
   if(isCurrent)toast('Catalogo aggiornato, inclusi tag e Radiance');
 }else{status.textContent=`${catalog.length?catalog.length+' stampe locali • ':''}Aggiornamento non riuscito. ${errors.join('; ')}`}
 searchCatalog();
}
function searchCatalog(){
 const q=norm($('catalogQuery').value.trim()),set=$('catalogSet').value,type=$('catalogType').value,root=$('catalogResults');
 if(!q&&!set&&!type){root.innerHTML='<p class="hint">Scrivi il nome, il tag di un campione (es. Ahri), o scegli un’espansione.</p>';return}
 const matches=catalog.filter(c=>(!set||c.expansion===set)&&(!type||norm(c.type)===norm(type))&&(!q||norm([c.name,c.code,c.publicCode,c.expansion,...(c.tags||[])].join(' ')).includes(q))).slice(0,80);
 root.innerHTML=matches.length?matches.map(c=>`<button type="button" class="catalog-result" data-id="${escapeHTML(c.id)}"><span class="catalog-art">${c.image?`<img loading="lazy" src="${escapeHTML(imageThumb(c.image))}" alt="">`:'✦'}</span><span class="catalog-info"><b>${escapeHTML(c.name)}</b><small>${escapeHTML(c.expansion)} · ${escapeHTML(c.publicCode)} · ${escapeHTML(c.type)} ${c.tags?.length?'· Tag: '+escapeHTML(c.tags.join(', ')):''} ${c.variant?'· Variante':''} ${c.signed?'· Signed':''}</small></span></button>`).join(''):'<p class="hint">Nessuna carta trovata. Controlla lo stato del catalogo sopra oppure aggiornalo.</p>';
}
function selectCatalog(c){selectedCatalog={code:c.code,publicCode:c.publicCode,image:c.image,name:c.name,expansion:c.expansion};$('cardName').value=c.name;$('expansion').value=c.expansion;$('selectedCard').hidden=false;$('selectedCard').innerHTML=`${c.image?`<img src="${escapeHTML(imageThumb(c.image))}" alt="">`:''}<div><b>${escapeHTML(c.name)}</b><small>${escapeHTML(c.expansion)} · ${escapeHTML(c.publicCode)}</small><small>Immagine selezionata dal catalogo</small></div>`;$('clearCatalog').hidden=false;$('catalogResults').innerHTML='';$('catalogQuery').value=''}
function clearSelection(){selectedCatalog=null;$('selectedCard').hidden=true;$('clearCatalog').hidden=true}
async function refresh(){loans=await all();render()}
function render(){const active=loans.filter(x=>!x.returned);for(const type of ['lent','borrowed']){const rows=active.filter(x=>x.type===type);$(type+'Count').textContent=rows.reduce((n,x)=>n+x.quantity,0);$(type+'Value').textContent=type==='lent'?'Carte attualmente prestate':'Carte attualmente ricevute'}let rows=loans.filter(x=>filter==='all'||(filter==='active'&&!x.returned)||(filter==='returned'&&x.returned)||(filter==='lent'&&x.type==='lent'&&!x.returned)||(filter==='borrowed'&&x.type==='borrowed'&&!x.returned));const query=$('search').value.trim().toLowerCase();if(query)rows=rows.filter(x=>[x.name,x.expansion,x.person,x.notes].some(s=>String(s||'').toLowerCase().includes(query)));rows.sort((a,b)=>b.date.localeCompare(a.date));$('listCount').textContent=rows.length;$('empty').hidden=rows.length>0;$('items').innerHTML=rows.map(x=>`<article class="item">${(x.photo||safeImage(x.cardImage))?`<img class="art" loading="lazy" src="${escapeHTML(x.photo||imageThumb(x.cardImage))}" alt="Foto di ${escapeHTML(x.name)}">`:'<div class="art">✦</div>'}<div class="iteminfo"><div class="itemtop"><div><h4>${escapeHTML(x.name)}</h4><div class="exp">${escapeHTML(x.expansion)}${x.cardCode?` · ${escapeHTML(x.cardCode)}`:''} · ${x.quantity} ${x.quantity===1?'carta':'carte'}</div></div><span class="tag ${x.returned?'returnedtag':x.type==='borrowed'?'borrowedtag':''}">${x.returned?'Restituita':x.type==='lent'?'↗ Prestata':'↙ Ricevuta'}</span></div><div class="details">${x.type==='lent'?'A':'Da'} <b>${escapeHTML(x.person)}</b> · ${niceDate(x.date)}${x.returned?' · resa '+niceDate(x.returnedDate):''}</div><div class="meta"><div class="itembuttons"><button class="action" data-edit="${escapeHTML(x.id)}">Modifica</button>${x.returned?`<button class="action" data-reopen="${escapeHTML(x.id)}">Riapri</button>`:`<button class="action" data-return="${escapeHTML(x.id)}">Restituita ✓</button>`}<button class="action delete" data-delete="${escapeHTML(x.id)}">×</button></div></div></div></article>`).join('')}
function reset(){editing=null;clearSelection();$('catalogQuery').value='';$('catalogSet').value='';$('catalogType').value='';$('catalogResults').innerHTML='';$('loanForm').reset();$('loanDate').value=today();$('editorTitle').textContent='Nuovo prestito';updatePerson()}
function updatePerson(){$('personLabel').firstChild.textContent=document.querySelector('input[name=type]:checked').value==='lent'?'Prestato a *':'Ricevuto da *'}
function showEditor(id){reset();if(id){const x=loans.find(l=>l.id===id);if(!x)return;editing=id;if(x.cardCode){selectedCatalog={code:x.cardCode,publicCode:x.cardPublicCode||x.cardCode,image:x.cardImage||'',name:x.name,expansion:x.expansion};$('selectedCard').hidden=false;$('selectedCard').textContent=`${x.name} · ${x.cardPublicCode||x.cardCode}`;$('clearCatalog').hidden=false}document.querySelector(`input[name=type][value="${x.type}"]`).checked=true;$('cardName').value=x.name;$('expansion').value=x.expansion;$('quantity').value=x.quantity;$('person').value=x.person;$('loanDate').value=x.date;$('notes').value=x.notes||'';$('editorTitle').textContent='Modifica prestito';updatePerson()}$('editor').showModal()}
async function backup(){const payload={app:'riftbound-vault',version:2,exportedAt:new Date().toISOString(),loans};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`riftbound-vault-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Backup esportato')}
async function restore(file){let payload;try{payload=JSON.parse(await file.text())}catch{throw Error('File JSON non valido')}if(payload.app!=='riftbound-vault'||!Array.isArray(payload.loans)||payload.loans.some(x=>!x.id||!x.name||!['lent','borrowed'].includes(x.type)||!x.person||!x.date||!Number.isInteger(x.quantity)))throw Error('Backup non valido');if(!confirm(`Sostituire i dati locali con ${payload.loans.length} prestiti del backup?`))return;await new Promise((res,rej)=>{const tx=db.transaction('loans','readwrite'),store=tx.objectStore('loans');store.clear();payload.loans.forEach(x=>store.put(x));tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});await refresh();toast('Backup ripristinato');$('backup').close()}
async function init(){try{db=await openDb();await refresh()}catch(e){alert('Memoria locale non disponibile. Apri l’app in Safari normale e riprova. '+e.message);return}$('loanDate').value=today();loadCatalog();$('updateCatalog').onclick=()=>loadCatalog(true);$('catalogSet').onchange=searchCatalog;$('catalogType').onchange=searchCatalog;$('catalogQuery').oninput=()=>{clearTimeout(catalogSearchTimer);catalogSearchTimer=setTimeout(searchCatalog,120)};$('catalogResults').onclick=e=>{const btn=e.target.closest('[data-id]');if(btn){const c=catalog.find(x=>x.id===btn.dataset.id);if(c)selectCatalog(c)}};$('clearCatalog').onclick=clearSelection;for(const id of ['fab','newTop','emptyNew','addNav'])$(id).onclick=()=>showEditor();$('backupBtn').onclick=()=>$('backup').showModal();$('exportBtn').onclick=backup;$('importFile').onchange=async e=>{if(!e.target.files[0])return;try{await restore(e.target.files[0])}catch(err){$('backupStatus').textContent=err.message}finally{e.target.value=''}};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());document.querySelectorAll('input[name=type]').forEach(r=>r.onchange=updatePerson);$('search').oninput=render;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(el=>el.classList.toggle('active',el===b));render()});$('historyNav').onclick=()=>document.querySelector('[data-filter="returned"]').click();$('homeBtn').onclick=()=>document.querySelector('[data-filter="active"]').click();$('loanForm').onsubmit=async e=>{e.preventDefault();const old=loans.find(x=>x.id===editing),entry={id:editing||crypto.randomUUID(),type:document.querySelector('input[name=type]:checked').value,name:$('cardName').value.trim(),expansion:$('expansion').value.trim(),price:old?.price??0,quantity:Number($('quantity').value),person:$('person').value.trim(),date:$('loanDate').value,notes:$('notes').value.trim(),photo:old?.photo||null,cardCode:selectedCatalog?.code||null,cardPublicCode:selectedCatalog?.publicCode||null,cardImage:selectedCatalog?.image||null,returned:old?.returned||false,returnedDate:old?.returnedDate||null};if(!entry.name||!entry.expansion||!entry.person||!entry.date||!Number.isInteger(entry.quantity)||entry.quantity<1){toast('Controlla i campi obbligatori');return}try{await put(entry);$('editor').close();await refresh();toast('Carta salvata')}catch(err){toast('Errore salvataggio: memoria piena?')}};$('items').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.edit||b.dataset.return||b.dataset.reopen||b.dataset.delete;if(!id)return;const x=loans.find(l=>l.id===id);if(!x)return;if(b.dataset.edit){showEditor(id);return}if(b.dataset.delete){if(!confirm(`Eliminare definitivamente ${x.name}?`))return;await remove(id)}else if(b.dataset.return){if(!confirm(`Segnare ${x.name} come restituita?`))return;await put({...x,returned:true,returnedDate:today()})}else if(b.dataset.reopen){await put({...x,returned:false,returnedDate:null})}await refresh()};if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});}
init();
