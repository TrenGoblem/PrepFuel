const STORAGE_KEY='flipledger_v2';
const LOCAL_OWNER_KEY='flipledger_local_owner_v1';
const DEFAULT_STATE={projects:[],transactions:[],settings:{businessName:'FlipLedger',openingProfit:0},meta:{updatedAt:null}};
let state=normalizeState(loadState());
let currentType=null;
let inventoryStatus='active';
let cloudReady=false;
let cloudSyncing=false;
let cloudSaveTimer=null;
let lastCloudSaveAt=null;

function normalizeState(value){
  const v=value&&typeof value==='object'?value:{};
  return {
    projects:Array.isArray(v.projects)?v.projects:[],
    transactions:Array.isArray(v.transactions)?v.transactions:[],
    settings:{...DEFAULT_STATE.settings,...(v.settings||{})},
    meta:{...DEFAULT_STATE.meta,...(v.meta||{})}
  }
}

function uid(prefix='id'){return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function money(n){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0))}
function money2(n){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0))}
function pct(n){return (Number(n||0)).toFixed(1)+'%'}
function today(){return new Date().toISOString().slice(0,10)}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function loadState(){
  try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)return {...DEFAULT_STATE,...JSON.parse(raw)}}
  catch(e){}
  return structuredClone(DEFAULT_STATE)
}
function save(options={}){
  const touch=options.touch!==false;
  if(touch)state.meta.updatedAt=new Date().toISOString();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  if(cloudReady&&window.FlipLedgerCloud?.user&&!options.localOnly)scheduleCloudSave();
}
function scheduleCloudSave(){
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer=setTimeout(()=>saveCloudNow().catch(err=>{
    console.warn('FlipLedger cloud save:',err);
    setCloudBadge('Offline copy','');
  }),450);
}
async function saveCloudNow(){
  if(!window.FlipLedgerCloud?.user)return;
  cloudSyncing=true;setCloudBadge('Saving…','syncing');
  const result=await window.FlipLedgerCloud.saveState(state);
  lastCloudSaveAt=result?.updated_at||new Date().toISOString();
  cloudSyncing=false;setCloudBadge('Synced','online');renderAccountSection();
}
function hasBusinessData(s){return Boolean((s?.projects?.length||0)||(s?.transactions?.length||0)||Number(s?.settings?.openingProfit||0))}
function stateTime(s){const t=Date.parse(s?.meta?.updatedAt||'');return Number.isFinite(t)?t:0}
function mergeFirstSync(localState,cloudState){
  const local=normalizeState(localState), remote=normalizeState(cloudState);
  if(!hasBusinessData(local))return remote;
  if(!hasBusinessData(remote))return local;
  const newer=stateTime(local)>=stateTime(remote)?local:remote;
  const older=newer===local?remote:local;
  const projects=[...newer.projects];
  const pids=new Set(projects.map(x=>x.id));
  older.projects.forEach(x=>{if(!pids.has(x.id))projects.push(x)});
  const transactions=[...newer.transactions];
  const tids=new Set(transactions.map(x=>x.id));
  older.transactions.forEach(x=>{if(!tids.has(x.id))transactions.push(x)});
  return normalizeState({...newer,projects,transactions,meta:{updatedAt:new Date().toISOString()}});
}
function setCloudBadge(label,mode=''){
  const el=document.getElementById('cloudStatusBtn');if(!el)return;
  el.textContent=label;el.classList.toggle('online',mode==='online');el.classList.toggle('syncing',mode==='syncing');
}
function projectTx(projectId){return state.transactions.filter(t=>t.projectId===projectId)}
function projectStats(projectId){
  const tx=projectTx(projectId);
  const purchase=tx.filter(t=>t.type==='purchase').reduce((s,t)=>s+Math.abs(Number(t.amount||0)),0);
  const expenses=tx.filter(t=>t.type==='expense').reduce((s,t)=>s+Math.abs(Number(t.amount||0)),0);
  const sales=tx.filter(t=>t.type==='sale').reduce((s,t)=>s+Math.abs(Number(t.amount||0)),0);
  const adjustments=tx.filter(t=>t.type==='adjustment').reduce((s,t)=>s+(t.direction==='in'?1:-1)*Math.abs(Number(t.amount||0)),0);
  const invested=purchase+expenses-Math.min(0,adjustments);
  const net=sales+Math.max(0,adjustments)-invested;
  const sold=sales>0;
  const roi=invested?net/invested*100:0;
  return {purchase,expenses,sales,adjustments,invested,net,sold,roi}
}
function projectStatus(p){
  const s=projectStats(p.id);
  if(s.sold)return 'sold';
  return p.status||'active'
}
function businessStats(){
  const pstats=state.projects.map(p=>({p,...projectStats(p.id)}));
  const sold=pstats.filter(x=>x.sold);
  const active=pstats.filter(x=>!x.sold);
  const realized=sold.reduce((s,x)=>s+x.net,0);
  const tied=active.reduce((s,x)=>s+x.invested,0);
  const sales=sold.reduce((s,x)=>s+x.sales,0);
  const avgRoi=sold.length?sold.reduce((s,x)=>s+x.roi,0)/sold.length:0;
  const month=today().slice(0,7);
  const monthProfit=sold.filter(x=>{
    const sale=projectTx(x.p.id).filter(t=>t.type==='sale').sort((a,b)=>b.date.localeCompare(a.date))[0];
    return sale&&sale.date.startsWith(month)
  }).reduce((s,x)=>s+x.net,0);
  const freeProfit=Number(state.settings.openingProfit||0)+realized-tied;
  return {realized,tied,sales,avgRoi,monthProfit,freeProfit,soldCount:sold.length,activeCount:active.length}
}
function clearLegacyDemoOnce(){
  const key='flipledger_demo_cleanup_v1';
  if(localStorage.getItem(key))return;
  const demoNames=['1995 Ford F-150','2000 Suzuki Intruder 1400','Kawasaki Bayou 350'];
  const exactDemo=state.projects.length===3&&state.transactions.length===8&&state.projects.every(p=>demoNames.includes(p.name))&&state.projects.every(p=>p.notes==='Demo flip'||p.notes==='Demo active inventory');
  if(exactDemo){state.projects=[];state.transactions=[];state.settings.openingProfit=0;save()}
  delete state.settings.demoOnEmpty;
  localStorage.setItem(key,'1');
}
clearLegacyDemoOnce();

function setView(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===view));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));
  if(view==='add')renderAdd();
  if(view==='ledger')renderLedger();
  if(view==='inventory')renderInventory();
  if(view==='analytics')renderAnalytics();
  if(view==='home')renderHome();
  window.scrollTo({top:0,behavior:'smooth'})
}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}
document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-nav]');
  if(nav){
    if(nav.dataset.nav==='add') currentType=nav.dataset.addType||null;
    setView(nav.dataset.nav)
  }
  const choice=e.target.closest('.add-choice');
  if(choice){currentType=choice.dataset.type;renderAdd()}
  const inv=e.target.closest('#inventoryFilter .seg');
  if(inv){inventoryStatus=inv.dataset.status;document.querySelectorAll('#inventoryFilter .seg').forEach(x=>x.classList.toggle('active',x===inv));renderInventory()}
  const card=e.target.closest('[data-project-id]');
  if(card && !e.target.closest('button'))openProject(card.dataset.projectId);
  const del=e.target.closest('[data-delete-tx]');
  if(del){deleteTransaction(del.dataset.deleteTx)}
  const close=e.target.closest('[data-close-dialog]');
  if(close)document.getElementById(close.dataset.closeDialog).close();
  const quick=e.target.closest('[data-quick-action]');
  if(quick){document.getElementById('projectDialog').close();currentType=quick.dataset.quickAction;setView('add');setTimeout(()=>{const sel=document.querySelector('[name=projectId]');if(sel)sel.value=quick.dataset.projectId},0)}
});
document.getElementById('addBackBtn').onclick=()=>{currentType=null;renderAdd()};
document.getElementById('settingsBtn').onclick=()=>{syncSettingsUI();renderAccountSection();document.getElementById('settingsDialog').showModal()};
document.getElementById('cloudStatusBtn').onclick=()=>{syncSettingsUI();renderAccountSection();document.getElementById('settingsDialog').showModal()};
document.getElementById('ledgerSearch').oninput=renderLedger;
document.getElementById('ledgerTypeFilter').onchange=renderLedger;
document.getElementById('inventorySearch').oninput=renderInventory;
document.getElementById('exportCsvBtn').onclick=exportCsv;

function renderHome(){
  const s=businessStats();
  document.getElementById('appTitle').textContent=state.settings.businessName||'FlipLedger';
  document.getElementById('profitPool').textContent=money(s.freeProfit);
  document.getElementById('profitPool').classList.toggle('loss',s.freeProfit<0);
  document.getElementById('realizedProfit').textContent=money(s.realized);
  document.getElementById('cashTied').textContent=money(s.tied);
  document.getElementById('salesRevenue').textContent=money(s.sales);
  document.getElementById('avgRoi').textContent=pct(s.avgRoi);
  const mp=document.getElementById('monthProfitPill');mp.textContent=(s.monthProfit>=0?'+':'')+money(s.monthProfit)+' this month';
  const active=state.projects.filter(p=>!projectStats(p.id).sold).slice(0,6);
  document.getElementById('activeProjects').innerHTML=active.length?active.map(projectCard).join(''):'<div class="empty"><strong>No active flips</strong>Add a purchase to start a project.</div>';
  const recent=[...state.transactions].sort((a,b)=>(b.date+b.id).localeCompare(a.date+a.id)).slice(0,6);
  document.getElementById('recentActivity').innerHTML=recent.length?recent.map(activityRow).join(''):'<div class="empty">No transactions yet.</div>'
}
function projectCard(p){
  const s=projectStats(p.id);
  const expected=Number(p.expectedSale||0);
  const projected=expected?expected-s.invested:null;
  return '<article class="project-card" data-project-id="'+p.id+'"><div class="project-top"><div><div class="project-name">'+esc(p.name)+'</div><small>'+esc(p.category||'Other')+'</small></div><span class="pill">'+esc(projectStatus(p))+'</span></div><div class="project-finance"><div><span>INVESTED</span><strong>'+money(s.invested)+'</strong></div><div><span>'+((projected!==null)?'PROJECTED':'EXPENSES')+'</span><strong class="'+((projected||0)<0?'loss':'')+'">'+(projected!==null?money(projected):money(s.expenses))+'</strong></div><div><span>ROI</span><strong>'+(projected!==null&&s.invested?pct(projected/s.invested*100):'—')+'</strong></div></div></article>'
}
function activityRow(t){
  const p=state.projects.find(p=>p.id===t.projectId);
  const incoming=t.type==='sale'||(t.type==='adjustment'&&t.direction==='in');
  const icon=t.type==='purchase'?'↓':t.type==='expense'?'−':t.type==='sale'?'+':'±';
  return '<div class="activity-row"><div class="activity-icon">'+icon+'</div><div><strong>'+esc(p?.name||'Business')+' · '+esc(labelType(t.type))+'</strong><small>'+esc(t.details||t.category||'')+' · '+esc(t.date)+'</small></div><strong class="'+(incoming?'money-in':'money-out')+'">'+(incoming?'+':'−')+money(Math.abs(t.amount))+'</strong></div>'
}
function labelType(t){return ({purchase:'Purchase',expense:'Expense',sale:'Sale',adjustment:'Adjustment'})[t]||t}
function renderAdd(){
  const chooser=document.getElementById('addChooser');
  const wrap=document.getElementById('addFormWrap');
  if(!currentType){
    chooser.hidden=false;wrap.hidden=true;document.getElementById('transactionForm').innerHTML='';return
  }
  chooser.hidden=true;wrap.hidden=false;
  document.getElementById('addFormTitle').textContent=({purchase:'Buy a vehicle',expense:'Add an expense',sale:'Record a sale',adjustment:'Other money'})[currentType]||'Add';
  renderTransactionForm(currentType)
}
function projectOptions(includeBlank=true){
  const opts=state.projects.filter(p=>!projectStats(p.id).sold).map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
  return (includeBlank?'<option value="">Choose project…</option>':'')+opts
}
function renderTransactionForm(type){
  const f=document.getElementById('transactionForm');
  if(type==='purchase'){
    f.innerHTML='<div class="field full"><label>Title</label><input name="name" required placeholder="1995 Ford F-150"></div>'+
      '<div class="field"><label>Category</label><select name="vehicleCategory"><option>Motorcycle</option><option>ATV</option><option>Dirt Bike</option><option>Minibike</option><option>Go-Kart</option><option>UTV</option><option>Truck</option><option>Car</option><option>Other</option></select></div>'+
      '<div class="field"><label>Purchase price</label><input name="amount" required type="number" step=".01" inputmode="decimal" placeholder="1200"></div>'+
      '<div class="field"><label>Purchase date</label><input name="date" type="date" value="'+today()+'"></div>'+
      '<div class="field"><label>Expected sale price</label><input name="expectedSale" type="number" step=".01" inputmode="decimal" placeholder="6500"></div>'+
      '<div class="field full"><label>Notes</label><textarea name="details" placeholder="Condition, title status, what it needs…"></textarea></div>'+
      '<div class="form-actions"><button class="primary-btn" type="submit">Add project + purchase</button></div>';
  }else if(type==='expense'){
    f.innerHTML='<div class="field full"><label>Project</label><select name="projectId" required>'+projectOptions()+'</select></div>'+
      '<div class="field"><label>Amount</label><input name="amount" required type="number" step=".01" inputmode="decimal" placeholder="85.42"></div>'+
      '<div class="field"><label>Date</label><input name="date" type="date" value="'+today()+'"></div>'+
      '<div class="field"><label>Category</label><select name="category"><option>Parts & repairs</option><option>Fluids & maintenance</option><option>Title / registration</option><option>Towing / transport</option><option>Fuel</option><option>Cleaning / detail</option><option>Marketplace / listing fee</option><option>Tools allocated to project</option><option>Other expense</option></select></div>'+
      '<div class="field"><label>Vendor</label><input name="vendor" placeholder="Walmart, eBay, RockAuto…"></div>'+
      '<div class="field full"><label>What was it?</label><input name="details" placeholder="Battery, carb kit, oil, paint…"></div>'+
      '<div class="form-actions"><button class="primary-btn" type="submit">Add expense</button></div>';
  }else if(type==='sale'){
    const unsold=state.projects.filter(p=>!projectStats(p.id).sold).map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
    f.innerHTML='<div class="field full"><label>Project</label><select name="projectId" required><option value="">Choose project…</option>'+unsold+'</select></div>'+
      '<div class="field"><label>Sale price</label><input name="amount" required type="number" step=".01" inputmode="decimal" placeholder="6500"></div>'+
      '<div class="field"><label>Sale date</label><input name="date" type="date" value="'+today()+'"></div>'+
      '<div class="field"><label>Selling fees</label><input name="fees" type="number" step=".01" inputmode="decimal" placeholder="0"></div>'+
      '<div class="field"><label>Buyer</label><input name="vendor" placeholder="Optional"></div>'+
      '<div class="field full"><label>Final notes</label><textarea name="details" placeholder="Cash sale, marketplace sale, final condition…"></textarea></div>'+
      '<div class="form-actions"><button class="primary-btn" type="submit">Mark sold + calculate profit</button></div>';
  }else{
    f.innerHTML='<div class="field"><label>Project (optional)</label><select name="projectId"><option value="">Business-level adjustment</option>'+state.projects.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('')+'</select></div>'+
      '<div class="field"><label>Direction</label><select name="direction"><option value="out">Cash out</option><option value="in">Cash in</option></select></div>'+
      '<div class="field"><label>Amount</label><input name="amount" required type="number" step=".01" inputmode="decimal"></div>'+
      '<div class="field"><label>Date</label><input name="date" type="date" value="'+today()+'"></div>'+
      '<div class="field"><label>Category</label><input name="category" placeholder="Owner withdrawal, refund…"></div>'+
      '<div class="field"><label>Source / payee</label><input name="vendor"></div>'+
      '<div class="field full"><label>Details</label><input name="details"></div>'+
      '<div class="form-actions"><button class="primary-btn" type="submit">Add adjustment</button></div>';
  }
  f.onsubmit=submitTransaction
}
function submitTransaction(e){
  e.preventDefault();const fd=new FormData(e.currentTarget);const d=Object.fromEntries(fd.entries());
  const amount=Number(d.amount||0);if(!(amount>0))return toast('Enter an amount');
  if(currentType==='purchase'){
    const p={id:uid('p'),name:d.name.trim(),category:d.vehicleCategory,expectedSale:Number(d.expectedSale||0),status:'active',purchaseDate:d.date||today(),notes:d.details};
    state.projects.push(p);
    state.transactions.push({id:uid('t'),projectId:p.id,type:'purchase',category:'Vehicle purchase',date:d.date||today(),amount,vendor:'',details:d.details||'Initial purchase'});
  }else{
    if((currentType==='expense'||currentType==='sale')&&!d.projectId)return toast('Choose a project');
    state.transactions.push({id:uid('t'),projectId:d.projectId||'',type:currentType,category:d.category||(currentType==='sale'?'Vehicle sale':'Adjustment'),date:d.date||today(),amount,vendor:d.vendor||'',details:d.details||'',direction:d.direction||''});
    if(currentType==='sale'){
      const p=state.projects.find(x=>x.id===d.projectId);if(p)p.status='sold';
      const fees=Number(d.fees||0);if(fees>0)state.transactions.push({id:uid('t'),projectId:d.projectId,type:'expense',category:'Selling fees',date:d.date||today(),amount:fees,vendor:d.vendor||'',details:'Selling fees'});
    }
  }
  const savedType=currentType;
  save();renderAll();e.currentTarget.reset();currentType=null;renderAdd();toast(savedType==='sale'?'Sale recorded — profit updated':'Saved')
}
function renderLedger(){
  const q=document.getElementById('ledgerSearch').value.toLowerCase().trim();const ft=document.getElementById('ledgerTypeFilter').value;
  let rows=[...state.transactions].sort((a,b)=>(b.date+b.id).localeCompare(a.date+a.id)).filter(t=>ft==='all'||t.type===ft);
  if(q)rows=rows.filter(t=>{const p=state.projects.find(p=>p.id===t.projectId);return [p?.name,t.category,t.details,t.vendor,t.date].join(' ').toLowerCase().includes(q)});
  const out=rows.filter(t=>t.type==='purchase'||t.type==='expense'||(t.type==='adjustment'&&t.direction!=='in')).reduce((s,t)=>s+Math.abs(Number(t.amount||0)),0);
  const inn=rows.filter(t=>t.type==='sale'||(t.type==='adjustment'&&t.direction==='in')).reduce((s,t)=>s+Math.abs(Number(t.amount||0)),0);
  document.getElementById('ledgerSummary').innerHTML='<div class="summary-chip"><span>Filtered cash out</span><strong>'+money(out)+'</strong></div><div class="summary-chip"><span>Filtered cash in</span><strong>'+money(inn)+'</strong></div><div class="summary-chip"><span>Net cash flow</span><strong class="'+(inn-out<0?'loss':'')+'">'+money(inn-out)+'</strong></div><div class="summary-chip"><span>Rows</span><strong>'+rows.length+'</strong></div>';
  document.getElementById('ledgerBody').innerHTML=rows.length?rows.map(t=>{
    const p=state.projects.find(p=>p.id===t.projectId);const incoming=t.type==='sale'||(t.type==='adjustment'&&t.direction==='in');const s=p?projectStats(p.id):null;
    return '<tr><td>'+esc(t.date)+'</td><td class="ledger-project">'+esc(p?.name||'Business')+'</td><td>'+labelType(t.type)+'</td><td>'+esc(t.category||'—')+'</td><td class="ledger-details" title="'+esc(t.details||'')+'">'+esc(t.details||t.vendor||'—')+'</td><td class="num money-out">'+(!incoming?money2(Math.abs(t.amount)):'—')+'</td><td class="num money-in">'+(incoming?money2(Math.abs(t.amount)):'—')+'</td><td class="num '+(s&&s.net<0?'loss':'')+'">'+(s&&s.sold?money2(s.net):'—')+'</td><td><div class="row-actions"><button class="mini-btn" data-delete-tx="'+t.id+'">Delete</button></div></td></tr>'
  }).join(''):'<tr><td colspan="9"><div class="empty">No ledger rows match.</div></td></tr>'
}
function deleteTransaction(id){
  const t=state.transactions.find(x=>x.id===id);if(!t)return;
  if(!confirm('Delete this '+labelType(t.type).toLowerCase()+' entry?'))return;
  state.transactions=state.transactions.filter(x=>x.id!==id);
  if(t.type==='sale'){const p=state.projects.find(x=>x.id===t.projectId);if(p&&!projectStats(p.id).sold)p.status='active'}
  save();renderAll();toast('Entry deleted')
}
function renderInventory(){
  const q=document.getElementById('inventorySearch').value.toLowerCase().trim();
  const list=state.projects.filter(p=>{
    const sold=projectStats(p.id).sold;const ok=inventoryStatus==='all'||(inventoryStatus==='sold'?sold:!sold);
    return ok&&(!q||[p.name,p.category,p.make,p.model,p.engine].join(' ').toLowerCase().includes(q))
  });
  document.getElementById('inventoryGrid').innerHTML=list.length?list.map(p=>{
    const s=projectStats(p.id);const expected=Number(p.expectedSale||0);const result=s.sold?s.net:(expected?expected-s.invested:null);
    const icon=({Motorcycle:'🏍',ATV:'▰','Dirt Bike':'🏍',Minibike:'⚙','Go-Kart':'◫',UTV:'▣',Truck:'▰',Car:'▱'})[p.category]||'⚙';
    return '<article class="inventory-card" data-project-id="'+p.id+'"><div class="vehicle-visual">'+icon+'<span class="pill '+(s.sold?'sold':'')+'" style="margin-left:auto">'+(s.sold?'Sold':esc(p.status||'Active'))+'</span></div><div class="inventory-body"><h3>'+esc(p.name)+'</h3><p>'+esc(p.category||'Other')+'</p><div class="inventory-stats"><div><span>Invested</span><strong>'+money(s.invested)+'</strong></div><div><span>'+(s.sold?'Profit':'Projected')+'</span><strong class="'+((result||0)<0?'loss':'')+'">'+(result===null?'—':money(result))+'</strong></div><div><span>ROI</span><strong>'+(s.sold?pct(s.roi):(result!==null&&s.invested?pct(result/s.invested*100):'—'))+'</strong></div></div></div></article>'
  }).join(''):'<div class="empty"><strong>Nothing here</strong>Try another filter or add a purchase.</div>'
}
function openProject(id){
  const p=state.projects.find(p=>p.id===id);if(!p)return;const s=projectStats(id);const tx=[...projectTx(id)].sort((a,b)=>(b.date+b.id).localeCompare(a.date+a.id));const expected=Number(p.expectedSale||0);const projected=expected?expected-s.invested:null;
  document.getElementById('projectDialogContent').innerHTML='<div class="dialog-head"><div><div class="eyebrow">'+esc(p.category||'PROJECT')+'</div><h2>'+esc(p.name)+'</h2></div><button class="icon-btn" onclick="document.getElementById(\'projectDialog\').close()">✕</button></div>'+
    '<div class="project-detail-hero"><span class="pill '+(s.sold?'sold':'')+'">'+(s.sold?'Sold':esc(p.status||'Active'))+'</span><p>'+esc(p.category||'Project')+'</p><div class="detail-metrics"><div><span>Purchase</span><strong>'+money(s.purchase)+'</strong></div><div><span>Expenses</span><strong>'+money(s.expenses)+'</strong></div><div><span>Total invested</span><strong>'+money(s.invested)+'</strong></div><div><span>'+(s.sold?'Real profit':'Projected')+'</span><strong class="'+((s.sold?s.net:(projected||0))<0?'loss':'')+'">'+(s.sold?money(s.net):(projected!==null?money(projected):'—'))+'</strong></div></div><div class="project-actions">'+(!s.sold?'<button class="primary-small" data-quick-action="expense" data-project-id="'+p.id+'">+ Expense</button><button class="outline-btn" data-quick-action="sale" data-project-id="'+p.id+'">Mark sold</button>':'')+'<button class="outline-btn" onclick="editExpectedSale(\''+p.id+'\')">Expected sale</button><button class="danger-btn" onclick="deleteProject(\''+p.id+'\')">Delete project</button></div></div>'+
    '<div class="dialog-body"><h3 style="margin-top:0">Project ledger</h3><div class="project-ledger">'+(tx.length?tx.map(t=>{const incoming=t.type==='sale'||(t.type==='adjustment'&&t.direction==='in');return '<div class="project-entry"><span>'+labelType(t.type)+'</span><div><strong>'+esc(t.details||t.category||'')+'</strong><small>'+esc(t.date)+' · '+esc(t.vendor||'')+'</small></div><strong class="'+(incoming?'money-in':'money-out')+'">'+(incoming?'+':'−')+money2(Math.abs(t.amount))+'</strong></div>'}).join(''):'<div class="empty">No entries.</div>')+'</div></div>';
  document.getElementById('projectDialog').showModal()
}
window.editExpectedSale=function(id){const p=state.projects.find(x=>x.id===id);if(!p)return;const v=prompt('Expected sale price',p.expectedSale||'');if(v===null)return;p.expectedSale=Number(v||0);save();renderAll();openProject(id)}
window.deleteProject=function(id){const p=state.projects.find(x=>x.id===id);if(!p||!confirm('Delete '+p.name+' and every ledger entry attached to it?'))return;state.projects=state.projects.filter(x=>x.id!==id);state.transactions=state.transactions.filter(t=>t.projectId!==id);save();document.getElementById('projectDialog').close();renderAll();toast('Project deleted')}
function renderAnalytics(){
  const stats=businessStats();const sold=state.projects.map(p=>({p,...projectStats(p.id)})).filter(x=>x.sold);
  const avgProfit=sold.length?sold.reduce((s,x)=>s+x.net,0)/sold.length:0;
  const best=sold.length?[...sold].sort((a,b)=>b.net-a.net)[0]:null;
  const worst=sold.length?[...sold].sort((a,b)=>a.net-b.net)[0]:null;
  document.getElementById('analyticsCards').innerHTML='<article class="metric-card"><span>Average profit</span><strong>'+money(avgProfit)+'</strong><small>Per sold flip</small></article><article class="metric-card"><span>Best flip</span><strong>'+(best?money(best.net):'$0')+'</strong><small>'+(best?esc(best.p.name):'No sales yet')+'</small></article><article class="metric-card"><span>Lowest flip</span><strong class="'+(worst&&worst.net<0?'loss':'')+'">'+(worst?money(worst.net):'$0')+'</strong><small>'+(worst?esc(worst.p.name):'No sales yet')+'</small></article><article class="metric-card"><span>Closed flips</span><strong>'+stats.soldCount+'</strong><small>'+stats.activeCount+' active</small></article>';
  const months=[];const now=new Date();for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(d.toISOString().slice(0,7))}
  const monthVals=months.map(m=>sold.filter(x=>projectTx(x.p.id).some(t=>t.type==='sale'&&t.date.startsWith(m))).reduce((s,x)=>s+x.net,0));const max=Math.max(1,...monthVals.map(Math.abs));
  document.getElementById('monthlyChart').innerHTML=months.map((m,i)=>'<div class="bar-col"><div class="bar '+(monthVals[i]<0?'negative':'')+'" style="height:'+Math.max(2,Math.abs(monthVals[i])/max*100)+'%"><span class="bar-value">'+money(monthVals[i])+'</span></div><small>'+new Date(m+'-02').toLocaleString('en-US',{month:'short'})+'</small></div>').join('');
  const cats={};sold.forEach(x=>cats[x.p.category||'Other']=(cats[x.p.category||'Other']||0)+x.net);const catEntries=Object.entries(cats).sort((a,b)=>b[1]-a[1]);const catMax=Math.max(1,...catEntries.map(x=>Math.abs(x[1])));
  document.getElementById('categoryChart').innerHTML=catEntries.length?catEntries.map(([c,v])=>'<div class="category-row"><span>'+esc(c)+'</span><div class="track"><div class="fill" style="width:'+Math.abs(v)/catMax*100+'%"></div></div><strong class="'+(v<0?'loss':'')+'">'+money(v)+'</strong></div>').join(''):'<div class="empty">Sell a flip to see category analytics.</div>';
  document.getElementById('flipRanking').innerHTML=sold.length?[...sold].sort((a,b)=>b.net-a.net).map((x,i)=>'<div class="ranking-row"><span class="rank-num">'+(i+1)+'</span><div class="ranking-meta"><strong>'+esc(x.p.name)+'</strong><small>'+esc(x.p.category||'Other')+' · '+pct(x.roi)+' ROI</small></div><strong>'+money(x.invested)+'</strong><strong class="'+(x.net<0?'loss':'money-in')+'">'+money(x.net)+'</strong></div>').join(''):'<div class="empty">No closed flips yet.</div>'
}
function exportCsv(){
  const headers=['Date','Project','Type','Category','Details','Vendor','Cash Out','Cash In','Project Net Profit'];
  const rows=[...state.transactions].sort((a,b)=>a.date.localeCompare(b.date)).map(t=>{const p=state.projects.find(p=>p.id===t.projectId);const incoming=t.type==='sale'||(t.type==='adjustment'&&t.direction==='in');const s=p?projectStats(p.id):null;return [t.date,p?.name||'Business',labelType(t.type),t.category||'',t.details||'',t.vendor||'',incoming?'':Math.abs(t.amount),incoming?Math.abs(t.amount):'',s&&s.sold?s.net:'']});
  const csv=[headers,...rows].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');downloadBlob(csv,'flipledger-ledger.csv','text/csv');toast('CSV exported')
}
function downloadBlob(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function renderAccountSection(){
  const box=document.getElementById('accountSection');if(!box)return;
  const cloud=window.FlipLedgerCloud;
  if(!cloud?.configured){
    box.innerHTML='<div class="account-card"><div class="account-head"><div><strong>Cloud account unavailable</strong><small>Your data is still saved locally on this device.</small></div></div></div>';
    setCloudBadge('Local','');return
  }
  if(cloud.user){
    const stamp=lastCloudSaveAt?new Date(lastCloudSaveAt).toLocaleString():state.meta.updatedAt?new Date(state.meta.updatedAt).toLocaleString():'Not yet';
    box.innerHTML='<div class="account-card signed-in"><div class="account-head"><div><strong>'+esc(cloud.user.email||'Signed in')+'</strong><small>Your FlipLedger data is backed up to your account and restores on other devices.</small></div><span class="account-state">Cloud on</span></div><div class="sync-line"><span>Last saved</span><strong>'+esc(stamp)+'</strong></div><div class="auth-actions" style="margin-top:11px"><button id="syncNowBtn" class="outline-btn" type="button">Sync now</button><button id="signOutBtn" class="outline-btn" type="button">Sign out</button></div></div>';
    box.querySelector('#syncNowBtn').onclick=async()=>{try{await saveCloudNow();toast('Cloud backup updated')}catch(e){alert(e.message||'Could not sync')}};
    box.querySelector('#signOutBtn').onclick=async()=>{await cloud.signOut();cloudReady=false;renderAccountSection();setCloudBadge('Local','');toast('Signed out — local copy kept')};
    setCloudBadge(cloudSyncing?'Saving…':'Synced',cloudSyncing?'syncing':'online');
    return
  }
  box.innerHTML='<div class="account-card"><div class="account-head"><div><strong>Back up FlipLedger</strong><small>Sign in with the same account system as Fuelr. Your projects and ledger will follow you between devices.</small></div></div><form id="authForm" class="auth-form"><div class="auth-row"><input name="email" type="email" autocomplete="email" placeholder="Email" required><input name="password" type="password" autocomplete="current-password" placeholder="Password" minlength="6" required></div><div class="auth-actions"><button class="primary-small" name="action" value="signin" type="submit">Sign in</button><button class="outline-btn" name="action" value="signup" type="submit">Create account</button></div><div class="auth-note">If you already made a Fuelr account, use the same email and password here.</div></form></div>';
  box.querySelector('#authForm').onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget), email=String(fd.get('email')||'').trim(), password=String(fd.get('password')||'');
    const action=e.submitter?.value||'signin';
    try{
      setCloudBadge(action==='signup'?'Creating…':'Signing in…','syncing');
      const result=action==='signup'?await cloud.signUp(email,password):await cloud.signIn(email,password);
      if(result.error)throw result.error;
      if(action==='signup'&&!result.data?.session){
        alert('Account created. Check your email to confirm it, then sign in.');
      }else{
        await initializeCloudState();
        toast('Account connected');
      }
      renderAccountSection();
    }catch(err){setCloudBadge('Local','');alert(err.message||'Account sign-in failed')}
  };
  setCloudBadge('Local','')
}
async function initializeCloudState(){
  const cloud=window.FlipLedgerCloud;
  if(!cloud?.configured||!cloud.user){cloudReady=false;renderAccountSection();return}
  cloudReady=false;setCloudBadge('Restoring…','syncing');
  try{
    const remote=await cloud.getState();
    const cachedOwner=localStorage.getItem(LOCAL_OWNER_KEY);
    if(cachedOwner&&cachedOwner!==cloud.user.id){
      state=remote?.state?normalizeState(remote.state):structuredClone(DEFAULT_STATE);
      save({touch:false,localOnly:true});
    }else if(remote?.state){
      state=mergeFirstSync(state,remote.state);
      save({touch:false,localOnly:true});
    }else{
      state.meta.updatedAt=state.meta.updatedAt||new Date().toISOString();
      save({touch:false,localOnly:true});
    }
    localStorage.setItem(LOCAL_OWNER_KEY,cloud.user.id);
    cloudReady=true;
    await saveCloudNow();
    renderAll();
  }catch(err){
    console.warn('FlipLedger cloud restore:',err);
    cloudReady=true;
    setCloudBadge('Offline copy','');
  }
  renderAccountSection()
}
async function initCloud(){
  const cloud=window.FlipLedgerCloud;
  if(!cloud?.configured){setCloudBadge('Local','');return}
  try{
    await cloud.init();
    if(cloud.user)await initializeCloudState();
    else renderAccountSection();
  }catch(err){console.warn('FlipLedger cloud init:',err);setCloudBadge('Local','')}
}
window.addEventListener('flipledger-auth-change',async e=>{
  if(e.detail?.user&&!cloudReady)await initializeCloudState();
  if(!e.detail?.user){cloudReady=false;setCloudBadge('Local','');renderAccountSection()}
});

function syncSettingsUI(){document.getElementById('businessNameInput').value=state.settings.businessName||'FlipLedger';document.getElementById('openingProfitInput').value=state.settings.openingProfit||0}
document.getElementById('businessNameInput').onchange=e=>{state.settings.businessName=e.target.value||'FlipLedger';save();renderAll()}
document.getElementById('openingProfitInput').onchange=e=>{state.settings.openingProfit=Number(e.target.value||0);save();renderAll()}
document.getElementById('backupBtn').onclick=()=>downloadBlob(JSON.stringify(state,null,2),'flipledger-backup-'+today()+'.json','application/json');
document.getElementById('restoreInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!data.projects||!data.transactions)throw Error();state={...DEFAULT_STATE,...data};save();renderAll();document.getElementById('settingsDialog').close();toast('Backup restored')}catch{alert('That backup file is not valid.')}e.target.value=''}
document.getElementById('clearDataBtn').onclick=()=>{if(!confirm('Clear every project and ledger entry? This cannot be undone unless you have a backup.'))return;state=structuredClone(DEFAULT_STATE);save();renderAll();document.getElementById('settingsDialog').close();toast('All data cleared')}
function renderAll(){renderHome();renderLedger();renderInventory();renderAnalytics()}
renderAdd();renderAll();initCloud();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
