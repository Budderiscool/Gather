import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ingredientLibrary } from './ingredients.js';
import {
  ArrowDownUp, ArrowLeft, ArrowRight, Bell, BookOpen, Check, CheckCircle2,
  ChefHat, ChevronDown, ChevronRight, CircleHelp, Clock3, CookingPot, Fingerprint, Flame,
  FolderHeart, Heart, Leaf, ListChecks, LogOut, Menu, Moon, MoreHorizontal,
  Plus, Search, Settings2, ShieldCheck, Sparkles, Sun, Users, X,
} from 'lucide-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { experimental: { passkey: true, recoveryCodes: true } } }) : null;
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const authRedirectUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString();
const emptyCookbook = () => ({ lists: [], recipes: [] });
const isOldStarterCookbook = data => {
  const listIds = ['bread', 'thanksgiving', 'weeknight'];
  const recipeIds = ['focaccia', 'pie', 'potatoes', 'turkey'];
  return data?.lists?.length === 3 && data?.recipes?.length === 4
    && [...data.lists.map(item => item.id)].sort().join('|') === listIds.join('|')
    && [...data.recipes.map(item => item.id)].sort().join('|') === recipeIds.join('|');
};
const pruneExpiredRecipes = data => {
  const recipes = data.recipes.filter(recipe => !recipe.expiresAt || recipe.expiresAt > Date.now());
  if (recipes.length === data.recipes.length) return data;
  const recipeIds = new Set(recipes.map(recipe => recipe.id));
  return { ...data, recipes, lists: data.lists.map(list => ({ ...list, recipeIds: (list.recipeIds || []).filter(id => recipeIds.has(id)) })) };
};
const normalizeCookbook = data => pruneExpiredRecipes(!data || !Array.isArray(data.lists) || !Array.isArray(data.recipes) || isOldStarterCookbook(data)
  ? emptyCookbook()
  : data);
const mergeCookbooks = (local, remote) => normalizeCookbook({
  lists: [...new Map([...local.lists, ...remote.lists].map(item => [item.id, item])).values()],
  recipes: [...new Map([...local.recipes, ...remote.recipes].map(item => [item.id, item])).values()],
});
const loadLocal = () => { try { return normalizeCookbook(JSON.parse(localStorage.getItem('gather-data'))); } catch { return emptyCookbook(); } };
const saveLocal = data => localStorage.setItem('gather-data', JSON.stringify(data));
const photo = id => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&q=85`;
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const durationValue = recipe => recipe.durationValue ?? (Number.parseFloat(recipe.time) || 30);
const durationUnit = recipe => recipe.durationUnit || (/\bday/i.test(recipe.time || '') ? 'days' : /\bhr|hour/i.test(recipe.time || '') ? 'hours' : 'minutes');
const durationLabel = recipe => {
  const unit = durationUnit(recipe);
  if (unit === 'days') return `${durationValue(recipe)} ${Number(durationValue(recipe)) === 1 ? 'day' : 'days'}`;
  return `${durationValue(recipe)} ${unit === 'hours' ? 'hr' : 'min'}`;
};
const servingValue = recipe => recipe.servingValue ?? (Number.parseInt(recipe.servings, 10) || 4);
const servingUnit = recipe => recipe.servingUnit || 'people';

function App() {
  const [data, setData] = useState(loadLocal);
  const [activeList, setActiveList] = useState(null);
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [modal, setModal] = useState('');
  const [query, setQuery] = useState('');
  const [dark, setDark] = useState(() => localStorage.getItem('gather-theme') === 'dark');
  const [mobileNav, setMobileNav] = useState(false);
  const [session, setSession] = useState(null);
  const [passkeys, setPasskeys] = useState([]);
  const [mfaFactors, setMfaFactors] = useState([]);
  const [mfaFlow, setMfaFlow] = useState('setup');
  const [mfaRequired, setMfaRequired] = useState(true);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [recoveryCodeCount, setRecoveryCodeCount] = useState(0);
  const [mfaReady, setMfaReady] = useState(false);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [syncedCloudUser, setSyncedCloudUser] = useState(null);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [cloudState, setCloudState] = useState(supabase ? 'ready' : 'local');
  const [toast, setToast] = useState('');
  const list = data.lists.find(x => x.id === activeList) || null;
  const userDisplayName = session?.user?.user_metadata?.display_name || session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Your kitchen';
  const recipes = data.recipes.filter(x => !activeList || x.listId === activeList);
  const filteredRecipes = recipes.filter(x => x.name.toLowerCase().includes(query.toLowerCase()) || x.ingredients.some(i => i.name.toLowerCase().includes(query.toLowerCase())));
  const allIngredients = recipes.flatMap(x => x.ingredients);
  const checked = allIngredients.filter(i => i.checked).length;
  const progress = allIngredients.length ? Math.round(checked / allIngredients.length * 100) : 0;
  const matchedIngredients = useMemo(() => query.length > 1 ? ingredientLibrary.filter(x => x.toLowerCase().includes(query.toLowerCase())).slice(0, 5) : [], [query]);

  useEffect(() => { saveLocal(data); }, [data]);
  useEffect(() => { localStorage.setItem('gather-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => { const timer = window.setInterval(() => setData(current => normalizeCookbook(current)), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: d }) => setSession(d.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (_event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryPending(true);
        // Route recovery through the same assurance check as sign-in. Users
        // with an enrolled MFA factor must verify it before setting a password.
      }
      if (!next) { setMfaReady(false); setSyncedCloudUser(null); setCloudState('ready'); }
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!supabase || !session?.user) { setMfaReady(false); setMfaFactors([]); return; }
    let active = true;
    (async () => {
      setMfaReady(false);
      const [{ data: assurance, error: assuranceError }, { data: listed, error: factorsError }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (!active) return;
      if (assuranceError || factorsError) {
        setAuthMessage(assuranceError?.message || factorsError?.message || 'Could not check account security.');
        setMfaFlow('setup'); setMfaRequired(true); setModal('mfa'); return;
      }
      const verified = listed?.all?.filter(factor => factor.status === 'verified') || [];
      setMfaFactors(verified);
      const recoveryStatus = await supabase.auth.mfa.recoveryCodes.getStatus().catch(() => ({ data: null }));
      if (active) setRecoveryCodeCount(recoveryStatus?.data?.remaining || 0);
      if (assurance?.currentLevel !== 'aal2' && assurance?.nextLevel === 'aal2' && verified.length) {
        setMfaRequired(true);
        setMfaFlow('challenge');
        setAuthMessage('');
        setModal('mfa');
        return;
      }
      setMfaRequired(false);
      setMfaReady(true);
      setAuthMessage('');
      if (passwordRecoveryPending) setModal('password-reset');
      else if (modal === 'mfa') setModal('account');
      if (syncedCloudUser !== session.user.id) await syncFromCloud(session.user.id);
    })();
    return () => { active = false; };
  }, [session?.access_token, session?.user?.id, passwordRecoveryPending]);
  useEffect(() => {
    if (!supabase || !session?.user) { setPasskeys([]); return; }
    let active = true;
    supabase.auth.passkey.list().then(({ data: found, error }) => {
      if (active) setPasskeys(error ? [] : found || []);
    }).catch(() => { if (active) setPasskeys([]); });
    return () => { active = false; };
  }, [session]);
  useEffect(() => {
    if (!session?.user || !supabase || !mfaReady || isSyncingCloud || syncedCloudUser !== session.user.id) return;
    const timer = setTimeout(async () => {
      setCloudState('saving');
      try {
        const { error } = await supabase.from('gather_data').upsert({ user_id: session.user.id, data, updated_at: new Date().toISOString() });
        setCloudState(error ? 'error' : 'synced');
      } catch { setCloudState('error'); }
    }, 900);
    return () => clearTimeout(timer);
  }, [data, session, mfaReady, isSyncingCloud, syncedCloudUser]);

  async function syncFromCloud(userId) {
    setIsSyncingCloud(true);
    try {
      const { data: remote, error } = await supabase.from('gather_data').select('data').eq('user_id', userId).maybeSingle();
      if (error) { setCloudState('error'); return; }
      const previousOwner = localStorage.getItem('gather-cloud-user');
      const localCookbook = previousOwner && previousOwner !== userId ? emptyCookbook() : normalizeCookbook(loadLocal());
      const merged = remote?.data?.lists ? mergeCookbooks(localCookbook, normalizeCookbook(remote.data)) : normalizeCookbook(localCookbook);
      localStorage.setItem('gather-cloud-user', userId);
      setData(merged); setActiveList(null); setCloudState('synced'); setSyncedCloudUser(userId);
    } catch { setCloudState('error'); }
    finally { setIsSyncingCloud(false); }
  }
  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const patchRecipe = (id, patch) => setData(d => ({ ...d, recipes: d.recipes.map(r => r.id === id ? { ...r, ...patch } : r) }));
  const toggleIngredient = (recipeId, ingredientId) => setData(d => ({ ...d, recipes: d.recipes.map(r => r.id !== recipeId ? r : { ...r, ingredients: r.ingredients.map(i => i.id === ingredientId ? { ...i, checked: !i.checked } : i) }) }));
  const createList = name => {
    const fresh = { id: uid(), name, emoji: '🍽️', color: '#e3eadc', recipeIds: [], pinned: false };
    setData(d => ({ ...d, lists: [...d.lists, fresh] })); setActiveList(fresh.id); setModal(''); setQuery('');
  };
  const createRecipe = (name, options) => {
    const { recipeListId, temporary, temporaryValue, temporaryUnit } = options;
    const fresh = { id: uid(), listId: recipeListId || null, name, note: '', durationValue: 30, durationUnit: 'minutes', servingValue: 4, servingUnit: 'people', category: 'Family favorite', image: 'photo-1490645935967-10de6ba17061', ingredients: [], directions: [], ...(temporary ? { temporary: true, expiresAt: Date.now() + Number(temporaryValue) * (temporaryUnit === 'hours' ? 3_600_000 : temporaryUnit === 'days' ? 86_400_000 : 604_800_000) } : {}) };
    setData(d => ({ ...d, recipes: [...d.recipes, fresh], lists: recipeListId ? d.lists.map(l => l.id === recipeListId ? { ...l, recipeIds: [...l.recipeIds, fresh.id] } : l) : d.lists })); setModal(''); setActiveList(recipeListId || null); setActiveRecipe(fresh.id);
  };
  const addIngredient = (recipeId, name) => {
    const value = name.trim(); if (!value) return;
    const recipe = data.recipes.find(r => r.id === recipeId);
    patchRecipe(recipeId, { ingredients: [...recipe.ingredients, { id: uid(), name: value, amount: '', unit: '', checked: false }] });
  };
  const createAccount = async (e, password, captchaToken) => { e.preventDefault(); setAuthMessage(''); const { data: result, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: authRedirectUrl(), captchaToken: captchaToken || undefined } }); if (error) setAuthMessage(error.message); else if (result.session) setAuthMessage('Account created.'); else setAuthMessage('Account created. Check your email to confirm, then come back here to sign in.'); };
  const signInWithPassword = async (e, password, captchaToken) => { e.preventDefault(); setAuthMessage(''); const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken || undefined } }); if (error) setAuthMessage(error.message); else setAuthMessage('Signed in.'); };
  const sendMagicLink = async captchaToken => { setAuthMessage(''); const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: authRedirectUrl(), captchaToken: captchaToken || undefined } }); setAuthMessage(error?.message || 'Check your inbox for a sign-in link.'); };
  const sendPasswordReset = async captchaToken => { setAuthMessage(''); const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl(), captchaToken: captchaToken || undefined }); setAuthMessage(error?.message || 'If an account uses that address, we sent a password reset link.'); };
  const signInWithGoogle = async () => { setAuthMessage(''); const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authRedirectUrl() } }); if (error) setAuthMessage(error.message); };
  const updatePassword = async (e, password) => { e.preventDefault(); setAuthMessage(''); const { error } = await supabase.auth.updateUser({ password }); if (error) setAuthMessage(error.message); else { setPasswordRecoveryPending(false); setModal(''); setAuthMessage(''); notify('Password updated.'); } };
  const changePassword = async (e, currentPassword, newPassword, nonce) => {
    e.preventDefault(); setAuthMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ current_password: currentPassword, password: newPassword, ...(nonce ? { nonce } : {}) });
      if (error?.code === 'reauthentication_needed' && !nonce) {
        const { error: reauthError } = await supabase.auth.reauthenticate();
        if (reauthError) setAuthMessage(reauthError.message);
        else setAuthMessage('We sent a verification code to your confirmed email. Enter it below to finish changing your password.');
        return reauthError ? false : 'reauthentication_needed';
      }
      if (error) setAuthMessage(error.message);
      else { setModal('account'); setAuthMessage(''); notify('Password changed.'); }
      return !error;
    } catch (error) {
      setAuthMessage(error.message || 'Password change could not be completed. Please try again.');
      return false;
    }
  };
  const signInWithPasskey = async () => { setAuthMessage(''); try { const { error } = await supabase.auth.signInWithPasskey(); if (error) setAuthMessage(error.message); else setAuthMessage('Signed in with your passkey.'); } catch (error) { setAuthMessage(error.message || 'Passkey sign-in could not start in this browser.'); } };
  const registerPasskey = async () => { setAuthMessage(''); try { const { data: credential, error } = await supabase.auth.registerPasskey(); if (error) setAuthMessage(error.message); else { setPasskeys(current => [...current, credential]); setAuthMessage('Passkey added to this account.'); } } catch (error) { setAuthMessage(error.message || 'Passkey registration could not start in this browser.'); } };
  const removePasskey = async passkeyId => { const { error } = await supabase.auth.passkey.delete({ passkeyId }); if (error) setAuthMessage(error.message); else setPasskeys(current => current.filter(passkey => passkey.id !== passkeyId)); };
  const removeMfaFactor = async factorId => {
    if (mfaFactors.length <= 1 && !window.confirm('Remove your only MFA method? MFA will be disabled for this account.')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) setAuthMessage(error.message);
    else {
      const factors = await supabase.auth.mfa.listFactors();
      setMfaFactors(factors.data?.all?.filter(factor => factor.status === 'verified') || []);
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session) setSession(refreshed.session);
      setAuthMessage('Security factor removed.');
    }
  };
  const openMfaSettings = () => { setMfaRequired(false); setMfaFlow('manage'); setAuthMessage(''); setModal('mfa'); };
  const completeMfa = async () => {
    const [{ data: factors }, { data: current }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.getSession()]);
    setMfaFactors(factors?.all?.filter(factor => factor.status === 'verified') || []);
    if (current.session) setSession(current.session);
    setMfaReady(true); setMfaRequired(false); setAuthMessage(''); setModal(passwordRecoveryPending ? 'password-reset' : 'account');
  };
  const generateRecoveryCodes = async () => {
    const { data: generated, error } = await supabase.auth.mfa.recoveryCodes.generate({ friendlyName: 'Gather backup codes' });
    if (error) setAuthMessage(error.message);
    else { setRecoveryCodes(generated.codes || []); setRecoveryCodeCount(generated.codes?.length || 0); setAuthMessage('Store these codes somewhere private. They are shown only once.'); }
  };
  const dismissRecoveryCodes = async () => { setRecoveryCodes([]); const { data: status } = await supabase.auth.mfa.recoveryCodes.getStatus(); setRecoveryCodeCount(status?.remaining || 0); setAuthMessage(''); };
  const signOut = async () => { await supabase.auth.signOut(); setSession(null); setSyncedCloudUser(null); setCloudState('ready'); };

  return <div className={`app ${dark ? 'dark' : ''}`}>
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand"><span className="brand-mark"><CookingPot size={19}/></span><span>gather<span className="brand-dot">.</span></span><button className="mobile-close icon-btn" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={19}/></button></div>
      <button className={`nav-link ${!activeList ? 'active' : ''}`} onClick={() => { setActiveList(null); setActiveRecipe(null); setQuery(''); setMobileNav(false); }}><BookOpen size={18}/><span>My recipes</span></button>
      <div className="side-section"><div className="section-label">YOUR TABLE <button className="tiny-icon" aria-label="Create a list" onClick={() => setModal('list')}><Plus size={16}/></button></div>
        {data.lists.map((item, index) => <button key={item.id} className={`list-link ${item.id === activeList ? 'selected' : ''}`} onClick={() => { setActiveList(item.id); setActiveRecipe(null); setQuery(''); setMobileNav(false); }}><span className="list-emoji" style={{background:item.color}}>{item.emoji}</span><span className="list-name">{item.name}</span>{index === 0 && <span className="list-count">{data.recipes.filter(r=>r.listId===item.id).length}</span>}</button>)}
        <button className="add-list" onClick={() => setModal('list')}><span className="add-list-icon"><Plus size={15}/></span>New gathering</button>
      </div>
      <div className="sidebar-bottom"><div className="sidebar-note"><div className="note-icon"><Leaf size={16}/></div><div><b>A little kitchen note</b><p>Good food is even better shared.</p></div></div><button className="nav-link settings-link" onClick={() => setModal('account')}><Settings2 size={17}/><span>Account & sync</span></button></div>
      <div className="profile"><div className="avatar">{userDisplayName.trim().charAt(0).toUpperCase()}</div><div className="profile-copy"><b>{userDisplayName}</b><span>{session ? 'Synced with Supabase' : 'Your personal cookbook'}</span></div><button className="tiny-icon" onClick={() => setModal('account')} aria-label="Account settings"><MoreHorizontal size={19}/></button></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-btn" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><span className="crumb">My recipes</span><ChevronRight size={14}/><span className="crumb-current">{list?.name || 'All recipes'}</span></div><div className="topbar-actions"><label className="searchbox"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a recipe or ingredient"/><kbd>⌘ K</kbd></label><button className="icon-btn theme-btn" onClick={()=>setDark(x=>!x)} aria-label={`Switch to ${dark?'light':'dark'} mode`}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button className="avatar top-avatar" onClick={()=>setModal('account')} aria-label="Open account">{session?.user?.email?.[0]?.toUpperCase()||'A'}</button></div></header>
      <div className="page-wrap">
        {activeRecipe ? <RecipeDetail recipe={data.recipes.find(r=>r.id===activeRecipe)} patchRecipe={patchRecipe} toggleIngredient={toggleIngredient} addIngredient={addIngredient} back={()=>setActiveRecipe(null)} notify={notify}/> : <>
          <div className="greeting-row"><div><div className="eyebrow"><span className="eyebrow-dot"/> {list ? 'YOUR GATHERING' : 'YOUR COOKBOOK'} {list?.date && <><span className="eyebrow-divider">·</span>{list.date}</>}</div><h1>{list?.name || 'My recipes'}</h1><p className="intro">{list ? 'A good meal starts with a little planning.' : 'Keep recipes here on their own, or add them to a gathering.'}</p></div><button className="button-secondary list-menu-btn" onClick={()=>list?setModal('list'):setModal('recipe')}><Plus size={18}/><span>{list?'New gathering':'New recipe'}</span></button></div>
          <section className="hero-card"><img src={photo('photo-1507048331197-7d4ac70811cf')} alt="A welcoming table set for a shared meal"/><div className="hero-shade"/><div className="hero-content"><span className="hero-kicker"><Sparkles size={14}/> THE JOY IS IN THE GATHERING</span><h2>Make room<br/>for something lovely.</h2><p>Collect every recipe and little detail<br className="desktop-only"/> for the moments around your table.</p><button className="hero-button" onClick={()=>setModal('recipe')}><Plus size={16}/> Add a recipe</button></div><span className="hero-stamp">made with<br/><b>a little love</b><Heart size={13}/></span></section>
          <div className="dashboard-grid"><section className="recipe-section"><div className="section-heading"><div><div className="eyebrow small-eyebrow">{list?'YOUR MENU':'ALL RECIPES'} <span className="heading-count">{recipes.length}</span></div><h2>{list?'Recipes for the table':'Your recipe book'}</h2></div><button className="text-button" onClick={()=>setModal('recipe')}><Plus size={16}/> Add recipe</button></div>
            {query && <div className="search-feedback">Showing recipes matching <b>“{query}”</b></div>}
            {filteredRecipes.length ? <div className="recipe-grid">{filteredRecipes.map(r=><RecipeCard key={r.id} recipe={r} onClick={()=>setActiveRecipe(r.id)}/>)}</div> : <div className="empty-recipes"><span>🥣</span><h3>{query?'No recipes found':'Your recipe book is empty'}</h3><p>{query?'Try another search or add a recipe.':'Create a recipe on its own, then add it to a gathering whenever you like.'}</p><button className="button-primary" onClick={()=>setModal('recipe')}><Plus size={16}/> Add your first recipe</button></div>}
          </section><aside className="right-rail"><section className="prep-card"><div className="prep-top"><span className="prep-icon"><ListChecks size={17}/></span><span className="eyebrow small-eyebrow">A LITTLE PREP</span><button className="tiny-icon" onClick={()=>setQuery('')} aria-label="Reset ingredient search"><ArrowDownUp size={15}/></button></div><h3>Gather the goods</h3><p>Everything you need for this meal, all in one place.</p><div className="progress-label"><span>{checked} of {allIngredients.length} gathered</span><b>{progress}%</b></div><div className="progress-track"><div style={{width:`${progress}%`}}/></div><button className="prep-action" onClick={()=>setModal('shopping')}><span><CheckCircle2 size={16}/> View ingredient list</span><ArrowRight size={16}/></button></section>
            <section className="idea-card"><div className="idea-art"><span>✳</span><div className="idea-leaf">❋</div></div><div className="idea-content"><span className="eyebrow small-eyebrow">A NOTE FOR LATER</span><h3>A little help from AI</h3><p>Recipe ideas and clever kitchen tweaks are coming soon.</p><button className="coming-button" onClick={()=>notify('AI recipe ideas are on the way ✨')}><Sparkles size={14}/> Coming soon</button></div></section>
            <div className="quote-card"><span>“</span><p>People who love to eat are always the best people.</p><small>JULIA CHILD</small></div></aside></div>
          <footer className="page-footer"><span>Made for the moments that matter.</span><span className="footer-status"><span className={`status-dot ${cloudState}`}/>{cloudState==='local'?'Saved on this device':cloudState==='saving'?'Saving to Supabase…':cloudState==='synced'?'Saved to Supabase':cloudState==='error'?'Sync paused — check your connection':session?'Connecting to Supabase…':'Sign in to sync'}</span></footer>
        </>}
      </div>
    </main>
    {modal==='list' && <ListModal close={()=>setModal('')} create={createList}/>}
    {modal==='recipe' && <RecipeModal close={()=>setModal('')} create={createRecipe} lists={data.lists} currentListId={list?.id}/>}
    {modal==='shopping' && <ShoppingModal close={()=>setModal('')} recipes={recipes} toggleIngredient={toggleIngredient}/>}
    {modal==='account' && <AccountModal close={()=>setModal('')} openChangePassword={()=>setModal('change-password')} configured={!!supabase} session={session} email={email} setEmail={setEmail} createAccount={createAccount} signIn={signInWithPassword} signInWithPasskey={signInWithPasskey} signInWithGoogle={signInWithGoogle} registerPasskey={registerPasskey} removePasskey={removePasskey} passkeys={passkeys} mfaFactors={mfaFactors} openMfaSettings={openMfaSettings} removeMfaFactor={removeMfaFactor} recoveryCodeCount={recoveryCodeCount} recoveryCodes={recoveryCodes} generateRecoveryCodes={generateRecoveryCodes} dismissRecoveryCodes={dismissRecoveryCodes} sendMagicLink={sendMagicLink} sendPasswordReset={sendPasswordReset} signOut={signOut} changePassword={changePassword} message={authMessage} cloudState={cloudState}/>}
    {modal==='password-reset' && <PasswordResetModal close={async()=>{await signOut();setPasswordRecoveryPending(false);setModal('');}} updatePassword={updatePassword} message={authMessage}/>}
    {modal==='change-password' && <ChangePasswordModal close={()=>setModal('account')} changePassword={changePassword} message={authMessage}/>}
    {modal==='mfa' && <MfaModal flow={mfaFlow} required={mfaRequired} factors={mfaFactors} message={authMessage} complete={completeMfa} close={()=>{if(!mfaRequired)setModal('account');}}/>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}

function RecipeCard({recipe,onClick}) { const total=recipe.ingredients.length; const done=recipe.ingredients.filter(i=>i.checked).length; return <button className="recipe-card" onClick={onClick}><div className="recipe-image"><img src={photo(recipe.image)} alt=""/><span className="category-chip">{recipe.temporary?'Temporary':recipe.category}</span><span className="card-arrow"><ArrowRight size={16}/></span></div><div className="recipe-card-body"><div className="recipe-title-line"><h3>{recipe.name}</h3><Heart size={15}/></div>{recipe.note && <p>{recipe.note}</p>}<div className="recipe-meta"><span><Clock3 size={14}/>{durationLabel(recipe)}</span><i/><span><Users size={14}/>{servingValue(recipe)} {servingUnit(recipe)}</span></div><div className="card-progress"><div className="mini-progress"><span style={{width:`${total?done/total*100:0}%`}}/></div><small>{done}/{total} ingredients</small></div></div></button>; }

function RecipeDetail({recipe,patchRecipe,toggleIngredient,addIngredient,back,notify}) {
  const [editDirection,setEditDirection]=useState('');
  if(!recipe) return null;
  const addDirection=()=>{if(editDirection.trim()){patchRecipe(recipe.id,{directions:[...recipe.directions,editDirection.trim()]});setEditDirection('');}};
  return <div className="detail-page">
    <button className="back-button" onClick={back}><ArrowLeft size={16}/> {recipe.listId?'Back to gathering':'Back to all recipes'}</button>
    <div className="detail-hero"><img src={photo(recipe.image)} alt=""/><span className="category-chip">{recipe.temporary?'Temporary':recipe.category}</span></div>
    <div className="detail-heading">
      <div><div className="eyebrow small-eyebrow">YOUR RECIPE</div><h1>{recipe.name}</h1><input className="note-input" value={recipe.note} onChange={e=>patchRecipe(recipe.id,{note:e.target.value})} placeholder="Add a little note about this recipe…"/></div>
      <div className="detail-meta">
        <label className="meta-editor"><span><Clock3 size={15}/> Ready in</span><span className="unit-control"><input type="number" min="1" step="1" value={durationValue(recipe)} onChange={e=>patchRecipe(recipe.id,{durationValue:Number(e.target.value)||1})}/><select aria-label="Cook time unit" value={durationUnit(recipe)} onChange={e=>patchRecipe(recipe.id,{durationUnit:e.target.value})}><option value="minutes">min</option><option value="hours">hr</option><option value="days">days</option></select></span></label>
        <label className="meta-editor"><span><Users size={15}/> Makes</span><span className="unit-control"><input type="number" min="1" step="1" value={servingValue(recipe)} onChange={e=>patchRecipe(recipe.id,{servingValue:Number(e.target.value)||1})}/><select aria-label="Serving unit" value={servingUnit(recipe)} onChange={e=>patchRecipe(recipe.id,{servingUnit:e.target.value})}><option value="people">people</option><option value="servings">servings</option><option value="portions">portions</option></select></span></label>
      </div>
    </div>
    <div className="detail-columns">
      <section className="detail-panel"><div className="detail-panel-heading"><div><span className="eyebrow small-eyebrow">DON'T FORGET A THING</span><h2>Ingredients <span>{recipe.ingredients.length}</span></h2></div><button className="button-secondary compact-button" onClick={()=>notify('Ingredient lookup is ready below.')}><Search size={15}/><span>Find</span></button></div><div className="ingredient-rows">{recipe.ingredients.map(i=><button key={i.id} className={`ingredient-row ${i.checked?'checked':''}`} onClick={()=>toggleIngredient(recipe.id,i.id)}><span className="checkbox">{i.checked&&<Check size={13}/>}</span><span className="ingredient-label">{i.name}</span><span className="ingredient-amount">{[i.amount,i.unit].filter(Boolean).join(' ')}</span></button>)}</div><IngredientAdder onAdd={name=>addIngredient(recipe.id,name)} /><p className="lookup-hint"><Search size={13}/> Search the ingredient shelf or add your own.</p></section>
      <section className="detail-panel directions-panel"><div className="eyebrow small-eyebrow">STEP BY STEP</div><h2>Directions</h2><div className="direction-list">{recipe.directions.map((step,i)=><div className="direction-row" key={`${i}-${step}`}><span>{String(i+1).padStart(2,'0')}</span><p>{step}</p></div>)}</div><div className="direction-add"><textarea value={editDirection} onChange={e=>setEditDirection(e.target.value)} placeholder="Add the next step…" rows="2"/><button onClick={addDirection} disabled={!editDirection.trim()}><Plus size={15}/> Add step</button></div></section>
    </div>
    <button className="ai-inline" onClick={()=>notify('AI recipe refinement is coming soon ✨')}><span className="ai-spark"><Sparkles size={16}/></span><span><b>Want to fine-tune this recipe?</b><small>AI suggestions for timing, temperature, and substitutions are coming soon.</small></span><span className="ai-coming">Coming soon</span></button>
  </div>;
}

function IngredientAdder({onAdd}) {const [value,setValue]=useState('');const [open,setOpen]=useState(false);const suggestions=useMemo(()=>value.length>0?ingredientLibrary.filter(i=>i.toLowerCase().includes(value.toLowerCase())).slice(0,4):[],[value]);const submit=v=>{onAdd(v);setValue('');setOpen(false);};return <div className="ingredient-adder"><div className="ingredient-input-wrap"><Search size={15}/><input value={value} onFocus={()=>setOpen(true)} onChange={e=>{setValue(e.target.value);setOpen(true);}} onKeyDown={e=>e.key==='Enter'&&submit(value)} placeholder="Search or add ingredient…"/><button onClick={()=>submit(value)} disabled={!value.trim()} aria-label="Add ingredient"><Plus size={17}/></button></div>{open&&value&&<div className="ingredient-suggestions">{suggestions.map(s=><button key={s} onClick={()=>submit(s)}><span><Search size={13}/>{s}</span><Plus size={15}/></button>)}{!suggestions.some(s=>s.toLowerCase()===value.toLowerCase())&&<button className="custom-suggestion" onClick={()=>submit(value)}><span><span className="custom-plus"><Plus size={12}/></span>Add “{value}” as a custom ingredient</span><ArrowRight size={14}/></button>}</div>}</div>;}

function ListModal({close,create}) {const [name,setName]=useState('');return <Modal close={close}><div className="modal-icon peach"><FolderHeart size={20}/></div><span className="eyebrow small-eyebrow">MAKE A LITTLE PLAN</span><h2>Start a gathering</h2><p className="modal-copy">Give your menu a name. A holiday, a dinner party, or just Sunday. Recipes can also stay on their own.</p><form onSubmit={e=>{e.preventDefault();if(name.trim())create(name.trim());}}><label className="field-label">Gathering name<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Thanksgiving dinner" maxLength="60" required/></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={close}>Cancel</button><button type="submit" className="button-primary"><Plus size={16}/> Create gathering</button></div></form></Modal>;}
function RecipeModal({close,create,lists,currentListId}) {const [name,setName]=useState('');const [recipeListId,setRecipeListId]=useState(currentListId||'');const [temporary,setTemporary]=useState(false);const [temporaryValue,setTemporaryValue]=useState('7');const [temporaryUnit,setTemporaryUnit]=useState('days');return <Modal close={close}><div className="modal-icon sage"><ChefHat size={21}/></div><span className="eyebrow small-eyebrow">ADD TO YOUR RECIPE BOOK</span><h2>What are we making?</h2><p className="modal-copy">Start with a name. You can add ingredients and directions next.</p><form onSubmit={e=>{e.preventDefault();if(name.trim())create(name.trim(),{recipeListId,temporary,temporaryValue,temporaryUnit});}}><label className="field-label">Recipe name<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Grandma's apple pie" maxLength="80" required/></label><label className="field-label">Add to a gathering <span className="optional">OPTIONAL</span><select value={recipeListId} onChange={e=>setRecipeListId(e.target.value)}><option value="">My recipes only</option>{lists.map(item=><option key={item.id} value={item.id}>{item.emoji} {item.name}</option>)}</select></label><label className="temporary-toggle"><input type="checkbox" checked={temporary} onChange={e=>setTemporary(e.target.checked)}/><span><b>Temporary recipe</b><small>Automatically remove it after a set time.</small></span></label>{temporary&&<div className="temporary-fields"><label className="field-label">Delete after<input type="number" min="1" max="999" value={temporaryValue} onChange={e=>setTemporaryValue(e.target.value)} required/></label><label className="field-label unit-label">Time unit<select value={temporaryUnit} onChange={e=>setTemporaryUnit(e.target.value)}><option value="hours">hours</option><option value="days">days</option><option value="weeks">weeks</option></select></label></div>}<div className="modal-actions"><button type="button" className="button-secondary" onClick={close}>Cancel</button><button type="submit" className="button-primary"><Plus size={16}/> Make this recipe</button></div></form></Modal>;}
function ShoppingModal({close,recipes,toggleIngredient}) {const items=recipes.flatMap(r=>r.ingredients.map(i=>({...i,recipeName:r.name,recipeId:r.id})));return <Modal close={close} wide><div className="modal-icon sage"><ListChecks size={20}/></div><span className="eyebrow small-eyebrow">YOUR GATHERING, AT A GLANCE</span><h2>Ingredient list</h2><p className="modal-copy">Check things off as they make their way into your kitchen.</p><div className="shopping-list">{items.length?items.map(i=><button className={`ingredient-row ${i.checked?'checked':''}`} key={i.id} onClick={()=>toggleIngredient(i.recipeId,i.id)}><span className="checkbox">{i.checked&&<Check size={13}/>}</span><span className="ingredient-label">{i.name}<small>{i.recipeName}</small></span><span className="ingredient-amount">{[i.amount,i.unit].filter(Boolean).join(' ')}</span></button>):<div className="shopping-empty">Add a recipe with ingredients and your list will appear here.</div>}</div><div className="modal-actions"><button className="button-primary" onClick={close}>All set <Check size={16}/></button></div></Modal>;}
function AccountModal({close,openChangePassword,configured,session,email,setEmail,createAccount,signIn,signInWithPasskey,signInWithGoogle,registerPasskey,removePasskey,passkeys,mfaFactors,openMfaSettings,removeMfaFactor,recoveryCodeCount,recoveryCodes,generateRecoveryCodes,dismissRecoveryCodes,sendMagicLink,sendPasswordReset,signOut,changePassword,message,cloudState}) {
  const [mode,setMode]=useState('signin');
  const [password,setPassword]=useState('');
  const [captchaToken,setCaptchaToken]=useState('');
  const [captchaReset,setCaptchaReset]=useState(0);
  const captchaEnabled=!!turnstileSiteKey;
  const hasPasswordLogin=!!(session?.user?.identities?.some(identity=>identity.provider==='email')||session?.user?.app_metadata?.providers?.includes('email'));
  const clearCaptcha=()=>{setCaptchaToken('');setCaptchaReset(value=>value+1);};
  return <Modal close={close}>
    <div className="modal-icon sage"><Settings2 size={20}/></div><span className="eyebrow small-eyebrow">YOUR KITCHEN, YOURS</span><h2>Account & sync</h2>
    {session ? <><p className="modal-copy">Signed in as <b>{session.user.email}</b>. Your recipes are backed up to your Supabase project.</p><div className="sync-line"><span className={`status-dot ${cloudState}`}/>{cloudState==='synced'?'Everything is up to date':cloudState==='saving'?'Saving your latest changes…':cloudState==='error'?'Sync issue — check your Supabase setup or connection':'Connecting to Supabase…'}</div>{hasPasswordLogin&&<button type="button" className="button-secondary passkey-add" onClick={openChangePassword}>Change password</button>}<section className="passkey-section"><div><b>Multifactor authentication</b><p className="modal-copy">Authenticator-app MFA is optional. Once enabled, you will verify a code when you sign in.</p></div>{mfaFactors.map(factor=><div className="passkey-row" key={factor.id}><span>{factor.factor_type==='phone'?'SMS phone factor':'Authenticator app'}{factor.phone?` · ${factor.phone}`:''}</span><button type="button" className="text-button" onClick={()=>removeMfaFactor(factor.id)} >Remove</button></div>)}{!mfaFactors.some(factor=>factor.factor_type==='totp')&&<button type="button" className="button-secondary passkey-add" onClick={openMfaSettings}>Add authenticator</button>}{mfaFactors.length>0&&<button type="button" className="magic-link-button" onClick={generateRecoveryCodes}>{recoveryCodeCount?'Replace':'Create'} one-time backup codes</button>}{recoveryCodes.length>0&&<div className="recovery-code-box"><p className="auth-message">Save these now. They will not be shown again.</p><code>{recoveryCodes.join('\n')}</code><button type="button" className="button-secondary" onClick={dismissRecoveryCodes}>I saved them</button></div>}</section><section className="passkey-section"><div><b>Passkeys</b><p className="modal-copy">Use Face ID, Touch ID, Windows Hello, or a security key to sign in.</p></div>{passkeys.map(key=><div className="passkey-row" key={key.id}><span><Fingerprint size={15}/>{key.friendly_name || key.name || 'Passkey'}</span><button type="button" className="text-button" onClick={()=>removePasskey(key.id)}>Remove</button></div>)}<button type="button" className="button-secondary passkey-add" onClick={registerPasskey}><Fingerprint size={15}/> Add a passkey</button>{message&&<p className="auth-message">{message}</p>}</section><div className="modal-actions"><button className="button-secondary" onClick={close}>Done</button><button className="button-primary" onClick={signOut}><LogOut size={15}/> Sign out</button></div></>
      : configured ? <><p className="modal-copy">Create an account or sign in to keep your recipes in sync across devices. Authenticator-app MFA is optional and can be enabled in account settings.</p><div className="auth-tabs"><button type="button" className={mode==='signin'?'selected':''} onClick={()=>{setMode('signin');}}>Sign in</button><button type="button" className={mode==='signup'?'selected':''} onClick={()=>{setMode('signup');}}>Create account</button></div><button type="button" className="google-signin" onClick={signInWithGoogle}><span className="google-mark">G</span>Continue with Google</button><div className="auth-divider"><span>or use email</span></div><form onSubmit={e=>{const result=mode==='signup'?createAccount(e,password,captchaToken):signIn(e,password,captchaToken);clearCaptcha();return result;}}><label className="field-label">Email address<input type="email" autoFocus value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required/></label><label className="field-label">Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='signup'?'At least 12 characters':'Your password'} autoComplete={mode==='signup'?'new-password':'current-password'} minLength={mode==='signup'?12:1} required/></label>{turnstileSiteKey&&<TurnstileWidget key={captchaReset} siteKey={turnstileSiteKey} onToken={setCaptchaToken}/>}{message&&<p className="auth-message">{message}</p>}<div className="modal-actions"><button type="button" className="button-secondary" onClick={close}>Cancel</button><button type="submit" className="button-primary" disabled={captchaEnabled&&!captchaToken}>{mode==='signup'?'Create account':'Sign in'} <ArrowRight size={15}/></button></div></form>{mode==='signin'&&<><button type="button" className="magic-link-button" onClick={()=>{sendPasswordReset(captchaToken);clearCaptcha();}} disabled={!email.includes('@')||(captchaEnabled&&!captchaToken)}>Forgot password?</button><button type="button" className="magic-link-button" onClick={()=>{sendMagicLink(captchaToken);clearCaptcha();}} disabled={!email.includes('@')||(captchaEnabled&&!captchaToken)}>Email me a sign-in link</button><button type="button" className="passkey-signin" onClick={signInWithPasskey}><Fingerprint size={16}/> Sign in with a passkey</button></>}</>
      : <><p className="modal-copy">Gather saves on this device until you connect a Supabase project. Then account creation and recipe sync are handled here.</p><div className="setup-steps"><span>1</span><p>Create a Supabase project, then copy its Project URL and publishable key (or legacy anon key).</p><span>2</span><p>Put both values in a <code>.env</code> file using the names in <code>.env.example</code>.</p><span>3</span><p>Run <code>supabase/schema.sql</code> in the Supabase SQL editor, then restart the Vite server.</p></div><div className="modal-actions"><button className="button-primary" onClick={close}>Got it</button></div></>}
  </Modal>;
}
function TurnstileWidget({siteKey,onToken}) {
  const mount=React.useRef(null);
  useEffect(()=>{
    if(!siteKey||!mount.current)return;
    let widgetId=null;let cancelled=false;
    const render=()=>{if(!cancelled&&window.turnstile&&mount.current&&!widgetId){widgetId=window.turnstile.render(mount.current,{sitekey:siteKey,callback:onToken,'expired-callback':()=>onToken(''),'error-callback':()=>onToken('')});}};
    let script=document.querySelector('script[data-gather-turnstile]');
    if(!script){script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;script.dataset.gatherTurnstile='true';document.head.appendChild(script);}
    script.addEventListener('load',render);render();
    return()=>{cancelled=true;script.removeEventListener('load',render);if(widgetId&&window.turnstile)window.turnstile.remove(widgetId);};
  },[siteKey,onToken]);
  return <div className="turnstile-wrap"><div ref={mount}/></div>;
}
function MfaModal({flow,required,factors,message,complete,close}) {
  const [factorId,setFactorId]=useState('');
  const [selectedFactor,setSelectedFactor]=useState(factors[0]?.id||'');
  const [challengeId,setChallengeId]=useState('');
  const [qrCode,setQrCode]=useState('');
  const [secret,setSecret]=useState('');
  const [code,setCode]=useState('');
  const [usingRecovery,setUsingRecovery]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [challengeRetry,setChallengeRetry]=useState(0);
  const challengeFactor=selectedFactor||factors[0]?.id;
  const startChallenge=async id=>{
    setError('');setBusy(true);
    const {data,error:challengeError}=await supabase.auth.mfa.challenge({factorId:id});
    setBusy(false);
    if(challengeError){setError(challengeError.message);return;}
    setChallengeId(data.id);
  };
  useEffect(()=>{if(flow==='challenge'&&challengeFactor&&!challengeId)startChallenge(challengeFactor);},[flow,challengeFactor,challengeRetry]);
  const startEnrollment=async()=>{
    setError('');setBusy(true);
    // Supabase keeps unverified factors after an interrupted setup. Clear those
    // before enrolling again, or the fixed friendly name conflicts.
    const {data:listed,error:listError}=await supabase.auth.mfa.listFactors();
    if(listError){setBusy(false);setError(listError.message);return;}
    for(const pending of (listed?.all||[]).filter(item=>item.factor_type==='totp'&&item.status==='unverified')){
      const {error:removeError}=await supabase.auth.mfa.unenroll({factorId:pending.id});
      if(removeError){setBusy(false);setError(removeError.message);return;}
    }
    const {data:factor,error:enrollError}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Gather authenticator'});
    if(enrollError){setBusy(false);setError(enrollError.message);return;}
    setFactorId(factor.id);setQrCode(factor.totp?.qr_code||'');setSecret(factor.totp?.secret||'');
    const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});
    setBusy(false);
    if(challengeError){setError(challengeError.message);return;}
    setChallengeId(challenge.id);
  };
  const verify=async e=>{
    e?.preventDefault();setError('');if(!code.trim())return;setBusy(true);
    const result=usingRecovery
      ? await supabase.auth.mfa.recoveryCodes.verify({code:code.trim()})
      : await supabase.auth.mfa.verify({factorId:flow==='challenge'?challengeFactor:factorId,challengeId,code:code.trim()});
    setBusy(false);
    if(result.error){setError(result.error.message);return;}
    await complete();
  };
  const dismiss=()=>{if(!required)close();};
  const discardEnrollment=async()=>{if(factorId){const {error:removeError}=await supabase.auth.mfa.unenroll({factorId});if(removeError){setError(removeError.message);return false;}}setFactorId('');setChallengeId('');setQrCode('');setSecret('');setCode('');return true;};
  const closeAndDiscard=async()=>{if(flow!=='challenge'&&factorId){const discarded=await discardEnrollment();if(!discarded)return;}dismiss();};
  const displayQr=qrCode?`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`:'';
  return <Modal close={closeAndDiscard} wide><div className="modal-icon sage"><ShieldCheck size={20}/></div><span className="eyebrow small-eyebrow">ACCOUNT SECURITY</span>
    <h2>{flow==='challenge'?'Verify it’s you':flow==='manage'?'Add a security method':'Protect your cookbook'}</h2>
    {flow==='challenge'?<><p className="modal-copy">Complete multifactor verification to open your synced recipes.</p>{factors.length>1&&<label className="field-label">Verification method<select value={challengeFactor} onChange={e=>{setSelectedFactor(e.target.value);setChallengeId('');setCode('');setUsingRecovery(false);}}>{factors.map(f=><option key={f.id} value={f.id}>{f.factor_type==='phone'?`Text ${f.phone||'your phone'}`:f.friendly_name||'Authenticator app'}</option>)}</select></label>}{!usingRecovery&&<p className="auth-message">{factors.find(f=>f.id===challengeFactor)?.factor_type==='phone'?'We sent a code to your phone.':'Open your authenticator app and enter its current code.'}</p>}<form onSubmit={verify}><label className="field-label">{usingRecovery?'One-time backup code':'Verification code'}<input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} placeholder={usingRecovery?'XXXX-XXXX-XXXX':'6-digit code'} required/></label>{error&&<p className="auth-error">{error}</p>}{message&&<p className="auth-error">{message}</p>}{!usingRecovery&&factors.find(f=>f.id===challengeFactor)?.factor_type==='phone'&&<button type="button" className="magic-link-button" disabled={busy} onClick={()=>{setChallengeId('');setChallengeRetry(value=>value+1);setCode('');setError('');}}>Send a new code</button>}<button type="button" className="magic-link-button" onClick={()=>{setUsingRecovery(v=>!v);setCode('');setError('');}}>{usingRecovery?'Use an authenticator or phone':'Use a backup code instead'}</button><div className="modal-actions"><button type="button" className="button-secondary" onClick={dismiss} disabled={required}>Cancel</button><button type="submit" className="button-primary" disabled={busy||!code.trim()||(!usingRecovery&&!challengeId)}>{busy?'Checking…':'Verify & continue'} <ArrowRight size={15}/></button></div></form></>
      : <><p className="modal-copy">Authenticator-app MFA is optional. Enable it to require a rotating code at sign-in.</p>{!factorId&&<button type="button" className="button-primary mfa-start" onClick={startEnrollment} disabled={busy}>{busy?"Starting setup…":"Set up authenticator"} <ArrowRight size={15}/></button>}{factorId&&<><div className="mfa-enrollment">{displayQr&&<img src={displayQr} alt="Scan this authenticator setup QR code"/>}<p>Scan with an authenticator app. If needed, enter this setup key manually:</p><code className="mfa-secret">{secret}</code></div>{!challengeId&&<button type="button" className="magic-link-button" disabled={busy} onClick={()=>startChallenge(factorId)}>Send verification code</button>}<form onSubmit={verify}><label className="field-label">Authenticator code<input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} placeholder="6-digit code" required/></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={async()=>{await discardEnrollment();}}>Discard setup</button><button type="submit" className="button-primary" disabled={busy||!code.trim()||!challengeId}>{busy?"Verifying…":"Verify & enable"} <Check size={15}/></button></div></form></>}{error&&<p className="auth-error">{error}</p>}{message&&<p className="auth-error">{message}</p>}{!required&&<div className="modal-actions"><button type="button" className="button-secondary" onClick={closeAndDiscard}>Done</button></div>}</>}
  </Modal>;
}
function PasswordResetModal({close,updatePassword,message}) {const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');return <Modal close={close}><div className="modal-icon sage"><Fingerprint size={20}/></div><span className="eyebrow small-eyebrow">ACCOUNT SECURITY</span><h2>Choose a new password</h2><p className="modal-copy">Set a new password for your Gather account.</p><form onSubmit={e=>{if(password!==confirm){e.preventDefault();return;}updatePassword(e,password);}}><label className="field-label">New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" minLength="12" required/></label><label className="field-label">Confirm new password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" minLength="12" required/></label>{password&&confirm&&password!==confirm&&<p className="auth-error">Passwords do not match.</p>}{message&&<p className="auth-message">{message}</p>}<div className="modal-actions"><button type="button" className="button-secondary" onClick={close}>Cancel</button><button type="submit" className="button-primary" disabled={password.length<12||password!==confirm}>Save password <ArrowRight size={15}/></button></div></form></Modal>;}
function ChangePasswordModal({close,changePassword,message}) {const [current,setCurrent]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [nonce,setNonce]=useState('');const [awaitingReauthentication,setAwaitingReauthentication]=useState(false);const [busy,setBusy]=useState(false);const submit=async e=>{if(password!==confirm){e.preventDefault();return;}setBusy(true);const result=await changePassword(e,current,password,nonce.trim());if(result==='reauthentication_needed')setAwaitingReauthentication(true);if(result===true)setNonce('');setBusy(false);};return <Modal close={close}><div className="modal-icon sage"><Fingerprint size={20}/></div><span className="eyebrow small-eyebrow">ACCOUNT SECURITY</span><h2>Change your password</h2><p className="modal-copy">Confirm your current password, then choose a new one with at least 12 characters.</p><form onSubmit={submit}><label className="field-label">Current password<input type="password" value={current} onChange={e=>setCurrent(e.target.value)} autoComplete="current-password" required/></label>{awaitingReauthentication&&<label className="field-label">Email verification code<input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength="8" value={nonce} onChange={e=>setNonce(e.target.value)} placeholder="8-digit code" required/></label>}<label className="field-label">New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" minLength="12" required/></label><label className="field-label">Confirm new password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" minLength="12" required/></label>{password&&confirm&&password!==confirm&&<p className="auth-error">New passwords do not match.</p>}{message&&<p className="auth-error">{message}</p>}<div className="modal-actions"><button type="button" className="button-secondary" onClick={close}>Cancel</button><button type="submit" className="button-primary" disabled={busy||!current||(awaitingReauthentication&&!nonce.trim())||password.length<12||password!==confirm}>{busy?'Saving…':awaitingReauthentication?'Verify & change password':'Change password'} <ArrowRight size={15}/></button></div></form></Modal>;}
function Modal({children,close,wide}) {useEffect(()=>{const f=e=>e.key==='Escape'&&close();window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f);},[close]);return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className={`modal ${wide?'wide-modal':''}`} role="dialog" aria-modal="true"><button className="modal-close icon-btn" onClick={close} aria-label="Close"><X size={18}/></button>{children}</div></div>;}

export default App;

