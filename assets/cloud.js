(() => {
  const cfg = window.FUELR_CLOUD_CONFIG || {};
  const sdk = window.supabase;
  const configured = Boolean(cfg.url && cfg.publishableKey && sdk?.createClient);
  const client = configured
    ? sdk.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  const weekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = (day + 6) % 7;
    const monday = new Date(d);
    monday.setHours(12, 0, 0, 0);
    monday.setDate(d.getDate() - diff);
    return monday.toISOString().slice(0, 10);
  };

  const isUuid = value =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));

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
        window.dispatchEvent(
          new CustomEvent("fuelr-auth-change", {
            detail: { session: this.session, user: this.user }
          })
        );
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
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("user_id", this.user.id)
        .maybeSingle();
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
        dietary_preferences: Array.isArray(profile.dietaryPreferences) ? profile.dietaryPreferences : [],
        allergies: Array.isArray(profile.allergies) ? profile.allergies : [],
        goal: profile.goal || "performance",
        onboarding_complete: Boolean(profile.onboardingComplete)
      };

      const { data, error } = await client
        .from("profiles")
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();

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

      const rows = recipes || [];
      await Promise.all(rows.map(async row => {
        const path = row.photo_url;
        if (!path || /^(https?:|assets\/|images\/|data:)/i.test(path)) return;
        const { data } = await client.storage
          .from("recipe-images")
          .createSignedUrl(path, 60 * 60);
        if (data?.signedUrl) row.signed_photo_url = data.signedUrl;
      }));
      return rows;
    },

    async uploadRecipeImage(file) {
      if (!client || !this.user) throw new Error("Sign in before uploading a recipe image.");
      if (!file) return null;
      if (!["image/jpeg","image/png","image/webp"].includes(file.type)) {
        throw new Error("Use a JPG, PNG or WebP image.");
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Recipe images must be 5 MB or smaller.");
      }

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${this.user.id}/${Date.now()}-${Math.random().toString(36).slice(2,10)}.${ext}`;

      const { error } = await client.storage
        .from("recipe-images")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (error) throw error;

      const { data: signed, error: signError } = await client.storage
        .from("recipe-images")
        .createSignedUrl(path, 60 * 60);

      if (signError) throw signError;
      return { path, signedUrl: signed?.signedUrl || null };
    },

    async createRecipe(recipe) {
      if (!client || !this.user) {
        throw new Error("Sign in before saving a cloud recipe.");
      }

      const clientSourceId =
        recipe.clientSourceId ||
        (String(recipe.id || "").startsWith("user-") ? String(recipe.id) : null);

      if (clientSourceId) {
        const { data: existing, error: existingError } = await client
          .from("recipes")
          .select("id")
          .eq("owner_id", this.user.id)
          .eq("client_source_id", clientSourceId)
          .maybeSingle();

        if (existingError) throw existingError;
        if (existing) return existing;
      }

      const { data: saved, error } = await client
        .from("recipes")
        .insert({
          owner_id: this.user.id,
          client_source_id: clientSourceId,
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
          photo_url: recipe.photoPath || recipe.photo || null,
          optimization_note: recipe.optimizationNote || null,
          instructions: recipe.instructions || [],
          visibility: "private"
        })
        .select()
        .single();

      if (error) throw error;

      const sourceItems = Array.isArray(recipe.original?.sourceIngredients)
        ? recipe.original.sourceIngredients
        : Array.isArray(recipe.ingredients)
          ? recipe.ingredients
          : [];

      if (sourceItems.length) {
        const optimizedByName = new Map(
          (recipe.ingredients || []).map(i => [String(i.item || ""), i])
        );

        const rows = sourceItems.map((i, idx) => {
          const optimized = optimizedByName.get(String(i.item || "")) || i;
          return {
            recipe_id: saved.id,
            sort_order: idx,
            item: i.item,
            source_quantity: Number(i.sourceQuantity ?? i.quantity) || null,
            source_unit: i.sourceUnit ?? i.unit ?? null,
            optimized_quantity: Number(optimized.optimizedQuantity ?? optimized.quantity) || null,
            optimized_unit: optimized.optimizedUnit ?? optimized.unit ?? null,
            category: optimized.category || i.category || null,
            used_cost: optimized.usedCost ?? null,
            note: optimized.note || i.note || null
          };
        });

        const { error: ingError } = await client
          .from("recipe_ingredients")
          .insert(rows);

        if (ingError) throw ingError;
      }

      return saved;
    },

    async getCurrentWeek() {
      if (!client || !this.user) return null;
      const { data, error } = await client
        .from("weekly_plans")
        .select("*, weekly_plan_recipes(*), grocery_items(*), prep_checks(*)")
        .eq("user_id", this.user.id)
        .eq("week_start", weekStart())
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    async ensureCurrentWeek(mealTarget, status = "planning") {
      if (!client || !this.user) return null;

      const { data, error } = await client
        .from("weekly_plans")
        .upsert(
          {
            user_id: this.user.id,
            week_start: weekStart(),
            status,
            meal_target: Number(mealTarget) || null
          },
          { onConflict: "user_id,week_start" }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async saveCurrentWeek(payload) {
      if (!client || !this.user) return null;

      const plan = await this.ensureCurrentWeek(
        payload.mealTarget,
        payload.status || "planning"
      );
      const planId = plan.id;

      const tables = ["weekly_plan_recipes", "grocery_items", "prep_checks"];
      for (const table of tables) {
        const { error } = await client.from(table).delete().eq("plan_id", planId);
        if (error) throw error;
      }

      const planRows = (payload.recipes || []).map((entry, idx) => {
        const recipeId = entry.cloudOwned && isUuid(entry.id) ? entry.id : null;
        return {
          plan_id: planId,
          recipe_id: recipeId,
          recipe_key: recipeId ? null : String(entry.id),
          recipe_name: entry.name || null,
          meal_count: Number(entry.count),
          slot: idx + 1
        };
      });

      if (planRows.length) {
        const { error } = await client
          .from("weekly_plan_recipes")
          .insert(planRows);
        if (error) throw error;
      }

      const groceryRows = (payload.grocery || []).map((item, idx) => ({
        plan_id: planId,
        recipe_id: item.cloudOwned && isUuid(item.recipeId) ? item.recipeId : null,
        recipe_key: item.cloudOwned && isUuid(item.recipeId) ? null : String(item.recipeId || ""),
        item_key: item.itemKey || null,
        item: item.item,
        quantity: item.quantity == null || item.quantity === "" ? null : Number(item.quantity),
        unit: item.unit || null,
        category: item.category || null,
        preferred_store: item.preferredStore || null,
        alt_store: item.altStore || null,
        estimated_checkout_cost:
          item.checkoutCost == null ? null : Number(item.checkoutCost),
        checked: Boolean(item.checked),
        sort_order: idx
      }));

      if (groceryRows.length) {
        const { error } = await client
          .from("grocery_items")
          .insert(groceryRows);
        if (error) throw error;
      }

      const prepRows = (payload.prep || []).map(item => ({
        plan_id: planId,
        recipe_id: item.cloudOwned && isUuid(item.recipeId) ? item.recipeId : null,
        recipe_key: item.cloudOwned && isUuid(item.recipeId) ? null : String(item.recipeId || ""),
        check_type: item.checkType,
        meal_index: item.mealIndex ?? null,
        checked: Boolean(item.checked)
      }));

      if (prepRows.length) {
        const { error } = await client
          .from("prep_checks")
          .insert(prepRows);
        if (error) throw error;
      }

      return plan;
    },

    async clearCurrentWeek() {
      if (!client || !this.user) return;
      const plan = await this.getCurrentWeek();
      if (!plan) return;
      const { error } = await client
        .from("weekly_plans")
        .delete()
        .eq("id", plan.id);
      if (error) throw error;
    }
  };

  window.FuelrCloud = api;
})();
