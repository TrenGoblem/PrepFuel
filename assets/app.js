const DEFAULTS = {
  schoolYearBudget: 2500,
  academicWeeks: 32,
  mealsPerWeek: 14,
  preferredStore: 'Aldi',
  altStore: 'Walmart'
};

const storedSettings = JSON.parse(localStorage.getItem('pf_settings') || '{}');
const storedSelections = JSON.parse(localStorage.getItem('pf_meal_selections') || '{}');
const legacySelected = localStorage.getItem('pf_selected_recipe') || '';

const state = {
  tab: localStorage.getItem('pf_tab') || 'home',
  recipes: [],
  selections: Object.keys(storedSelections).length ? storedSelections : (legacySelected ? {[legacySelected]:14} : {}),
  checked: JSON.parse(localStorage.getItem('pf_checked') || '{}'),
  settings: {
    schoolYearBudget: Number(storedSettings.schoolYearBudget) || DEFAULTS.schoolYearBudget,
    academicWeeks: Number(storedSettings.academicWeeks) || DEFAULTS.academicWeeks,
    mealsPerWeek: 14,
    preferredStore: storedSettings.preferredStore || DEFAULTS.preferredStore,
    altStore: storedSettings.altStore || DEFAULTS.altStore
  },
  lastSync: localStorage.getItem('pf_last_sync') || '',
  detailId: ''
};

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const syncBtn = document.getElementById('syncBtn');
const toast = document.getElementById('toast');
const money = v => '$' + Number(v || 0).toFixed(2);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const mealTarget = () => state.settings.schoolYearBudget / (state.settings.academicWeeks * state.settings.mealsPerWeek);
const weeklyBudget = () => mealTarget() * state.settings.mealsPerWeek;
const plannedYear = () => weeklyBudget() * state.settings.academicWeeks;
const semesterBudget = () => plannedYear() / 2;
const buffer = () => state.settings.schoolYearBudget - plannedYear();
const plannedMeals = () => Object.values(state.selections).reduce((a,b)=>a+Number(b||0),0);
const planFor = id => Number(state.selections[id] || 0);
const selectedEntries = () => Object.entries(state.selections)
  .map(([id,count]) => ({recipe:state.recipes.find(r=>r.id===id),count:Number(count)}))
  .filter(x=>x.recipe && (x.count===7 || x.count===14));

function saveSettings(){ localStorage.setItem('pf_settings', JSON.stringify(state.settings)); }
function saveSelections(){ localStorage.setItem('pf_meal_selections', JSON.stringify(state.selections)); localStorage.removeItem('pf_selected_recipe'); }
function showToast(msg){ toast.textContent = msg; toast.classList.remove('hidden'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>toast.classList.add('hidden'),2200); }
function formatQty(n){
  const x=Number(n);
  if(!Number.isFinite(x)) return String(n ?? '');
  if(Math.abs(x-Math.round(x))<0.001) return String(Math.round(x));
  if(x<10) return String(Math.round(x*100)/100);
  return String(Math.round(x*10)/10);
}
function scaleQuantity(q,factor){
  if(q===null || q===undefined) return '';
  const s=String(q).trim();
  if(/^\d+(\.\d+)?$/.test(s)) return formatQty(Number(s)*factor);
  return s;
}
function scaledIngredient(i,factor){
  return {...i, quantity:scaleQuantity(i.quantity,factor), usedCost:i.usedCost!=null?Number(i.usedCost)*factor:i.usedCost};
}
function scaledShopping(i,factor){
  const originalQty=Number(i.buyQuantity);
  const packageLike=/bag|pack|bottle|can|package|box|jar|tub/i.test(String(i.unit||''));
  if(Number.isFinite(originalQty) && packageLike){
    const buyQty=Math.max(1,Math.ceil(originalQty*factor));
    const cost=i.checkoutCost!=null ? Number(i.checkoutCost)*(buyQty/originalQty) : i.checkoutCost;
    return {...i,buyQuantity:formatQty(buyQty),checkoutCost:cost};
  }
  return {...i, buyQuantity:scaleQuantity(i.buyQuantity,factor), checkoutCost:i.checkoutCost!=null?Number(i.checkoutCost)*factor:i.checkoutCost};
}
function scaledCheckoutTotal(r,count){
  const factor=count/Number(r.servings||14);
  return (r.shopping||[]).map(i=>scaledShopping(i,factor)).reduce((sum,i)=>sum+Number(i.checkoutCost||0),0);
}
function setMealPlan(id,count){
  count=Number(count);
  if(count===14){
    state.selections={[id]:14};
  }else{
    const otherSeven=Object.entries(state.selections).find(([otherId,c])=>otherId!==id && Number(c)===7);
    state.selections={};
    if(otherSeven) state.selections[otherSeven[0]]=7;
    state.selections[id]=7;
  }
  state.checked={};
  localStorage.setItem('pf_checked','{}');
  saveSelections();
  const total=plannedMeals();
  showToast(total===14 ? '14 meals planned for the week' : '7 meals planned — choose another 7');
  render();
}
function clearMealPlan(id){
  delete state.selections[id];
  state.checked={};
  localStorage.setItem('pf_checked','{}');
  saveSelections();
  showToast('Meal removed from this week');
  render();
}

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

function setTab(tab){ state.tab=tab; state.detailId=''; localStorage.setItem('pf_tab',tab); render(); window.scrollTo({top:0,behavior:'smooth'}); }

function recipeCard(r){
  const photo = r.photo ? esc(r.photo) : 'assets/meal-placeholder.svg';
  const count = planFor(r.id);
  const selected = count===7 || count===14;
  return `<article class="meal-float-card ${selected?'selected':''}" data-recipe="${esc(r.id)}">
    <div class="meal-photo">
      <img src="${photo}" alt="${esc(r.name)}" onerror="this.src='assets/meal-placeholder.svg'">
      <div class="meal-photo-top">
        <span class="meal-tag">${selected?count+' MEALS THIS WEEK':'ATHLETE PREP'}</span>
        <span class="meal-cost">${money(r.costPerMeal ?? mealTarget())}/meal</span>
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
      <div class="meal-plan-toggle" aria-label="Choose meal count">
        <button class="${count===7?'active':''}" data-plan-id="${esc(r.id)}" data-plan-count="7">7 meals</button>
        <button class="${count===14?'active':''}" data-plan-id="${esc(r.id)}" data-plan-count="14">14 meals</button>
      </div>
      <div class="meal-card-action"><span>${selected?count+' of 14 weekly meals':'Tap card for full recipe'}</span>${selected?`<button class="clear-plan" data-clear-plan="${esc(r.id)}">clear</button>`:`<span class="round-arrow">↗</span>`}</div>
    </div>
  </article>`;
}

function renderHome(){
  const entries=selectedEntries();
  const total=plannedMeals();
  const remaining=Math.max(0,14-total);
  const pct=Math.min(100,(plannedYear()/state.settings.schoolYearBudget)*100);
  const selectedCards=entries.length ? entries.map(x=>recipeCard(x.recipe)).join('') : state.recipes.slice(0,4).map(recipeCard).join('');
  const promptTitle = total===14 ? (entries.length===1?'Week locked in.':'Lunch + dinner locked in.') : total===7 ? 'Seven meals left to choose.' : 'What are you eating this week?';
  const promptCopy = total===14 ? (entries.length===1?'One recipe covers all fourteen meals.':'Two seven-meal preps give you different lunch and dinner options.') : total===7 ? 'Choose another 7-meal recipe to complete the week, or switch this one to 14.' : 'Choose 14 meals from one recipe, or split the week into two different 7-meal preps.';

  return `<section class="dashboard-hero">
    <div class="dashboard-intro">
      <div class="eyebrow">PrepFuel · streamlined weekly system</div>
      <h1>Build the week your <span class="accent">way.</span></h1>
      <p>One 14-meal prep, or two different 7-meal preps. Every recipe is optimized toward the same ${money(mealTarget())} meal cap.</p>
      <div class="hero-actions">
        <button class="btn primary" data-go="recipes">${total?'Edit meal plan':'Choose meals'}</button>
        <button class="btn ghost" data-go="grocery">Open grocery list</button>
      </div>
    </div>
    <div class="dashboard-prompt">
      <div class="prompt-head"><span class="prompt-dot"></span><span>WEEKLY FUEL</span><span class="prompt-status">${total}/14</span></div>
      <h3>${promptTitle}</h3>
      <p>${promptCopy}</p>
      <button class="prompt-button" data-go="${total===14?'grocery':'recipes'}">${total===14?'View shopping list':'Choose meals'} <span>→</span></button>
    </div>
  </section>

  <section class="dash-summary">
    <div class="section-head clean-head"><div><h2>Budget system</h2><p>No separate produce bucket — vegetables live inside the recipes</p></div><span class="soft-pill">${total}/14 planned</span></div>
    <div class="summary-grid">
      <article class="summary-card ring-card">
        <div class="budget-ring" style="--budget-angle:${pct*3.6}deg"><div><strong>${Math.round(pct)}%</strong><span>allocated</span></div></div>
        <div><span class="summary-label">School-year food budget</span><strong class="summary-value">${money(state.settings.schoolYearBudget)}</strong><small>${state.settings.academicWeeks} weeks · 14 meals/week</small></div>
      </article>
      <article class="summary-card"><span class="summary-icon blue">01</span><span class="summary-label">Meal cap</span><strong class="summary-value">${money(mealTarget())}</strong><small>all-in target / meal</small></article>
      <article class="summary-card"><span class="summary-icon pale">07</span><span class="summary-label">7-meal prep</span><strong class="summary-value">${money(mealTarget()*7)}</strong><small>half-week budget</small></article>
      <article class="summary-card"><span class="summary-icon dark">14</span><span class="summary-label">14-meal prep</span><strong class="summary-value">${money(weeklyBudget())}</strong><small>full-week budget</small></article>
    </div>
  </section>

  <section class="floating-meals-section">
    <div class="section-head clean-head"><div><h2>${entries.length?'Your weekly lineup':'Choose your lineup'}</h2><p>${remaining?remaining+' meals still open':'All 14 meals planned'}</p></div><button class="link-btn" data-go="recipes">See all →</button></div>
    <div class="floating-meal-stage">
      <div class="meal-swipe-rail home-rail">${selectedCards || '<div class="empty clean-empty"><h3>Send your first recipe.</h3><p>It will appear here ready for a 7- or 14-meal plan.</p></div>'}</div>
    </div>
  </section>

  <section class="quick-row">
    <button class="quick-tile" data-go="grocery"><span class="quick-kicker">GROCERY</span><strong>One combined run.</strong><small>Lists scale automatically to each 7- or 14-meal choice.</small><span class="quick-arrow">→</span></button>
    <button class="quick-tile" data-go="budget"><span class="quick-kicker">BUDGET</span><strong>${money(weeklyBudget())}/week.</strong><small>The entire food budget is now inside the meals.</small><span class="quick-arrow">→</span></button>
  </section>`;
}

function renderRecipes(){
  const total=plannedMeals();
  const cards=state.recipes.length ? state.recipes.map(recipeCard).join('') : '<div class="empty clean-empty"><h3>Recipe #1 goes here.</h3><p>Send a recipe and PrepFuel will optimize it to the meal cap automatically.</p></div>';
  return `<section class="page-intro">
      <div class="eyebrow">Meal lineup</div>
      <h1>Pick 7 + 7, or <span class="accent">all 14.</span></h1>
      <p>Use the toggle on every card. Two 7-meal choices give you different lunch and dinner preps; one 14-meal choice keeps the whole week the same.</p>
      <div class="meals-meta"><span>${state.recipes.length} recipes</span><span>•</span><span>${total}/14 planned</span><span>•</span><span>${money(mealTarget())} cap / meal</span></div>
    </section>
    <section class="plan-status-bar">
      <div><span class="plan-status-label">WEEKLY PLAN</span><strong>${total}/14 meals</strong></div>
      <div class="plan-dots"><i class="${total>=7?'on':''}"></i><i class="${total>=14?'on':''}"></i></div>
      <span>${total===0?'Choose a 7 or 14':total===7?'Choose one more 7':'Week complete'}</span>
    </section>
    <section class="floating-meal-stage large-stage">
      <div class="meal-swipe-rail">${cards}</div>
      <div class="swipe-hint"><span>←</span> swipe meals · use the 7 / 14 toggle <span>→</span></div>
    </section>
    <div class="sync-strip light-sync"><span class="status-dot"></span><span>Recipe library online</span><span class="sync-spacer"></span><span>${state.lastSync?'Synced '+new Date(state.lastSync).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'Ready'}</span></div>
    <section class="meal-info-row">
      <div class="info-bubble"><b>01</b><span>Recipe priced</span></div>
      <div class="info-bubble"><b>02</b><span>Scaled to cap</span></div>
      <div class="info-bubble"><b>03</b><span>Choose 7 or 14</span></div>
    </section>`;
}

function renderRecipeDetail(r){
  const photo=r.photo?esc(r.photo):'assets/meal-placeholder.svg';
  const count=planFor(r.id)||14;
  const factor=count/Number(r.servings||14);
  const ingredients=(r.ingredients||[]).map(i=>scaledIngredient(i,factor));
  const steps=r.instructions||[];
  const batchUsed=(r.costPerMeal ?? mealTarget())*count;
  return `<button class="link-btn back-link" data-go="recipes">← Back to meals</button>
    <section class="detail-shell">
      <div class="detail-photo-card">
        <img src="${photo}" alt="${esc(r.name)}" onerror="this.src='assets/meal-placeholder.svg'">
        <span class="meal-tag detail-tag">${count}-MEAL PREP</span>
      </div>
      <div class="detail-copy">
        <div class="eyebrow">PrepFuel optimized</div>
        <h1>${esc(r.name)}</h1>
        <p>${r.optimizationNote?esc(r.optimizationNote):'Optimized toward the current meal cap while protecting quality, protein, carbs and useful food volume.'}</p>
        <div class="meal-plan-toggle detail-toggle" aria-label="Choose meal count">
          <button class="${count===7?'active':''}" data-plan-id="${esc(r.id)}" data-plan-count="7">7 meals</button>
          <button class="${count===14?'active':''}" data-plan-id="${esc(r.id)}" data-plan-count="14">14 meals</button>
        </div>
        <div class="optimize-strip">
          <span>MEAL CAP</span>
          <strong>${money(mealTarget())}</strong>
          <small>${money(batchUsed)} used-cost target for ${count} meals</small>
        </div>
        ${r.scaleFactor?`<div class="scale-explain"><span>OPTIMIZATION MULTIPLIER</span><strong>×${Number(r.scaleFactor).toFixed(2)}</strong><small>Source ingredient amounts are scaled toward the meal cap, with practical limits on seasonings and strong sauces.</small></div>`:''}
        ${r.original?`<div class="source-compare">
          <div><span>SOURCE</span><strong>${esc(r.original.servings)} servings</strong><small>${r.original.portion?esc(r.original.portion):'original recipe'}</small></div>
          <div class="compare-arrow">→</div>
          <div><span>PREPFUEL</span><strong>${count} meals</strong><small>${esc(r.portion||'optimized athlete portion')}</small></div>
        </div>`:''}
        <div class="detail-price">${money(r.costPerMeal ?? mealTarget())} <small>/ meal · ${esc(r.priceStatus||'estimated')}</small></div>
        <div class="macro-grid clean-macros">
          <div class="macro"><strong>${esc(r.macros?.calories ?? '—')}</strong><small>Calories</small></div>
          <div class="macro"><strong>${esc(r.macros?.protein ?? '—')}${r.macros?.protein?'g':''}</strong><small>Protein</small></div>
          <div class="macro"><strong>${esc(r.macros?.carbs ?? '—')}${r.macros?.carbs?'g':''}</strong><small>Carbs</small></div>
          <div class="macro"><strong>${esc(r.macros?.fat ?? '—')}${r.macros?.fat?'g':''}</strong><small>Fat</small></div>
        </div>
        ${planFor(r.id)?`<button class="btn secondary full" data-clear-plan="${esc(r.id)}">Remove from this week</button>`:''}
      </div>
    </section>
    <section class="section"><div class="section-head clean-head"><div><h2>Ingredients</h2><p>Automatically scaled for ${count} meals</p></div><span class="soft-pill">${money(batchUsed)} used cost</span></div><div class="card"><div class="card-body"><div class="list">${ingredients.map(i=>`<div class="list-item"><div class="list-dot"></div><div><div class="item-main">${esc(i.item)}</div><div class="item-sub">${esc(i.quantity)} ${esc(i.unit||'')}${i.note?` · ${esc(i.note)}`:''}</div></div><div class="item-cost">${i.usedCost!=null?money(i.usedCost):''}</div></div>`).join('')||'<div class="kicker">Ingredient details will appear here with the recipe.</div>'}</div></div></div></section>
    <section class="section"><div class="section-head clean-head"><div><h2>Prep flow</h2><p>Same method, scaled batch</p></div></div><div class="card"><div class="card-body">${steps.map((s,i)=>`<div class="step"><div class="step-num">${String(i+1).padStart(2,'0')}</div><p>${esc(s)}</p></div>`).join('')||'<div class="kicker">Cooking steps will appear here with the recipe.</div>'}</div></div></section>
    <section class="section"><div class="notice blue"><strong>Storage:</strong> for a 7-meal batch, refrigerate what you will eat within 3–4 days and freeze the rest if needed. For 14 meals, freeze the later-week portions promptly.</div></section>`;
}

function groceryRows(r,count){
  const factor=count/Number(r.servings||14);
  const rows=(r.shopping||r.ingredients||[]).map(i=>scaledShopping(i,factor));
  const groups={};
  rows.forEach((it,idx)=>{ const g=it.category||'Other'; (groups[g] ||= []).push({...it,_idx:idx}); });
  return Object.entries(groups).map(([g,items])=>`<div class="category-title">${esc(g)}</div><div class="list">${items.map(it=>{
    const key=`${r.id}:${count}:${it._idx}`; const checked=!!state.checked[key];
    return `<label class="list-item ${checked?'checked':''}"><input type="checkbox" data-check="${esc(key)}" ${checked?'checked':''}><div><div class="item-main">${esc(it.item)}</div><div class="item-sub">${esc(it.buyQuantity ?? it.quantity ?? '')} ${esc(it.unit||'')}${it.preferredStore?` · ${esc(it.preferredStore)}`:` · ${esc(state.settings.preferredStore)} first`}${it.altStore?` / ${esc(it.altStore)}`:''}${it.priceStatus?` · ${esc(it.priceStatus)}`:''}</div></div><div class="item-cost">${it.checkoutCost!=null?money(it.checkoutCost):''}</div></label>`;}).join('')}</div>`).join('');
}

function renderGrocery(){
  const entries=selectedEntries();
  const total=plannedMeals();
  const usedTotal=entries.reduce((sum,x)=>sum+(x.recipe.costPerMeal??mealTarget())*x.count,0);
  const checkoutTotal=entries.reduce((sum,x)=>sum+scaledCheckoutTotal(x.recipe,x.count),0);
  return `<section class="page-intro">
      <div class="eyebrow">Combined grocery run</div>
      <h1>One list for <span class="accent">${total || 0} meals.</span></h1>
      <p>Whether you choose one 14-meal recipe or two different 7-meal recipes, quantities scale automatically.</p>
    </section>
    <section class="grocery-summary">
      <article><span>Meals planned</span><strong>${total}/14</strong><small>${entries.length===2?'two different 7-meal preps':entries.length===1?entries[0].count+'-meal prep':'choose meals first'}</small></article>
      <article><span>Used-cost target</span><strong>${money(usedTotal)}</strong><small>meal ingredients only</small></article>
      <article><span>Checkout estimate</span><strong>${money(checkoutTotal)}</strong><small>full packages can vary</small></article>
    </section>
    ${entries.length?entries.map(x=>`<section class="section grocery-recipe-block">
      <div class="section-head clean-head"><div><h2>${esc(x.recipe.name)}</h2><p>${x.count} meals · ${money((x.recipe.costPerMeal??mealTarget())*x.count)} used-cost target</p></div><span class="soft-pill">${x.count} meals</span></div>
      ${groceryRows(x.recipe,x.count)}
    </section>`).join(''):`<div class="empty clean-empty"><div class="empty-orb light">✓</div><div class="eyebrow">Nothing to shop yet</div><h3>Choose 7 + 7 or one 14.</h3><p>Your combined grocery list will build itself here.</p><button class="btn primary" data-go="recipes">Choose meals</button></div>`}`;
}

function renderBudget(){
  const target=mealTarget();
  const weekly=weeklyBudget();
  return `<section class="page-intro">
      <div class="eyebrow">Budget dashboard</div>
      <h1>One cap. <span class="accent">No extra buckets.</span></h1>
      <p>The old produce allowance is gone. The full school-year food budget now goes directly into the meals themselves.</p>
    </section>
    <section class="budget-dashboard">
      <article class="budget-main-card">
        <div class="budget-ring big-ring" style="--budget-angle:360deg"><div><strong>${money(target)}</strong><span>per meal</span></div></div>
        <div><span class="summary-label">All-in meal cap</span><strong class="budget-hero-number">${money(target)}</strong><small>${money(state.settings.schoolYearBudget)} ÷ ${state.settings.academicWeeks} weeks ÷ 14 meals</small></div>
      </article>
      <div class="budget-mini-grid">
        <article><span>7 meals</span><strong>${money(target*7)}</strong><small>half-week prep</small></article>
        <article><span>14 meals</span><strong>${money(weekly)}</strong><small>full-week prep</small></article>
        <article><span>Semester</span><strong>${money(semesterBudget())}</strong><small>planned food</small></article>
        <article><span>School year</span><strong>${money(plannedYear())}</strong><small>fully allocated</small></article>
      </div>
    </section>
    <section class="section"><div class="card budget-breakdown"><div class="card-body">
      <div class="budget-row"><div class="name">Option A · one recipe</div><div class="amount">14 meals</div><small>One optimized recipe can use up to ${money(weekly)} for the week.</small></div>
      <div class="budget-row"><div class="name">Option B · two recipes</div><div class="amount">7 + 7</div><small>Each prep gets about ${money(target*7)}, for the same ${money(weekly)} weekly cap.</small></div>
      <div class="budget-row"><div class="name">Optimization rule</div><div class="amount">scale to cap</div><small>If a source meal costs less, PrepFuel increases useful ingredient quantities toward the cap. If it costs more, it scales back intelligently while protecting quality and nutrition.</small></div>
    </div></div></section>`;
}

function renderSettings(){
  return `<section class="page-intro">
      <div class="eyebrow">System settings</div>
      <h1>One budget drives <span class="accent">everything.</span></h1>
      <p>PrepFuel calculates the meal cap automatically from your school-year budget, academic weeks, and 14 weekly meals.</p>
    </section>
    <section class="settings-grid">
      <div class="settings-card">
        <div class="settings-card-head"><span class="summary-icon blue">01</span><div><h3>Budget</h3><p>Sets the automatic meal cap</p></div></div>
        <div class="split"><div class="field"><label>School-year budget</label><input id="sBudget" type="number" step="1" value="${state.settings.schoolYearBudget}"></div><div class="field"><label>Academic weeks</label><input id="sWeeks" type="number" step="1" value="${state.settings.academicWeeks}"></div></div>
        <div class="derived-cap"><span>Calculated meal cap</span><strong>${money(mealTarget())}</strong><small>per meal · 14 meals/week</small></div>
      </div>
      <div class="settings-card">
        <div class="settings-card-head"><span class="summary-icon dark">02</span><div><h3>Stores</h3><p>Where the grocery list starts</p></div></div>
        <div class="split"><div class="field"><label>Preferred store</label><input id="sStore" value="${esc(state.settings.preferredStore)}"></div><div class="field"><label>Backup store</label><input id="sAlt" value="${esc(state.settings.altStore)}"></div></div>
      </div>
    </section>
    <button id="saveSettings" class="btn primary full save-settings">Save PrepFuel settings</button>
    <section class="section"><div class="notice blue"><strong>Streamlined scaling:</strong> PrepFuel first prices the source recipe per serving, calculates the ratio between that cost and your meal cap, then uses that multiplier as the starting point for ingredient quantities. Main protein, carbs and vegetables follow the multiplier closely; potent seasonings, oils and sauces are adjusted sensibly so the food still tastes right.</div></section>`;
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
  app.querySelectorAll('[data-recipe]').forEach(el=>el.addEventListener('click',e=>{ if(e.target.closest('[data-plan-id],[data-clear-plan]')) return; state.detailId=el.dataset.recipe;render();window.scrollTo({top:0,behavior:'smooth'});}));
  app.querySelectorAll('[data-plan-id]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setMealPlan(el.dataset.planId,Number(el.dataset.planCount));}));
  app.querySelectorAll('[data-clear-plan]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();clearMealPlan(el.dataset.clearPlan);}));
  app.querySelectorAll('[data-check]').forEach(el=>el.addEventListener('change',()=>{state.checked[el.dataset.check]=el.checked;localStorage.setItem('pf_checked',JSON.stringify(state.checked));render();}));
  const save=document.getElementById('saveSettings');
  if(save) save.addEventListener('click',()=>{
    state.settings.schoolYearBudget=Number(document.getElementById('sBudget').value)||DEFAULTS.schoolYearBudget;
    state.settings.academicWeeks=Number(document.getElementById('sWeeks').value)||DEFAULTS.academicWeeks;
    state.settings.mealsPerWeek=14;
    state.settings.preferredStore=document.getElementById('sStore').value||'Aldi';
    state.settings.altStore=document.getElementById('sAlt').value||'Walmart';
    saveSettings();showToast('Settings saved · meal cap recalculated');render();
  });
}

nav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
document.querySelectorAll('.brand-button').forEach(b=>b.addEventListener('click',()=>setTab('home')));
syncBtn.addEventListener('click',()=>syncRecipes(false));
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
syncRecipes(true);
