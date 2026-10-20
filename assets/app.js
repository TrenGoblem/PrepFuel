const WEEKLY_MEAL_OPTIONS = [7,14,21];

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
const storedSchedule = JSON.parse(localStorage.getItem('fuelr_week_schedule') || '{}');
const normalizeTab = tab => ['prep','grocery'].includes(tab) ? 'week' : ['budget','settings'].includes(tab) ? 'you' : (['home','recipes','week','calendar','you'].includes(tab) ? tab : 'home');

const state = {
  tab: normalizeTab(savedTab),
  weekView: localStorage.getItem('fuelr_week_view') || (savedTab==='grocery'?'shop':savedTab==='prep'?'prep':'plan'),
  recipes: [],
  catalogRecipes: [],
  userRecipes: Array.isArray(storedUserRecipes) ? storedUserRecipes : [],
  selections: Object.keys(storedSelections).length ? storedSelections : (legacySelected ? {[legacySelected]:14} : {}),
  checked: JSON.parse(localStorage.getItem('pf_checked') || '{}'),
  prepChecks: JSON.parse(localStorage.getItem('pf_prep_checks') || '{}'),
  schedule: storedSchedule && typeof storedSchedule === 'object' ? storedSchedule : {},
  calendarPick: '',
  settings: {
    schoolYearBudget: Number(storedSettings.schoolYearBudget) || DEFAULTS.schoolYearBudget,
    academicWeeks: Number(storedSettings.academicWeeks) || DEFAULTS.academicWeeks,
    mealsPerWeek: WEEKLY_MEAL_OPTIONS.includes(Number(storedSettings.mealsPerWeek)) ? Number(storedSettings.mealsPerWeek) : DEFAULTS.mealsPerWeek,
    preferredStore: storedSettings.preferredStore || DEFAULTS.preferredStore,
    altStore: storedSettings.altStore || DEFAULTS.altStore
  },
  profile: {
    schoolId: storedProfile.schoolId || '',
    prepStyle: storedProfile.prepStyle || 'split',
    portionMode: storedProfile.portionMode || 'athlete',
    dietaryPreferences: Array.isArray(storedProfile.dietaryPreferences) ? storedProfile.dietaryPreferences : [],
    allergies: Array.isArray(storedProfile.allergies) ? storedProfile.allergies : [],
    goal: storedProfile.goal || 'performance',
    ...storedProfile
  },
  onboardingComplete: localStorage.getItem('fuelr_onboarding_done') === '1',
  onboardingStep: 0,
  addRecipeMode: false,
  lastSync: localStorage.getItem('pf_last_sync') || '',
  detailId: '',
  cloud: { ready:false, session:null, user:null, mode:'signin', error:'', message:'' }
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
  .filter(x=>x.recipe && WEEKLY_MEAL_OPTIONS.includes(x.count));

const weeklyMealTarget = () => state.settings.mealsPerWeek;
const mealsPerDay = () => weeklyMealTarget()/7;
const remainingMeals = () => Math.max(0, weeklyMealTarget()-plannedMeals());
const recipeBudgetFactor = r => {
  const base=Number(r?.costPerMeal);
  return Number.isFinite(base) && base>0 ? mealTarget()/base : 1;
};
const recipeBatchFactor = (r,count) => (Number(count)/Number(r?.servings||14))*recipeBudgetFactor(r);
const macroFor = (r,key) => {
  const v=Number(r?.macros?.[key]);
  if(!Number.isFinite(v)) return r?.macros?.[key] ?? null;
  return Math.round(v*recipeBudgetFactor(r)*10)/10;
};
const planShape = () => selectedEntries().map(x=>x.count).sort((a,b)=>b-a).join(' + ');
const planExamples = target => target===7 ? '7' : target===14 ? '7 + 7 or 14' : '7 + 7 + 7, 14 + 7, or 21';
const weeklyMealDescription = target => target===7 ? '1 prepared meal per day' : target===14 ? '2 prepared meals per day' : '3 prepared meals per day';
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SLOT_LABELS = {breakfast:'Breakfast',lunch:'Lunch',dinner:'Dinner'};
const recipeMealType = r => r?.mealType === 'breakfast' ? 'breakfast' : 'main';
const recipeBatchAllowed = (r,count) => recipeMealType(r)==='breakfast' ? Number(count)<=7 : Number(count)<=14;
const slotCompatible = (r,slot) => recipeMealType(r)==='breakfast' ? slot==='breakfast' : (slot==='lunch' || slot==='dinner');
const calendarSlotKey = (day,slot) => day+':'+slot;
const currentWeekStart = () => {
  const d=new Date();
  const diff=(d.getDay()+6)%7;
  const monday=new Date(d);
  monday.setHours(12,0,0,0);
  monday.setDate(d.getDate()-diff);
  return monday.toISOString().slice(0,10);
};
const weekDate = day => {
  const [y,m,d]=currentWeekStart().split('-').map(Number);
  const date=new Date(y,m-1,d+Number(day),12,0,0);
  return date;
};
const calendarAssignedCount = id => Object.values(state.schedule).filter(x=>x===id).length;
const scheduledMeals = () => Object.keys(state.schedule).filter(k=>state.schedule[k]).length;



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
  if(state.onboardingComplete) persistProfileToCloud();
  render();
}
function setWeekView(view){
  state.weekView=['plan','shop','prep'].includes(view)?view:'plan';
  localStorage.setItem('fuelr_week_view',state.weekView);
  state.tab='week';
  localStorage.setItem('pf_tab','week');
  state.detailId='';
  render();
  scheduleCloudWeekSave();
  window.scrollTo({top:0,behavior:'smooth'});
}
function beginSchoolChange(){
  state.onboardingComplete=false;
  state.onboardingStep=1;
  render();
}

const cloudEnabled = () => Boolean(window.FuelrCloud?.configured);
const cloudSignedIn = () => Boolean(state.cloud.session?.user);

function mapCloudRecipe(row){
  const ing=(row.recipe_ingredients||[]).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const ingredients=ing.map(i=>({
    item:i.item,
    quantity:i.optimized_quantity ?? i.source_quantity ?? '',
    unit:i.optimized_unit || i.source_unit || '',
    usedCost:i.used_cost,
    category:i.category || 'My recipe',
    note:i.note || ''
  }));
  const sourceIngredients=ing.map(i=>({
    item:i.item,
    quantity:i.source_quantity ?? i.optimized_quantity ?? '',
    unit:i.source_unit || i.optimized_unit || '',
    category:i.category || 'My recipe',
    note:i.note || ''
  }));
  return {
    id:row.id,
    clientSourceId:row.client_source_id || null,
    name:row.name,
    sourceName:row.source_name || 'My recipe',
    mealType:row.meal_type === 'breakfast' ? 'breakfast' : 'main',
    photo:row.signed_photo_url || row.photo_url || 'assets/meal-placeholder.svg',
    photoPath:row.photo_url || null,
    servings:Number(row.optimized_servings||14),
    portion:'Fuelr cloud recipe',
    costPerMeal:row.optimized_cost_per_meal != null ? Number(row.optimized_cost_per_meal) : mealTarget(),
    priceStatus:row.source_batch_cost != null ? 'based on your source cost' : 'price estimate needed',
    macros:{
      calories:row.calories != null ? Number(row.calories) : null,
      protein:row.protein_g != null ? Number(row.protein_g) : null,
      carbs:row.carbs_g != null ? Number(row.carbs_g) : null,
      fat:row.fat_g != null ? Number(row.fat_g) : null
    },
    userOwned:true,
    optimizationNote:row.optimization_note || 'Saved to your Fuelr account.',
    original:{
      servings:Number(row.source_servings||1),
      portion:'source serving',
      sourceIngredients,
      ingredients:sourceIngredients.map(i=>`${i.quantity} ${i.unit} ${i.item}`)
    },
    ingredients,
    shopping:ingredients.map(i=>({
      item:i.item,
      category:i.category||'My recipe',
      buyQuantity:i.quantity,
      unit:i.unit,
      preferredStore:state.settings.preferredStore,
      altStore:state.settings.altStore,
      priceStatus:'price needed'
    })),
    instructions:Array.isArray(row.instructions)?row.instructions:[],
    cloudOwned:true
  };
}

async function loadCloudUserData(){
  if(!cloudSignedIn()) return;
  try{
    const localWasOnboarded=localStorage.getItem('fuelr_onboarding_done')==='1';
    let profile=await window.FuelrCloud.getProfile();

    // First sign-in on an existing device: move the user's current Fuelr setup into the account
    // instead of overwriting it with the new profile defaults.
    if(profile && !profile.onboarding_complete && localWasOnboarded){
      profile=await window.FuelrCloud.saveProfile({
        schoolId:state.profile.schoolId || 'fuelr',
        schoolYearBudget:state.settings.schoolYearBudget,
        academicWeeks:state.settings.academicWeeks,
        mealsPerWeek:state.settings.mealsPerWeek,
        preferredStore:state.settings.preferredStore,
        altStore:state.settings.altStore,
        prepStyle:state.profile.prepStyle,
        portionMode:state.profile.portionMode,
        dietaryPreferences:state.profile.dietaryPreferences||[],
        allergies:state.profile.allergies||[],
        goal:state.profile.goal||'performance',
        onboardingComplete:true
      });
    }

    if(profile){
      state.profile.schoolId=profile.school_id || 'fuelr';
      state.profile.prepStyle=profile.prep_style || 'split';
      state.profile.portionMode=profile.portion_mode || 'athlete';
      state.profile.dietaryPreferences=Array.isArray(profile.dietary_preferences)?profile.dietary_preferences:[];
      state.profile.allergies=Array.isArray(profile.allergies)?profile.allergies:[];
      state.profile.goal=profile.goal || 'performance';
      state.settings.schoolYearBudget=Number(profile.school_year_budget)||DEFAULTS.schoolYearBudget;
      state.settings.academicWeeks=Number(profile.academic_weeks)||DEFAULTS.academicWeeks;
      state.settings.mealsPerWeek=WEEKLY_MEAL_OPTIONS.includes(Number(profile.meals_per_week))?Number(profile.meals_per_week):DEFAULTS.mealsPerWeek;
      state.settings.preferredStore=profile.preferred_store||'Aldi';
      state.settings.altStore=profile.alt_store||'Walmart';
      state.onboardingComplete=Boolean(profile.onboarding_complete);
      saveProfile(); saveSettings();
      localStorage.setItem('fuelr_onboarding_done',state.onboardingComplete?'1':'0');
      applySchoolTheme();
    }else{
      state.onboardingComplete=false;
      state.onboardingStep=0;
    }

    // One-time migration of recipes created before accounts were turned on.
    const migrationKey='fuelr_local_recipes_migrated_'+state.cloud.user.id;
    const localRecipes=JSON.parse(localStorage.getItem('fuelr_user_recipes')||'[]');
    if(localRecipes.length && localStorage.getItem(migrationKey)!=='1'){
      for(const recipe of localRecipes){
        await window.FuelrCloud.createRecipe({...recipe,clientSourceId:recipe.id});
      }
      localStorage.setItem(migrationKey,'1');
    }

    const rows=await window.FuelrCloud.listRecipes();
    state.userRecipes=(rows||[]).map(mapCloudRecipe);
    state.recipes=[...state.catalogRecipes,...state.userRecipes];

    // Remap any pre-account local recipe IDs to their new cloud UUIDs.
    const remapped={};
    Object.entries(state.selections).forEach(([id,count])=>{
      const migrated=state.userRecipes.find(r=>r.clientSourceId===id);
      remapped[migrated?.id || id]=count;
    });
    state.selections=remapped;
    saveSelections();

    const week=await window.FuelrCloud.getCurrentWeek();
    if(week){
      state.selections={};
      (week.weekly_plan_recipes||[])
        .slice()
        .sort((a,b)=>(a.slot||0)-(b.slot||0))
        .forEach(row=>{
          const id=row.recipe_id || row.recipe_key;
          if(id) state.selections[id]=Number(row.meal_count);
        });

      state.checked={};
      (week.grocery_items||[]).forEach(row=>{
        if(row.item_key) state.checked[row.item_key]=Boolean(row.checked);
      });

      state.prepChecks={};
      (week.prep_checks||[]).forEach(row=>{
        const id=row.recipe_id || row.recipe_key;
        if(!id) return;
        const key=row.check_type==='meal'
          ? prepMealKey(id,Number(row.meal_index))
          : prepStageKey(id,row.check_type);
        state.prepChecks[key]=Boolean(row.checked);
      });

      state.schedule={};
      (week.weekly_schedule_slots||[]).forEach(row=>{
        const id=row.recipe_id || row.recipe_key;
        if(id) state.schedule[calendarSlotKey(Number(row.day_index),row.slot_type)]=id;
      });
      reconcileSchedule(!Object.keys(state.schedule).length);

      saveSelections();
      localStorage.setItem('pf_checked',JSON.stringify(state.checked));
      savePrepChecks();
      saveSchedule();
      state.weekView=week.status==='prepping' || week.status==='complete'
        ? 'prep'
        : week.status==='shopping'
          ? 'shop'
          : state.weekView;
      localStorage.setItem('fuelr_week_view',state.weekView);
    }else if(plannedMeals()>0){
      await saveCloudWeekState();
    }
  }catch(err){
    console.warn('Fuelr cloud load:',err);
    state.cloud.error='Could not load your cloud data.';
  }
}

async function persistProfileToCloud(){
  if(!cloudSignedIn()) return;
  try{
    await window.FuelrCloud.saveProfile({
      schoolId:state.profile.schoolId || 'fuelr',
      schoolYearBudget:state.settings.schoolYearBudget,
      academicWeeks:state.settings.academicWeeks,
      mealsPerWeek:state.settings.mealsPerWeek,
      preferredStore:state.settings.preferredStore,
      altStore:state.settings.altStore,
      prepStyle:state.profile.prepStyle,
      portionMode:state.profile.portionMode,
      dietaryPreferences:state.profile.dietaryPreferences||[],
      allergies:state.profile.allergies||[],
      goal:state.profile.goal||'performance',
      onboardingComplete:state.onboardingComplete
    });
  }catch(err){
    console.warn('Fuelr cloud profile save:',err);
    showToast('Saved on device — cloud sync needs attention');
  }
}


function cloudWeekStatus(){
  if(plannedMeals()<weeklyMealTarget()) return 'planning';
  if(totalPrepDone()===weeklyMealTarget()) return 'complete';
  if(state.weekView==='prep') return 'prepping';
  if(state.weekView==='shop') return 'shopping';
  return 'planning';
}

function buildCloudWeekPayload(){
  const entries=selectedEntries();
  const grocery=[];
  const prep=[];

  entries.forEach(({recipe,count})=>{
    const factor=recipeBatchFactor(recipe,count);
    const rows=(recipe.shopping||recipe.ingredients||[]).map(i=>scaledShopping(i,factor));
    rows.forEach((item,idx)=>{
      const itemKey=`${recipe.id}:${count}:${idx}`;
      const rawQty=item.buyQuantity ?? item.quantity ?? null;
      const numericQty=rawQty!==null && rawQty!=='' && Number.isFinite(Number(rawQty))
        ? Number(rawQty)
        : null;
      grocery.push({
        recipeId:recipe.id,
        cloudOwned:Boolean(recipe.cloudOwned),
        itemKey,
        item:item.item,
        quantity:numericQty,
        unit:item.unit||null,
        category:item.category||'Other',
        preferredStore:item.preferredStore||state.settings.preferredStore,
        altStore:item.altStore||state.settings.altStore,
        checkoutCost:item.checkoutCost??null,
        checked:Boolean(state.checked[itemKey])
      });
    });

    ['cooked','portioned','stored'].forEach(stage=>{
      prep.push({
        recipeId:recipe.id,
        cloudOwned:Boolean(recipe.cloudOwned),
        checkType:stage,
        mealIndex:null,
        checked:Boolean(state.prepChecks[prepStageKey(recipe.id,stage)])
      });
    });

    for(let i=1;i<=count;i++){
      prep.push({
        recipeId:recipe.id,
        cloudOwned:Boolean(recipe.cloudOwned),
        checkType:'meal',
        mealIndex:i,
        checked:Boolean(state.prepChecks[prepMealKey(recipe.id,i)])
      });
    }
  });

  const schedule=Object.entries(state.schedule).map(([key,recipeId])=>{
    const [dayIndex,slotType]=key.split(':');
    const recipe=state.recipes.find(r=>r.id===recipeId);
    return {
      dayIndex:Number(dayIndex),
      slotType,
      recipeId,
      cloudOwned:Boolean(recipe?.cloudOwned)
    };
  }).filter(x=>x.recipeId);

  return {
    mealTarget:mealTarget(),
    status:cloudWeekStatus(),
    schedule,
    recipes:entries.map(({recipe,count})=>({
      id:recipe.id,
      name:recipe.name,
      cloudOwned:Boolean(recipe.cloudOwned),
      count
    })),
    grocery,
    prep
  };
}

async function saveCloudWeekState(){
  if(!cloudSignedIn()) return;
  try{
    await window.FuelrCloud.saveCurrentWeek(buildCloudWeekPayload());
  }catch(err){
    console.warn('Fuelr week sync:',err);
    state.cloud.error='Weekly cloud sync needs attention.';
  }
}

function scheduleCloudWeekSave(){
  if(!cloudSignedIn()) return;
  clearTimeout(scheduleCloudWeekSave.t);
  scheduleCloudWeekSave.t=setTimeout(()=>saveCloudWeekState(),300);
}

async function initCloud(){
  if(!cloudEnabled()){
    state.cloud.ready=true;
    render();
    return;
  }
  try{
    const result=await window.FuelrCloud.init();
    state.cloud.ready=true;
    state.cloud.session=result.session||null;
    state.cloud.user=result.user||null;
    if(state.cloud.session) await loadCloudUserData();
  }catch(err){
    state.cloud.ready=true;
    state.cloud.error='Cloud connection failed. Refresh and try again.';
  }
  if(!window.__fuelrAuthListener){
    window.__fuelrAuthListener=true;
    window.addEventListener('fuelr-auth-change',async e=>{
      state.cloud.session=e.detail?.session||null;
      state.cloud.user=e.detail?.user||null;
      state.cloud.error='';
      state.cloud.message='';
      if(state.cloud.session) await loadCloudUserData();
      render();
    });
  }
  render();
}

function renderAuthGate(){
  const signup=state.cloud.mode==='signup';
  return `<div class="auth-shell">
    <div class="auth-mark">FR</div>
    <div class="eyebrow">Fuelr account</div>
    <h1>${signup?'Create your':'Welcome'} <span class="accent">Fuelr.</span></h1>
    <p>${signup?'Your recipes, school theme, weekly plan and prep progress will follow you across devices.':'Sign in to your personal food system.'}</p>
    <div class="auth-card">
      <div class="auth-switch">
        <button class="${!signup?'active':''}" data-auth-mode="signin">Sign in</button>
        <button class="${signup?'active':''}" data-auth-mode="signup">Create account</button>
      </div>
      <div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input id="authPassword" type="password" autocomplete="${signup?'new-password':'current-password'}" placeholder="At least 6 characters"></div>
      ${state.cloud.error?`<div class="auth-message error">${esc(state.cloud.error)}</div>`:''}
      ${state.cloud.message?`<div class="auth-message">${esc(state.cloud.message)}</div>`:''}
      <button class="btn primary full auth-submit" id="authSubmit">${signup?'Create my Fuelr':'Sign in'}</button>
      <small class="auth-footnote">Fuelr uses secure account authentication. Your private recipes remain tied to your account.</small>
    </div>
  </div>`;
}

async function submitAuth(){
  const email=document.getElementById('authEmail')?.value.trim();
  const password=document.getElementById('authPassword')?.value||'';
  if(!email || password.length<6){
    state.cloud.error='Enter a valid email and a password with at least 6 characters.';
    render(); return;
  }
  state.cloud.error=''; state.cloud.message='';
  try{
    const result=state.cloud.mode==='signup'
      ? await window.FuelrCloud.signUp(email,password)
      : await window.FuelrCloud.signIn(email,password);
    if(result?.error) throw result.error;
    const session=result?.data?.session||null;
    if(session){
      state.cloud.session=session;
      state.cloud.user=session.user;
      await loadCloudUserData();
      render();
    }else if(state.cloud.mode==='signup'){
      state.cloud.message='Account created. Check your email if confirmation is required, then sign in.';
      state.cloud.mode='signin';
      render();
    }
  }catch(err){
    state.cloud.error=err?.message||'Could not sign in.';
    render();
  }
}

async function signOutCloud(){
  try{ await window.FuelrCloud.signOut(); }
  catch(err){ state.cloud.error=err?.message||'Could not sign out.'; }
  state.cloud.session=null;
  state.cloud.user=null;
  render();
}


function saveSettings(){ localStorage.setItem('pf_settings', JSON.stringify(state.settings)); }
function saveSelections(){ localStorage.setItem('pf_meal_selections', JSON.stringify(state.selections)); localStorage.removeItem('pf_selected_recipe'); }
function savePrepChecks(){ localStorage.setItem('pf_prep_checks', JSON.stringify(state.prepChecks)); }
function saveSchedule(){ localStorage.setItem('fuelr_week_schedule', JSON.stringify(state.schedule)); }
function resetSchedule(){ state.schedule={}; state.calendarPick=''; saveSchedule(); }

function reconcileSchedule(autoFill=true){
  const selected=new Map(selectedEntries().map(x=>[x.recipe.id,x]));
  const kept={};
  const counts={};

  Object.entries(state.schedule).forEach(([key,id])=>{
    const entry=selected.get(id);
    if(!entry) return;
    const [day,slot]=key.split(':');
    if(!slotCompatible(entry.recipe,slot)) return;
    counts[id]=(counts[id]||0)+1;
    if(counts[id] <= entry.count) kept[key]=id;
  });

  state.schedule=kept;

  if(autoFill){
    selectedEntries().forEach(({recipe,count})=>{
      let need=count-calendarAssignedCount(recipe.id);
      if(need<=0) return;
      const slots=[];
      for(let day=0;day<7;day++){
        if(recipeMealType(recipe)==='breakfast') slots.push(calendarSlotKey(day,'breakfast'));
        else {
          slots.push(calendarSlotKey(day,'lunch'));
          slots.push(calendarSlotKey(day,'dinner'));
        }
      }
      for(const key of slots){
        if(need<=0) break;
        if(!state.schedule[key]){
          state.schedule[key]=recipe.id;
          need--;
        }
      }
    });
  }
  saveSchedule();
}

function assignCalendarSlot(day,slot,recipeId){
  const recipe=state.recipes.find(r=>r.id===recipeId);
  const planned=planFor(recipeId);
  if(!recipe || !planned || !slotCompatible(recipe,slot)) return;

  const key=calendarSlotKey(day,slot);
  const existingHere=state.schedule[key];
  if(existingHere===recipeId){ state.calendarPick=''; render(); return; }

  if(calendarAssignedCount(recipeId)>=planned){
    const moveKey=Object.keys(state.schedule).find(k=>state.schedule[k]===recipeId && k!==key);
    if(moveKey) delete state.schedule[moveKey];
  }

  state.schedule[key]=recipeId;
  state.calendarPick='';
  saveSchedule();
  render();
  scheduleCloudWeekSave();
}

function clearCalendarSlot(day,slot){
  delete state.schedule[calendarSlotKey(day,slot)];
  state.calendarPick='';
  saveSchedule();
  render();
  scheduleCloudWeekSave();
}

function autoFillCalendar(){
  reconcileSchedule(true);
  state.calendarPick='';
  render();
  scheduleCloudWeekSave();
}

function ensureLocalWeekRollover(){
  const now=currentWeekStart();
  const saved=localStorage.getItem('fuelr_week_start');
  if(saved && saved!==now){
    state.selections={};
    state.checked={};
    state.prepChecks={};
    state.schedule={};
    saveSelections();
    localStorage.setItem('pf_checked','{}');
    savePrepChecks();
    saveSchedule();
    state.weekView='plan';
    localStorage.setItem('fuelr_week_view','plan');
  }
  localStorage.setItem('fuelr_week_start',now);
}

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
  savePrepChecks(); render(); scheduleCloudWeekSave();
}
function togglePrepStage(id,stage){
  const key=prepStageKey(id,stage);
  state.prepChecks[key]=!state.prepChecks[key];
  savePrepChecks(); render(); scheduleCloudWeekSave();
}
function markPrepBatch(id,count){
  const allDone=prepDoneFor(id,count)===count;
  for(let i=1;i<=count;i++) state.prepChecks[prepMealKey(id,i)]=!allDone;
  ['cooked','portioned','stored'].forEach(stage=>state.prepChecks[prepStageKey(id,stage)]=!allDone);
  savePrepChecks(); render(); scheduleCloudWeekSave();
}
function startNextWeek(){
  if(!confirm('Start a new week? This clears the current meal plan, grocery checks, and prep progress.')) return;
  state.selections={};
  state.checked={};
  state.prepChecks={};
  state.schedule={};
  state.calendarPick='';
  saveSelections();
  localStorage.setItem('pf_checked','{}');
  savePrepChecks();
  saveSchedule();
  state.detailId='';
  state.tab='recipes';
  localStorage.setItem('pf_tab','recipes');
  showToast('New week started — choose your meals');
  if(cloudSignedIn()) window.FuelrCloud.clearCurrentWeek().catch(err=>console.warn('Fuelr clear week:',err));
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
  const factor=recipeBatchFactor(r,count);
  return (r.shopping||[]).map(i=>scaledShopping(i,factor)).reduce((sum,i)=>sum+Number(i.checkoutCost||0),0);
}
function setWeeklyMealsTarget(count){
  count=Number(count);
  if(!WEEKLY_MEAL_OPTIONS.includes(count) || count===state.settings.mealsPerWeek) return;
  state.settings.mealsPerWeek=count;

  let used=0;
  const next={};
  Object.entries(state.selections).forEach(([id,c])=>{
    c=Number(c);
    if(WEEKLY_MEAL_OPTIONS.includes(c) && c<=count && used+c<=count){
      next[id]=c;
      used+=c;
    }
  });
  state.selections=next;
  state.checked={};
  state.prepChecks={};
  saveSelections();
  localStorage.setItem('pf_checked','{}');
  savePrepChecks();
  reconcileSchedule(true);
  saveSettings();
  if(state.onboardingComplete){
    persistProfileToCloud();
    scheduleCloudWeekSave();
  }
  showToast(`${count} prepared meals per week selected`);
  render();
}

function setMealPlan(id,count){
  count=Number(count);
  const target=weeklyMealTarget();
  const recipe=state.recipes.find(r=>r.id===id);
  if(!WEEKLY_MEAL_OPTIONS.includes(count) || count>target){
    showToast(`Your weekly target is ${target} meals`);
    return;
  }
  if(recipe && !recipeBatchAllowed(recipe,count)){
    showToast(recipeMealType(recipe)==='breakfast' ? 'Breakfast recipes fill the 7 breakfast slots' : 'Lunch / dinner recipes can fill up to 14 weekly slots');
    return;
  }
  if(planFor(id)===count) return;

  let remaining=target-count;
  const next={};
  Object.entries(state.selections).forEach(([otherId,c])=>{
    c=Number(c);
    if(otherId===id || !WEEKLY_MEAL_OPTIONS.includes(c)) return;
    if(c<=remaining){
      next[otherId]=c;
      remaining-=c;
    }
  });
  next[id]=count;
  state.selections=next;

  state.checked={};
  localStorage.setItem('pf_checked','{}');
  resetPrepChecks();
  saveSelections();
  reconcileSchedule(true);

  const total=plannedMeals();
  showToast(total===target
    ? `${target} meals planned for the week`
    : `${target-total} meals left to choose`);
  render();
  scheduleCloudWeekSave();
}

function clearMealPlan(id){
  delete state.selections[id];
  state.checked={};
  localStorage.setItem('pf_checked','{}');
  resetPrepChecks();
  saveSelections();
  reconcileSchedule(true);
  showToast('Meal removed from this week');
  render();
  scheduleCloudWeekSave();
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
  const selected = WEEKLY_MEAL_OPTIONS.includes(count);
  const target=weeklyMealTarget();
  const protein=macroFor(r,'protein');
  const calories=macroFor(r,'calories');
  const carbs=macroFor(r,'carbs');
  const buttons=WEEKLY_MEAL_OPTIONS.map(n=>`<button class="${count===n?'active':''}" data-plan-id="${esc(r.id)}" data-plan-count="${n}" ${n>target?'disabled aria-disabled="true"':''}><b>${n}</b><span>meals</span></button>`).join('');
  return `<article class="meal-float-card ${selected?'selected':''}" data-recipe="${esc(r.id)}">
    <div class="meal-photo">
      <img src="${photo}" alt="${esc(r.name)}" onerror="this.src='assets/meal-placeholder.svg'">
      <div class="meal-photo-top">
        <span class="meal-tag">${selected?count+' MEALS THIS WEEK':'FUELR PREP'}</span>
        <span class="meal-cost">${money(mealTarget())}/meal target</span>
      </div>
    </div>
    <div class="meal-card-copy">
      <div class="meal-card-label">FUELR OPTIMIZED</div>
      <h3>${esc(r.name)}</h3>
      <div class="meal-stats">
        ${protein ? `<span><b>${esc(protein)}g</b> protein</span>`:''}
        ${calories ? `<span><b>${esc(calories)}</b> cal</span>`:''}
        ${carbs ? `<span><b>${esc(carbs)}g</b> carbs</span>`:''}
      </div>
      <div class="meal-count-actions" aria-label="Choose meal count">${buttons}</div>
      <div class="meal-card-action"><span>${selected?count+' of '+target+' weekly meals':'Tap card for full recipe'}</span>${selected?`<button class="clear-plan" data-clear-plan="${esc(r.id)}">clear</button>`:`<span class="round-arrow">↗</span>`}</div>
    </div>
  </article>`;
}

function renderHome(){
  const entries=selectedEntries();
  const total=plannedMeals();
  const target=weeklyMealTarget();
  const remaining=Math.max(0,target-total);
  const pct=Math.min(100,(plannedYear()/state.settings.schoolYearBudget)*100);
  const selectedCards=entries.length ? entries.map(x=>recipeCard(x.recipe)).join('') : state.recipes.slice(0,4).map(recipeCard).join('');
  const promptTitle = total===target ? 'Week locked in.' : total ? `${remaining} meals left to choose.` : 'What are you eating this week?';
  const promptCopy = total===target
    ? `${planShape()} gives you all ${target} prepared meals for the week.`
    : total
      ? `Add ${remaining} more meals in a 7-, 14-, or 21-meal batch that fits your target.`
      : `Your target is ${target} prepared meals: ${planExamples(target)}.`;

  return `<section class="dashboard-hero">
    <div class="dashboard-intro">
      <div class="eyebrow">Fuelr · personalized weekly system</div>
      <h1>Build the week your <span class="accent">way.</span></h1>
      <p>${target} prepared meals per week · ${weeklyMealDescription(target)}. Every recipe dynamically scales toward your ${money(mealTarget())} meal cap.</p>
      <div class="hero-actions">
        <button class="btn primary" data-go="recipes">${total?'Edit meal plan':'Choose meals'}</button>
        <button class="btn ghost" data-week-view="shop">Open grocery list</button>
      </div>
    </div>
    <div class="dashboard-prompt">
      <div class="prompt-head"><span class="prompt-dot"></span><span>WEEKLY FUEL</span><span class="prompt-status">${total}/${target}</span></div>
      <h3>${promptTitle}</h3>
      <p>${promptCopy}</p>
      <button class="prompt-button" data-go="${total===target?'prep':'recipes'}">${total===target?'Open prep board':'Choose meals'} <span>→</span></button>
    </div>
  </section>

  <section class="dash-summary">
    <div class="section-head clean-head"><div><h2>Budget system</h2><p>Your food budget is divided across the prepared meals you actually choose</p></div><span class="soft-pill">${total}/${target} planned</span></div>
    <div class="summary-grid">
      <article class="summary-card ring-card">
        <div class="budget-ring" style="--budget-angle:${pct*3.6}deg"><div><strong>${Math.round(pct)}%</strong><span>allocated</span></div></div>
        <div><span class="summary-label">School-year food budget</span><strong class="summary-value">${money(state.settings.schoolYearBudget)}</strong><small>${state.settings.academicWeeks} weeks · ${target} meals/week</small></div>
      </article>
      <article class="summary-card"><span class="summary-icon blue">01</span><span class="summary-label">Meal cap</span><strong class="summary-value">${money(mealTarget())}</strong><small>all-in target / meal</small></article>
      <article class="summary-card"><span class="summary-icon pale">07</span><span class="summary-label">7-meal batch</span><strong class="summary-value">${money(mealTarget()*7)}</strong><small>one prepared meal/day</small></article>
      <article class="summary-card"><span class="summary-icon dark">${target}</span><span class="summary-label">Weekly prep</span><strong class="summary-value">${money(weeklyBudget())}</strong><small>${target} prepared meals</small></article>
    </div>
  </section>

  <section class="floating-meals-section">
    <div class="section-head clean-head"><div><h2>${entries.length?'Your weekly lineup':'Choose your lineup'}</h2><p>${remaining?remaining+' meals still open':'All '+target+' meals planned'}</p></div><button class="link-btn" data-go="recipes">See all →</button></div>
    <div class="floating-meal-stage">
      <div class="meal-swipe-rail home-rail">${selectedCards || '<div class="empty clean-empty"><h3>Add your first recipe.</h3><p>It will appear here ready for a 7-, 14-, or 21-meal batch.</p></div>'}</div>
    </div>
  </section>

  <section class="quick-row">
    <button class="quick-tile" data-week-view="shop"><span class="quick-kicker">GROCERY</span><strong>One combined run.</strong><small>Lists scale automatically to every 7-, 14-, or 21-meal batch.</small><span class="quick-arrow">→</span></button>
    <button class="quick-tile" data-go="you"><span class="quick-kicker">YOUR SYSTEM</span><strong>${target} meals/week.</strong><small>Change between 7, 14, and 21 anytime.</small><span class="quick-arrow">→</span></button>
  </section>`;
}

function renderRecipes(){
  if(state.addRecipeMode) return renderAddRecipe();
  const total=plannedMeals();
  const target=weeklyMealTarget();
  const remaining=Math.max(0,target-total);
  const cards=state.recipes.length ? state.recipes.map(recipeCard).join('') : '<div class="empty clean-empty"><h3>Your recipes will live here.</h3><p>Add your first recipe and Fuelr will scale it for 7, 14, or 21 meals.</p></div>';
  const dots=Array.from({length:target/7},(_,i)=>`<i class="${total>=(i+1)*7?'on':''}"></i>`).join('');
  return `<section class="page-intro meals-intro">
      <div class="eyebrow">Meal library</div>
      <div class="title-action-row"><div><h1>Build <span class="accent">${target} meals.</span></h1><p>${planExamples(target)}. Fuelr handles ingredient scaling, quantities, groceries, and the weekly budget underneath.</p></div><button class="add-recipe-btn" data-add-recipe="1"><span>+</span>Add recipe</button></div>
      <div class="meals-meta"><span>${state.recipes.length} recipes</span><span>•</span><span>${total}/${target} planned</span><span>•</span><span>${money(mealTarget())} cap / meal</span></div>
    </section>
    <section class="plan-status-bar">
      <div><span class="plan-status-label">WEEKLY PLAN</span><strong>${total}/${target} meals</strong></div>
      <div class="plan-dots">${dots}</div>
      <span>${total===target?'Week complete':total===0?'Choose a batch':remaining+' meals left'}</span>
    </section>
    <section class="floating-meal-stage large-stage">
      <div class="meal-swipe-rail">${cards}</div>
      <div class="swipe-hint"><span>←</span> swipe meals · choose 7, 14 or 21 <span>→</span></div>
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
      <p>Enter the source recipe exactly as written. Fuelr converts it from its original serving count into optimized 7-, 14-, and 21-meal batches.</p>
    </section>
    <section class="add-recipe-card">
      <div class="split">
        <div class="field"><label>Recipe name</label><input id="urName" placeholder="Chicken burrito bowls"></div>
        <div class="field"><label>Source servings</label><input id="urServings" type="number" min="1" step="1" placeholder="10"></div>
      </div>
      <div class="field"><label>Estimated source batch cost</label><input id="urBatchCost" type="number" min="0" step=".01" placeholder="40.00"><small>Total ingredient cost for the original source batch.</small></div>
      <div class="field"><label>Recipe photo</label><input id="urPhoto" type="file" accept="image/jpeg,image/png,image/webp"><small>Optional · JPG, PNG or WebP · up to 5 MB.</small></div>
      <div class="field"><label>Ingredients</label><textarea id="urIngredients" rows="8" placeholder="2 tbsp | buffalo seasoning&#10;1500 g | chicken thighs&#10;4 whole | baguettes&#10;16 slices | provolone"></textarea><small>One ingredient per line: quantity + unit | ingredient name. Include salt, spices, oils and sauces too.</small></div>
      <div class="split macro-inputs">
        <div class="field"><label>Calories / source serving</label><input id="urCalories" type="number" min="0" placeholder="650"></div>
        <div class="field"><label>Protein g</label><input id="urProtein" type="number" min="0" placeholder="50"></div>
        <div class="field"><label>Carbs g</label><input id="urCarbs" type="number" min="0" placeholder="70"></div>
        <div class="field"><label>Fat g</label><input id="urFat" type="number" min="0" placeholder="20"></div>
      </div>
      <div class="field"><label>Directions</label><textarea id="urDirections" rows="5" placeholder="One step per line"></textarea></div>
      <div class="recipe-form-note"><strong>How Fuelr handles this:</strong> every listed ingredient is first normalized from the source serving count to 7, 14, or 21 meals. Then the full recipe is optimized toward your ${money(mealTarget())} meal cap while preserving the original ratios.</div>
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

async function saveNewUserRecipe(){
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
  let photoPath=null;
  let photoUrl='assets/meal-placeholder.svg';
  const photoFile=document.getElementById('urPhoto')?.files?.[0] || null;
  if(photoFile && cloudSignedIn()){
    try{
      const uploaded=await window.FuelrCloud.uploadRecipeImage(photoFile);
      photoPath=uploaded?.path || null;
      photoUrl=uploaded?.signedUrl || photoUrl;
    }catch(err){
      showToast(err?.message || 'Could not upload recipe photo');
      return;
    }
  }
  const recipe={
    id,
    name,
    sourceName:'My recipe',
    photo:photoUrl,
    photoPath,
    servings:14,
    portion:'Fuelr optimized serving',
    costPerMeal:Math.round(mealTarget()*100)/100,
    checkoutTotal:null,
    priceStatus:batchCost>0?'based on your source cost':'price estimate needed',
    scaleFactor:Math.round(budgetMultiplier*100)/100,
    macros,
    macrosStatus:'Fuelr estimate from your source serving',
    userOwned:true,
    optimizationNote:`Your source makes ${sourceServings} servings. Fuelr first normalizes every ingredient to the selected 7-, 14-, or 21-meal batch, then applies a ${budgetMultiplier.toFixed(2)}× budget multiplier toward your current meal cap.`,
    sourceBatchCost:batchCost>0?batchCost:null,
    original:{
      servings:sourceServings,
      portion:'source serving',
      macros:sourceMacros,
      sourceIngredients,
      ingredients:sourceIngredients.map(i=>`${i.quantity} ${i.unit} ${i.item}`)
    },
    ingredients,
    shopping:ingredients.map(i=>({item:i.item,category:'My recipe',buyQuantity:i.quantity,unit:i.unit,preferredStore:state.settings.preferredStore,altStore:state.settings.altStore,priceStatus:'price needed'})),
    instructions:directions
  };
  if(cloudSignedIn()){
    try{
      const saved=await window.FuelrCloud.createRecipe(recipe);
      recipe.id=saved.id;
      recipe.cloudOwned=true;
    }catch(err){
      state.cloud.error=err?.message||'Could not save recipe to your account.';
      showToast('Recipe was not saved — try again');
      return;
    }
  }else{
    saveUserRecipes();
  }
  state.userRecipes.push(recipe);
  if(!cloudSignedIn()) saveUserRecipes();
  state.recipes=[...state.catalogRecipes,...state.userRecipes];
  state.addRecipeMode=false;
  state.detailId=recipe.id;
  showToast(cloudSignedIn()?'Recipe saved to your account':'Recipe saved on this device');
  render();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderWeekPlan(){
  const entries=selectedEntries();
  const total=plannedMeals();
  const target=weeklyMealTarget();
  return `<section class="week-plan-card">
    <div class="week-plan-head"><div><span>THIS WEEK</span><h2>${total}/${target} meals planned</h2></div><strong>${money(weeklyBudget())}</strong></div>
    ${entries.length?entries.map((x,i)=>`<div class="week-plan-recipe"><div class="week-letter">${String.fromCharCode(65+i)}</div><div><strong>${esc(x.recipe.name)}</strong><small>${x.count} meals · ${money(mealTarget()*x.count)} used-cost target</small></div><span>${x.count}</span></div>`).join(''):`<div class="week-empty"><h3>Build this week first.</h3><p>Your target is ${target} meals: ${planExamples(target)}.</p></div>`}
    <button class="btn primary full" data-go="recipes">${total?'Edit meal choices':'Choose meals'}</button>
  </section>`;
}

function renderWeek(){
  const view=state.weekView;
  const total=plannedMeals();
  const target=weeklyMealTarget();
  const done=totalPrepDone();
  const tabs=`<section class="week-flow">
    <button class="${view==='plan'?'active':''}" data-week-view="plan"><span>1</span><b>Plan</b><small>${total}/${target}</small></button>
    <i>→</i>
    <button class="${view==='shop'?'active':''}" data-week-view="shop"><span>2</span><b>Shop</b><small>List</small></button>
    <i>→</i>
    <button class="${view==='prep'?'active':''}" data-week-view="prep"><span>3</span><b>Prep</b><small>${done}/${target}</small></button>
  </section>`;
  if(view==='shop') return tabs+renderGrocery();
  if(view==='prep') return tabs+renderPrep();
  return `<section class="page-intro"><div class="eyebrow">Your week</div><h1>Plan → Shop → <span class="accent">Prep.</span></h1><p>${target} prepared meals, one simple weekly flow.</p></section>`+tabs+renderWeekPlan();
}

function renderYou(){
  const school=currentSchool();
  const target=weeklyMealTarget();
  const weeklyButtons=WEEKLY_MEAL_OPTIONS.map(n=>`<button class="${target===n?'selected':''}" data-weekly-meals="${n}"><b>${n}</b><span>${n/7}/day</span></button>`).join('');
  return `<section class="page-intro">
      <div class="eyebrow">Your Fuelr</div>
      <h1>Built around <span class="accent">you.</span></h1>
      <p>Your school, weekly meal count, budget, stores and food profile shape the whole app.</p>
    </section>
    <section class="profile-school-card">
      <div class="school-badge">${esc(school.abbr)}</div>
      <div><span>CAMPUS THEME</span><h2>${esc(school.name)}</h2><p>Fuelr automatically carries your school colors through the interface.</p></div>
      <button class="mini-action" data-change-school="1">Change</button>
    </section>
    <section class="you-metrics">
      <article><span>Meal cap</span><strong>${money(mealTarget())}</strong><small>per prepared meal</small></article>
      <article><span>Weekly</span><strong>${money(weeklyBudget())}</strong><small>food budget</small></article>
      <article><span>Meals</span><strong>${target}</strong><small>${weeklyMealDescription(target)}</small></article>
    </section>
    <section class="food-profile-card">
      <div><span>FOOD PROFILE</span><strong>${esc((state.profile.goal||'performance').replaceAll('_',' '))}</strong><small>${(state.profile.dietaryPreferences||[]).length?esc(state.profile.dietaryPreferences.join(' · ')):'No diet restrictions set'}</small></div>
      <div><span>AVOID</span><strong>${(state.profile.allergies||[]).length}</strong><small>${(state.profile.allergies||[]).length?esc(state.profile.allergies.join(' · ')):'No allergies listed'}</small></div>
    </section>
    <section class="settings-card you-settings">
      <div class="settings-card-head"><span class="summary-icon blue">01</span><div><h3>Food system</h3><p>Change the numbers that drive Fuelr</p></div></div>
      <div class="field"><label>Prepared meals each week</label><div class="weekly-meal-selector">${weeklyButtons}</div><small>7 = one/day · 14 = two/day · 21 = three/day. You can still split the week across multiple recipes.</small></div>
      <div class="split"><div class="field"><label>School-year budget</label><input id="sBudget" type="number" step="1" value="${state.settings.schoolYearBudget}"></div><div class="field"><label>Academic weeks</label><input id="sWeeks" type="number" step="1" value="${state.settings.academicWeeks}"></div></div>
      <div class="split"><div class="field"><label>Preferred store</label><input id="sStore" value="${esc(state.settings.preferredStore)}"></div><div class="field"><label>Backup store</label><input id="sAlt" value="${esc(state.settings.altStore)}"></div></div>
      <div class="derived-cap"><span>Calculated meal cap</span><strong>${money(mealTarget())}</strong><small>${money(state.settings.schoolYearBudget)} ÷ ${state.settings.academicWeeks} weeks ÷ ${target} meals</small></div>
      <button id="saveSettings" class="btn primary full save-settings">Save my Fuelr</button>
    </section>
    ${cloudEnabled() && cloudSignedIn()?`<section class="cloud-ready-card cloud-live"><div class="cloud-dot"></div><div><span>ACCOUNT + CLOUD</span><strong>${esc(state.cloud.user?.email||'Signed in')}</strong><p>Your profile, weekly plan and personal recipes are connected to your Fuelr account.</p></div><button class="mini-action" data-sign-out="1">Sign out</button></section>`:`<section class="cloud-ready-card"><div class="cloud-dot"></div><div><span>ACCOUNT + CLOUD</span><strong>${cloudEnabled()?'Sign in to sync':'Cloud setup pending'}</strong><p>${cloudEnabled()?'Your account keeps Fuelr available across devices.':'Fuelr is currently using on-device storage.'}</p></div></section>`}`;
}

function renderOnboarding(){
  const s=currentSchool();
  const step=state.onboardingStep;
  const shell=(body,back=true)=>`<div class="onboarding-shell">
    <div class="onboarding-progress">${Array.from({length:6},(_,i)=>`<i class="${step>=i?'on':''}"></i>`).join('')}</div>
    ${body}
    ${back && step>0?`<button class="onboard-back" data-ob-back="1">← Back</button>`:''}
  </div>`;

  if(step===0) return shell(`<div class="onboard-hero"><div class="onboard-logo">FR</div><div class="eyebrow">Welcome to Fuelr</div><h1>Your food system.<br><span class="accent">Built for you.</span></h1><p>Fuelr turns your budget, school, recipes and weekly routine into one simple meal-prep system.</p><button class="btn primary onboard-main" data-ob-next="1">Build my Fuelr →</button></div>`,false);

  if(step===1) return shell(`<div class="onboard-copy"><div class="eyebrow">01 · Campus</div><h1>Where do you <span class="accent">go to school?</span></h1><p>Pick your school and Fuelr adapts its visual identity around your campus colors.</p></div>
    <div class="school-grid">${SCHOOL_THEMES.filter(x=>x.id!=='fuelr').map(x=>`<button class="school-choice ${state.profile.schoolId===x.id?'selected':''}" data-school-id="${x.id}" style="--choice-primary:${x.primary};--choice-secondary:${x.secondary};--choice-on:${x.onPrimary}"><span class="school-choice-badge">${x.abbr}</span><strong>${x.name}</strong><small>${state.profile.schoolId===x.id?'Selected':'Choose school'}</small></button>`).join('')}</div>
    <button class="no-school-btn ${state.profile.schoolId==='fuelr'?'selected':''}" data-school-id="fuelr">No school / use Fuelr theme</button>
    <button class="btn primary onboard-main" data-ob-next="1" ${!state.profile.schoolId?'disabled':''}>Continue →</button>`);

  if(step===2){
    const target=weeklyMealTarget();
    return shell(`<div class="onboard-copy"><div class="eyebrow">02 · Weekly meals</div><h1>How much of your week should Fuelr <span class="accent">cover?</span></h1><p>Choose the number of prepared meals you want each week. Breakfast shakes or meals you handle another way do not need to count.</p></div>
      <div class="weekly-target-grid">
        ${WEEKLY_MEAL_OPTIONS.map(n=>`<button class="${target===n?'selected':''}" data-weekly-meals="${n}"><b>${n}</b><span>${n/7} prepared ${n===7?'meal':'meals'} / day</span><small>${n===7?'One meal a day':n===14?'Two meals a day':'Three meals a day'}</small></button>`).join('')}
      </div>
      <div class="onboard-note"><strong>${target} meals/week</strong><span>${planExamples(target)} · you can mix recipes however you want within the target.</span></div>
      <button class="btn primary onboard-main" data-ob-next="1">Continue →</button>`);
  }

  if(step===3) return shell(`<div class="onboard-copy"><div class="eyebrow">03 · Budget + stores</div><h1>Give every dollar a <span class="accent">job.</span></h1><p>Fuelr divides your budget across the ${weeklyMealTarget()} prepared meals you selected each week.</p></div>
    <div class="onboard-card">
      <div class="field"><label>School-year food budget</label><div class="money-input"><span>$</span><input id="obBudget" type="number" value="${state.settings.schoolYearBudget}"></div></div>
      <div class="field"><label>Academic weeks</label><input id="obWeeks" type="number" value="${state.settings.academicWeeks}"></div>
      <div class="split"><div class="field"><label>Preferred store</label><input id="obStore" value="${esc(state.settings.preferredStore)}"></div><div class="field"><label>Backup store</label><input id="obAlt" value="${esc(state.settings.altStore)}"></div></div>
      <div class="onboard-result"><span>CURRENT TARGET</span><strong id="obMealTargetPreview">${money(mealTarget())}</strong><small>per meal · ${weeklyMealTarget()} prepared meals each week</small></div>
    </div>
    <button class="btn primary onboard-main" data-ob-next="1">Continue →</button>`);

  if(step===4){
    const goals=[
      ['performance','Performance'],
      ['high_protein','High protein'],
      ['balanced','Balanced'],
      ['bulking','Gain size'],
      ['cutting','Lean out']
    ];
    return shell(`<div class="onboard-copy"><div class="eyebrow">04 · Food profile</div><h1>Make it fit <span class="accent">how you eat.</span></h1><p>These settings guide future recipe recommendations and optimization. You can change them anytime.</p></div>
      <div class="onboard-card">
        <div class="field"><label>Main goal</label><div class="goal-grid">${goals.map(([id,label])=>`<button class="${state.profile.goal===id?'selected':''}" data-goal="${id}">${label}</button>`).join('')}</div></div>
        <div class="field"><label>Diet preferences</label><input id="obDiet" placeholder="High protein, no pork, vegetarian..." value="${esc((state.profile.dietaryPreferences||[]).join(', '))}"><small>Separate multiple preferences with commas.</small></div>
        <div class="field"><label>Allergies / foods to avoid</label><input id="obAllergies" placeholder="Peanuts, shellfish..." value="${esc((state.profile.allergies||[]).join(', '))}"><small>Fuelr will keep these attached to your account for future recipe filtering.</small></div>
      </div>
      <button class="btn primary onboard-main" data-ob-next="1">Continue →</button>`);
  }

  return shell(`<div class="onboard-finish"><div class="finish-school" style="--finish-primary:${s.primary};--finish-secondary:${s.secondary};--finish-on:${s.onPrimary}"><span>${s.abbr}</span></div><div class="eyebrow">05 · Ready</div><h1>Your Fuelr is <span class="accent">ready.</span></h1><p>${esc(s.name)} theme. ${weeklyMealTarget()} prepared meals each week. ${money(mealTarget())} per-meal target.</p><div class="finish-stat"><span>YOUR MEAL CAP</span><strong>${money(mealTarget())}</strong><small>Fuelr will optimize every recipe around this target.</small></div><button class="btn primary onboard-main" data-finish-onboarding="1">Enter Fuelr →</button></div>`);
}

function renderRecipeDetail(r){
  const photo=r.photo?esc(r.photo):'assets/meal-placeholder.svg';
  const selectedCount=planFor(r.id);
  const target=weeklyMealTarget();
  const count=selectedCount || (target===7?7:14);
  const factor=recipeBatchFactor(r,count);
  const ingredients=(r.ingredients||[]).map(i=>scaledIngredient(i,factor));
  const steps=r.instructions||[];
  const batchUsed=mealTarget()*count;
  const buttons=WEEKLY_MEAL_OPTIONS.map(n=>`<button class="${selectedCount===n?'active':''}" data-plan-id="${esc(r.id)}" data-plan-count="${n}" ${n>target?'disabled aria-disabled="true"':''}><b>${n}</b><span>meals</span></button>`).join('');
  return `<button class="link-btn back-link" data-go="recipes">← Back to meals</button>
    <section class="detail-shell">
      <div class="detail-photo-card">
        <img src="${photo}" alt="${esc(r.name)}" onerror="this.src='assets/meal-placeholder.svg'">
        <span class="meal-tag detail-tag">${count}-MEAL ${selectedCount?'PREP':'PREVIEW'}</span>
      </div>
      <div class="detail-copy">
        <div class="eyebrow">Fuelr optimized</div>
        <h1>${esc(r.name)}</h1>
        <p>${r.optimizationNote?esc(r.optimizationNote):'Optimized toward your current meal cap while protecting quality, protein, carbs and useful food volume.'}</p>
        <div class="meal-count-actions detail-count-actions" aria-label="Choose meal count">${buttons}</div>
        <div class="optimize-strip">
          <span>YOUR MEAL CAP</span>
          <strong>${money(mealTarget())}</strong>
          <small>${money(batchUsed)} used-cost target for ${count} meals</small>
        </div>
        <div class="scale-explain"><span>LIVE BUDGET ADJUSTMENT</span><strong>×${recipeBudgetFactor(r).toFixed(2)}</strong><small>Fuelr scales the stored recipe to your personal meal cap, then scales every listed ingredient to 7, 14, or 21 meals — including salt, spices, oils and sauces.</small></div>
        ${r.original?`<div class="source-compare">
          <div><span>SOURCE</span><strong>${esc(r.original.servings)} servings</strong><small>${r.original.portion?esc(r.original.portion):'original recipe'}</small></div>
          <div class="compare-arrow">→</div>
          <div><span>FUELR</span><strong>${count} meals</strong><small>${esc(r.portion||'optimized portion')}</small></div>
        </div>`:''}
        <div class="detail-price">${money(mealTarget())} <small>/ meal target · ${esc(r.priceStatus||'estimated')}</small></div>
        <div class="macro-grid clean-macros">
          <div class="macro"><strong>${esc(macroFor(r,'calories') ?? '—')}</strong><small>Calories</small></div>
          <div class="macro"><strong>${esc(macroFor(r,'protein') ?? '—')}${macroFor(r,'protein')?'g':''}</strong><small>Protein</small></div>
          <div class="macro"><strong>${esc(macroFor(r,'carbs') ?? '—')}${macroFor(r,'carbs')?'g':''}</strong><small>Carbs</small></div>
          <div class="macro"><strong>${esc(macroFor(r,'fat') ?? '—')}${macroFor(r,'fat')?'g':''}</strong><small>Fat</small></div>
        </div>
        ${planFor(r.id)?`<button class="btn secondary full" data-clear-plan="${esc(r.id)}">Remove from this week</button>`:''}
      </div>
    </section>
    <section class="section"><div class="section-head clean-head"><div><h2>Ingredients</h2><p>Automatically scaled for ${count} meals</p></div><span class="soft-pill">${money(batchUsed)} used cost</span></div><div class="card"><div class="card-body"><div class="list">${ingredients.map(i=>`<div class="list-item"><div class="list-dot"></div><div><div class="item-main">${esc(i.item)}</div><div class="item-sub">${esc(i.quantity)} ${esc(i.unit||'')}${i.note?` · ${esc(i.note)}`:''}</div></div><div class="item-cost">${i.usedCost!=null?money(i.usedCost):''}</div></div>`).join('')||'<div class="kicker">Ingredient details will appear here with the recipe.</div>'}</div></div></div></section>
    <section class="section"><div class="section-head clean-head"><div><h2>Prep flow</h2><p>Same method, scaled batch</p></div></div><div class="card"><div class="card-body">${steps.map((s,i)=>`<div class="step"><div class="step-num">${String(i+1).padStart(2,'0')}</div><p>${esc(s)}</p></div>`).join('')||'<div class="kicker">Cooking steps will appear here with the recipe.</div>'}</div></div></section>
    <section class="section"><div class="notice blue"><strong>Storage:</strong> refrigerate what you will eat within about 3–4 days and freeze later portions promptly, especially for 14- and 21-meal batches.</div></section>`;
}

function groceryRows(r,count){
  const factor=recipeBatchFactor(r,count);
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
  const target=weeklyMealTarget();
  const usedTotal=entries.reduce((sum,x)=>sum+mealTarget()*x.count,0);
  const checkoutTotal=entries.reduce((sum,x)=>sum+scaledCheckoutTotal(x.recipe,x.count),0);
  return `<section class="page-intro">
      <div class="eyebrow">Combined grocery run</div>
      <h1>One list for <span class="accent">${total || 0} meals.</span></h1>
      <p>Your grocery list combines any valid ${target}-meal lineup — ${planExamples(target)}.</p>
    </section>
    <section class="grocery-summary">
      <article><span>Meals planned</span><strong>${total}/${target}</strong><small>${entries.length?planShape()+' meal batches':'choose meals first'}</small></article>
      <article><span>Used-cost target</span><strong>${money(usedTotal)}</strong><small>meal ingredients only</small></article>
      <article><span>Checkout estimate</span><strong>${money(checkoutTotal)}</strong><small>full packages can vary</small></article>
    </section>
    ${entries.length?entries.map(x=>`<section class="section grocery-recipe-block">
      <div class="section-head clean-head"><div><h2>${esc(x.recipe.name)}</h2><p>${x.count} meals · ${money(mealTarget()*x.count)} used-cost target</p></div><span class="soft-pill">${x.count} meals</span></div>
      ${groceryRows(x.recipe,x.count)}
    </section>`).join(''):`<div class="empty clean-empty"><div class="empty-orb light">✓</div><div class="eyebrow">Nothing to shop yet</div><h3>Build your ${target}-meal week.</h3><p>${planExamples(target)} — the combined grocery list will build itself here.</p><button class="btn primary" data-go="recipes">Choose meals</button></div>`}`;
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
  const target=weeklyMealTarget();
  const done=totalPrepDone();
  const pct=total===target?Math.round(done/target*100):0;
  if(total!==target){
    const left=Math.max(0,target-total);
    return `<section class="page-intro">
      <div class="eyebrow">Weekly prep board</div>
      <h1>Finish the plan, then <span class="accent">cook it.</span></h1>
      <p>The Prep board unlocks when your week reaches ${target} meals. Valid combinations: ${planExamples(target)}.</p>
    </section>
    <section class="prep-lock-card">
      <div class="prep-lock-number">${total}/${target}</div>
      <h3>${total?'Almost there.':'Choose your meals first.'}</h3>
      <p>${total?`Add ${left} more meals to complete this week.`:'Your prep checklist will appear here once the weekly plan is complete.'}</p>
      <div class="progress prep-progress"><span style="width:${Math.min(100,total/target*100)}%"></span></div>
      <button class="btn primary full" data-go="recipes">${total?'Complete the week':'Build this week'}</button>
    </section>`;
  }

  return `<section class="page-intro prep-intro">
      <div class="eyebrow">Weekly prep board</div>
      <h1>Cook it. Portion it. <span class="accent">Done.</span></h1>
      <p>Check off each container as you fill it. When all ${target} are ready, Fuelr can roll into the next week.</p>
    </section>
    <section class="prep-overview">
      <div class="prep-overview-copy"><span>WEEK READY</span><strong>${done}/${target}</strong><small>${done===target?'All meals prepared':'Keep going — '+(target-done)+' left'}</small></div>
      <div class="prep-overview-bar"><div style="width:${pct}%"></div></div>
      <span class="prep-overview-pct">${pct}%</span>
    </section>
    <section class="prep-batches">${entries.map((entry,index)=>prepBatchCard(entry,index)).join('')}</section>
    ${done===target?`<section class="week-complete-card">
      <div class="week-complete-icon">✓</div>
      <div><span>WEEK COMPLETE</span><h3>All ${target} meals are cooked and ready.</h3><p>When you are ready, clear this week and choose the next recipe lineup.</p></div>
      <button class="btn primary" data-next-week="1">Start next week</button>
    </section>`:''}`;
}

function renderBudget(){
  const target=mealTarget();
  const weekly=weeklyBudget();
  const weeklyMeals=weeklyMealTarget();
  return `<section class="page-intro">
      <div class="eyebrow">Budget dashboard</div>
      <h1>One cap. <span class="accent">Your meal count.</span></h1>
      <p>The full school-year food budget is divided across ${weeklyMeals} prepared meals each week.</p>
    </section>
    <section class="budget-dashboard">
      <article class="budget-main-card">
        <div class="budget-ring big-ring" style="--budget-angle:360deg"><div><strong>${money(target)}</strong><span>per meal</span></div></div>
        <div><span class="summary-label">All-in meal cap</span><strong class="budget-hero-number">${money(target)}</strong><small>${money(state.settings.schoolYearBudget)} ÷ ${state.settings.academicWeeks} weeks ÷ ${weeklyMeals} meals</small></div>
      </article>
      <div class="budget-mini-grid">
        <article><span>7 meals</span><strong>${money(target*7)}</strong><small>one 7-meal batch</small></article>
        <article><span>14 meals</span><strong>${money(target*14)}</strong><small>two prepared meals/day</small></article>
        <article><span>21 meals</span><strong>${money(target*21)}</strong><small>three daily meals/week</small></article>
        <article><span>Your week</span><strong>${money(weekly)}</strong><small>${weeklyMeals} prepared meals</small></article>
      </div>
    </section>
    <section class="section"><div class="card budget-breakdown"><div class="card-body">
      <div class="budget-row"><div class="name">Weekly target</div><div class="amount">${weeklyMeals} meals</div><small>${weeklyMealDescription(weeklyMeals)}. Valid batch combinations: ${planExamples(weeklyMeals)}.</small></div>
      <div class="budget-row"><div class="name">Dynamic recipe target</div><div class="amount">${money(target)}/meal</div><small>Fuelr adjusts optimized recipe quantities when the user's weekly meal count changes.</small></div>
      <div class="budget-row"><div class="name">Optimization rule</div><div class="amount">scale to cap</div><small>If a source meal costs less, Fuelr increases useful ingredient quantities toward the cap. If it costs more, it scales back while protecting useful food and nutrition.</small></div>
    </div></div></section>`;
}

function renderSettings(){
  const target=weeklyMealTarget();
  return `<section class="page-intro">
      <div class="eyebrow">System settings</div>
      <h1>One budget drives <span class="accent">everything.</span></h1>
      <p>Fuelr calculates the meal cap automatically from your school-year budget, academic weeks, and prepared meals per week.</p>
    </section>
    <section class="settings-grid">
      <div class="settings-card">
        <div class="settings-card-head"><span class="summary-icon blue">01</span><div><h3>Budget</h3><p>Sets the automatic meal cap</p></div></div>
        <div class="field"><label>Prepared meals each week</label><div class="weekly-meal-selector">${WEEKLY_MEAL_OPTIONS.map(n=>`<button class="${target===n?'selected':''}" data-weekly-meals="${n}"><b>${n}</b><span>${n/7}/day</span></button>`).join('')}</div></div>
        <div class="split"><div class="field"><label>School-year budget</label><input id="sBudget" type="number" step="1" value="${state.settings.schoolYearBudget}"></div><div class="field"><label>Academic weeks</label><input id="sWeeks" type="number" step="1" value="${state.settings.academicWeeks}"></div></div>
        <div class="derived-cap"><span>Calculated meal cap</span><strong>${money(mealTarget())}</strong><small>per meal · ${target} meals/week</small></div>
      </div>
      <div class="settings-card">
        <div class="settings-card-head"><span class="summary-icon dark">02</span><div><h3>Stores</h3><p>Where the grocery list starts</p></div></div>
        <div class="split"><div class="field"><label>Preferred store</label><input id="sStore" value="${esc(state.settings.preferredStore)}"></div><div class="field"><label>Backup store</label><input id="sAlt" value="${esc(state.settings.altStore)}"></div></div>
      </div>
    </section>
    <button id="saveSettings" class="btn primary full save-settings">Save Fuelr settings</button>
    <section class="section"><div class="notice blue"><strong>Streamlined scaling:</strong> Fuelr normalizes every ingredient from the creator's source yield to 7, 14, or 21 meals, then adjusts the full recipe toward your personal meal cap.</div></section>`;
}

function render(){
  const topbar=document.querySelector('.topbar');
  if(cloudEnabled() && !state.cloud.ready){
    nav.classList.add('hidden');
    topbar?.classList.add('onboarding-mode');
    app.innerHTML='<div class="cloud-loading"><div class="auth-mark">FR</div><strong>Connecting Fuelr…</strong></div>';
    return;
  }
  if(cloudEnabled() && !cloudSignedIn()){
    nav.classList.add('hidden');
    topbar?.classList.add('onboarding-mode');
    app.innerHTML=renderAuthGate();
    bindDynamic();
    return;
  }
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
  app.querySelectorAll('[data-auth-mode]').forEach(el=>el.addEventListener('click',()=>{state.cloud.mode=el.dataset.authMode;state.cloud.error='';state.cloud.message='';render();}));
  document.getElementById('authSubmit')?.addEventListener('click',submitAuth);
  app.querySelectorAll('[data-sign-out]').forEach(el=>el.addEventListener('click',signOutCloud));
  app.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>setTab(el.dataset.go)));
  app.querySelectorAll('[data-recipe]').forEach(el=>el.addEventListener('click',e=>{ if(e.target.closest('[data-plan-id],[data-clear-plan]')) return; state.detailId=el.dataset.recipe;render();window.scrollTo({top:0,behavior:'smooth'});}));
  app.querySelectorAll('[data-plan-id]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setMealPlan(el.dataset.planId,Number(el.dataset.planCount));}));
  app.querySelectorAll('[data-clear-plan]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();clearMealPlan(el.dataset.clearPlan);}));
  app.querySelectorAll('[data-check]').forEach(el=>el.addEventListener('change',()=>{state.checked[el.dataset.check]=el.checked;localStorage.setItem('pf_checked',JSON.stringify(state.checked));render();scheduleCloudWeekSave();}));
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
  app.querySelectorAll('[data-prep-style]').forEach(el=>el.addEventListener('click',()=>{state.profile.prepStyle=el.dataset.prepStyle;saveProfile();if(state.onboardingComplete)persistProfileToCloud();render();}));
  app.querySelectorAll('[data-weekly-meals]').forEach(el=>el.addEventListener('click',()=>setWeeklyMealsTarget(Number(el.dataset.weeklyMeals))));
  app.querySelectorAll('[data-goal]').forEach(el=>el.addEventListener('click',()=>{state.profile.goal=el.dataset.goal;saveProfile();render();}));
  const refreshOnboardBudget=()=>{
    const budget=Number(document.getElementById('obBudget')?.value)||state.settings.schoolYearBudget;
    const weeks=Number(document.getElementById('obWeeks')?.value)||state.settings.academicWeeks;
    const preview=document.getElementById('obMealTargetPreview');
    if(preview) preview.textContent=money(budget/(weeks*weeklyMealTarget()));
  };
  document.getElementById('obBudget')?.addEventListener('input',refreshOnboardBudget);
  document.getElementById('obWeeks')?.addEventListener('input',refreshOnboardBudget);
  app.querySelectorAll('[data-ob-back]').forEach(el=>el.addEventListener('click',()=>{state.onboardingStep=Math.max(0,state.onboardingStep-1);render();}));
  app.querySelectorAll('[data-ob-next]').forEach(el=>el.addEventListener('click',()=>{
    if(state.onboardingStep===1 && !state.profile.schoolId){ showToast('Choose a school or Fuelr theme'); return; }
    if(state.onboardingStep===3){
      state.settings.schoolYearBudget=Number(document.getElementById('obBudget')?.value)||DEFAULTS.schoolYearBudget;
      state.settings.academicWeeks=Number(document.getElementById('obWeeks')?.value)||DEFAULTS.academicWeeks;
      state.settings.preferredStore=document.getElementById('obStore')?.value||'Aldi';
      state.settings.altStore=document.getElementById('obAlt')?.value||'Walmart';
      saveSettings(); saveProfile();
    }
    if(state.onboardingStep===4){
      const toList=v=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,20);
      state.profile.dietaryPreferences=toList(document.getElementById('obDiet')?.value);
      state.profile.allergies=toList(document.getElementById('obAllergies')?.value);
      saveProfile();
    }
    state.onboardingStep=Math.min(5,state.onboardingStep+1); render(); window.scrollTo({top:0,behavior:'smooth'});
  }));
  app.querySelectorAll('[data-finish-onboarding]').forEach(el=>el.addEventListener('click',()=>{
    state.onboardingComplete=true;
    localStorage.setItem('fuelr_onboarding_done','1');
    saveProfile(); saveSettings(); applySchoolTheme();
    persistProfileToCloud();
    state.tab='home'; localStorage.setItem('pf_tab','home');
    showToast('Fuelr is ready');
    render(); window.scrollTo({top:0,behavior:'smooth'});
  }));

  const save=document.getElementById('saveSettings');
  if(save) save.addEventListener('click',()=>{
    state.settings.schoolYearBudget=Number(document.getElementById('sBudget').value)||DEFAULTS.schoolYearBudget;
    state.settings.academicWeeks=Number(document.getElementById('sWeeks').value)||DEFAULTS.academicWeeks;
    state.settings.mealsPerWeek=WEEKLY_MEAL_OPTIONS.includes(Number(state.settings.mealsPerWeek))?Number(state.settings.mealsPerWeek):DEFAULTS.mealsPerWeek;
    state.settings.preferredStore=document.getElementById('sStore').value||'Aldi';
    state.settings.altStore=document.getElementById('sAlt').value||'Walmart';
    saveSettings();persistProfileToCloud();scheduleCloudWeekSave();showToast('Your Fuelr was updated');render();
  });
}

nav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
document.querySelectorAll('.brand-button').forEach(b=>b.addEventListener('click',()=>setTab('home')));
syncBtn.addEventListener('click',()=>syncRecipes(false));
applySchoolTheme();
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
(async()=>{
  await syncRecipes(true);
  await initCloud();
})();
