const DEFAULTS = {
  schoolYearBudget: 2500,
  academicWeeks: 32,
  mealsPerWeek: 14,
  preferredStore: 'Aldi',
  altStore: 'Walmart'
};

const SCHOOL_THEMES = [
  {id:'fuelr',name:'Fuelr',abbr:'FR',primary:'#657ff0',secondary:'#1d232b',accent:'#9db4ff',onPrimary:'#ffffff'},
  {id:'ucf',name:'University of Central Florida',abbr:'UCF',primary:'#ffc904',secondary:'#000000',accent:'#ffdf66',onPrimary:'#111111'},
  {id:'uf',name:'University of Florida',abbr:'UF',primary:'#0021a5',secondary:'#fa4616',accent:'#fa4616',onPrimary:'#ffffff'},
  {id:'fsu',name:'Florida State University',abbr:'FSU',primary:'#782f40',secondary:'#ceb888',accent:'#ceb888',onPrimary:'#ffffff'},
  {id:'usf',name:'University of South Florida',abbr:'USF',primary:'#006747',secondary:'#cfc493',accent:'#cfc493',onPrimary:'#ffffff'},
  {id:'miami',name:'University of Miami',abbr:'UM',primary:'#f47321',secondary:'#005030',accent:'#005030',onPrimary:'#ffffff'},
  {id:'fiu',name:'Florida International University',abbr:'FIU',primary:'#081e3f',secondary:'#b6862c',accent:'#b6862c',onPrimary:'#ffffff'},
  {id:'fau',name:'Florida Atlantic University',abbr:'FAU',primary:'#003366',secondary:'#cc0000',accent:'#cc0000',onPrimary:'#ffffff'}
];

const storedSettings = JSON.parse(localStorage.getItem('pf_settings') || '{}');
const storedSelections = JSON.parse(localStorage.getItem('pf_meal_selections') || '{}');
const storedProfile = JSON.parse(localStorage.getItem('fuelr_profile') || '{}');
const storedUserRecipes = JSON.parse(localStorage.getItem('fuelr_user_recipes') || '[]');
const legacySelected = localStorage.getItem('pf_selected_recipe') || '';
const savedTab = localStorage.getItem('pf_tab') || 'home';
const normalizeTab = tab => ['prep','grocery'].includes(tab) ? 'week' : ['budget','settings'].includes(tab) ? 'you' : (['home','recipes','week','you'].includes(tab) ? tab : 'home');

const state = {
  tab: normalizeTab(savedTab),
  weekView: localStorage.getItem('fuelr_week_view') || (savedTab==='grocery'?'shop':savedTab==='prep'?'prep':'plan'),
  recipes: [],
  catalogRecipes: [],
  userRecipes: Array.isArray(storedUserRecipes) ? storedUserRecipes : [],
  selections: Object.keys(storedSelections).length ? storedSelections : (legacySelected ? {[legacySelected]:14} : {}),
  checked: JSON.parse(localStorage.getItem('pf_checked') || '{}'),
  prepChecks: JSON.parse(localStorage.getItem('pf_prep_checks') || '{}'),
  settings: {
    schoolYearBudget: Number(storedSettings.schoolYearBudget) || DEFAULTS.schoolYearBudget,
    academicWeeks: Number(storedSettings.academicWeeks) || DEFAULTS.academicWeeks,
    mealsPerWeek: 14,
    preferredStore: storedSettings.preferredStore || DEFAULTS.preferredStore,
    altStore: storedSettings.altStore || DEFAULTS.altStore
  },
  profile: {
    schoolId: storedProfile.schoolId || '',
    prepStyle: storedProfile.prepStyle || 'split',
    portionMode: storedProfile.portionMode || 'athlete',
    ...storedProfile
  },
  onboardingComplete: localStorage.getItem('fuelr_onboarding_done') === '1',
  onboardingStep: 0,
  addRecipeMode: false,
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

const currentSchool = () => SCHOOL_THEMES.find(s=>s.id===state.profile.schoolId) || SCHOOL_THEMES[0];
function saveProfile(){ localStorage.setItem('fuelr_profile', JSON.stringify(state.profile)); }
function saveUserRecipes(){ localStorage.setItem('fuelr_user_recipes', JSON.stringify(state.userRecipes)); }
function applySchoolTheme(){
  const s=currentSchool();
  const root=document.documentElement;
  root.style.setProperty('--school-primary',s.primary);
  root.style.setProperty('--school-secondary',s.secondary);
  root.style.setProperty('--school-accent',s.accent);
  root.style.setProperty('--school-on-primary',s.onPrimary);
  document.body.dataset.school=s.id;
}
function chooseSchool(id){
  state.profile.schoolId=id;
  saveProfile();
  applySchoolTheme();
  render();
}
function setWeekView(view){
  state.weekView=['plan','shop','prep'].includes(view)?view:'plan';
  localStorage.setItem('fuelr_week_view',state.weekView);
  state.tab='week';
  localStorage.setItem('pf_tab','week');
  state.detailId='';
  render();
  window.scrollTo({top:0,behavior:'smooth'});
}
function beginSchoolChange(){
  state.onboardingComplete=false;
  state.onboardingStep=1;
  render();
}


function saveSettings(){ localStorage.setItem('pf_settings', JSON.stringify(state.settings)); }
function saveSelections(){ localStorage.setItem('pf_meal_selections', JSON.stringify(state.selections)); localStorage.removeItem('pf_selected_recipe'); }
function savePrepChecks(){ localStorage.setItem('pf_prep_checks', JSON.stringify(state.prepChecks)); }
function resetPrepChecks(){ state.prepChecks={}; savePrepChecks(); }
function prepMealKey(id,index){ return id+':meal:'+index; }
function prepStageKey(id,stage){ return id+':stage:'+stage; }
function prepDoneFor(id,count){
  let n=0;
  for(let i=1;i<=count;i++) if(state.prepChecks[prepMealKey(id,i)]) n++;
  return n;
}
function totalPrepDone(){ return selectedEntries().reduce((sum,x)=>sum+prepDoneFor(x.recipe.id,x.count),0); }
function togglePrepMeal(id,index){
  const key=prepMealKey(id,index);
  state.prepChecks[key]=!state.prepChecks[key];
  savePrepChecks(); render();
}
function togglePrepStage(id,stage){
  const key=prepStageKey(id,stage);
  state.prepChecks[key]=!state.prepChecks[key];
  savePrepChecks(); render();
}
function markPrepBatch(id,count){
  const allDone=prepDoneFor(id,count)===count;
  for(let i=1;i<=count;i++) state.prepChecks[prepMealKey(id,i)]=!allDone;
  ['cooked','portioned','stored'].forEach(stage=>state.prepChecks[prepStageKey(id,stage)]=!allDone);
  savePrepChecks(); render();
}
function startNextWeek(){
  if(!confirm('Start a new week? This clears the current meal plan, grocery checks, and prep progress.')) return;
  state.selections={};
  state.checked={};
  state.prepChecks={};
  saveSelections();
  localStorage.setItem('pf_checked','{}');
  savePrepChecks();
  state.detailId='';
  state.tab='recipes';
  localStorage.setItem('pf_tab','recipes');
  showToast('New week started — choose your meals');
  render();
  window.scrollTo({top:0,behavior:'smooth'});
}
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
  resetPrepChecks();
  saveSelections();
  const total=plannedMeals();
  showToast(total===14 ? '14 meals planned for the week' : '7 meals planned — choose another 7');
  render();
}
function clearMealPlan(id){
  delete state.selections[id];
  state.checked={};
  localStorage.setItem('pf_checked','{}');
  resetPrepChecks();
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
    state.catalogRecipes = Array.isArray(data.recipes) ? data.recipes : [];
    state.recipes = [...state.catalogRecipes, ...state.userRecipes];
    state.lastSync = new Date().toISOString();
    localStorage.setItem('pf_last_sync', state.lastSync);
    if(!silent) showToast('Recipe library synced');
  }catch(e){
    state.recipes = [...state.catalogRecipes, ...state.userRecipes];
    if(!silent) showToast('Could not sync — using saved app data');
  }finally{
    syncBtn.classList.remove('syncing');
    render();
  }
}

function setTab(tab){
  if(tab==='grocery'){ setWeekView('shop'); return; }
  if(tab==='prep'){ setWeekView('prep'); return; }
  if(tab==='budget' || tab==='settings') tab='you';
  tab=normalizeTab(tab);
  state.tab=tab;
  state.detailId='';
  state.addRecipeMode=false;
  localStorage.setItem('pf_tab',tab);
  render();
  window.scrollTo({top:0,behavior:'smooth'});
}

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
      <div class="meal-card-label">FUELR OPTIMIZED</div>
      <h3>${esc(r.name)}</h3>
      <div class="meal-stats">
        ${r.macros?.protein ? `<span><b>${esc(r.macros.protein)}g</b> protein</span>`:''}
        ${r.macros?.calories ? `<span><b>${esc(r.macros.calories)}</b> cal</span>`:''}
        ${r.macros?.carbs ? `<span><b>${esc(r.macros.carbs)}g</b> carbs</span>`:''}
      </div>
      <div class="meal-count-actions" aria-label="Choose meal count">
        <button class="${count===7?'active':''}" data-plan-id="${esc(r.id)}" data-plan-count="7"><b>7</b><span>meals</span></button>
        <button class="${count===14?'active':''}" data-plan-id="${esc(r.id)}" data-plan-count="14"><b>14</b><span>meals</span></button>
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
      <div class="eyebrow">Fuelr · streamlined weekly system</div>
      <h1>Build the week your <span class="accent">way.</span></h1>
      <p>One 14-meal prep, or two different 7-meal preps. Every recipe is optimized toward the same ${money(mealTarget())} meal cap.</p>
      <div class="hero-actions">
        <button class="btn primary" data-go="recipes">${total?'Edit meal plan':'Choose meals'}</button>
        <button class="btn ghost" data-week-view="shop">Open grocery list</button>
      </div>
    </div>
    <div class="dashboard-prompt">
      <div class="prompt-head"><span class="prompt-dot"></span><span>WEEKLY FUEL</span><span class="prompt-status">${total}/14</span></div>
      <h3>${promptTitle}</h3>
      <p>${promptCopy}</p>
      <button class="prompt-button" data-go="${total===14?'prep':'recipes'}">${total===14?'Open prep board':'Choose meals'} <span>→</span></button>
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
    <button class="quick-tile" data-week-view="shop"><span class="quick-kicker">GROCERY</span><strong>One combined run.</strong><small>Lists scale automatically to each 7- or 14-meal choice.</small><span class="quick-arrow">→</span></button>
    <button class="quick-tile" data-go="you"><span class="quick-kicker">BUDGET</span><strong>${money(weeklyBudget())}/week.</strong><small>The entire food budget is now inside the meals.</small><span class="quick-arrow">→</span></button>
  </section>`;
}

function renderRecipes(){
  if(state.addRecipeMode) return renderAddRecipe();
  const total=plannedMeals();
  const cards=state.recipes.length ? state.recipes.map(recipeCard).join('') : '<div class="empty clean-empty"><h3>Your recipes will live here.</h3><p>Add your first recipe and Fuelr will scale it for 7 or 14 meals.</p></div>';
  return `<section class="page-intro meals-intro">
      <div class="eyebrow">Meal library</div>
      <div class="title-action-row"><div><h1>Pick 7 + 7, or <span class="accent">all 14.</span></h1><p>Every recipe has two clear buttons. Fuelr handles the scaling, quantities and weekly budget underneath.</p></div><button class="add-recipe-btn" data-add-recipe="1"><span>+</span>Add recipe</button></div>
      <div class="meals-meta"><span>${state.recipes.length} recipes</span><span>•</span><span>${total}/14 planned</span><span>•</span><span>${money(mealTarget())} cap / meal</span></div>
    </section>
    <section class="plan-status-bar">
      <div><span class="plan-status-label">WEEKLY PLAN</span><strong>${total}/14 meals</strong></div>
      <div class="plan-dots"><i class="${total>=7?'on':''}"></i><i class="${total>=14?'on':''}"></i></div>
      <span>${total===0?'Choose 7 or 14':total===7?'Choose one more 7':'Week complete'}</span>
    </section>
    <section class="floating-meal-stage large-stage">
      <div class="meal-swipe-rail">${cards}</div>
      <div class="swipe-hint"><span>←</span> swipe meals · choose 7 or 14 <span>→</span></div>
    </section>
    <div class="sync-strip light-sync"><span class="status-dot"></span><span>Fuelr recipe library</span><span class="sync-spacer"></span><span>${state.lastSync?'Synced '+new Date(state.lastSync).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'Ready'}</span></div>
    <section class="meal-info-row">
      <div class="info-bubble"><b>01</b><span>Add or choose</span></div>
      <div class="info-bubble"><b>02</b><span>Fuelr scales it</span></div>
      <div class="info-bubble"><b>03</b><span>Shop + prep</span></div>
    </section>`;
}


function renderAddRecipe(){
  return `<button class="link-btn back-link" data-close-add="1">← Back to meals</button>
    <section class="page-intro add-recipe-intro">
      <div class="eyebrow">Personal recipe</div>
      <h1>Add it once. <span class="accent">Fuelr scales it.</span></h1>
      <p>Enter the source recipe exactly as written. Fuelr converts it from its original serving count into optimized 7- and 14-meal batches.</p>
    </section>
    <section class="add-recipe-card">
      <div class="split">
        <div class="field"><label>Recipe name</label><input id="urName" placeholder="Chicken burrito bowls"></div>
        <div class="field"><label>Source servings</label><input id="urServings" type="number" min="1" step="1" placeholder="10"></div>
      </div>
      <div class="field"><label>Estimated source batch cost</label><input id="urBatchCost" type="number" min="0" step=".01" placeholder="40.00"><small>Total ingredient cost for the original source batch.</small></div>
      <div class="field"><label>Ingredients</label><textarea id="urIngredients" rows="8" placeholder="2 tbsp | buffalo seasoning&#10;1500 g | chicken thighs&#10;4 whole | baguettes&#10;16 slices | provolone"></textarea><small>One ingredient per line: quantity + unit | ingredient name. Include salt, spices, oils and sauces too.</small></div>
      <div class="split macro-inputs">
        <div class="field"><label>Calories / source serving</label><input id="urCalories" type="number" min="0" placeholder="650"></div>
        <div class="field"><label>Protein g</label><input id="urProtein" type="number" min="0" placeholder="50"></div>
        <div class="field"><label>Carbs g</label><input id="urCarbs" type="number" min="0" placeholder="70"></div>
        <div class="field"><label>Fat g</label><input id="urFat" type="number" min="0" placeholder="20"></div>
      </div>
      <div class="field"><label>Directions</label><textarea id="urDirections" rows="5" placeholder="One step per line"></textarea></div>
      <div class="recipe-form-note"><strong>How Fuelr handles this:</strong> every listed ingredient is first normalized from the source serving count to 7 or 14 meals. Then the full recipe is optimized toward your ${money(mealTarget())} meal cap while preserving the original ratios.</div>
      <button class="btn primary full" id="saveUserRecipe">Save to my meals</button>
    </section>`;
}

function parseUserIngredients(text){
  return String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).map(line=>{
    const parts=line.split('|');
    if(parts.length<2) return null;
    const left=parts[0].trim().split(/\s+/);
    const qty=Number(left.shift());
    if(!Number.isFinite(qty)) return null;
    const unit=left.join(' ') || 'unit';
    const item=parts.slice(1).join('|').trim();
    return item ? {item,quantity:qty,unit,note:'scaled from your source recipe'} : null;
  }).filter(Boolean);
}

function saveNewUserRecipe(){
  const name=document.getElementById('urName')?.value.trim();
  const sourceServings=Number(document.getElementById('urServings')?.value);
  const batchCost=Number(document.getElementById('urBatchCost')?.value);
  const sourceIngredients=parseUserIngredients(document.getElementById('urIngredients')?.value);
  if(!name || !sourceServings || !sourceIngredients.length){
    showToast('Add a name, source servings and ingredients');
    return;
  }
  const sourceCostPerMeal=batchCost>0 ? batchCost/sourceServings : mealTarget();
  const budgetMultiplier=sourceCostPerMeal>0 ? mealTarget()/sourceCostPerMeal : 1;
  const toFourteen=(14/sourceServings)*budgetMultiplier;
  const ingredients=sourceIngredients.map(i=>({...i,quantity:formatQty(Number(i.quantity)*toFourteen)}));
  const macroValue=id=>Number(document.getElementById(id)?.value)||null;
  const sourceMacros={calories:macroValue('urCalories'),protein:macroValue('urProtein'),carbs:macroValue('urCarbs'),fat:macroValue('urFat')};
  const macros=Object.fromEntries(Object.entries(sourceMacros).map(([k,v])=>[k,v==null?null:Math.round(v*budgetMultiplier*10)/10]));
  const directions=String(document.getElementById('urDirections')?.value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const id='user-'+Date.now();
  const recipe={
    id,
    name,
    sourceName:'My recipe',
    photo:'assets/meal-placeholder.svg',
    servings:14,
    portion:'Fuelr optimized serving',
    costPerMeal:Math.round(mealTarget()*100)/100,
    checkoutTotal:null,
    priceStatus:batchCost>0?'based on your source cost':'price estimate needed',
    scaleFactor:Math.round(budgetMultiplier*100)/100,
    macros,
    macrosStatus:'Fuelr estimate from your source serving',
    userOwned:true,
    optimizationNote:`Your source makes ${sourceServings} servings. Fuelr first normalizes every ingredient to the selected 7- or 14-meal batch, then applies a ${budgetMultiplier.toFixed(2)}× budget multiplier toward your current meal cap.`,
    original:{
      servings:sourceServings,
      portion:'source serving',
      macros:sourceMacros,
      ingredients:sourceIngredients.map(i=>`${i.quantity} ${i.unit} ${i.item}`)
    },
    ingredients,
    shopping:ingredients.map(i=>({item:i.item,category:'My recipe',buyQuantity:i.quantity,unit:i.unit,preferredStore:state.settings.preferredStore,altStore:state.settings.altStore,priceStatus:'price needed'})),
    instructions:directions
  };
  state.userRecipes.push(recipe);
  saveUserRecipes();
  state.recipes=[...state.catalogRecipes,...state.userRecipes];
  state.addRecipeMode=false;
  state.detailId=id;
  showToast('Recipe added to your Fuelr');
  render();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderWeekPlan(){
  const entries=selectedEntries();
  const total=plannedMeals();
  return `<section class="week-plan-card">
    <div class="week-plan-head"><div><span>THIS WEEK</span><h2>${total}/14 meals planned</h2></div><strong>${money(weeklyBudget())}</strong></div>
    ${entries.length?entries.map((x,i)=>`<div class="week-plan-recipe"><div class="week-letter">${String.fromCharCode(65+i)}</div><div><strong>${esc(x.recipe.name)}</strong><small>${x.count} meals · ${money((x.recipe.costPerMeal??mealTarget())*x.count)} used-cost target</small></div><span>${x.count}</span></div>`).join(''):`<div class="week-empty"><h3>Build this week first.</h3><p>Choose one 14-meal recipe or two 7-meal recipes.</p></div>`}
    <button class="btn primary full" data-go="recipes">${total?'Edit meal choices':'Choose meals'}</button>
  </section>`;
}

function renderWeek(){
  const view=state.weekView;
  const total=plannedMeals();
  const done=totalPrepDone();
  const tabs=`<section class="week-flow">
    <button class="${view==='plan'?'active':''}" data-week-view="plan"><span>1</span><b>Plan</b><small>${total}/14</small></button>
    <i>→</i>
    <button class="${view==='shop'?'active':''}" data-week-view="shop"><span>2</span><b>Shop</b><small>List</small></button>
    <i>→</i>
    <button class="${view==='prep'?'active':''}" data-week-view="prep"><span>3</span><b>Prep</b><small>${done}/14</small></button>
  </section>`;
  if(view==='shop') return tabs+renderGrocery();
  if(view==='prep') return tabs+renderPrep();
  return `<section class="page-intro"><div class="eyebrow">Your week</div><h1>Plan → Shop → <span class="accent">Prep.</span></h1><p>One place for the entire weekly flow.</p></section>`+tabs+renderWeekPlan();
}

function renderYou(){
  const school=currentSchool();
  return `<section class="page-intro">
      <div class="eyebrow">Your Fuelr</div>
      <h1>Built around <span class="accent">you.</span></h1>
      <p>Your school, budget, stores and meal targets shape the whole app.</p>
    </section>
    <section class="profile-school-card">
      <div class="school-badge">${esc(school.abbr)}</div>
      <div><span>CAMPUS THEME</span><h2>${esc(school.name)}</h2><p>Fuelr automatically carries your school colors through the interface.</p></div>
      <button class="mini-action" data-change-school="1">Change</button>
    </section>
    <section class="you-metrics">
      <article><span>Meal cap</span><strong>${money(mealTarget())}</strong><small>per prepared meal</small></article>
      <article><span>Weekly</span><strong>${money(weeklyBudget())}</strong><small>14 meals</small></article>
      <article><span>Prep style</span><strong>${state.profile.prepStyle==='split'?'7 + 7':'14'}</strong><small>default</small></article>
    </section>
    <section class="settings-card you-settings">
      <div class="settings-card-head"><span class="summary-icon blue">01</span><div><h3>Food system</h3><p>Change the numbers that drive Fuelr</p></div></div>
      <div class="split"><div class="field"><label>School-year budget</label><input id="sBudget" type="number" step="1" value="${state.settings.schoolYearBudget}"></div><div class="field"><label>Academic weeks</label><input id="sWeeks" type="number" step="1" value="${state.settings.academicWeeks}"></div></div>
      <div class="split"><div class="field"><label>Preferred store</label><input id="sStore" value="${esc(state.settings.preferredStore)}"></div><div class="field"><label>Backup store</label><input id="sAlt" value="${esc(state.settings.altStore)}"></div></div>
      <div class="derived-cap"><span>Calculated meal cap</span><strong>${money(mealTarget())}</strong><small>${money(state.settings.schoolYearBudget)} ÷ ${state.settings.academicWeeks} weeks ÷ 14 meals</small></div>
      <button id="saveSettings" class="btn primary full save-settings">Save my Fuelr</button>
    </section>
    <section class="cloud-ready-card"><div class="cloud-dot"></div><div><span>ACCOUNT + CLOUD</span><strong>Cloud foundation is next.</strong><p>Your current setup is stored on this device. The Supabase connection will move profiles, recipes, weeks and prep history into user accounts.</p></div></section>`;
}

function renderOnboarding(){
  const s=currentSchool();
  const step=state.onboardingStep;
  const shell=(body,back=true)=>`<div class="onboarding-shell">
    <div class="onboarding-progress"><i class="${step>=0?'on':''}"></i><i class="${step>=1?'on':''}"></i><i class="${step>=2?'on':''}"></i><i class="${step>=3?'on':''}"></i><i class="${step>=4?'on':''}"></i></div>
    ${body}
    ${back && step>0?`<button class="onboard-back" data-ob-back="1">← Back</button>`:''}
  </div>`;
  if(step===0) return shell(`<div class="onboard-hero"><div class="onboard-logo">FR</div><div class="eyebrow">Welcome to Fuelr</div><h1>Your food system.<br><span class="accent">Built for you.</span></h1><p>Fuelr turns your budget, school, recipes and weekly routine into one simple meal-prep system.</p><button class="btn primary onboard-main" data-ob-next="1">Build my Fuelr →</button></div>`,false);
  if(step===1) return shell(`<div class="onboard-copy"><div class="eyebrow">01 · Campus</div><h1>Where do you <span class="accent">go to school?</span></h1><p>Pick your school and Fuelr adapts its visual identity around your campus colors.</p></div>
    <div class="school-grid">${SCHOOL_THEMES.filter(x=>x.id!=='fuelr').map(x=>`<button class="school-choice ${state.profile.schoolId===x.id?'selected':''}" data-school-id="${x.id}" style="--choice-primary:${x.primary};--choice-secondary:${x.secondary};--choice-on:${x.onPrimary}"><span class="school-choice-badge">${x.abbr}</span><strong>${x.name}</strong><small>${state.profile.schoolId===x.id?'Selected':'Choose school'}</small></button>`).join('')}</div>
    <button class="no-school-btn ${state.profile.schoolId==='fuelr'?'selected':''}" data-school-id="fuelr">No school / use Fuelr theme</button>
    <button class="btn primary onboard-main" data-ob-next="1" ${!state.profile.schoolId?'disabled':''}>Continue →</button>`);
  if(step===2) return shell(`<div class="onboard-copy"><div class="eyebrow">02 · Budget</div><h1>Give every dollar a <span class="accent">job.</span></h1><p>Fuelr calculates your per-meal target automatically.</p></div>
    <div class="onboard-card"><div class="field"><label>School-year food budget</label><div class="money-input"><span>$</span><input id="obBudget" type="number" value="${state.settings.schoolYearBudget}"></div></div><div class="field"><label>Academic weeks</label><input id="obWeeks" type="number" value="${state.settings.academicWeeks}"></div><div class="onboard-result"><span>Current target</span><strong>${money(mealTarget())}</strong><small>per meal · 14 meals each week</small></div></div>
    <button class="btn primary onboard-main" data-ob-next="1">Continue →</button>`);
  if(step===3) return shell(`<div class="onboard-copy"><div class="eyebrow">03 · Routine</div><h1>How do you <span class="accent">prep?</span></h1><p>Set a default. You can still choose either option every week.</p></div>
    <div class="prep-style-grid"><button class="${state.profile.prepStyle==='split'?'selected':''}" data-prep-style="split"><b>7 + 7</b><span>Two different recipes</span><small>Different lunch and dinner</small></button><button class="${state.profile.prepStyle==='single'?'selected':''}" data-prep-style="single"><b>14</b><span>One recipe</span><small>Maximum simplicity</small></button></div>
    <div class="onboard-card"><div class="split"><div class="field"><label>Preferred store</label><input id="obStore" value="${esc(state.settings.preferredStore)}"></div><div class="field"><label>Backup store</label><input id="obAlt" value="${esc(state.settings.altStore)}"></div></div></div>
    <button class="btn primary onboard-main" data-ob-next="1">Continue →</button>`);
  return shell(`<div class="onboard-finish"><div class="finish-school" style="--finish-primary:${s.primary};--finish-secondary:${s.secondary};--finish-on:${s.onPrimary}"><span>${s.abbr}</span></div><div class="eyebrow">04 · Ready</div><h1>Your Fuelr is <span class="accent">ready.</span></h1><p>${esc(s.name)} theme. ${money(mealTarget())} meal target. ${state.profile.prepStyle==='split'?'7 + 7':'14'} default prep.</p><div class="finish-stat"><span>YOUR MEAL CAP</span><strong>${money(mealTarget())}</strong><small>Fuelr will optimize every recipe around this target.</small></div><button class="btn primary onboard-main" data-finish-onboarding="1">Enter Fuelr →</button></div>`);
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
        <div class="eyebrow">Fuelr optimized</div>
        <h1>${esc(r.name)}</h1>
        <p>${r.optimizationNote?esc(r.optimizationNote):'Optimized toward the current meal cap while protecting quality, protein, carbs and useful food volume.'}</p>
        <div class="meal-count-actions detail-count-actions" aria-label="Choose meal count">
          <button class="${count===7?'active':''}" data-plan-id="${esc(r.id)}" data-plan-count="7"><b>7</b><span>meals</span></button>
          <button class="${count===14?'active':''}" data-plan-id="${esc(r.id)}" data-plan-count="14"><b>14</b><span>meals</span></button>
        </div>
        <div class="optimize-strip">
          <span>MEAL CAP</span>
          <strong>${money(mealTarget())}</strong>
          <small>${money(batchUsed)} used-cost target for ${count} meals</small>
        </div>
        ${r.scaleFactor?`<div class="scale-explain"><span>OPTIMIZATION MULTIPLIER</span><strong>×${Number(r.scaleFactor).toFixed(2)}</strong><small>Every source ingredient is first scaled from the creator's serving count to this 7- or 14-meal batch — including salt, spices, oils and sauces — then the whole recipe is optimized toward the meal cap while preserving the original flavor ratios.</small></div>`:''}
        ${r.original?`<div class="source-compare">
          <div><span>SOURCE</span><strong>${esc(r.original.servings)} servings</strong><small>${r.original.portion?esc(r.original.portion):'original recipe'}</small></div>
          <div class="compare-arrow">→</div>
          <div><span>FUELR</span><strong>${count} meals</strong><small>${esc(r.portion||'optimized athlete portion')}</small></div>
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

function prepBatchCard(entry,index){
  const r=entry.recipe;
  const count=entry.count;
  const done=prepDoneFor(r.id,count);
  const pct=Math.round((done/count)*100);
  const photo=r.photo?esc(r.photo):'assets/meal-placeholder.svg';
  const stages=['cooked','portioned','stored'];
  const stageLabels={cooked:'Cooked',portioned:'Portioned',stored:'Stored'};
  const meals=Array.from({length:count},(_,i)=>{
    const n=i+1;
    const checked=!!state.prepChecks[prepMealKey(r.id,n)];
    return `<button class="prep-meal-check ${checked?'done':''}" data-prep-meal-id="${esc(r.id)}" data-prep-meal-index="${n}" aria-label="Meal ${n} ${checked?'ready':'not ready'}"><span>${checked?'✓':n}</span></button>`;
  }).join('');
  return `<article class="prep-batch-card">
    <div class="prep-batch-head">
      <img src="${photo}" alt="${esc(r.name)}" onerror="this.src='assets/meal-placeholder.svg'">
      <div class="prep-batch-copy"><span class="prep-batch-label">PREP ${String.fromCharCode(65+index)} · ${count} MEALS</span><h3>${esc(r.name)}</h3><p>${done}/${count} containers ready</p></div>
      <div class="prep-mini-ring" style="--prep-angle:${pct*3.6}deg"><div><strong>${pct}%</strong></div></div>
    </div>
    <div class="prep-stage-row">
      ${stages.map(stage=>`<button class="${state.prepChecks[prepStageKey(r.id,stage)]?'done':''}" data-prep-stage-id="${esc(r.id)}" data-prep-stage="${stage}"><span>${state.prepChecks[prepStageKey(r.id,stage)]?'✓':'○'}</span>${stageLabels[stage]}</button>`).join('')}
    </div>
    <div class="prep-meal-title"><span>Meal containers</span><small>Tap each one as it is filled and ready</small></div>
    <div class="prep-meal-grid count-${count}">${meals}</div>
    <button class="prep-all-btn ${done===count?'complete':''}" data-prep-all-id="${esc(r.id)}" data-prep-all-count="${count}">${done===count?'Reset this batch':'Mark all '+count+' ready'}</button>
  </article>`;
}

function renderPrep(){
  const entries=selectedEntries();
  const total=plannedMeals();
  const done=totalPrepDone();
  const pct=total===14?Math.round(done/14*100):0;
  if(total!==14){
    return `<section class="page-intro">
      <div class="eyebrow">Weekly prep board</div>
      <h1>Finish the plan, then <span class="accent">cook it.</span></h1>
      <p>The Prep page unlocks when your week reaches 14 meals — either one 14-meal recipe or two different 7-meal recipes.</p>
    </section>
    <section class="prep-lock-card">
      <div class="prep-lock-number">${total}/14</div>
      <h3>${total===7?'Halfway there.':'Choose your meals first.'}</h3>
      <p>${total===7?'Pick one more 7-meal recipe, or change your current recipe to 14.':'Your prep checklist will appear here once the weekly plan is complete.'}</p>
      <div class="progress prep-progress"><span style="width:${Math.min(100,total/14*100)}%"></span></div>
      <button class="btn primary full" data-go="recipes">${total===7?'Choose the other 7':'Build this week'}</button>
    </section>`;
  }

  return `<section class="page-intro prep-intro">
      <div class="eyebrow">Weekly prep board</div>
      <h1>Cook it. Portion it. <span class="accent">Done.</span></h1>
      <p>Check off each container as you fill it. When all 14 are ready, Fuelr is ready to roll into the next week.</p>
    </section>
    <section class="prep-overview">
      <div class="prep-overview-copy"><span>WEEK READY</span><strong>${done}/14</strong><small>${done===14?'All meals prepared':'Keep going — '+(14-done)+' left'}</small></div>
      <div class="prep-overview-bar"><div style="width:${pct}%"></div></div>
      <span class="prep-overview-pct">${pct}%</span>
    </section>
    <section class="prep-batches">${entries.map((entry,index)=>prepBatchCard(entry,index)).join('')}</section>
    ${done===14?`<section class="week-complete-card">
      <div class="week-complete-icon">✓</div>
      <div><span>WEEK COMPLETE</span><h3>All 14 meals are cooked and ready.</h3><p>When you are ready, clear this week and choose the next recipe lineup.</p></div>
      <button class="btn primary" data-next-week="1">Start next week</button>
    </section>`:''}`;
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
      <div class="budget-row"><div class="name">Optimization rule</div><div class="amount">scale to cap</div><small>If a source meal costs less, Fuelr increases useful ingredient quantities toward the cap. If it costs more, it scales back intelligently while protecting quality and nutrition.</small></div>
    </div></div></section>`;
}

function renderSettings(){
  return `<section class="page-intro">
      <div class="eyebrow">System settings</div>
      <h1>One budget drives <span class="accent">everything.</span></h1>
      <p>Fuelr calculates the meal cap automatically from your school-year budget, academic weeks, and 14 weekly meals.</p>
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
    <button id="saveSettings" class="btn primary full save-settings">Save Fuelr settings</button>
    <section class="section"><div class="notice blue"><strong>Streamlined scaling:</strong> Fuelr first normalizes every listed ingredient from the creator's original serving count to 7 or 14 meals — including salt, spices, seasoning packets, oils and sauces. Then it prices that normalized recipe per meal, calculates the ratio to your meal cap, and scales the full recipe toward that budget while preserving the original ingredient and flavor ratios.</div></section>`;
}

function render(){
  const topbar=document.querySelector('.topbar');
  const onboarding=!state.onboardingComplete;
  nav.classList.toggle('hidden',onboarding);
  topbar?.classList.toggle('onboarding-mode',onboarding);
  if(onboarding){
    app.innerHTML=renderOnboarding();
    bindDynamic();
    return;
  }
  nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab && !state.detailId && !state.addRecipeMode));
  if(state.detailId){ const r=state.recipes.find(x=>x.id===state.detailId); app.innerHTML=r?renderRecipeDetail(r):renderRecipes(); }
  else if(state.tab==='recipes') app.innerHTML=renderRecipes();
  else if(state.tab==='week') app.innerHTML=renderWeek();
  else if(state.tab==='you') app.innerHTML=renderYou();
  else app.innerHTML=renderHome();
  bindDynamic();
}

function bindDynamic(){
  app.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>setTab(el.dataset.go)));
  app.querySelectorAll('[data-recipe]').forEach(el=>el.addEventListener('click',e=>{ if(e.target.closest('[data-plan-id],[data-clear-plan]')) return; state.detailId=el.dataset.recipe;render();window.scrollTo({top:0,behavior:'smooth'});}));
  app.querySelectorAll('[data-plan-id]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setMealPlan(el.dataset.planId,Number(el.dataset.planCount));}));
  app.querySelectorAll('[data-clear-plan]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();clearMealPlan(el.dataset.clearPlan);}));
  app.querySelectorAll('[data-check]').forEach(el=>el.addEventListener('change',()=>{state.checked[el.dataset.check]=el.checked;localStorage.setItem('pf_checked',JSON.stringify(state.checked));render();}));
  app.querySelectorAll('[data-prep-meal-id]').forEach(el=>el.addEventListener('click',()=>togglePrepMeal(el.dataset.prepMealId,Number(el.dataset.prepMealIndex))));
  app.querySelectorAll('[data-prep-stage-id]').forEach(el=>el.addEventListener('click',()=>togglePrepStage(el.dataset.prepStageId,el.dataset.prepStage)));
  app.querySelectorAll('[data-prep-all-id]').forEach(el=>el.addEventListener('click',()=>markPrepBatch(el.dataset.prepAllId,Number(el.dataset.prepAllCount))));
  app.querySelectorAll('[data-next-week]').forEach(el=>el.addEventListener('click',()=>startNextWeek()));
  app.querySelectorAll('[data-week-view]').forEach(el=>el.addEventListener('click',()=>setWeekView(el.dataset.weekView)));
  app.querySelectorAll('[data-add-recipe]').forEach(el=>el.addEventListener('click',()=>{state.addRecipeMode=true;state.detailId='';render();window.scrollTo({top:0,behavior:'smooth'});}));
  app.querySelectorAll('[data-close-add]').forEach(el=>el.addEventListener('click',()=>{state.addRecipeMode=false;render();}));
  document.getElementById('saveUserRecipe')?.addEventListener('click',saveNewUserRecipe);
  app.querySelectorAll('[data-change-school]').forEach(el=>el.addEventListener('click',beginSchoolChange));

  app.querySelectorAll('[data-school-id]').forEach(el=>el.addEventListener('click',()=>chooseSchool(el.dataset.schoolId)));
  app.querySelectorAll('[data-prep-style]').forEach(el=>el.addEventListener('click',()=>{state.profile.prepStyle=el.dataset.prepStyle;saveProfile();render();}));
  app.querySelectorAll('[data-ob-back]').forEach(el=>el.addEventListener('click',()=>{state.onboardingStep=Math.max(0,state.onboardingStep-1);render();}));
  app.querySelectorAll('[data-ob-next]').forEach(el=>el.addEventListener('click',()=>{
    if(state.onboardingStep===1 && !state.profile.schoolId){ showToast('Choose a school or Fuelr theme'); return; }
    if(state.onboardingStep===2){
      state.settings.schoolYearBudget=Number(document.getElementById('obBudget')?.value)||DEFAULTS.schoolYearBudget;
      state.settings.academicWeeks=Number(document.getElementById('obWeeks')?.value)||DEFAULTS.academicWeeks;
      saveSettings();
    }
    if(state.onboardingStep===3){
      state.settings.preferredStore=document.getElementById('obStore')?.value||'Aldi';
      state.settings.altStore=document.getElementById('obAlt')?.value||'Walmart';
      saveSettings(); saveProfile();
    }
    state.onboardingStep=Math.min(4,state.onboardingStep+1); render(); window.scrollTo({top:0,behavior:'smooth'});
  }));
  app.querySelectorAll('[data-finish-onboarding]').forEach(el=>el.addEventListener('click',()=>{
    state.onboardingComplete=true;
    localStorage.setItem('fuelr_onboarding_done','1');
    saveProfile(); saveSettings(); applySchoolTheme();
    state.tab='home'; localStorage.setItem('pf_tab','home');
    showToast('Fuelr is ready');
    render(); window.scrollTo({top:0,behavior:'smooth'});
  }));

  const save=document.getElementById('saveSettings');
  if(save) save.addEventListener('click',()=>{
    state.settings.schoolYearBudget=Number(document.getElementById('sBudget').value)||DEFAULTS.schoolYearBudget;
    state.settings.academicWeeks=Number(document.getElementById('sWeeks').value)||DEFAULTS.academicWeeks;
    state.settings.mealsPerWeek=14;
    state.settings.preferredStore=document.getElementById('sStore').value||'Aldi';
    state.settings.altStore=document.getElementById('sAlt').value||'Walmart';
    saveSettings();showToast('Your Fuelr was updated');render();
  });
}

nav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
document.querySelectorAll('.brand-button').forEach(b=>b.addEventListener('click',()=>setTab('home')));
syncBtn.addEventListener('click',()=>syncRecipes(false));
applySchoolTheme();
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
syncRecipes(true);
