/**
 * Authentication module using Supabase Auth.
 * signUp, signIn, signOut, getCurrentUser, onAuthStateChange
 */
const Auth = {
  signUp: async (email, password, name) => {
    if (!window.supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await window.supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });
    if (error) throw error;
    return data;
  },

  signIn: async (email, password) => {
    if (!window.supabase) throw new Error('Supabase client not initialized');
    const { data, error } = await window.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  signOut: async () => {
    if (!window.supabase) throw new Error('Supabase client not initialized');
    const { error } = await window.supabase.auth.signOut();
    if (error) throw error;
  },

  getCurrentUser: async () => {
    if (!window.supabase) return null;
    const { data: { user } } = await window.supabase.auth.getUser();
    return user;
  },

  onAuthStateChange: (callback) => {
    if (!window.supabase) return () => {};
    const { data: { subscription } } = window.supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }
};
