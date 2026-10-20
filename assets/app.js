const DEFAULTS = {
  schoolYearBudget: 2500,
  academicWeeks: 32,
  mealsPerWeek: 14,
  recipeCostPerMeal: 5.00,
  producePerMeal: 0.575,
  preferredStore: 'Aldi',
  altStore: 'Walmart'
};

const state = {
  tab: localStorage.getItem('pf_tab') || 'home',
  recipes: [],
  selectedRecipeId: localStorage.getItem('pf_selected_recipe') || '',
  checked: JSON.parse(localStorage.getItem('pf_checked') || '{}'),
  settings: {...DEFAULTS, ...JSON.parse(localStorage.getItem('pf_settings') || '{}')},
  lastSync: localStorage.getItem('pf_last_sync') || '',
  detailId: ''
};

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const syncBtn = document.getElementById('syncBtn');
const toast = document.getElementById('toast');
const money = v => '$' + Number(v || 0).toFixed(2);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const weeklyProduce = () => state.settings.producePerMeal * state.settings.mealsPerWeek;
const weeklyRecipe = () => state.settings.recipeCostPerMeal * state.settings.mealsPerWeek;
const weeklyTotal = () => weeklyProduce() + weeklyRecipe();
const plannedYear = () => weeklyTotal() * state.settings.academicWeeks;
const semesterBudget = () => state.settings.schoolYearBudget / 2;
const buffer = () => state.settings.schoolYearBudget - plannedYear();

function saveSettings(){ localStorage.setItem('pf_settings', JSON.stringify(state.settings)); }
function showToast(msg){ toast.textContent = msg; toast.classList.remove('hidden'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>toast.classList.add('hidden'),2200); }

async function syncRecipes(silent=false){
  syncBtn.classList.add('syncing');
  try{
    const res = await fetch('data/recipes.json?v=' + Date.now(), {cache:'no-store'});
    if(!res.ok) throw new Error('Recipe catalog unavailable');
    const data = await res.json();
    state.recipes = Array.isArray(data.recipes) ? data.recipes : [];
    state.lastSync = new Date().toISOString();
    localStorage.setItem('pf_last_sync', state.lastSync);
    if(!silent) showToast('Recipe library synced');
  }catch(e){
    if(!silent) showToast('Could not sync — using saved app data');
  }finally{
    syncBtn.classList.remove('syncing');
    render();
  }
}

function selectedRecipe(){ return state.recipes.find(r=>r.id===state.selectedRecipeId); }
function setTab(tab){ state.tab=tab; state.detailId=''; localStorage.setItem('pf_tab',tab); render(); window.scrollTo({top:0,behavior:'smooth'}); }
function setSelected(id){ state.selectedRecipeId=id; localStorage.setItem('pf_selected_recipe',id); state.checked={}; localStorage.setItem('pf_checked','{}'); showToast('Set as this week’s 14-meal prep'); render(); }

function recipeCard(r){
  const photo = r.photo ? esc(r.photo) : 'assets/meal-placeholder.svg';
  return `<article class="card recipe-card" data-recipe="${esc(r.id)}">
    <img class="recipe-image" src="${photo}" alt="${esc(r.name)}" onerror="this.src='assets/meal-placeholder.svg'">
    <div class="info">
      <h3>${esc(r.name)}</h3>
      <div class="chips">
        ${r.macros?.protein ? `<span class="chip blue">${esc(r.macros.protein)}g PRO</span>`:''}
        ${r.macros?.calories ? `<span class="chip">${esc(r.macros.calories)} CAL</span>`:''}
        ${r.id===state.selectedRecipeId ? `<span class="chip green">THIS WEEK</span>`:''}
      </div>
      <div class="cost">${money(r.costPerMeal ?? state.settings.recipeCostPerMeal)} <small>/ MEAL</small></div>
    </div>
  </article>`;
}

function renderHome(){
  const r=selectedRecipe();
  const pct = Math.min(100,(plannedYear()/state.settings.schoolYearBudget)*100);
  return `<section class="hero hero-showcase">
    <div class="hero-panel">
      <div class="hero-copy-block">
        <div class="eyebrow">Built for athletes</div>
        <h1>Train hard. <span class="accent">Eat sharp.</span></h1>
        <p>A clean weekly fuel system with bold visuals, simple moves, and zero guesswork. Pick the meal, shop fast, cook once, and coast all week.</p>
        <div class="hero-actions">
          ${r ? `<button class="btn primary" data-go="grocery">This week’s grocery run</button>` : `<button class="btn primary" data-go="recipes">Build my week</button>`}
          <button class="btn ghost" data-go="recipes">Swipe meals</button>
        </div>
      </div>
      <div class="hero-stage">
        <div class="hero-orb"></div>
        <div class="hero-stat-card primary">
          <small>weekly target</small>
          <strong>${money(weeklyTotal())}</strong>
          <span>${state.settings.mealsPerWeek} meals + produce</span>
        </div>
        <div class="hero-stat-card secondary">
          <small>default meal</small>
          <strong>${money(state.settings.recipeCostPerMeal)}</strong>
          <span>protein-first serving</span>
        </div>
        <div class="hero-pill">${state.settings.mealsPerWeek} meals / week</div>
      </div>
    </div>
  </section>

  <section class="swipe-section">
    <div class="section-head compact"><div><h2>Why it hits</h2><p>Made to feel fast and satisfying</p></div><span class="micro-copy">Swipe →</span></div>
    <div class="swipe-rail">
      <article class="swipe-card spotlight">
        <div class="swipe-top">Locked in</div>
        <h3>One Sunday prep. Full week covered.</h3>
        <p>Choose one meal and auto-build the full ${state.settings.mealsPerWeek}-meal game plan.</p>
      </article>
      <article class="swipe-card">
        <div class="swipe-top">Budget first</div>
        <h3>${money(state.settings.schoolYearBudget)} school-year cap</h3>
        <p>PrepFuel splits your recipe spend and produce allowance so the numbers stay clean.</p>
      </article>
      <article class="swipe-card">
        <div class="swipe-top">Athlete mode</div>
        <h3>Protein, carbs, and real volume.</h3>
        <p>Meals are adjusted for serious appetite, training, and actual recovery—not tiny portions.</p>
      </article>
    </div>
  </section>

  <div class="grid two feature-metrics">
    <div class="metric glass blue"><div class="label">Meal target</div><div class="value">${money(state.settings.recipeCostPerMeal)}</div><div class="sub">per prepared meal</div></div>
    <div class="metric glass"><div class="label">Produce add-on</div><div class="value">${money(weeklyProduce())}</div><div class="sub">fruit + veggies / week</div></div>
    <div class="metric glass"><div class="label">Weekly total</div><div class="value">${money(weeklyTotal())}</div><div class="sub">14 meals + produce</div></div>
    <div class="metric glass red"><div class="label">School year</div><div class="value">${money(state.settings.schoolYearBudget)}</div><div class="sub">${state.settings.academicWeeks} school weeks</div></div>
  </div>

  <section class="section">
    <div class="section-head"><div><h2>This week</h2><p>One recipe × ${state.settings.mealsPerWeek} meals</p></div>${r?`<button class="link-btn" data-go="grocery">Open grocery →</button>`:''}</div>
    ${r ? recipeCard(r) : `<div class="empty stylish"><div class="icon">⚡</div><h3>No meal selected yet</h3><p>Once your first recipe is added, pick it in Meals and PrepFuel will turn it into your full weekly prep system.</p><div class="spacer"></div><button class="btn primary" data-go="recipes">Open Meals</button></div>`}
  </section>

  <section class="section">
    <div class="section-head"><div><h2>Budget pace</h2><p>${state.settings.academicWeeks} weeks</p></div></div>
    <div class="card budget-feature"><div class="card-body">
      <div class="cost-box"><div><div class="kicker">Planned school-year spend</div><strong>${money(plannedYear())}</strong></div><div class="chip green">${buffer()>=0?money(buffer())+' BUFFER':'OVER'}</div></div>
      <div class="progress fat" style="margin-top:14px"><span style="width:${pct}%"></span></div>
      <div class="mini-split">
        <div><span>Meals</span><strong>${money(weeklyRecipe())}/wk</strong></div>
        <div><span>Fruit + veg</span><strong>${money(weeklyProduce())}/wk</strong></div>
      </div>
    </div></div>
  </section>`;
}

function renderRecipes(){
  return `<section class="hero"><div class="eyebrow">Recipe library</div><h1>Your <span class="accent">fuel lineup.</span></h1><p>Every recipe you send gets athlete-scaled, priced, and saved here. Pick one recipe for all 14 meals that week.</p></section>
    <div class="notice blue"><span class="status-dot"></span>Online recipe catalog${state.lastSync?` · last synced ${new Date(state.lastSync).toLocaleString()}`:''}</div>
    <section class="section"><div class="grid">${state.recipes.length?state.recipes.map(recipeCard).join(''):`<div class="empty"><div class="icon">▦</div><h3>Ready for recipe #1</h3><p>Send the recipe name, picture, ingredients, quantities, and cooking instructions in ChatGPT. It will be added to this same app.</p></div>`}</div></section>`;
}

function renderRecipeDetail(r){
  const photo = r.photo ? esc(r.photo) : 'assets/meal-placeholder.svg';
  const ingredients = r.ingredients || [];
  const steps = r.instructions || [];
  return `<button class="link-btn" data-go="recipes">← Meals</button>
    <section class="section">
      <div class="detail-hero"><img src="${photo}" alt="${esc(r.name)}" onerror="this.src='assets/meal-placeholder.svg'"><div class="detail-title"><div class="eyebrow">14-meal athlete prep</div><h1>${esc(r.name)}</h1><div class="chips"><span class="chip blue">${money(r.costPerMeal ?? state.settings.recipeCostPerMeal)}/MEAL</span>${r.sourceName?`<span class="chip">SOURCE: ${esc(r.sourceName)}</span>`:''}</div></div></div>
      <div class="macro-grid">
        <div class="macro"><strong>${esc(r.macros?.calories ?? '—')}</strong><small>Calories</small></div>
        <div class="macro"><strong>${esc(r.macros?.protein ?? '—')}g</strong><small>Protein</small></div>
        <div class="macro"><strong>${esc(r.macros?.carbs ?? '—')}g</strong><small>Carbs</small></div>
        <div class="macro"><strong>${esc(r.macros?.fat ?? '—')}g</strong><small>Fat</small></div>
      </div>
      <div style="margin-top:12px"><button class="btn ${r.id===state.selectedRecipeId?'secondary':'primary'} full" data-select="${esc(r.id)}">${r.id===state.selectedRecipeId?'✓ Selected for this week':'Use this for all 14 meals'}</button></div>
    </section>
    ${r.optimizationNote?`<section class="section"><div class="notice blue"><strong>Athlete adjustment:</strong> ${esc(r.optimizationNote)}</div></section>`:''}
    <section class="section"><div class="section-head"><div><h2>Ingredients</h2><p>Scaled for ${esc(r.servings ?? 14)} servings</p></div></div><div class="card"><div class="card-body"><div class="list">${ingredients.map(i=>`<div class="list-item"><div>•</div><div><div class="item-main">${esc(i.item)}</div><div class="item-sub">${esc(i.quantity)} ${esc(i.unit||'')}${i.note?` · ${esc(i.note)}`:''}</div></div><div class="item-cost">${i.usedCost!=null?money(i.usedCost):''}</div></div>`).join('')||'<div class="kicker">Ingredient details coming with this recipe.</div>'}</div></div></div></section>
    <section class="section"><div class="section-head"><div><h2>Cook it</h2><p>Sunday prep</p></div></div><div class="card"><div class="card-body">${steps.map((s,i)=>`<div class="step"><div class="step-num">${i+1}</div><p>${esc(s)}</p></div>`).join('')||'<div class="kicker">Cooking steps coming with this recipe.</div>'}</div></div></section>
    <section class="section"><div class="notice red"><strong>Storage:</strong> Refrigerate only the first 3–4 days of cooked meals. Freeze the later-week portions promptly and thaw safely in the refrigerator before reheating.</div></section>`;
}

function groceryRows(r){
  if(!r) return '';
  const rows = r.shopping || r.ingredients || [];
  const groups = {};
  rows.forEach((it,idx)=>{ const g=it.category||'Other'; (groups[g] ||= []).push({...it,_idx:idx}); });
  return Object.entries(groups).map(([g,items])=>`<div class="category-title">${esc(g)}</div><div class="list">${items.map(it=>{
    const key=`${r.id}:${it._idx}`; const checked=!!state.checked[key];
    return `<label class="list-item ${checked?'checked':''}"><input type="checkbox" data-check="${esc(key)}" ${checked?'checked':''}><div><div class="item-main">${esc(it.item)}</div><div class="item-sub">${esc(it.buyQuantity ?? it.quantity ?? '')} ${esc(it.unit||'')}${it.preferredStore?` · ${esc(it.preferredStore)}`:` · ${esc(state.settings.preferredStore)} first`}${it.altStore?` / ${esc(it.altStore)}`:''}${it.priceStatus?` · ${esc(it.priceStatus)}`:''}</div></div><div class="item-cost">${it.checkoutCost!=null?money(it.checkoutCost):''}</div></label>`;}).join('')}</div>`).join('');
}

function renderGrocery(){
  const r=selectedRecipe();
  return `<section class="hero"><div class="eyebrow">Store run</div><h1>Grab it. Check it. <span class="accent">Get out.</span></h1><p>Your exact 14-meal ingredient list plus a separate fruit and vegetable allowance.</p></section>
    ${r?`<div class="card"><div class="card-body"><div class="cost-box"><div><div class="kicker">${esc(r.name)}</div><strong>${money((r.checkoutTotal ?? weeklyRecipe()))}</strong></div><span class="chip blue">CHECKOUT EST.</span></div><p class="settings-note">Checkout cost can be higher than consumed recipe cost because you buy full packages. Prices are labeled estimated or verified per ingredient.</p></div></div>
    <section class="section">${groceryRows(r)}</section>`:`<div class="empty"><div class="icon">✓</div><h3>No weekly meal selected</h3><p>Choose a recipe in Meals first. Your shopping list will appear here automatically.</p><div class="spacer"></div><button class="btn primary" data-go="recipes">Choose meal</button></div>`}
    <section class="section"><div class="category-title">Extra produce</div><div class="card"><div class="card-body"><div class="cost-box"><div><div class="kicker">Fruit + vegetables</div><strong>${money(weeklyProduce())}</strong></div><span class="chip green">WEEKLY</span></div><p class="settings-note">Exact scaled allowance from the original $0.46/meal produce budget: ${money(state.settings.producePerMeal)} per meal × ${state.settings.mealsPerWeek}. Use it flexibly for carrots, broccoli, bananas, apples, berries, or whatever gives the best value that week.</p></div></div></section>`;
}

function renderBudget(){
  const pct=Math.min(100,(plannedYear()/state.settings.schoolYearBudget)*100);
  return `<section class="hero"><div class="eyebrow">School-year budget</div><h1><span class="accent">$2.5K</span> with a job.</h1><p>Every dollar is assigned between your 14 main meals and the weekly produce add-on.</p></section>
    <div class="card"><div class="card-body"><div class="cost-box"><div><div class="kicker">Planned vs budget</div><strong>${money(plannedYear())}</strong></div><span class="chip ${buffer()>=0?'green':'red'}">${buffer()>=0?money(buffer())+' LEFT':money(-buffer())+' OVER'}</span></div><div class="progress" style="margin-top:15px"><span style="width:${pct}%"></span></div></div></div>
    <section class="section"><div class="card"><div class="card-body">
      <div class="budget-row"><div class="name">Prepared meals</div><div class="amount">${money(weeklyRecipe())}/wk</div><small>${state.settings.mealsPerWeek} × ${money(state.settings.recipeCostPerMeal)}</small></div>
      <div class="budget-row"><div class="name">Fruit + vegetables</div><div class="amount">${money(weeklyProduce())}/wk</div><small>${state.settings.mealsPerWeek} × ${money(state.settings.producePerMeal)}</small></div>
      <div class="budget-row"><div class="name">Total weekly target</div><div class="amount">${money(weeklyTotal())}</div><small>${state.settings.academicWeeks} school weeks</small></div>
      <div class="budget-row"><div class="name">Per semester planned</div><div class="amount">${money(plannedYear()/2)}</div><small>Semester budget cap: ${money(semesterBudget())}</small></div>
      <div class="budget-row"><div class="name">School-year planned</div><div class="amount">${money(plannedYear())}</div><small>School-year cap: ${money(state.settings.schoolYearBudget)}</small></div>
    </div></div></section>`;
}

function renderSettings(){
  return `<section class="hero"><div class="eyebrow">System settings</div><h1>Dial in your <span class="accent">numbers.</span></h1><p>These defaults control the weekly budget math across PrepFuel.</p></section>
  <div class="card"><div class="card-body">
    <div class="split"><div class="field"><label>School-year budget</label><input id="sBudget" type="number" step="1" value="${state.settings.schoolYearBudget}"></div><div class="field"><label>Academic weeks</label><input id="sWeeks" type="number" step="1" value="${state.settings.academicWeeks}"></div></div>
    <div class="split"><div class="field"><label>Meals per week</label><input id="sMeals" type="number" step="1" value="${state.settings.mealsPerWeek}"></div><div class="field"><label>Recipe $ / meal</label><input id="sMealCost" type="number" step="0.01" value="${state.settings.recipeCostPerMeal}"></div></div>
    <div class="field"><label>Produce $ / meal</label><input id="sProduce" type="number" step="0.001" value="${state.settings.producePerMeal}"></div>
    <div class="split"><div class="field"><label>Preferred store</label><input id="sStore" value="${esc(state.settings.preferredStore)}"></div><div class="field"><label>Backup store</label><input id="sAlt" value="${esc(state.settings.altStore)}"></div></div>
    <button id="saveSettings" class="btn primary full">Save settings</button>
    <p class="settings-note">Current exact plan: ${money(weeklyRecipe())} meals + ${money(weeklyProduce())} produce = ${money(weeklyTotal())}/week. This uses $5.00 meal cost and $0.575 produce per meal after scaling the earlier $4.00 + $0.46 plan by 25%.</p>
  </div></div>
  <section class="section"><div class="notice blue"><strong>Online updates:</strong> recipes are loaded from the hosted <code>data/recipes.json</code> catalog. When ChatGPT updates the GitHub repository, this same app gets the new recipe on sync/reopen.</div></section>`;
}

function render(){
  nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab && !state.detailId));
  if(state.detailId){ const r=state.recipes.find(x=>x.id===state.detailId); app.innerHTML=r?renderRecipeDetail(r):renderRecipes(); }
  else if(state.tab==='recipes') app.innerHTML=renderRecipes();
  else if(state.tab==='grocery') app.innerHTML=renderGrocery();
  else if(state.tab==='budget') app.innerHTML=renderBudget();
  else if(state.tab==='settings') app.innerHTML=renderSettings();
  else app.innerHTML=renderHome();
  bindDynamic();
}

function bindDynamic(){
  app.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>setTab(el.dataset.go)));
  app.querySelectorAll('[data-recipe]').forEach(el=>el.addEventListener('click',()=>{state.detailId=el.dataset.recipe;render();window.scrollTo({top:0,behavior:'smooth'});}));
  app.querySelectorAll('[data-select]').forEach(el=>el.addEventListener('click',()=>setSelected(el.dataset.select)));
  app.querySelectorAll('[data-check]').forEach(el=>el.addEventListener('change',()=>{state.checked[el.dataset.check]=el.checked;localStorage.setItem('pf_checked',JSON.stringify(state.checked));render();}));
  const save=document.getElementById('saveSettings');
  if(save) save.addEventListener('click',()=>{
    state.settings.schoolYearBudget=Number(document.getElementById('sBudget').value)||DEFAULTS.schoolYearBudget;
    state.settings.academicWeeks=Number(document.getElementById('sWeeks').value)||DEFAULTS.academicWeeks;
    state.settings.mealsPerWeek=Number(document.getElementById('sMeals').value)||DEFAULTS.mealsPerWeek;
    state.settings.recipeCostPerMeal=Number(document.getElementById('sMealCost').value)||DEFAULTS.recipeCostPerMeal;
    state.settings.producePerMeal=Number(document.getElementById('sProduce').value)||DEFAULTS.producePerMeal;
    state.settings.preferredStore=document.getElementById('sStore').value||'Aldi';
    state.settings.altStore=document.getElementById('sAlt').value||'Walmart';
    saveSettings();showToast('Settings saved');render();
  });
}

nav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
document.querySelectorAll('.brand-button').forEach(b=>b.addEventListener('click',()=>setTab('home')));
syncBtn.addEventListener('click',()=>syncRecipes(false));
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
syncRecipes(true);
