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
      if (error) console.warn("FlipLedger cloud session:", error.message);
      this.session = data?.session || null;
      this.user = this.session?.user || null;

      client.auth.onAuthStateChange((_event, session) => {
        this.session = session || null;
        this.user = session?.user || null;
        window.dispatchEvent(new CustomEvent("flipledger-auth-change", {
          detail: { session: this.session, user: this.user }
        }));
      });

      return { configured: true, session: this.session, user: this.user };
    },

    async signUp(email, password) {
      if (!client) throw new Error("Cloud accounts are not configured.");
      return client.auth.signUp({ email, password });
    },

    async signIn(email, password) {
      if (!client) throw new Error("Cloud accounts are not configured.");
      return client.auth.signInWithPassword({ email, password });
    },

    async signOut() {
      if (!client) return;
      return client.auth.signOut();
    },

    async getState() {
      if (!client || !this.user) return null;
      const { data, error } = await client
        .from("flipledger_states")
        .select("state, updated_at")
        .eq("user_id", this.user.id)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async saveState(state) {
      if (!client || !this.user) return null;
      const payload = {
        user_id: this.user.id,
        state,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await client
        .from("flipledger_states")
        .upsert(payload, { onConflict: "user_id" })
        .select("updated_at")
        .single();
      if (error) throw error;
      return data;
    }
  };

  window.FlipLedgerCloud = api;
})();