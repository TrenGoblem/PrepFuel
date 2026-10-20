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
  const isSelected = r.id===state.selectedRecipeId;
  return `<article class="meal-float-card ${isSelected?'selected':''}" data-recipe="${esc(r.id)}">
    <div class="meal-photo">
      <img src="${photo}" alt="${esc(r.name)}" onerror="this.src='assets/meal-placeholder.svg'">
      <div class="meal-photo-top">
        <span class="meal-tag">${isSelected?'THIS WEEK':'ATHLETE PREP'}</span>
        <span class="meal-cost">${money(r.costPerMeal ?? state.settings.recipeCostPerMeal)}</span>
      </div>
    </div>
    <div class="meal-card-copy">
      <div class="meal-card-label">PREPFUEL OPTIMIZED</div>
      <h3>${esc(r.name)}</h3>
      <div class="meal-stats">
        ${r.macros?.protein ? `<span><b>${esc(r.macros.protein)}g</b> protein</span>`:''}
        ${r.macros?.calories ? `<span><b>${esc(r.macros.calories)}</b> cal</span>`:''}
        ${r.macros?.carbs ? `<span><b>${esc(r.macros.carbs)}g</b> carbs</span>`:''}
      </div>
      <div class="meal-card-action"><span>${isSelected?'Locked for this week':'Open meal'}</span><span class="round-arrow">↗</span></div>
    </div>
  </article>`;
}

function renderHome(){
  const r=selectedRecipe();
  const pct = Math.min(100,(plannedYear()/state.settings.schoolYearBudget)*100);
  const budgetPct = Math.round(pct);
  const recipePreview = state.recipes.length
    ? state.recipes.slice(0,4).map(recipeCard).join('')
    : `<article class="meal-float-card preview-card tilt-left">
        <div class="meal-photo preview-photo"><div class="preview-shape"></div><span class="meal-tag">RECIPE SLOT 01</span></div>
        <div class="meal-card-copy"><div class="meal-card-label">YOUR NEXT MEAL</div><h3>Send your first recipe.</h3><p>Photo, ingredients and directions turn into a full 14-meal plan.</p></div>
      </article>
      <article class="meal-float-card preview-card center-card">
        <div class="meal-photo preview-photo blue-preview"><div class="preview-shape circle"></div><span class="meal-tag">14 MEALS</span></div>
        <div class="meal-card-copy"><div class="meal-card-label">AUTO-SCALED</div><h3>One prep. Full week.</h3><p>PrepFuel handles portions, cost and grocery quantities.</p></div>
      </article>
      <article class="meal-float-card preview-card tilt-right">
        <div class="meal-photo preview-photo dark-preview"><div class="preview-shape line"></div><span class="meal-tag">ATHLETE MODE</span></div>
        <div class="meal-card-copy"><div class="meal-card-label">BUILT TO FUEL</div><h3>Big portions. Clean numbers.</h3><p>Protein and carbs without losing the budget.</p></div>
      </article>`;

  return `<section class="dashboard-hero">
    <div class="dashboard-intro">
      <div class="eyebrow">PrepFuel · weekly system</div>
      <h1>Let’s fuel the <span class="accent">week.</span></h1>
      <p>One meal. Fourteen athlete-sized servings. A grocery run and budget that stay simple.</p>
      <div class="hero-actions">
        <button class="btn primary" data-go="recipes">${r?'Change this week’s meal':'Choose this week’s meal'}</button>
        <button class="btn ghost" data-go="grocery">Open grocery list</button>
      </div>
    </div>
    <div class="dashboard-prompt">
      <div class="prompt-head"><span class="prompt-dot"></span><span>WEEKLY FUEL</span><span class="prompt-status">READY</span></div>
      <h3>${r?esc(r.name):'What are you eating this week?'}</h3>
      <p>${r?'Your meal is locked in. The shopping list and budget are ready.':'Choose one recipe and PrepFuel builds the entire week around it.'}</p>
      <button class="prompt-button" data-go="${r?'grocery':'recipes'}">${r?'View the plan':'Pick a meal'} <span>→</span></button>
    </div>
  </section>

  <section class="dash-summary">
    <div class="section-head clean-head"><div><h2>Summary</h2><p>Your week at a glance</p></div><span class="soft-pill">${state.settings.mealsPerWeek} meals</span></div>
    <div class="summary-grid">
      <article class="summary-card ring-card">
        <div class="budget-ring" style="--budget-angle:${pct*3.6}deg"><div><strong>${budgetPct}%</strong><span>planned</span></div></div>
        <div><span class="summary-label">School-year budget</span><strong class="summary-value">${money(plannedYear())}</strong><small>of ${money(state.settings.schoolYearBudget)}</small></div>
      </article>
      <article class="summary-card"><span class="summary-icon blue">01</span><span class="summary-label">Meal target</span><strong class="summary-value">${money(state.settings.recipeCostPerMeal)}</strong><small>per prepared meal</small></article>
      <article class="summary-card"><span class="summary-icon pale">02</span><span class="summary-label">Weekly total</span><strong class="summary-value">${money(weeklyTotal())}</strong><small>meals + produce</small></article>
      <article class="summary-card"><span class="summary-icon dark">03</span><span class="summary-label">Fruit + veg</span><strong class="summary-value">${money(weeklyProduce())}</strong><small>extra produce / week</small></article>
    </div>
  </section>

  <section class="floating-meals-section">
    <div class="section-head clean-head"><div><h2>${r?'This week’s meal':'Choose your meal'}</h2><p>Swipe through the lineup</p></div><button class="link-btn" data-go="recipes">See all →</button></div>
    <div class="floating-meal-stage">
      <div class="meal-swipe-rail home-rail">${r?recipeCard(r):recipePreview}</div>
    </div>
  </section>

  <section class="quick-row">
    <button class="quick-tile" data-go="grocery"><span class="quick-kicker">GROCERY</span><strong>Shop once.</strong><small>Exact quantities for all 14 meals.</small><span class="quick-arrow">→</span></button>
    <button class="quick-tile" data-go="budget"><span class="quick-kicker">BUDGET</span><strong>Stay on pace.</strong><small>${money(buffer())} projected buffer.</small><span class="quick-arrow">→</span></button>
  </section>`;
}

function renderRecipes(){
  const cards = state.recipes.length
    ? state.recipes.map(recipeCard).join('')
    : `<article class="meal-float-card preview-card tilt-left"><div class="meal-photo preview-photo"><div class="preview-shape"></div><span class="meal-tag">SLOT 01</span></div><div class="meal-card-copy"><div class="meal-card-label">FIRST RECIPE</div><h3>Your first meal floats here.</h3><p>Send a recipe and photo in ChatGPT.</p></div></article>
       <article class="meal-float-card preview-card center-card"><div class="meal-photo preview-photo blue-preview"><div class="preview-shape circle"></div><span class="meal-tag">SLOT 02</span></div><div class="meal-card-copy"><div class="meal-card-label">WEEKLY PREP</div><h3>Swipe to choose.</h3><p>One selected meal covers all 14 servings.</p></div></article>
       <article class="meal-float-card preview-card tilt-right"><div class="meal-photo preview-photo dark-preview"><div class="preview-shape line"></div><span class="meal-tag">SLOT 03</span></div><div class="meal-card-copy"><div class="meal-card-label">ATHLETE BUILD</div><h3>Macros + cost together.</h3><p>No hunting through screenshots or notes.</p></div></article>`;
  return `<section class="page-intro">
      <div class="eyebrow">Meal lineup</div>
      <h1>What sounds <span class="accent">good?</span></h1>
      <p>Swipe the floating cards, open a recipe, then lock one meal for the full week.</p>
      <div class="meals-meta"><span>${state.recipes.length} recipes</span><span>•</span><span>${state.settings.mealsPerWeek} meals / week</span><span>•</span><span>${money(state.settings.recipeCostPerMeal)} target</span></div>
    </section>
    <section class="floating-meal-stage large-stage">
      <div class="meal-swipe-rail">${cards}</div>
      <div class="swipe-hint"><span>←</span> swipe meals <span>→</span></div>
    </section>
    <div class="sync-strip light-sync"><span class="status-dot"></span><span>Recipe library online</span><span class="sync-spacer"></span><span>${state.lastSync?'Synced '+new Date(state.lastSync).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'Ready'}</span></div>
    <section class="meal-info-row">
      <div class="info-bubble"><b>01</b><span>Pick one meal</span></div>
      <div class="info-bubble"><b>02</b><span>Scale to 14</span></div>
      <div class="info-bubble"><b>03</b><span>Shop + prep</span></div>
    </section>`;
}

function renderRecipeDetail(r){
  const photo = r.photo ? esc(r.photo) : 'assets/meal-placeholder.svg';
  const ingredients = r.ingredients || [];
  const steps = r.instructions || [];
  return `<button class="link-btn back-link" data-go="recipes">← Back to meals</button>
    <section class="detail-shell">
      <div class="detail-photo-card">
        <img src="${photo}" alt="${esc(r.name)}" onerror="this.src='assets/meal-placeholder.svg'">
        <span class="meal-tag detail-tag">14-MEAL PREP</span>
      </div>
      <div class="detail-copy">
        <div class="eyebrow">Athlete fuel</div>
        <h1>${esc(r.name)}</h1>
        <p>${r.optimizationNote?esc(r.optimizationNote):'Scaled for one full week of athlete-sized meals.'}</p>
        <div class="optimize-strip">
          <span>PREPFUEL OPTIMIZED</span>
          <strong>${money(r.costPerMeal ?? state.settings.recipeCostPerMeal)}</strong>
          <small>target ${money(state.settings.recipeCostPerMeal)} / meal</small>
        </div>
        ${r.original?`<div class="source-compare">
          <div><span>SOURCE</span><strong>${esc(r.original.servings)} servings</strong><small>${r.original.portion?esc(r.original.portion):'original recipe'}</small></div>
          <div class="compare-arrow">→</div>
          <div><span>PREPFUEL</span><strong>${esc(r.servings)} meals</strong><small>${r.portion?esc(r.portion):'optimized portion'}</small></div>
        </div>`:''}
        <div class="detail-price">${money(r.costPerMeal ?? state.settings.recipeCostPerMeal)} <small>/ meal · ${esc(r.priceStatus||'estimated')}</small></div>
        <div class="macro-grid clean-macros">
          <div class="macro"><strong>${esc(r.macros?.calories ?? '—')}</strong><small>Calories</small></div>
          <div class="macro"><strong>${esc(r.macros?.protein ?? '—')}${r.macros?.protein?'g':''}</strong><small>Protein</small></div>
          <div class="macro"><strong>${esc(r.macros?.carbs ?? '—')}${r.macros?.carbs?'g':''}</strong><small>Carbs</small></div>
          <div class="macro"><strong>${esc(r.macros?.fat ?? '—')}${r.macros?.fat?'g':''}</strong><small>Fat</small></div>
        </div>
        <button class="btn primary full" data-select="${esc(r.id)}">${r.id===state.selectedRecipeId?'✓ Selected for this week':'Use this for all 14 meals'}</button>
      </div>
    </section>
    <section class="section"><div class="section-head clean-head"><div><h2>Ingredients</h2><p>Scaled for ${esc(r.servings ?? 14)} servings</p></div></div><div class="card"><div class="card-body"><div class="list">${ingredients.map(i=>`<div class="list-item"><div class="list-dot"></div><div><div class="item-main">${esc(i.item)}</div><div class="item-sub">${esc(i.quantity)} ${esc(i.unit||'')}${i.note?` · ${esc(i.note)}`:''}</div></div><div class="item-cost">${i.usedCost!=null?money(i.usedCost):''}</div></div>`).join('')||'<div class="kicker">Ingredient details will appear here with the recipe.</div>'}</div></div></div></section>
    <section class="section"><div class="section-head clean-head"><div><h2>Prep flow</h2><p>Simple Sunday sequence</p></div></div><div class="card"><div class="card-body">${steps.map((s,i)=>`<div class="step"><div class="step-num">${String(i+1).padStart(2,'0')}</div><p>${esc(s)}</p></div>`).join('')||'<div class="kicker">Cooking steps will appear here with the recipe.</div>'}</div></div></section>
    <section class="section"><div class="notice blue"><strong>Storage plan:</strong> refrigerate the first 3–4 days and freeze the later-week portions promptly. Thaw in the refrigerator before reheating.</div></section>`;
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
  return `<section class="page-intro">
      <div class="eyebrow">Grocery run</div>
      <h1>Grab it. Check it. <span class="accent">Done.</span></h1>
      <p>Exact quantities for the weekly meal plus your flexible fruit-and-vegetable allowance.</p>
    </section>
    <section class="grocery-summary">
      <article><span>Meal prep</span><strong>${r?esc(r.name):'Choose a meal'}</strong><small>${r?money(r.checkoutTotal ?? weeklyRecipe())+' checkout est.':'No weekly recipe selected'}</small></article>
      <article><span>Produce</span><strong>${money(weeklyProduce())}</strong><small>fruit + vegetables</small></article>
      <article><span>Store order</span><strong>${esc(state.settings.preferredStore)}</strong><small>${esc(state.settings.altStore)} backup</small></article>
    </section>
    ${r?`<section class="section"><div class="section-head clean-head"><div><h2>Shopping list</h2><p>Tap items as they hit the cart</p></div><span class="soft-pill">${state.settings.mealsPerWeek} meals</span></div>${groceryRows(r)}</section>`:`<div class="empty clean-empty"><div class="empty-orb light">✓</div><div class="eyebrow">Nothing to shop yet</div><h3>Pick this week’s meal first.</h3><p>Your full ingredient list will build itself here.</p><button class="btn primary" data-go="recipes">Choose a meal</button></div>`}
    <section class="section"><div class="card produce-card"><div class="card-body"><div class="cost-box"><div><div class="kicker">Flexible produce pocket</div><strong>${money(weeklyProduce())}</strong></div><span class="chip green">WEEKLY</span></div><p class="settings-note">Use it however the week needs: broccoli, carrots, bananas, apples, berries, frozen vegetables, or sale produce.</p></div></div></section>`;
}

function renderBudget(){
  const pct=Math.min(100,(plannedYear()/state.settings.schoolYearBudget)*100);
  return `<section class="page-intro">
      <div class="eyebrow">Budget dashboard</div>
      <h1>Every dollar has a <span class="accent">job.</span></h1>
      <p>Keep the school-year food budget simple enough to understand in one glance.</p>
    </section>
    <section class="budget-dashboard">
      <article class="budget-main-card">
        <div class="budget-ring big-ring" style="--budget-angle:${pct*3.6}deg"><div><strong>${Math.round(pct)}%</strong><span>planned</span></div></div>
        <div><span class="summary-label">School-year plan</span><strong class="budget-hero-number">${money(plannedYear())}</strong><small>of ${money(state.settings.schoolYearBudget)} · ${money(buffer())} buffer</small></div>
      </article>
      <div class="budget-mini-grid">
        <article><span>Weekly</span><strong>${money(weeklyTotal())}</strong><small>all food</small></article>
        <article><span>Meals</span><strong>${money(weeklyRecipe())}</strong><small>${state.settings.mealsPerWeek} servings</small></article>
        <article><span>Produce</span><strong>${money(weeklyProduce())}</strong><small>extra / week</small></article>
        <article><span>Semester</span><strong>${money(plannedYear()/2)}</strong><small>planned spend</small></article>
      </div>
    </section>
    <section class="section"><div class="card budget-breakdown"><div class="card-body">
      <div class="budget-row"><div class="name">Prepared meals</div><div class="amount">${money(weeklyRecipe())}/wk</div><small>${state.settings.mealsPerWeek} × ${money(state.settings.recipeCostPerMeal)}</small></div>
      <div class="budget-row"><div class="name">Fruit + vegetables</div><div class="amount">${money(weeklyProduce())}/wk</div><small>${state.settings.mealsPerWeek} × ${money(state.settings.producePerMeal)}</small></div>
      <div class="budget-row"><div class="name">School-year cushion</div><div class="amount">${money(buffer())}</div><small>after ${state.settings.academicWeeks} planned weeks</small></div>
    </div></div></section>`;
}

function renderSettings(){
  return `<section class="page-intro">
      <div class="eyebrow">System settings</div>
      <h1>Make PrepFuel <span class="accent">yours.</span></h1>
      <p>These numbers drive every weekly plan, grocery list, and budget card.</p>
    </section>
    <section class="settings-grid">
      <div class="settings-card">
        <div class="settings-card-head"><span class="summary-icon blue">01</span><div><h3>Budget</h3><p>School-year targets</p></div></div>
        <div class="split"><div class="field"><label>School-year budget</label><input id="sBudget" type="number" step="1" value="${state.settings.schoolYearBudget}"></div><div class="field"><label>Academic weeks</label><input id="sWeeks" type="number" step="1" value="${state.settings.academicWeeks}"></div></div>
      </div>
      <div class="settings-card">
        <div class="settings-card-head"><span class="summary-icon pale">02</span><div><h3>Meal system</h3><p>Weekly prep defaults</p></div></div>
        <div class="split"><div class="field"><label>Meals per week</label><input id="sMeals" type="number" step="1" value="${state.settings.mealsPerWeek}"></div><div class="field"><label>Recipe $ / meal</label><input id="sMealCost" type="number" step="0.01" value="${state.settings.recipeCostPerMeal}"></div></div>
        <div class="field"><label>Produce $ / meal</label><input id="sProduce" type="number" step="0.001" value="${state.settings.producePerMeal}"></div>
      </div>
      <div class="settings-card">
        <div class="settings-card-head"><span class="summary-icon dark">03</span><div><h3>Stores</h3><p>Where the list starts</p></div></div>
        <div class="split"><div class="field"><label>Preferred store</label><input id="sStore" value="${esc(state.settings.preferredStore)}"></div><div class="field"><label>Backup store</label><input id="sAlt" value="${esc(state.settings.altStore)}"></div></div>
      </div>
    </section>
    <button id="saveSettings" class="btn primary full save-settings">Save PrepFuel settings</button>
    <section class="section"><div class="notice blue"><strong>Live app:</strong> recipes are synced from the online catalog. New recipes and design updates can appear in this same installed app after a refresh.</div></section>`;
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
