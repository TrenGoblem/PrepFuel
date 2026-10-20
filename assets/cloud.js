(() => {
  const cfg = window.FUELR_CLOUD_CONFIG || {};
  const sdk = window.supabase;
  const configured = Boolean(cfg.url && cfg.publishableKey && sdk?.createClient);
  const client = configured
    ? sdk.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  const api = {
    configured,
    client,
    session: null,
    user: null,
    async init() {
      if (!client) return { configured: false, session: null, user: null };
      const { data, error } = await client.auth.getSession();
      if (error) console.warn("Fuelr cloud session:", error.message);
      this.session = data?.session || null;
      this.user = this.session?.user || null;
      client.auth.onAuthStateChange((_event, session) => {
        this.session = session || null;
        this.user = session?.user || null;
        window.dispatchEvent(new CustomEvent("fuelr-auth-change", { detail: { session: this.session, user: this.user } }));
      });
      return { configured: true, session: this.session, user: this.user };
    },
    async signUp(email, password) {
      if (!client) throw new Error("Fuelr cloud is not configured.");
      return client.auth.signUp({ email, password });
    },
    async signIn(email, password) {
      if (!client) throw new Error("Fuelr cloud is not configured.");
      return client.auth.signInWithPassword({ email, password });
    },
    async signOut() {
      if (!client) return;
      return client.auth.signOut();
    },
    async getProfile() {
      if (!client || !this.user) return null;
      const { data, error } = await client.from("profiles").select("*").eq("user_id", this.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    async saveProfile(profile) {
      if (!client || !this.user) return null;
      const payload = {
        user_id: this.user.id,
        school_id: profile.schoolId || "fuelr",
        school_year_budget: Number(profile.schoolYearBudget),
        academic_weeks: Number(profile.academicWeeks),
        meals_per_week: 14,
        preferred_store: profile.preferredStore || "Aldi",
        alt_store: profile.altStore || "Walmart",
        prep_style: profile.prepStyle || "split",
        portion_mode: profile.portionMode || "athlete",
        onboarding_complete: Boolean(profile.onboardingComplete)
      };
      const { data, error } = await client.from("profiles").upsert(payload, { onConflict: "user_id" }).select().single();
      if (error) throw error;
      return data;
    },
    async listRecipes() {
      if (!client || !this.user) return [];
      const { data: recipes, error } = await client
        .from("recipes")
        .select("*, recipe_ingredients(*)")
        .eq("owner_id", this.user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return recipes || [];
    },
    async createRecipe(recipe) {
      if (!client || !this.user) throw new Error("Sign in before saving a cloud recipe.");
      const { data: saved, error } = await client.from("recipes").insert({
        owner_id: this.user.id,
        name: recipe.name,
        source_name: recipe.sourceName || "My recipe",
        source_servings: Number(recipe.original?.servings || 1),
        optimized_servings: Number(recipe.servings || 14),
        source_batch_cost: recipe.sourceBatchCost ?? null,
        optimized_cost_per_meal: recipe.costPerMeal ?? null,
        calories: recipe.macros?.calories ?? null,
        protein_g: recipe.macros?.protein ?? null,
        carbs_g: recipe.macros?.carbs ?? null,
        fat_g: recipe.macros?.fat ?? null,
        photo_url: recipe.photo || null,
        optimization_note: recipe.optimizationNote || null,
        instructions: recipe.instructions || [],
        visibility: "private"
      }).select().single();
      if (error) throw error;

      const sourceItems = Array.isArray(recipe.original?.sourceIngredients)
        ? recipe.original.sourceIngredients
        : Array.isArray(recipe.ingredients)
          ? recipe.ingredients
          : [];
      if (sourceItems.length) {
        const rows = sourceItems.map((i, idx) => ({
          recipe_id: saved.id,
          sort_order: idx,
          item: i.item,
          source_quantity: Number(i.sourceQuantity ?? i.quantity) || null,
          source_unit: i.sourceUnit ?? i.unit ?? null,
          optimized_quantity: Number(i.optimizedQuantity ?? i.quantity) || null,
          optimized_unit: i.optimizedUnit ?? i.unit ?? null,
          category: i.category || null,
          used_cost: i.usedCost ?? null,
          note: i.note || null
        }));
        const { error: ingError } = await client.from("recipe_ingredients").insert(rows);
        if (ingError) throw ingError;
      }
      return saved;
    },
    async getCurrentWeek() {
      if (!client || !this.user) return null;
      const d = new Date();
      const day = d.getDay();
      const diff = (day + 6) % 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - diff);
      const weekStart = monday.toISOString().slice(0,10);
      const { data, error } = await client
        .from("weekly_plans")
        .select("*, weekly_plan_recipes(*), grocery_items(*), prep_checks(*)")
        .eq("user_id", this.user.id)
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  };

  window.FuelrCloud = api;
})();
