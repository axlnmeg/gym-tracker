import './style.css';

// ============================================
// KINETIC — Single Page Application
// ============================================

// --- Auth & Data Store ---
const Store = {
  getUser() { return JSON.parse(localStorage.getItem('kinetic_user') || 'null'); },
  setUser(u) { localStorage.setItem('kinetic_user', JSON.stringify(u)); },
  logout() { localStorage.removeItem('kinetic_user'); },
  getData(key, fallback) {
    const d = localStorage.getItem(`kinetic_${key}`);
    return d ? JSON.parse(d) : fallback;
  },
  setData(key, val) { localStorage.setItem(`kinetic_${key}`, JSON.stringify(val)); },
  // Registered users store
  getRegisteredUsers() { return JSON.parse(localStorage.getItem('kinetic_registered_users') || '[]'); },
  registerUser(user) {
    const users = this.getRegisteredUsers();
    if (users.find(u => u.email === user.email)) return false; // already exists
    users.push(user);
    localStorage.setItem('kinetic_registered_users', JSON.stringify(users));
    return true;
  },
  findUser(email, password) {
    return this.getRegisteredUsers().find(u => u.email === email && u.password === password);
  },
  emailExists(email) {
    return this.getRegisteredUsers().some(u => u.email === email);
  },
  // Clear all app data for fresh user experience
  clearAllData() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('kinetic_') && k !== 'kinetic_registered_users');
    keys.forEach(k => localStorage.removeItem(k));
  },
  // Initialize default data for a brand-new user
  initNewUserData() {
    this.setData('steps_today', 0);
    this.setData('steps_goal', 10000);
    this.setData('steps_week', [0, 0, 0, 0, 0, 0, 0]);
    this.setData('steps_current_streak', 0);
    this.setData('steps_best_streak', 0);
    this.setData('water_today', 0);
    this.setData('water_goal', 3000);
    this.setData('water_week', [0, 0, 0, 0, 0, 0, 0]);
    this.setData('meals', { breakfast: [], lunch: [], dinner: [], snacks: [] });
    this.setData('fitness_goal', 'maintenance');
    this.setData('cal_history', []);
    this.setData('weight_history', []);
    this.setData('sleep_history', []);
    this.setData('notifications', []);
    this.setData('gym_time', '18:00');
  },
  // Export all app data as JSON
  exportAllData() {
    const data = {};
    Object.keys(localStorage).filter(k => k.startsWith('kinetic_')).forEach(k => {
      try { data[k] = JSON.parse(localStorage.getItem(k)); } catch { data[k] = localStorage.getItem(k); }
    });
    return JSON.stringify(data, null, 2);
  },
  // Import data from JSON string
  importAllData(jsonStr) {
    const data = JSON.parse(jsonStr);
    Object.entries(data).forEach(([k, v]) => {
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    });
  },
  // Frequent foods tracking
  getFrequentFoods() { return this.getData('frequent_foods', []); },
  trackFoodUsage(foodName) {
    const freq = this.getFrequentFoods();
    const existing = freq.find(f => f.name === foodName);
    if (existing) { existing.count++; existing.last = Date.now(); }
    else { freq.push({ name: foodName, count: 1, last: Date.now() }); }
    freq.sort((a, b) => b.count - a.count);
    if (freq.length > 15) freq.length = 15;
    this.setData('frequent_foods', freq);
  },
  // Notification preferences
  getNotifPrefs() {
    return this.getData('notif_prefs', { goals: true, hydration: true, steps: true, calories: true, gym: true, tips: true });
  },
  setNotifPrefs(prefs) { this.setData('notif_prefs', prefs); }
};

// --- Workout Player (persistent timer) ---
const WorkoutPlayer = {
  _interval: null,
  start(workoutName) {
    Store.setData('wp_active', true);
    Store.setData('wp_workout', workoutName);
    Store.setData('wp_start', Date.now());
    this._tick();
  },
  stop() {
    Store.setData('wp_active', false);
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
    this.removeBar();
  },
  isActive() { return Store.getData('wp_active', false); },
  getElapsed() { return Date.now() - Store.getData('wp_start', Date.now()); },
  getWorkout() { return Store.getData('wp_workout', 'Workout'); },
  _tick() {
    if (this._interval) clearInterval(this._interval);
    this._interval = setInterval(() => this.updateBar(), 1000);
    this.updateBar();
  },
  showBar() {
    if (!this.isActive()) return;
    if (!document.getElementById('wp-bar')) {
      const bar = document.createElement('div');
      bar.id = 'wp-bar';
      bar.className = 'wp-bar';
      document.body.appendChild(bar);
    }
    this.updateBar();
    if (!this._interval) this._tick();
  },
  updateBar() {
    const bar = document.getElementById('wp-bar');
    if (!bar || !this.isActive()) return;
    const elapsed = this.getElapsed();
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const time = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    bar.innerHTML = `
      <div class="wp-bar-inner">
        <span class="material-symbols-rounded wp-bar-icon">fitness_center</span>
        <div class="wp-bar-info">
          <span class="wp-bar-name">${this.getWorkout()}</span>
          <span class="wp-bar-time">${time}</span>
        </div>
        <button class="wp-bar-stop" id="wp-stop-btn">Stop</button>
        <button class="wp-bar-resume" id="wp-resume">Resume</button>
      </div>`;
    document.getElementById('wp-resume')?.addEventListener('click', () => Router.navigate('active_workout'));
    document.getElementById('wp-stop-btn')?.addEventListener('click', () => {
      if (confirm('Stop workout? Your progress will be saved.')) {
        WorkoutPlayer.stop();
      }
    });
  },
  removeBar() {
    document.getElementById('wp-bar')?.remove();
  },
  resume() {
    if (this.isActive()) this.showBar();
  }
};

// --- Router ---
const Router = {
  routes: {},
  current: null,
  register(path, handler) { this.routes[path] = handler; },
  navigate(path) {
    if (this.current === path) return;
    this.current = path;
    window.location.hash = path;
    this.render();
  },
  render() {
    const path = (window.location.hash || '#login').replace('#', '');
    const user = Store.getUser();
    // Validate session: ensure the logged-in user exists in registered users
    if (user && !Store.emailExists(user.email)) {
      Store.logout();
      this.current = 'login';
      window.location.hash = 'login';
      this.routes['login']?.();
      return;
    }
    if (!user && path !== 'login' && path !== 'signup') {
      this.current = 'login';
      window.location.hash = 'login';
      this.routes['login']?.();
      return;
    }
    if (user && (path === 'login' || path === 'signup')) {
      this.current = 'dashboard';
      window.location.hash = 'dashboard';
      this.routes['dashboard']?.();
      return;
    }
    this.current = path;
    const handler = this.routes[path] || this.routes['dashboard'];
    handler?.();
  },
  init() {
    window.addEventListener('hashchange', () => this.render());
    this.render();
  }
};

// --- Helpers ---
function $(sel, parent = document) { return parent.querySelector(sel); }
function $$(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }
const app = () => $('#app');

function createSVGRing(size, strokeWidth, progress, color = 'var(--primary)', trackColor = 'var(--surface-variant)') {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg)">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${trackColor}" stroke-width="${strokeWidth}" opacity="0.3"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"
      style="transition: stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)"/>
  </svg>`;
}

function barChart(data, maxVal) {
  return `<div class="bar-chart">${data.map(d => {
    const h = Math.max(4, (d.value / maxVal) * 100);
    return `<div class="bar-wrapper">
      <div class="bar"><div class="bar-fill" style="height:${h}%"></div></div>
      <span class="bar-label">${d.label}</span>
    </div>`;
  }).join('')}</div>`;
}

function topBar(title = 'KINETIC') {
  const user = Store.getUser();
  const initials = user ? (user.name || user.email || 'U').substring(0, 2).toUpperCase() : 'K';
  const notifs = Store.getData('notifications', []);
  const unread = notifs.filter(n => !n.read).length;
  return `<header class="top-app-bar">
    <div class="avatar">${initials}</div>
    <span class="brand">${title}</span>
    <button class="icon-btn" id="notif-btn" style="position:relative">
      <span class="material-symbols-rounded">notifications</span>
      ${unread > 0 ? `<span class="notif-badge">${unread > 9 ? '9+' : unread}</span>` : ''}
    </button>
  </header>`;
}

function bottomNav(active) {
  const items = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
    { id: 'diet', icon: 'restaurant', label: 'Diet' },
    { id: 'workouts', icon: 'fitness_center', label: 'Workouts' },
    { id: 'steps', icon: 'directions_walk', label: 'Steps' },
    { id: 'water', icon: 'water_drop', label: 'Water' },
    { id: 'trends', icon: 'trending_up', label: 'Trends' },
  ];
  return `<nav class="bottom-nav">${items.map(i =>
    `<div class="nav-item ${active===i.id?'active':''}" data-route="${i.id}">
      <span class="material-symbols-rounded">${i.icon}</span>
      <span>${i.label}</span>
    </div>`
  ).join('')}</nav>`;
}

function bindNav() {
  setTimeout(() => {
    $$('.nav-item').forEach(el => {
      el.addEventListener('click', () => Router.navigate(el.dataset.route));
    });
    // Bind notification bell
    $('#notif-btn')?.addEventListener('click', openNotificationDrawer);
    // Show workout player bar if active (and not on active_workout page)
    if (WorkoutPlayer.isActive() && Router.current !== 'active_workout') {
      WorkoutPlayer.showBar();
    } else {
      WorkoutPlayer.removeBar();
    }
  }, 10);
}

// --- Notification Drawer ---
function getNotifications() {
  const stored = Store.getData('notifications', null);
  if (stored && stored.length > 0) return stored;
  // Default sample notifications
  const defaults = [
    { id: 1, icon: '💪', title: 'Welcome to KINETIC!', body: 'Start tracking your workouts and nutrition today.', time: Date.now() - 60000, read: false },
    { id: 2, icon: '🔥', title: 'Set Your Goal', body: 'Head to Diet page and pick your fitness goal for personalized tracking.', time: Date.now() - 120000, read: false },
    { id: 3, icon: '🏋️', title: 'Workout Ready', body: 'Your weekly schedule is set up. Tap Workouts to get started.', time: Date.now() - 300000, read: false },
  ];
  Store.setData('notifications', defaults);
  return defaults;
}

function addNotification(icon, title, body) {
  const notifs = getNotifications();
  notifs.unshift({ id: Date.now(), icon, title, body, time: Date.now(), read: false });
  if (notifs.length > 20) notifs.length = 20;
  Store.setData('notifications', notifs);
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function openNotificationDrawer() {
  // Remove existing drawer if any
  document.querySelectorAll('.notif-drawer-overlay, .notif-drawer').forEach(el => el.remove());

  const notifs = getNotifications();

  const overlayEl = document.createElement('div');
  overlayEl.className = 'notif-drawer-overlay';

  const drawer = document.createElement('div');
  drawer.className = 'notif-drawer';
  drawer.innerHTML = `
    <div class="notif-drawer-header">
      <h3>Notifications</h3>
      <button class="btn-icon" id="notif-drawer-close"><span class="material-symbols-rounded" style="font-size:20px">close</span></button>
    </div>
    <div class="notif-drawer-body">
      ${notifs.length > 0 ? notifs.map(n => `
        <div class="notif-item ${n.read ? '' : 'unread'}" data-nid="${n.id}">
          <div class="notif-item-icon">${n.icon}</div>
          <div class="notif-item-content">
            <div class="notif-item-title">${n.title}</div>
            <div class="notif-item-body">${n.body}</div>
            <div class="notif-item-time">${formatTimeAgo(n.time)}</div>
          </div>
        </div>
      `).join('') : `
        <div class="notif-empty">
          <span class="material-symbols-rounded">notifications_off</span>
          <div class="body-md">No notifications yet</div>
          <div class="body-sm text-surface-variant" style="margin-top:4px">You'll see updates here as you use the app</div>
        </div>
      `}
    </div>
    <div class="notif-prefs-section">
      <div class="notif-prefs-toggle" id="notif-prefs-toggle">
        <span class="material-symbols-rounded" style="font-size:16px">settings</span>
        <span>Notification Preferences</span>
        <span class="material-symbols-rounded notif-prefs-arrow" style="font-size:16px;margin-left:auto">expand_more</span>
      </div>
      <div class="notif-prefs-body" id="notif-prefs-body" style="display:none">
        ${(() => {
          const prefs = Store.getNotifPrefs();
          const types = [
            { key: 'goals', label: 'Goal Completions', icon: '🏆' },
            { key: 'calories', label: 'Calorie Milestones', icon: '🔥' },
            { key: 'steps', label: 'Step Goal Alerts', icon: '👟' },
            { key: 'hydration', label: 'Hydration Targets', icon: '💧' },
            { key: 'gym', label: 'Gym Time Reminders', icon: '🏋️' },
            { key: 'tips', label: 'Tips & Suggestions', icon: '💡' },
          ];
          return types.map(t => `
            <label class="notif-pref-row">
              <span>${t.icon} ${t.label}</span>
              <input type="checkbox" class="notif-pref-check" data-pref="${t.key}" ${prefs[t.key] ? 'checked' : ''}/>
            </label>
          `).join('');
        })()}
      </div>
    </div>
    <div class="notif-drawer-footer">
      <button id="notif-mark-read">Mark all read</button>
      <button id="notif-clear-all">Clear all</button>
    </div>
  `;

  document.body.appendChild(overlayEl);
  document.body.appendChild(drawer);

  // Animate in
  requestAnimationFrame(() => {
    overlayEl.classList.add('show');
    drawer.classList.add('show');
  });

  function closeDrawer() {
    drawer.classList.remove('show');
    overlayEl.classList.remove('show');
    setTimeout(() => {
      drawer.remove();
      overlayEl.remove();
    }, 350);
  }

  overlayEl.addEventListener('click', closeDrawer);
  drawer.querySelector('#notif-drawer-close')?.addEventListener('click', closeDrawer);

  // Mark all as read
  drawer.querySelector('#notif-mark-read')?.addEventListener('click', () => {
    const n = getNotifications();
    n.forEach(item => item.read = true);
    Store.setData('notifications', n);
    // Update badge in topbar
    const badge = document.querySelector('.notif-badge');
    if (badge) badge.remove();
    // Update drawer items
    drawer.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
  });

  // Clear all
  drawer.querySelector('#notif-clear-all')?.addEventListener('click', () => {
    Store.setData('notifications', []);
    const badge = document.querySelector('.notif-badge');
    if (badge) badge.remove();
    drawer.querySelector('.notif-drawer-body').innerHTML = `
      <div class="notif-empty">
        <span class="material-symbols-rounded">notifications_off</span>
        <div class="body-md">No notifications yet</div>
        <div class="body-sm text-surface-variant" style="margin-top:4px">You'll see updates here as you use the app</div>
      </div>
    `;
  });

  // Notification preferences toggle
  drawer.querySelector('#notif-prefs-toggle')?.addEventListener('click', () => {
    const body = drawer.querySelector('#notif-prefs-body');
    const arrow = drawer.querySelector('.notif-prefs-arrow');
    if (body.style.display === 'none') {
      body.style.display = 'block';
      arrow.textContent = 'expand_less';
    } else {
      body.style.display = 'none';
      arrow.textContent = 'expand_more';
    }
  });
  // Notification preference checkboxes
  drawer.querySelectorAll('.notif-pref-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const prefs = Store.getNotifPrefs();
      prefs[cb.dataset.pref] = cb.checked;
      Store.setNotifPrefs(prefs);
    });
  });

  // Click on individual notification marks it as read
  drawer.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', () => {
      const nid = parseInt(el.dataset.nid);
      const n = getNotifications();
      const item = n.find(x => x.id === nid);
      if (item) {
        item.read = true;
        Store.setData('notifications', n);
        el.classList.remove('unread');
        // Update badge
        const unread = n.filter(x => !x.read).length;
        const badge = document.querySelector('.notif-badge');
        if (unread === 0 && badge) badge.remove();
        else if (badge) badge.textContent = unread > 9 ? '9+' : unread;
      }
    });
  });
}

// ============================================
// PAGE: Login
// ============================================
function renderLogin() {
  app().innerHTML = `
    <div class="login-page animate-fade-in">
      <div class="login-brand">
        <h1>KINETIC</h1>
        <p>THE LIMIT IS NON-EXISTENT</p>
      </div>
      <div class="login-form-card glass-card">
        <div class="login-error" id="login-error"></div>
        <div class="form-fields">
          <div class="input-group">
            <span class="material-symbols-rounded input-icon">mail</span>
            <input type="email" id="login-email" placeholder="Email address" autocomplete="email"/>
          </div>
          <div class="input-group">
            <span class="material-symbols-rounded input-icon">lock</span>
            <input type="password" id="login-password" placeholder="Password" autocomplete="current-password"/>
            <span class="material-symbols-rounded toggle-pw" id="toggle-pw">visibility_off</span>
          </div>
        </div>
        <div class="forgot-link"><a href="#">Forgot Password?</a></div>
        <button class="btn-primary" id="login-btn">
          <span class="material-symbols-rounded">login</span>
          Sign In
        </button>
        <div class="divider-text">or continue with</div>
        <div class="social-btns">
          <button class="social-btn" id="google-btn" style="width:100%">
            <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
        </div>
      </div>
      <div class="login-footer" id="login-footer">
        Don't have an account? <a href="#" id="to-signup">Sign Up</a>
      </div>
    </div>
  `;

  // Toggle password
  $('#toggle-pw').addEventListener('click', function() {
    const inp = $('#login-password');
    const isPassword = inp.type === 'password';
    inp.type = isPassword ? 'text' : 'password';
    this.textContent = isPassword ? 'visibility' : 'visibility_off';
  });

  // Sign in — validates against registered users in localStorage
  $('#login-btn').addEventListener('click', () => {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value.trim();
    const err = $('#login-error');
    err.classList.remove('show');
    if (!email || !password) {
      err.textContent = 'Please enter your email and password.';
      err.classList.add('show');
      return;
    }
    if (!email.includes('@')) {
      err.textContent = 'Please enter a valid email address.';
      err.classList.add('show');
      return;
    }
    // Check registered users
    const user = Store.findUser(email, password);
    if (!user) {
      if (!Store.emailExists(email)) {
        err.textContent = 'No account found. Please sign up first.';
      } else {
        err.textContent = 'Incorrect password. Please try again.';
      }
      err.classList.add('show');
      return;
    }
    Store.setUser({ email: user.email, name: user.name });
    Router.navigate('dashboard');
  });

  // Google auth — simulated OAuth: auto-register if not exists, then login
  $('#google-btn')?.addEventListener('click', () => {
    const name = 'Google User';
    const email = 'user@gmail.com';
    if (!Store.emailExists(email)) {
      Store.registerUser({ name, email, password: 'google_oauth' });
      Store.clearAllData();
      Store.initNewUserData();
    }
    Store.setUser({ email, name });
    Router.navigate('dashboard');
  });

  // Sign up toggle
  $('#to-signup').addEventListener('click', (e) => {
    e.preventDefault();
    Router.navigate('signup');
  });
}

// ============================================
// PAGE: Sign Up
// ============================================
function renderSignup() {
  app().innerHTML = `
    <div class="login-page animate-fade-in">
      <div class="login-brand">
        <h1>KINETIC</h1>
        <p>CREATE YOUR ACCOUNT</p>
      </div>
      <div class="login-form-card glass-card">
        <div class="login-error" id="signup-error"></div>
        <div class="form-fields">
          <div class="input-group">
            <span class="material-symbols-rounded input-icon">person</span>
            <input type="text" id="signup-name" placeholder="Full Name"/>
          </div>
          <div class="input-group">
            <span class="material-symbols-rounded input-icon">mail</span>
            <input type="email" id="signup-email" placeholder="Email address"/>
          </div>
          <div class="input-group">
            <span class="material-symbols-rounded input-icon">lock</span>
            <input type="password" id="signup-password" placeholder="Password"/>
          </div>
        </div>
        <div style="height:var(--spacing-4)"></div>
        <button class="btn-primary" id="signup-btn">
          <span class="material-symbols-rounded">person_add</span>
          Create Account
        </button>
        <div class="divider-text">or continue with</div>
        <div class="social-btns">
          <button class="social-btn" id="signup-google-btn" style="width:100%">
            <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
        </div>
      </div>
      <div class="login-footer">
        Already have an account? <a href="#" id="to-login">Sign In</a>
      </div>
    </div>
  `;
  $('#signup-btn').addEventListener('click', () => {
    const name = $('#signup-name').value.trim();
    const email = $('#signup-email').value.trim();
    const password = $('#signup-password').value.trim();
    const err = $('#signup-error');
    err.classList.remove('show');
    if (!name || !email || !password) {
      err.textContent = 'Please fill in all fields.';
      err.classList.add('show');
      return;
    }
    if (!email.includes('@')) {
      err.textContent = 'Please enter a valid email address.';
      err.classList.add('show');
      return;
    }
    if (password.length < 6) {
      err.textContent = 'Password must be at least 6 characters.';
      err.classList.add('show');
      return;
    }
    if (Store.emailExists(email)) {
      err.textContent = 'An account with this email already exists. Please sign in.';
      err.classList.add('show');
      return;
    }
    // Register new user
    Store.registerUser({ name, email, password });
    // Clear all app data and initialize fresh defaults for new user
    Store.clearAllData();
    Store.initNewUserData();
    // Set current user
    Store.setUser({ email, name });
    Router.navigate('dashboard');
  });
  $('#to-login').addEventListener('click', (e) => { e.preventDefault(); Router.navigate('login'); });

  // Google auth on signup page
  $('#signup-google-btn')?.addEventListener('click', () => {
    const name = 'Google User';
    const email = 'user@gmail.com';
    if (!Store.emailExists(email)) {
      Store.registerUser({ name, email, password: 'google_oauth' });
    }
    Store.clearAllData();
    Store.initNewUserData();
    Store.setUser({ email, name });
    Router.navigate('dashboard');
  });
}

// ============================================
// WATER REMINDER (every 30 min)
// ============================================
let waterReminderInterval = null;

function startWaterReminder() {
  stopWaterReminder();
  const prefs = Store.getNotifPrefs();
  if (!Store.getData('water_reminder_on', true) || !prefs.hydration) return;

  waterReminderInterval = setInterval(() => {
    const water = Store.getData('water_today', 0);
    const waterGoal = Store.getData('water_goal', 3000);
    if (water >= waterGoal) return; // Already hit goal

    const remaining = ((waterGoal - water) / 1000).toFixed(1);

    // Alert popup
    alert(`💧 Hydration Reminder\n\nTime to drink water! ${remaining}L remaining to hit your daily goal.`);

    // In-app notification
    addNotification('💧', 'Hydration Reminder', `Drink some water! ${remaining}L remaining today.`);

    // Show toast if app is visible
    showGoalToast('Hydration Reminder', `${remaining}L remaining — grab some water!`, '💧');
  }, 30 * 60 * 1000); // 30 minutes
}

function stopWaterReminder() {
  if (waterReminderInterval) {
    clearInterval(waterReminderInterval);
    waterReminderInterval = null;
  }
}

// Auto-start water reminder if enabled
if (Store.getData('water_reminder_on', true)) {
  startWaterReminder();
}

// ============================================
// GYM TIMER LOGIC
// ============================================
let gymTimerInterval = null;

function getGymTime() { return Store.getData('gym_time', '18:00'); }
function setGymTime(t) { Store.setData('gym_time', t); }

function getCountdown(gymTimeStr) {
  const now = new Date();
  const [h, m] = gymTimeStr.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1); // next day if past
  const diff = target - now;
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return { hrs, mins, secs, diff, isToday: target.getDate() === now.getDate() };
}

function formatCountdown(cd) {
  return `${String(cd.hrs).padStart(2,'0')}:${String(cd.mins).padStart(2,'0')}:${String(cd.secs).padStart(2,'0')}`;
}

function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendGymNotification() {
  alert('🏋️ KINETIC — Gym Time!\n\nTime to hit the gym! Your scheduled workout is starting now.');
}

// Goal completion notification system
function sendGoalNotification(title, body, emoji) {
  // Alert popup
  alert(`${emoji} ${title}\n\n${body}`);
  // Store in notification drawer
  addNotification(emoji, title, body);
  // In-app toast notification
  showGoalToast(title, body, emoji);
}

function showGoalToast(title, body, emoji) {
  // Remove existing toasts
  document.querySelectorAll('.goal-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'goal-toast';
  toast.innerHTML = `
    <div class="goal-toast-icon">${emoji}</div>
    <div class="goal-toast-content">
      <div class="goal-toast-title">${title}</div>
      <div class="goal-toast-body">${body}</div>
    </div>
  `;
  document.body.appendChild(toast);
  // Animate in
  requestAnimationFrame(() => toast.classList.add('goal-toast-show'));
  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toast.classList.remove('goal-toast-show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function checkGoalNotifications() {
  const prefs = Store.getNotifPrefs();

  // Check calorie goal
  if (prefs.calories) {
    const meals = getMeals();
    const goalKey = getSelectedGoal();
    const goal = FITNESS_GOALS[goalKey];
    let totalCals = 0;
    for (const key in meals) { totalCals += calcMealTotals(meals[key]).cal; }
    const calPct = Math.round((totalCals / goal.cal) * 100);

    if (calPct >= 100 && !Store.getData('notif_cal_done_today', false)) {
      Store.setData('notif_cal_done_today', true);
      sendGoalNotification('Calorie Goal Hit!', `You've consumed ${totalCals.toLocaleString()} of ${goal.cal.toLocaleString()} kcal today.`, '🔥');
    } else if (calPct >= 90 && calPct < 100 && !Store.getData('notif_cal_90_today', false)) {
      Store.setData('notif_cal_90_today', true);
      sendGoalNotification('Almost There!', `You're at ${calPct}% of your daily calorie goal. Keep going!`, '🍽️');
    }
  }

  // Check step goal
  if (prefs.steps) {
    const steps = Store.getData('steps_today', 0);
    const stepGoal = Store.getData('steps_goal', 10000);
    const stepPct = Math.round((steps / stepGoal) * 100);
    if (stepPct >= 100 && !Store.getData('notif_steps_done_today', false)) {
      Store.setData('notif_steps_done_today', true);
      sendGoalNotification('Step Goal Crushed!', `${steps.toLocaleString()} steps — you've smashed your ${stepGoal.toLocaleString()} goal!`, '🚶');
    }
  }

  // Check water goal
  if (prefs.hydration) {
    const water = Store.getData('water_today', 0);
    const waterGoal = Store.getData('water_goal', 3000);
    const waterPct = Math.round((water / waterGoal) * 100);
    if (waterPct >= 100 && !Store.getData('notif_water_done_today', false)) {
      Store.setData('notif_water_done_today', true);
      sendGoalNotification('Hydration Complete!', `${(water/1000).toFixed(1)}L of water — you're fully hydrated today!`, '💧');
    }
  }
}

function startGymTimer() {
  if (gymTimerInterval) clearInterval(gymTimerInterval);
  const gymTime = getGymTime();
  let notified = false;
  gymTimerInterval = setInterval(() => {
    const cd = getCountdown(gymTime);
    const el = document.getElementById('gym-countdown');
    if (el) el.textContent = formatCountdown(cd);
    // Notify when within 1 minute
    if (cd.diff <= 60000 && cd.diff > 0 && !notified) {
      notified = true;
      sendGymNotification();
    }
    // Notify exactly at time
    if (cd.diff <= 1000 && !notified) {
      notified = true;
      sendGymNotification();
    }
  }, 1000);
}

// ============================================
// PAGE: Dashboard
// ============================================
function renderDashboard() {
  const user = Store.getUser();
  const steps = Store.getData('steps_today', 0);
  const stepsGoal = Store.getData('steps_goal', 10000);
  const stepsPercent = Math.round((steps / stepsGoal) * 100);
  const water = Store.getData('water_today', 0);
  const waterGoal = Store.getData('water_goal', 3000);
  const waterPercent = Math.round((water / waterGoal) * 100);
  // Dynamic calorie data from meals & fitness goal
  const meals = getMeals();
  const goalKey = getSelectedGoal();
  const goalData = FITNESS_GOALS[goalKey];
  const allMealTotals = { cal: 0, p: 0, c: 0, f: 0 };
  for (const key in meals) {
    const t = calcMealTotals(meals[key]);
    allMealTotals.cal += t.cal; allMealTotals.p += t.p; allMealTotals.c += t.c; allMealTotals.f += t.f;
  }
  const calsConsumed = allMealTotals.cal;
  const calsGoal = goalData.cal;
  const calsRemaining = Math.max(0, calsGoal - calsConsumed);
  const calsPercent = Math.min(100, Math.round((calsConsumed / calsGoal) * 100));

  // Get today's workout from schedule
  const schedule = getSchedule();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayDay = days[new Date().getDay()];
  const todaySched = schedule.find(s => s.day === todayDay) || schedule[0];

  // Gym time
  const gymTime = getGymTime();
  const cd = getCountdown(gymTime);
  const notifGranted = 'Notification' in window && Notification.permission === 'granted';
  const gymTimeFormatted = new Date(`2000-01-01T${gymTime}:00`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  app().innerHTML = `
    ${topBar()}
    <div class="page-content stagger">
      <!-- Hero -->
      <div style="margin-bottom:var(--spacing-6)">
        <p class="body-md text-surface-variant" style="margin-bottom:var(--spacing-1)">Welcome back,</p>
        <h1 class="headline-lg" style="margin-bottom:var(--spacing-2)">${user?.name || 'Athlete'}</h1>
        <p class="body-md text-surface-variant">You're <span class="text-primary" style="font-weight:700">${stepsPercent}%</span> through your daily step goal. Keep the momentum.</p>
      </div>

      <!-- BMI & Calorie Calculator -->
      <div class="section-header"><h3 class="section-title">BMI & Calorie Calculator</h3></div>
      <div class="bmi-card">
        <div class="bmi-inputs">
          <input type="number" id="bmi-weight" placeholder="Weight (kg)" value="72" min="20" max="300" step="0.1" maxlength="5" inputmode="decimal"/>
          <input type="number" id="bmi-height" placeholder="Height (cm)" value="175" min="50" max="280" step="1" maxlength="5" inputmode="decimal"/>
        </div>
        <div class="bmi-inputs" style="margin-top:var(--spacing-3)">
          <input type="number" id="bmi-age" placeholder="Age" value="25" min="5" max="120" step="1" maxlength="3" inputmode="numeric"/>
          <select id="bmi-gender" style="flex:1;padding:var(--spacing-2) var(--spacing-3);border-radius:var(--radius-md);border:1px solid var(--surface-variant);background:var(--surface-container-high);color:var(--on-surface);font-size:0.875rem;font-family:var(--font-body)">
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <button class="btn-primary" id="btn-calc-bmi" style="width:100%;padding:var(--spacing-2);margin-top:var(--spacing-3)">Calculate BMI & Calories</button>
        <div class="bmi-result-box" id="bmi-result">
          <div class="bmi-status" id="bmi-status-text">Normal</div>
          <div class="bmi-value" id="bmi-value-text">23.5</div>
          <div id="bmi-calorie-result" style="background:var(--surface-container);border-radius:var(--radius-lg);padding:var(--spacing-3);margin:var(--spacing-3) 0">
            <div class="label-sm text-surface-variant" style="margin-bottom:4px">Recommended Daily Intake</div>
            <div class="title-md text-primary" id="bmi-cal-value">2,400 kcal</div>
            <div class="body-sm text-surface-variant" id="bmi-cal-breakdown">BMR: 1,700 • Activity: Moderate</div>
          </div>
          <p class="body-sm text-surface-variant" style="margin-bottom:var(--spacing-2)">Based on your BMI, KINETIC suggests:</p>
          <button class="bmi-suggest-btn" id="bmi-suggest-btn" data-goal="lean_body">
            Adopt <span id="bmi-suggest-name" style="font-weight:800;text-decoration:underline">Lean Body</span> Plan
          </button>
        </div>
      </div>

      <!-- Gym Timer -->
      <div class="gym-timer-card">
        <div class="gym-timer-top">
          <div class="gym-label">
            <span class="material-symbols-rounded">timer</span>
            <span>Gym Time</span>
          </div>
          <span class="chip chip-active" style="font-size:0.6rem;padding:3px 10px">${gymTimeFormatted}</span>
        </div>
        <div class="gym-time-display">
          <div class="countdown-value" id="gym-countdown">${formatCountdown(cd)}</div>
          <div class="countdown-label">${cd.isToday ? 'Until gym time today' : 'Until gym time tomorrow'}</div>
        </div>
        <div class="gym-time-set">
          <input type="time" id="gym-time-input" value="${gymTime}"/>
          <button class="btn-set-time" id="set-gym-time">Set Time</button>
        </div>
        <div class="notif-status">
          <span class="dot ${notifGranted ? 'on' : 'off'}"></span>
          ${notifGranted ? 'Notifications on — you\'ll be reminded' : '<a href="#" id="enable-notif" style="color:var(--primary);font-weight:600">Enable notifications</a>'}
        </div>
      </div>

      <!-- Progress Ring -->
      <div style="text-align:center;margin-bottom:var(--spacing-8)">
        <div class="progress-ring-container" style="display:inline-block">
          ${createSVGRing(180, 10, calsPercent)}
          <div class="ring-center-text" style="top:50%;left:50%;transform:translate(-50%,-50%)">
            <div class="display-sm text-primary">${calsRemaining.toLocaleString()}</div>
            <div class="label-sm text-surface-variant">KCAL LEFT</div>
          </div>
        </div>
      </div>

      <!-- Macro Nutrients -->
      <div class="section-header"><h3 class="section-title">Macro Nutrients</h3></div>
      <div class="macro-row" style="margin-bottom:var(--spacing-8)">
        <div class="macro-pill"><div class="macro-val text-primary">${allMealTotals.p}g</div><div class="macro-lbl">Protein</div></div>
        <div class="macro-pill"><div class="macro-val text-tertiary">${allMealTotals.c}g</div><div class="macro-lbl">Carbs</div></div>
        <div class="macro-pill"><div class="macro-val" style="color:var(--secondary)">${allMealTotals.f}g</div><div class="macro-lbl">Fats</div></div>
      </div>

      <!-- Step Tracking Big Section -->
      <div style="background:linear-gradient(135deg, var(--surface-container) 0%, var(--surface-container-high) 100%);border-radius:var(--radius-xl);padding:var(--spacing-6);margin-bottom:var(--spacing-6);border:1px solid rgba(64,72,93,0.12)">
        <!-- Step Count Center -->
        <div style="text-align:center;margin-bottom:var(--spacing-5)" onclick="window.location.hash='steps'" role="button">
          <div class="progress-ring-container" style="display:inline-block;margin-bottom:var(--spacing-3)">
            ${createSVGRing(200, 12, Math.min(100, stepsPercent), 'var(--primary)', 'var(--surface-container-high)')}
            <div class="ring-center-text" style="top:50%;left:50%;transform:translate(-50%,-50%)">
              <span class="material-symbols-rounded" style="font-size:24px;color:var(--primary);display:block;margin-bottom:2px">directions_walk</span>
              <div style="font-family:var(--font-display);font-size:${steps >= 10000 ? '2rem' : '2.5rem'};font-weight:900;color:var(--primary);line-height:1" id="dash-step-count">${steps.toLocaleString()}</div>
              <div class="label-sm text-surface-variant" style="margin-top:4px;letter-spacing:1.5px">STEPS</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:center;gap:var(--spacing-2);margin-bottom:var(--spacing-1)">
            <span class="material-symbols-rounded" style="font-size:16px;color:var(--primary)">flag</span>
            <span class="body-md" style="font-weight:600">${stepsPercent}% of ${stepsGoal.toLocaleString()} goal</span>
          </div>
          <!-- Progress bar -->
          <div style="height:8px;background:var(--surface-container-high);border-radius:var(--radius-full);overflow:hidden;margin:var(--spacing-2) auto;max-width:280px">
            <div style="height:100%;width:${Math.min(100, stepsPercent)}%;background:linear-gradient(90deg,var(--primary),var(--primary-container));border-radius:var(--radius-full);transition:width 1s ease"></div>
          </div>
        </div>
        <!-- Stats Row -->
        <div style="display:flex;justify-content:center;gap:var(--spacing-6);margin-bottom:var(--spacing-5)">
          <div style="text-align:center">
            <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:2px">
              <span class="material-symbols-rounded" style="font-size:18px;color:var(--tertiary)">local_fire_department</span>
              <span style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;color:var(--on-surface)">${Math.round(steps * 0.04)}</span>
            </div>
            <div class="label-sm text-surface-variant">KCAL</div>
          </div>
          <div style="width:1px;background:var(--surface-variant);align-self:stretch"></div>
          <div style="text-align:center">
            <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:2px">
              <span class="material-symbols-rounded" style="font-size:18px;color:var(--secondary)">straighten</span>
              <span style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;color:var(--on-surface)">${(steps * 0.0008).toFixed(1)}</span>
            </div>
            <div class="label-sm text-surface-variant">KM</div>
          </div>
          <div style="width:1px;background:var(--surface-variant);align-self:stretch"></div>
          <div style="text-align:center">
            <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:2px">
              <span class="material-symbols-rounded" style="font-size:18px;color:var(--primary)">schedule</span>
              <span style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;color:var(--on-surface)">${Math.round(steps * 0.0125)}</span>
            </div>
            <div class="label-sm text-surface-variant">MIN</div>
          </div>
        </div>
        <!-- Auto Step Toggle -->
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface-container);border-radius:var(--radius-lg);padding:var(--spacing-3) var(--spacing-4)">
          <div style="display:flex;align-items:center;gap:var(--spacing-3)">
            <span class="material-symbols-rounded" style="font-size:22px;color:${Pedometer.active ? 'var(--primary)' : 'var(--on-surface-variant)'}">sensors</span>
            <div>
              <div class="title-sm">Auto Step Tracking</div>
              <div class="body-sm text-surface-variant">${Pedometer.active ? '<span style="color:var(--primary);font-weight:600">Active</span> — counting' : Pedometer.isSupported() ? 'Tap to enable' : 'Not supported'}</div>
            </div>
          </div>
          <label class="pedometer-toggle">
            <input type="checkbox" id="dash-pedometer-switch" ${Pedometer.active ? 'checked' : ''} ${!Pedometer.isSupported() ? 'disabled' : ''} style="opacity:0;width:0;height:0">
            <span class="pedometer-slider" style="width:52px;height:28px;border-radius:var(--radius-full);background:var(--surface-container-high);display:block;position:relative;cursor:pointer;transition:background var(--transition-fast)"></span>
          </label>
        </div>
      </div>

      <!-- Water Quick Stat -->
      <div class="stat-card" style="cursor:pointer;margin-bottom:var(--spacing-8)" onclick="window.location.hash='water'">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:var(--spacing-2)">
            <span class="material-symbols-rounded text-tertiary" style="font-size:20px">water_drop</span>
            <span class="stat-label">Hydration</span>
          </div>
          <span class="body-sm text-surface-variant">${waterPercent}%</span>
        </div>
        <div class="stat-value" style="color:var(--tertiary)">${(water/1000).toFixed(1)}L <span class="body-sm text-surface-variant" style="font-weight:400">/ ${(waterGoal/1000).toFixed(1)}L</span></div>
        <div style="height:4px;background:var(--surface-variant);border-radius:var(--radius-full);overflow:hidden">
          <div style="height:100%;width:${waterPercent}%;background:linear-gradient(90deg,var(--tertiary),var(--tertiary-dim));border-radius:var(--radius-full);transition:width 1s ease"></div>
        </div>
      </div>

      <!-- Next Workout -->
      <div class="section-header">
        <h3 class="section-title">Today's Workout</h3>
        <span class="section-action" style="cursor:pointer" onclick="window.location.hash='workouts'">View All <span class="material-symbols-rounded" style="font-size:16px">chevron_right</span></span>
      </div>
      <div class="plan-card" onclick="window.location.hash='workouts'">
        <div class="plan-icon"><span class="material-symbols-rounded">fitness_center</span></div>
        <div class="plan-info">
          <h4>${todaySched.workout}</h4>
          <p>${todaySched.type} • ${todaySched.duration}</p>
        </div>
        <span class="material-symbols-rounded plan-arrow">chevron_right</span>
      </div>

      <!-- Heart Rate Monitor -->
      <div style="background:linear-gradient(135deg, var(--surface-container) 0%, var(--surface-container-high) 100%);border-radius:var(--radius-xl);padding:var(--spacing-6);margin-bottom:var(--spacing-6);border:1px solid rgba(64,72,93,0.12)">
        <!-- Header + Toggle -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--spacing-4)">
          <div style="display:flex;align-items:center;gap:var(--spacing-2)">
            <span class="material-symbols-rounded" style="color:var(--error);font-size:22px">favorite</span>
            <span class="title-md">Heart Rate</span>
          </div>
          <label class="pedometer-toggle">
            <input type="checkbox" id="hr-toggle-switch" ${HeartRateMonitor.active ? 'checked' : ''} style="opacity:0;width:0;height:0">
            <span class="pedometer-slider" style="width:52px;height:28px;border-radius:var(--radius-full);background:var(--surface-container-high);display:block;position:relative;cursor:pointer;transition:background var(--transition-fast)"></span>
          </label>
        </div>
        <!-- BPM Display -->
        <div style="text-align:center;margin-bottom:var(--spacing-4)">
          <span class="material-symbols-rounded ${HeartRateMonitor.active ? 'hr-pulse' : ''}" id="hr-pulse-icon" style="font-size:36px;color:var(--error);display:block;margin-bottom:var(--spacing-1);${HeartRateMonitor.active ? 'animation-duration:' + (60 / HeartRateMonitor.getCurrentBPM()).toFixed(2) + 's' : ''}">favorite</span>
          <div style="font-family:var(--font-display);font-size:4rem;font-weight:900;color:var(--error);line-height:1" id="hr-bpm-value">${HeartRateMonitor.getCurrentBPM()}</div>
          <div class="label-sm text-surface-variant" style="margin-top:4px;letter-spacing:1.5px">BPM</div>
          <span id="hr-zone-badge" style="display:inline-block;margin-top:var(--spacing-2);padding:4px 14px;border-radius:var(--radius-full);font-size:0.7rem;font-weight:700;${(() => { const z = HeartRateMonitor.getZone(HeartRateMonitor.getCurrentBPM()); return 'background:' + z.bg + ';color:' + z.color; })()}">${HeartRateMonitor.getZone(HeartRateMonitor.getCurrentBPM()).name}</span>
        </div>
        <!-- Sparkline -->
        <div id="hr-sparkline" style="margin-bottom:var(--spacing-4)">${HeartRateMonitor._renderSparkline()}</div>
        <!-- Stats Row -->
        <div style="display:flex;justify-content:center;gap:var(--spacing-6)">
          <div style="text-align:center">
            <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:800;color:var(--on-surface)" id="hr-avg">${(() => { const h = Store.getData('hr_history', []); return h.length ? Math.round(h.reduce((a,b) => a+b, 0) / h.length) : '--'; })()}</div>
            <div class="label-sm text-surface-variant">AVG</div>
          </div>
          <div style="width:1px;background:var(--surface-variant);align-self:stretch"></div>
          <div style="text-align:center">
            <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:800;color:var(--on-surface)" id="hr-min">${(() => { const h = Store.getData('hr_history', []); return h.length ? Math.min(...h) : '--'; })()}</div>
            <div class="label-sm text-surface-variant">MIN</div>
          </div>
          <div style="width:1px;background:var(--surface-variant);align-self:stretch"></div>
          <div style="text-align:center">
            <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:800;color:var(--on-surface)" id="hr-max">${(() => { const h = Store.getData('hr_history', []); return h.length ? Math.max(...h) : '--'; })()}</div>
            <div class="label-sm text-surface-variant">MAX</div>
          </div>
        </div>
        ${!HeartRateMonitor.active ? '<div class="body-sm text-surface-variant" style="text-align:center;margin-top:var(--spacing-3)">Toggle on to start monitoring</div>' : ''}
      </div>

      <!-- Crew Feed -->
      <div class="plan-card" id="go-crew-feed">
        <div class="plan-icon" style="background:rgba(97,194,255,0.1)"><span class="material-symbols-rounded" style="color:var(--tertiary)">group</span></div>
        <div class="plan-info">
          <h4>Crew Feed</h4>
          <p>See what your fitness crew is up to</p>
        </div>
        <span class="material-symbols-rounded plan-arrow">chevron_right</span>
      </div>

      <!-- Data Portability -->
      <div class="section-header"><h3 class="section-title">Data Portability</h3></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--spacing-3);margin-bottom:var(--spacing-6)">
        <button class="btn-secondary" id="export-data-btn">
          <span class="material-symbols-rounded" style="font-size:18px">download</span>
          Export Data
        </button>
        <button class="btn-secondary" id="import-data-btn">
          <span class="material-symbols-rounded" style="font-size:18px">upload</span>
          Import Data
        </button>
      </div>
      <input type="file" id="import-file-input" accept=".json" style="display:none"/>

      <!-- Reset All Data -->
      <button class="btn-secondary" id="reset-all-btn" style="margin-bottom:var(--spacing-3);border-color:var(--error);color:var(--error)">
        <span class="material-symbols-rounded" style="font-size:18px">restart_alt</span>
        Reset All Data
      </button>

      <!-- Logout -->
      <button class="btn-secondary" id="logout-btn" style="margin-bottom:var(--spacing-6)">
        <span class="material-symbols-rounded">logout</span>
        Sign Out
      </button>
    </div>
    ${bottomNav('dashboard')}
  `;
  bindNav();
  $('#logout-btn')?.addEventListener('click', () => { Store.logout(); Router.navigate('login'); });

  // Crew Feed link
  $('#go-crew-feed')?.addEventListener('click', () => Router.navigate('crew'));

  // Reset All Data with confirmation
  $('#reset-all-btn')?.addEventListener('click', () => {
    if (!confirm('⚠️ Are you sure you want to reset ALL data?\n\nThis will erase all your meals, steps, water, workouts, and preferences. This cannot be undone.')) return;
    if (!confirm('This is your last chance — ALL data will be permanently deleted. Continue?')) return;
    Store.clearAllData();
    Store.initNewUserData();
    showGoalToast('Data Reset', 'All your data has been reset to defaults.', '🔄');
    setTimeout(() => renderDashboard(), 1000);
  });

  // Export Data
  $('#export-data-btn')?.addEventListener('click', () => {
    const json = Store.exportAllData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `kinetic_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    const btn = $('#export-data-btn');
    btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px">check_circle</span> Exported!';
    setTimeout(() => { btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px">download</span> Export Data'; }, 2000);
  });
  // Import Data
  $('#import-data-btn')?.addEventListener('click', () => $('#import-file-input')?.click());
  $('#import-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        Store.importAllData(ev.target.result);
        const btn = $('#import-data-btn');
        btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px">check_circle</span> Imported!';
        setTimeout(() => renderDashboard(), 1500);
      } catch {
        alert('Invalid JSON file. Please select a valid KINETIC backup.');
      }
    };
    reader.readAsText(file);
  });

  // Gym timer logic
  startGymTimer();
  $('#set-gym-time')?.addEventListener('click', () => {
    const val = $('#gym-time-input')?.value;
    if (val) {
      setGymTime(val);
      renderDashboard();
    }
  });
  $('#enable-notif')?.addEventListener('click', (e) => {
    e.preventDefault();
    requestNotifPermission();
    setTimeout(() => renderDashboard(), 1000);
  });

  // Dashboard pedometer toggle
  $('#dash-pedometer-switch')?.addEventListener('change', async (e) => {
    if (e.target.checked) {
      const granted = await Pedometer.requestPermission();
      if (granted) {
        Pedometer.start();
        renderDashboard();
      } else {
        e.target.checked = false;
        alert('Motion sensor permission is required for automatic step tracking.');
      }
    } else {
      Pedometer.stop();
      renderDashboard();
    }
  });

  // Heart rate monitor toggle
  $('#hr-toggle-switch')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      HeartRateMonitor.start();
      renderDashboard();
    } else {
      HeartRateMonitor.stop();
      renderDashboard();
    }
  });

  // BMI input masking — clamp values on blur and prevent string concatenation
  ['bmi-weight','bmi-height','bmi-age'].forEach(id => {
    const el = $(`#${id}`);
    if (!el) return;
    el.addEventListener('input', () => {
      const max = parseFloat(el.max) || 999;
      if (el.value.length > (el.maxLength || 5)) el.value = el.value.slice(0, el.maxLength || 5);
      if (parseFloat(el.value) > max) el.value = max;
    });
    el.addEventListener('blur', () => {
      const min = parseFloat(el.min) || 0;
      const max = parseFloat(el.max) || 999;
      let v = parseFloat(el.value);
      if (isNaN(v)) { el.value = ''; return; }
      v = Math.max(min, Math.min(max, v));
      el.value = v;
    });
  });

  // BMI & Calorie Calculator events
  $('#btn-calc-bmi')?.addEventListener('click', () => {
    const w = parseFloat($('#bmi-weight').value);
    const hCm = parseFloat($('#bmi-height').value);
    const age = parseInt($('#bmi-age').value) || 25;
    const gender = $('#bmi-gender').value;
    const h = hCm / 100; // to meters
    if (!w || !h || w < 20 || w > 300 || hCm < 50 || hCm > 280 || age < 5 || age > 120) return;

    // BMI calculation
    const bmi = w / (h * h);
    $('#bmi-value-text').textContent = bmi.toFixed(1);

    // Mifflin-St Jeor equation for BMR
    let bmr;
    if (gender === 'male') {
      bmr = (10 * w) + (6.25 * hCm) - (5 * age) + 5;
    } else {
      bmr = (10 * w) + (6.25 * hCm) - (5 * age) - 161;
    }

    // Activity multiplier (moderate active = 1.55)
    const activityMultiplier = 1.55;
    let tdee = Math.round(bmr * activityMultiplier);

    let statusText = '';
    let statusColor = '';
    let goalKey = '';
    let calAdjustment = '';

    if (bmi < 18.5) {
      statusText = 'Underweight';
      statusColor = 'var(--secondary)';
      goalKey = 'muscle_gain';
      tdee = Math.round(tdee + 400); // surplus for weight gain
      calAdjustment = '+400 surplus';
    } else if (bmi < 25) {
      statusText = 'Normal Range';
      statusColor = 'var(--primary)';
      goalKey = 'lean_body';
      calAdjustment = 'maintenance';
    } else if (bmi < 30) {
      statusText = 'Overweight';
      statusColor = 'var(--tertiary)';
      goalKey = 'weight_loss';
      tdee = Math.round(tdee - 400); // deficit for weight loss
      calAdjustment = '-400 deficit';
    } else {
      statusText = 'Obese';
      statusColor = 'var(--error)';
      goalKey = 'weight_loss';
      tdee = Math.round(tdee - 600); // larger deficit
      calAdjustment = '-600 deficit';
    }

    const goal = FITNESS_GOALS[goalKey];
    $('#bmi-status-text').textContent = statusText;
    $('#bmi-status-text').style.color = statusColor;
    $('#bmi-suggest-btn').dataset.goal = goalKey;
    $('#bmi-suggest-name').textContent = goal.name;
    $('#bmi-cal-value').textContent = tdee.toLocaleString() + ' kcal';
    $('#bmi-cal-breakdown').textContent = `BMR: ${Math.round(bmr).toLocaleString()} • TDEE: ${calAdjustment}`;

    $('#bmi-result').style.display = 'block';
  });

  $('#bmi-suggest-btn')?.addEventListener('click', (e) => {
    const goalKey = e.currentTarget.dataset.goal;
    Store.setData('fitness_goal', goalKey);
    // Add visual feedback
    e.currentTarget.innerHTML = '<span class="material-symbols-rounded" style="vertical-align:middle;font-size:18px">check_circle</span> Plan Set!';
    setTimeout(() => { window.location.hash = 'diet'; }, 800);
  });
}

// ============================================
// FOOD DATABASE (per 100g unless noted)
// ============================================
const FOOD_DB = [
  // --- Non-Veg ---
  { name: 'Chicken Breast (Grilled)', serving: '100g', cal: 165, p: 31, c: 0, f: 3.6, type: 'nonveg' },
  { name: 'Chicken Thigh', serving: '100g', cal: 209, p: 26, c: 0, f: 11, type: 'nonveg' },
  { name: 'Salmon Fillet', serving: '100g', cal: 208, p: 20, c: 0, f: 13, type: 'nonveg' },
  { name: 'Tuna (Canned)', serving: '100g', cal: 116, p: 25.5, c: 0, f: 0.8, type: 'nonveg' },
  { name: 'Turkey Breast', serving: '100g', cal: 135, p: 30, c: 0, f: 1, type: 'nonveg' },
  { name: 'Beef Steak (Lean)', serving: '100g', cal: 271, p: 26, c: 0, f: 18, type: 'nonveg' },
  { name: 'Shrimp', serving: '100g', cal: 99, p: 24, c: 0.2, f: 0.3, type: 'nonveg' },
  { name: 'Egg (Large, Whole)', serving: '1 egg (50g)', cal: 72, p: 6.3, c: 0.4, f: 4.8, type: 'nonveg' },
  { name: 'Egg Whites', serving: '100g', cal: 52, p: 11, c: 0.7, f: 0.2, type: 'nonveg' },
  { name: 'Scrambled Eggs', serving: '2 eggs', cal: 182, p: 12, c: 2, f: 14, type: 'nonveg' },
  { name: 'Grilled Chicken Wrap', serving: '1 wrap', cal: 410, p: 32, c: 38, f: 14, type: 'nonveg' },
  // --- Indian Non-Veg ---
  { name: 'Butter Chicken', serving: '1 bowl (200g)', cal: 438, p: 28, c: 12, f: 32, type: 'nonveg' },
  { name: 'Chicken Biryani', serving: '1 plate (300g)', cal: 490, p: 24, c: 58, f: 18, type: 'nonveg' },
  { name: 'Tandoori Chicken', serving: '2 pieces (200g)', cal: 260, p: 36, c: 4, f: 12, type: 'nonveg' },
  { name: 'Chicken Tikka', serving: '6 pieces (150g)', cal: 220, p: 30, c: 6, f: 8, type: 'nonveg' },
  { name: 'Fish Curry', serving: '1 bowl (200g)', cal: 280, p: 22, c: 8, f: 18, type: 'nonveg' },
  { name: 'Egg Curry', serving: '1 bowl (200g)', cal: 240, p: 14, c: 10, f: 16, type: 'nonveg' },
  { name: 'Mutton Rogan Josh', serving: '1 bowl (200g)', cal: 420, p: 26, c: 8, f: 32, type: 'nonveg' },
  { name: 'Keema (Minced Meat)', serving: '1 bowl (200g)', cal: 380, p: 28, c: 6, f: 28, type: 'nonveg' },
  // --- Veg (includes dairy/eggs) ---
  { name: 'Brown Rice (Cooked)', serving: '100g', cal: 123, p: 2.7, c: 26, f: 1, type: 'veg' },
  { name: 'White Rice (Cooked)', serving: '100g', cal: 130, p: 2.7, c: 28, f: 0.3, type: 'veg' },
  { name: 'Oatmeal (Cooked)', serving: '100g', cal: 71, p: 2.5, c: 12, f: 1.5, type: 'veg' },
  { name: 'Greek Yogurt (Plain)', serving: '100g', cal: 59, p: 10, c: 3.6, f: 0.4, type: 'veg' },
  { name: 'Cottage Cheese', serving: '100g', cal: 98, p: 11, c: 3.4, f: 4.3, type: 'veg' },
  { name: 'Milk (Whole)', serving: '250ml', cal: 149, p: 8, c: 12, f: 8, type: 'veg' },
  { name: 'Milk (Skim)', serving: '250ml', cal: 83, p: 8.3, c: 12, f: 0.2, type: 'veg' },
  { name: 'Cheddar Cheese', serving: '30g', cal: 120, p: 7, c: 0.4, f: 10, type: 'veg' },
  { name: 'Mozzarella', serving: '30g', cal: 85, p: 6.3, c: 0.7, f: 6.3, type: 'veg' },
  { name: 'Whey Protein Shake', serving: '1 scoop (30g)', cal: 120, p: 24, c: 3, f: 1.5, type: 'veg' },
  { name: 'Whole Wheat Bread', serving: '1 slice (28g)', cal: 69, p: 3.6, c: 12, f: 1.1, type: 'veg' },
  { name: 'Pasta (Cooked)', serving: '100g', cal: 131, p: 5, c: 25, f: 1.1, type: 'veg' },
  { name: 'Oatmeal w/ Blueberries', serving: '1 bowl (250g)', cal: 320, p: 8, c: 54, f: 6, type: 'veg' },
  { name: 'Granola', serving: '50g', cal: 225, p: 5, c: 32, f: 9, type: 'veg' },
  { name: 'Caesar Salad', serving: '1 serving', cal: 360, p: 14, c: 18, f: 26, type: 'veg' },
  { name: 'Cappuccino', serving: '1 cup (240ml)', cal: 120, p: 8, c: 10, f: 5, type: 'veg' },
  { name: 'Protein Bar', serving: '1 bar (60g)', cal: 220, p: 20, c: 24, f: 7, type: 'veg' },
  // --- Indian Veg ---
  { name: 'Paneer Butter Masala', serving: '1 bowl (200g)', cal: 400, p: 16, c: 14, f: 32, type: 'veg' },
  { name: 'Paneer Tikka', serving: '6 pieces (150g)', cal: 280, p: 18, c: 8, f: 20, type: 'veg' },
  { name: 'Palak Paneer', serving: '1 bowl (200g)', cal: 320, p: 16, c: 10, f: 24, type: 'veg' },
  { name: 'Veg Biryani', serving: '1 plate (300g)', cal: 380, p: 10, c: 62, f: 12, type: 'veg' },
  { name: 'Chole (Chickpea Curry)', serving: '1 bowl (200g)', cal: 280, p: 12, c: 38, f: 10, type: 'veg' },
  { name: 'Rajma (Kidney Bean Curry)', serving: '1 bowl (200g)', cal: 260, p: 14, c: 36, f: 6, type: 'veg' },
  { name: 'Aloo Gobi', serving: '1 bowl (200g)', cal: 180, p: 4, c: 24, f: 8, type: 'veg' },
  { name: 'Dal Tadka', serving: '1 bowl (200g)', cal: 190, p: 12, c: 28, f: 4, type: 'veg' },
  { name: 'Dal Makhani', serving: '1 bowl (200g)', cal: 280, p: 14, c: 30, f: 12, type: 'veg' },
  { name: 'Roti / Chapati', serving: '1 roti (40g)', cal: 104, p: 3, c: 18, f: 3, type: 'veg' },
  { name: 'Naan', serving: '1 naan (90g)', cal: 260, p: 8, c: 42, f: 6, type: 'veg' },
  { name: 'Paratha (Plain)', serving: '1 paratha (80g)', cal: 260, p: 5, c: 32, f: 13, type: 'veg' },
  { name: 'Poha', serving: '1 plate (200g)', cal: 250, p: 5, c: 42, f: 8, type: 'veg' },
  { name: 'Upma', serving: '1 bowl (200g)', cal: 210, p: 5, c: 32, f: 7, type: 'veg' },
  { name: 'Idli', serving: '2 idlis (120g)', cal: 130, p: 4, c: 26, f: 0.5, type: 'veg' },
  { name: 'Dosa (Plain)', serving: '1 dosa (100g)', cal: 168, p: 4, c: 28, f: 5, type: 'veg' },
  { name: 'Masala Dosa', serving: '1 dosa (200g)', cal: 300, p: 6, c: 40, f: 14, type: 'veg' },
  { name: 'Samosa', serving: '1 samosa (80g)', cal: 252, p: 4, c: 24, f: 16, type: 'veg' },
  { name: 'Raita (Curd)', serving: '1 bowl (150g)', cal: 90, p: 5, c: 8, f: 4, type: 'veg' },
  { name: 'Khichdi', serving: '1 bowl (250g)', cal: 220, p: 8, c: 36, f: 5, type: 'veg' },
  { name: 'Pav Bhaji', serving: '1 plate', cal: 400, p: 10, c: 52, f: 18, type: 'veg' },
  { name: 'Curd Rice', serving: '1 bowl (250g)', cal: 220, p: 7, c: 34, f: 6, type: 'veg' },
  { name: 'Lassi (Sweet)', serving: '1 glass (250ml)', cal: 180, p: 6, c: 28, f: 5, type: 'veg' },
  // --- Vegan ---
  { name: 'Banana', serving: '1 medium (118g)', cal: 105, p: 1.3, c: 27, f: 0.4, type: 'vegan' },
  { name: 'Apple', serving: '1 medium (182g)', cal: 95, p: 0.5, c: 25, f: 0.3, type: 'vegan' },
  { name: 'Orange', serving: '1 medium (131g)', cal: 62, p: 1.2, c: 15, f: 0.2, type: 'vegan' },
  { name: 'Blueberries', serving: '100g', cal: 57, p: 0.7, c: 14, f: 0.3, type: 'vegan' },
  { name: 'Strawberries', serving: '100g', cal: 32, p: 0.7, c: 7.7, f: 0.3, type: 'vegan' },
  { name: 'Avocado', serving: '1/2 avocado (68g)', cal: 114, p: 1.3, c: 6, f: 10.5, type: 'vegan' },
  { name: 'Sweet Potato', serving: '100g', cal: 86, p: 1.6, c: 20, f: 0.1, type: 'vegan' },
  { name: 'Broccoli', serving: '100g', cal: 34, p: 2.8, c: 7, f: 0.4, type: 'vegan' },
  { name: 'Spinach (Raw)', serving: '100g', cal: 23, p: 2.9, c: 3.6, f: 0.4, type: 'vegan' },
  { name: 'Quinoa (Cooked)', serving: '100g', cal: 120, p: 4.4, c: 21, f: 1.9, type: 'vegan' },
  { name: 'Tofu', serving: '100g', cal: 76, p: 8, c: 1.9, f: 4.8, type: 'vegan' },
  { name: 'Lentils (Cooked)', serving: '100g', cal: 116, p: 9, c: 20, f: 0.4, type: 'vegan' },
  { name: 'Chickpeas (Cooked)', serving: '100g', cal: 164, p: 8.9, c: 27, f: 2.6, type: 'vegan' },
  { name: 'Almonds', serving: '28g (1 oz)', cal: 164, p: 6, c: 6, f: 14, type: 'vegan' },
  { name: 'Peanut Butter', serving: '2 tbsp (32g)', cal: 188, p: 8, c: 6, f: 16, type: 'vegan' },
  { name: 'Olive Oil', serving: '1 tbsp (14g)', cal: 119, p: 0, c: 0, f: 14, type: 'vegan' },
  { name: 'Hummus', serving: '2 tbsp (30g)', cal: 70, p: 2, c: 4, f: 5, type: 'vegan' },
  { name: 'Honey', serving: '1 tbsp (21g)', cal: 64, p: 0.1, c: 17, f: 0, type: 'vegan' },
  { name: 'Dark Chocolate (70%)', serving: '30g', cal: 170, p: 2.2, c: 13, f: 12, type: 'vegan' },
  { name: 'Smoothie Bowl', serving: '1 bowl', cal: 290, p: 8, c: 52, f: 6, type: 'vegan' },
  { name: 'Coffee (Black)', serving: '1 cup (240ml)', cal: 2, p: 0.3, c: 0, f: 0, type: 'vegan' },
  // --- Indian Vegan ---
  { name: 'Chana Masala', serving: '1 bowl (200g)', cal: 270, p: 12, c: 38, f: 8, type: 'vegan' },
  { name: 'Baingan Bharta', serving: '1 bowl (200g)', cal: 160, p: 4, c: 16, f: 10, type: 'vegan' },
  { name: 'Aloo Paratha (Oil)', serving: '1 paratha', cal: 300, p: 6, c: 38, f: 14, type: 'vegan' },
  { name: 'Pongal', serving: '1 bowl (200g)', cal: 200, p: 6, c: 32, f: 6, type: 'vegan' },
  { name: 'Vegetable Pulao', serving: '1 plate (250g)', cal: 300, p: 6, c: 50, f: 9, type: 'vegan' },
  { name: 'Moong Dal (Cooked)', serving: '1 bowl (200g)', cal: 180, p: 14, c: 26, f: 2, type: 'vegan' },
  { name: 'Coconut Chutney', serving: '2 tbsp (40g)', cal: 60, p: 1, c: 4, f: 5, type: 'vegan' },
  { name: 'Sambhar', serving: '1 bowl (200g)', cal: 130, p: 6, c: 20, f: 3, type: 'vegan' },
];

const DEFAULT_MEALS = {
  breakfast: [],
  lunch: [],
  dinner: [],
  snacks: [],
};

function getMeals() { return Store.getData('meals', DEFAULT_MEALS); }
function setMeals(m) { Store.setData('meals', m); }

// --- Meal Plan Generator ---
function generateMealPlan(dietPref, goalKey) {
  const goal = FITNESS_GOALS[goalKey] || FITNESS_GOALS['maintenance'];
  const calTarget = goal.cal;
  const filtered = dietPref === 'all' ? FOOD_DB : FOOD_DB.filter(f => f.type === dietPref || (dietPref === 'veg' && f.type === 'vegan'));
  const pick = (arr, n) => { const s = [...arr].sort(() => Math.random() - 0.5); return s.slice(0, n); };
  const bfFoods = filtered.filter(f => f.cal < 300);
  const mainFoods = filtered.filter(f => f.cal >= 150 && f.cal <= 500);
  const snackFoods = filtered.filter(f => f.cal < 250);
  return {
    breakfast: pick(bfFoods.length ? bfFoods : filtered, 2).map(f => ({ ...f, servings: 1 })),
    lunch: pick(mainFoods.length ? mainFoods : filtered, 2).map(f => ({ ...f, servings: 1 })),
    dinner: pick(mainFoods.length ? mainFoods : filtered, 2).map(f => ({ ...f, servings: 1 })),
    snacks: pick(snackFoods.length ? snackFoods : filtered, 1).map(f => ({ ...f, servings: 1 })),
    calTarget,
  };
}

function calcMealTotals(items) {
  return items.reduce((t, i) => {
    const s = i.servings || 1;
    t.cal += Math.round(i.cal * s);
    t.p += Math.round(i.p * s);
    t.c += Math.round(i.c * s);
    t.f += Math.round(i.f * s);
    return t;
  }, { cal: 0, p: 0, c: 0, f: 0 });
}

// ============================================
// FITNESS GOALS SYSTEM
// ============================================
const FITNESS_GOALS = {
  weight_loss: {
    name: 'Weight Loss', emoji: '🔥', desc: 'Caloric deficit, high protein',
    cal: 2000, p: 160, c: 180, f: 60,
    dietTip: 'Focus on <strong>lean proteins</strong> (chicken, fish, egg whites) and <strong>high-fiber veggies</strong>. Eat smaller, frequent meals. Avoid sugary drinks and processed carbs.',
    workoutTip: 'Combine <strong>strength training 3x/week</strong> with <strong>cardio HIIT 2-3x/week</strong>. 30 min sessions. Focus on compound movements (squats, deadlifts, bench).',
    schedule: ['Full Body','Cardio HIIT','Rest Day','Upper Body Power','Cardio HIIT','Lower Body Power','Rest Day'],
  },
  muscle_gain: {
    name: 'Muscle Gain', emoji: '💪', desc: 'Caloric surplus, high protein & carbs',
    cal: 3200, p: 200, c: 350, f: 90,
    dietTip: 'Eat in a <strong>300-500 cal surplus</strong>. Prioritize post-workout meals with <strong>fast carbs + whey protein</strong>. Eat 5-6 meals daily with emphasis on whole foods.',
    workoutTip: 'Follow a <strong>Push/Pull/Legs split</strong> 6 days/week. Progressive overload with <strong>heavy compound lifts</strong>. Rest 2-3 min between sets. Target 8-12 reps for hypertrophy.',
    schedule: ['Push Day','Pull Day','Leg Day','Push Day','Pull Day','Leg Day','Rest Day'],
  },
  strength: {
    name: 'Strength Build', emoji: '🏋️', desc: 'Power-focused, moderate surplus',
    cal: 3000, p: 180, c: 300, f: 85,
    dietTip: 'Moderate surplus with emphasis on <strong>complex carbs</strong> (oats, rice, sweet potato) for energy. High protein for recovery. Include <strong>creatine supplementation</strong>.',
    workoutTip: 'Focus on the <strong>big 3: Squat, Bench, Deadlift</strong>. Train 4x/week with <strong>heavy weights (3-5 reps)</strong>. Emphasis on progressive overload and proper rest (3-5 min between sets).',
    schedule: ['Upper Body Power','Lower Body Power','Rest Day','Upper Body Hypertrophy','Lower Body Hypertrophy','Rest Day','Rest Day'],
  },
  lean_body: {
    name: 'Lean Body', emoji: '⚡', desc: 'Recomp, balanced macros',
    cal: 2400, p: 170, c: 220, f: 70,
    dietTip: 'Eat at <strong>maintenance or slight deficit</strong>. Cycle carbs — higher on training days, lower on rest days. Focus on <strong>clean, whole foods</strong> and time meals around workouts.',
    workoutTip: 'Mix <strong>strength training 4x/week</strong> with <strong>steady-state cardio 2x/week</strong>. Include <strong>core work and mobility</strong>. Maintain intensity while managing fatigue.',
    schedule: ['Upper Body Power','Cardio HIIT','Lower Body Power','Rest Day','Full Body','Yoga & Mobility','Rest Day'],
  },
  competition: {
    name: 'Competition Prep', emoji: '🏆', desc: 'Extreme cut, precise macros',
    cal: 1800, p: 220, c: 140, f: 50,
    dietTip: 'Strict tracking required. <strong>Very high protein</strong> to preserve muscle. Reduce carbs progressively. Peak week involves <strong>carb loading and water manipulation</strong>. Supplement with BCAAs.',
    workoutTip: 'High-volume training <strong>6 days/week</strong> with <strong>fasted morning cardio</strong>. Reduce rest times. Add posing practice. Monitor energy levels closely.',
    schedule: ['Chest & Triceps','Back & Biceps','Leg Day','Arms & Shoulders','Cardio HIIT','Full Body','Rest Day'],
  },
  maintenance: {
    name: 'Stay Fit', emoji: '🧘', desc: 'Maintain weight, balanced lifestyle',
    cal: 2800, p: 150, c: 280, f: 80,
    dietTip: 'Eat at <strong>maintenance calories</strong>. Balanced macro split. Allow <strong>flexible dieting</strong> — 80% whole foods, 20% whatever you enjoy. Stay hydrated and consistent.',
    workoutTip: 'Train <strong>3-4x/week</strong> with a mix of <strong>strength, cardio, and mobility work</strong>. Focus on enjoyment and sustainability. Include active hobbies like hiking or sports.',
    schedule: ['Upper Body Power','Cardio HIIT','Rest Day','Lower Body Power','Active Recovery','Rest Day','Rest Day'],
  },
};

function getSelectedGoal() { return Store.getData('fitness_goal', 'maintenance'); }
function setSelectedGoal(g) { Store.setData('fitness_goal', g); }

// Auto-apply workout schedule when goal changes
function applyGoalSchedule(goalKey) {
  const g = FITNESS_GOALS[goalKey];
  if (!g || !g.schedule) return;
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const typeMap = {
    'Upper Body Power': { type: 'Chest, Shoulders, Triceps', duration: '55 min' },
    'Lower Body Power': { type: 'Quads, Hamstrings, Glutes', duration: '50 min' },
    'Upper Body Hypertrophy': { type: 'Back, Biceps, Rear Delts', duration: '50 min' },
    'Lower Body Hypertrophy': { type: 'Legs & Calves', duration: '45 min' },
    'Push Day': { type: 'Chest, Shoulders, Triceps', duration: '50 min' },
    'Pull Day': { type: 'Back, Biceps, Rear Delts', duration: '50 min' },
    'Leg Day': { type: 'Quads, Hamstrings, Glutes, Calves', duration: '55 min' },
    'Full Body': { type: 'All Major Muscle Groups', duration: '60 min' },
    'Cardio HIIT': { type: 'Interval Training', duration: '25 min' },
    'Active Recovery': { type: 'Active Recovery / Stretching', duration: '20 min' },
    'Yoga & Mobility': { type: 'Flexibility & Balance', duration: '30 min' },
    'Core & Abs': { type: 'Core Stability & Abs', duration: '25 min' },
    'Arms & Shoulders': { type: 'Biceps, Triceps, Delts', duration: '40 min' },
    'Back & Biceps': { type: 'Pull Muscles', duration: '45 min' },
    'Chest & Triceps': { type: 'Push Muscles', duration: '45 min' },
    'Rest Day': { type: 'Full Rest', duration: '—' },
  };
  const newSched = g.schedule.map((workout, i) => {
    const meta = typeMap[workout] || { type: workout, duration: '45 min' };
    return { day: dayNames[i], workout, type: meta.type, duration: meta.duration };
  });
  setSchedule(newSched);
}

// --- Diet Preference ---
function getDietPref() { return Store.getData('diet_pref', 'all'); }
function setDietPref(p) { Store.setData('diet_pref', p); }

const DIET_PREF_CONFIG = {
  all:    { label: 'All', icon: '🍽️', color: 'var(--primary)', desc: 'Show all food options' },
  veg:    { label: 'Veg', icon: '🥬', color: '#22c55e', desc: 'Vegetarian (includes dairy)' },
  nonveg: { label: 'Non-Veg', icon: '🍗', color: '#ef4444', desc: 'Non-vegetarian foods' },
  vegan:  { label: 'Vegan', icon: '🌱', color: '#16a34a', desc: 'Plant-based only' },
};

// Suggested foods per diet preference (curated Indian-focused top picks)
const DIET_SUGGESTIONS = {
  veg: [
    { name: 'Paneer Tikka', reason: 'High protein Indian favourite', cal: 280, p: 18, icon: '🧀' },
    { name: 'Palak Paneer', reason: 'Iron + protein combo', cal: 320, p: 16, icon: '🥬' },
    { name: 'Dal Makhani', reason: 'Protein-rich comfort food', cal: 280, p: 14, icon: '🍲' },
    { name: 'Chole (Chickpea Curry)', reason: 'Fibre & protein packed', cal: 280, p: 12, icon: '🫘' },
    { name: 'Rajma (Kidney Bean Curry)', reason: 'North Indian staple protein', cal: 260, p: 14, icon: '🍛' },
    { name: 'Idli', reason: 'Light & easy to digest', cal: 130, p: 4, icon: '🫓' },
    { name: 'Dosa (Plain)', reason: 'South Indian classic', cal: 168, p: 4, icon: '🥞' },
    { name: 'Khichdi', reason: 'Comfort food with dal & rice', cal: 220, p: 8, icon: '🍚' },
    { name: 'Raita (Curd)', reason: 'Probiotic & cooling', cal: 90, p: 5, icon: '🥛' },
    { name: 'Whey Protein Shake', reason: 'Quick post-workout fuel', cal: 120, p: 24, icon: '🥤' },
  ],
  nonveg: [
    { name: 'Tandoori Chicken', reason: 'High protein, low carb', cal: 260, p: 36, icon: '🔥' },
    { name: 'Chicken Tikka', reason: 'Lean grilled protein', cal: 220, p: 30, icon: '🍗' },
    { name: 'Chicken Biryani', reason: 'Complete Indian meal', cal: 490, p: 24, icon: '🍚' },
    { name: 'Butter Chicken', reason: 'India\'s favourite curry', cal: 438, p: 28, icon: '🍛' },
    { name: 'Egg Curry', reason: 'Budget protein meal', cal: 240, p: 14, icon: '🥚' },
    { name: 'Fish Curry', reason: 'Omega-rich Indian style', cal: 280, p: 22, icon: '🐟' },
    { name: 'Keema (Minced Meat)', reason: 'High protein mince', cal: 380, p: 28, icon: '🥘' },
    { name: 'Mutton Rogan Josh', reason: 'Rich Kashmiri classic', cal: 420, p: 26, icon: '🍖' },
    { name: 'Chicken Breast (Grilled)', reason: 'Lean protein king', cal: 165, p: 31, icon: '💪' },
    { name: 'Scrambled Eggs', reason: 'Quick breakfast protein', cal: 182, p: 12, icon: '🍳' },
  ],
  vegan: [
    { name: 'Chana Masala', reason: 'Protein-rich Indian classic', cal: 270, p: 12, icon: '🫘' },
    { name: 'Moong Dal (Cooked)', reason: 'Light & high protein dal', cal: 180, p: 14, icon: '🍲' },
    { name: 'Sambhar', reason: 'South Indian lentil stew', cal: 130, p: 6, icon: '🥣' },
    { name: 'Baingan Bharta', reason: 'Smoky roasted eggplant', cal: 160, p: 4, icon: '🍆' },
    { name: 'Vegetable Pulao', reason: 'Fragrant rice dish', cal: 300, p: 6, icon: '🍚' },
    { name: 'Aloo Paratha (Oil)', reason: 'Filling breakfast option', cal: 300, p: 6, icon: '🫓' },
    { name: 'Pongal', reason: 'South Indian comfort food', cal: 200, p: 6, icon: '🍛' },
    { name: 'Tofu', reason: 'Plant protein staple', cal: 76, p: 8, icon: '🧊' },
    { name: 'Lentils (Cooked)', reason: 'Fibre + protein powerhouse', cal: 116, p: 9, icon: '🌾' },
    { name: 'Peanut Butter', reason: 'Calorie-dense fuel', cal: 188, p: 8, icon: '🥜' },
  ],
};

// ============================================
// PAGE: Diet Tracker
// ============================================
function renderDiet() {
  const meals = getMeals();
  const goalKey = getSelectedGoal();
  const goal = FITNESS_GOALS[goalKey];
  const calGoal = goal.cal;
  const proteinGoal = goal.p;
  const carbsGoal = goal.c;
  const fatsGoal = goal.f;

  const allTotals = { cal: 0, p: 0, c: 0, f: 0 };
  for (const key in meals) {
    const t = calcMealTotals(meals[key]);
    allTotals.cal += t.cal; allTotals.p += t.p; allTotals.c += t.c; allTotals.f += t.f;
  }
  const calRemaining = Math.max(0, calGoal - allTotals.cal);
  const calPct = Math.min(100, Math.round((allTotals.cal / calGoal) * 100));
  const pPct = Math.min(100, Math.round((allTotals.p / proteinGoal) * 100));
  const cPct = Math.min(100, Math.round((allTotals.c / carbsGoal) * 100));
  const fPct = Math.min(100, Math.round((allTotals.f / fatsGoal) * 100));

  const mealConfig = [
    { key: 'breakfast', label: 'Breakfast', icon: '☀️', iconBg: 'rgba(107,255,143,0.1)', iconColor: 'var(--primary)' },
    { key: 'lunch', label: 'Lunch', icon: '🌤️', iconBg: 'rgba(97,194,255,0.1)', iconColor: 'var(--tertiary)' },
    { key: 'dinner', label: 'Dinner', icon: '🌙', iconBg: 'rgba(213,227,253,0.1)', iconColor: 'var(--secondary)' },
    { key: 'snacks', label: 'Snacks', icon: '🍎', iconBg: 'rgba(255,115,81,0.1)', iconColor: 'var(--error)' },
  ];

  function renderMealCard(cfg) {
    const items = meals[cfg.key] || [];
    const totals = calcMealTotals(items);
    const hasItems = items.length > 0;
    return `<div class="meal-card">
      <div class="meal-header">
        <div class="meal-header-left">
          <div class="meal-icon" style="background:${cfg.iconBg};color:${cfg.iconColor}">${cfg.icon}</div>
          <div>
            <div class="title-sm">${cfg.label}</div>
            <div class="body-sm text-surface-variant">${hasItems ? totals.cal + ' kcal' : 'No entries yet'}</div>
          </div>
        </div>
        <button class="btn-ghost add-meal-btn" data-meal="${cfg.key}" style="font-size:0.75rem">+ Add</button>
      </div>
      <div class="meal-items">
        ${hasItems ? items.map((item, idx) => {
          const s = item.servings || 1;
          return `<div class="swipe-meal-wrapper" data-meal="${cfg.key}" data-idx="${idx}">
            <div class="swipe-actions-bg">
              <button class="swipe-action-edit" data-meal="${cfg.key}" data-idx="${idx}"><span class="material-symbols-rounded" style="font-size:18px">edit</span></button>
              <button class="swipe-action-delete" data-meal="${cfg.key}" data-idx="${idx}"><span class="material-symbols-rounded" style="font-size:18px">delete</span></button>
            </div>
            <div class="meal-item swipe-meal-content">
              <div class="meal-item-info">
                <h4>${item.name}</h4>
                <p>${s !== 1 ? s + 'x ' : ''}${item.serving}</p>
              </div>
              <div style="display:flex;align-items:center;gap:var(--spacing-2)">
                <div class="meal-item-macros">
                  <div class="kcal">${Math.round(item.cal * s)} kcal</div>
                  <div>P: ${Math.round(item.p * s)}g / C: ${Math.round(item.c * s)}g / F: ${Math.round(item.f * s)}g</div>
                </div>
                <button class="ami-remove remove-food-btn" data-meal="${cfg.key}" data-idx="${idx}">
                  <span class="material-symbols-rounded" style="font-size:14px">close</span>
                </button>
              </div>
            </div>
          </div>`;
        }).join('') : `<p class="body-sm text-surface-variant" style="text-align:center;padding:var(--spacing-4)">Tap + Add to log your ${cfg.label.toLowerCase()}</p>`}
      </div>
    </div>`;
  }

  app().innerHTML = `
    ${topBar('KINETIC')}
    <div class="page-content stagger">
      <h1 class="headline-lg" style="margin-bottom:var(--spacing-2)">Fueling Progress</h1>
      <p class="body-md text-surface-variant" style="margin-bottom:var(--spacing-6)">Track every nutrient to power your goals.</p>

      <!-- Diet Preference Selector -->
      <div class="diet-pref-bar">
        ${Object.entries(DIET_PREF_CONFIG).map(([key, cfg]) => `
          <button class="diet-pref-chip ${key === getDietPref() ? 'diet-pref-active' : ''}" data-pref="${key}" style="${key === getDietPref() ? `--chip-color:${cfg.color}` : ''}">
            <span class="diet-pref-icon">${cfg.icon}</span>
            <span>${cfg.label}</span>
          </button>
        `).join('')}
      </div>

      ${getDietPref() !== 'all' ? `
      <!-- Diet Suggestions Based on Preference -->
      <div class="diet-sug-section">
        <div class="diet-sug-header">
          <span class="diet-sug-badge" style="background:${DIET_PREF_CONFIG[getDietPref()].color}20;color:${DIET_PREF_CONFIG[getDietPref()].color}">
            ${DIET_PREF_CONFIG[getDietPref()].icon} ${DIET_PREF_CONFIG[getDietPref()].label} Picks
          </span>
          <span class="body-sm text-surface-variant">Quick add to your meals</span>
        </div>
        <div class="diet-sug-scroll">
          ${(DIET_SUGGESTIONS[getDietPref()] || []).map(s => `
            <div class="diet-sug-card" data-sug-name="${s.name}">
              <div class="diet-sug-emoji">${s.icon}</div>
              <div class="diet-sug-name">${s.name}</div>
              <div class="diet-sug-reason">${s.reason}</div>
              <div class="diet-sug-meta">${s.cal} kcal • ${s.p}g protein</div>
              <button class="diet-sug-add" data-sug-name="${s.name}">+ Add</button>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Fitness Goal Selector -->
      <div class="section-header"><h3 class="section-title">Your Goal</h3></div>
      <div class="goal-grid">
        ${Object.entries(FITNESS_GOALS).map(([key, g]) => `
          <div class="goal-card ${key === goalKey ? 'active' : ''}" data-goal="${key}">
            <div class="goal-check"><span class="material-symbols-rounded" style="font-size:12px">check</span></div>
            <span class="goal-emoji">${g.emoji}</span>
            <div class="goal-name">${g.name}</div>
            <div class="goal-desc">${g.desc}</div>
          </div>
        `).join('')}
      </div>

      <!-- Calorie Ring -->
      <div style="text-align:center;margin-bottom:var(--spacing-6)">
        <div class="progress-ring-container" style="display:inline-block">
          ${createSVGRing(160, 10, calPct)}
          <div class="ring-center-text" style="top:50%;left:50%;transform:translate(-50%,-50%)">
            <div class="headline-md text-primary">${calRemaining.toLocaleString()}</div>
            <div class="label-sm text-surface-variant">KCAL LEFT</div>
          </div>
        </div>
      </div>

      <!-- Macro Row -->
      <div class="macro-row" style="margin-bottom:var(--spacing-8)">
        <div class="macro-pill">
          <div style="margin-bottom:var(--spacing-2)">${createSVGRing(40, 3, pPct)}</div>
          <div class="macro-val text-primary">${allTotals.p}g</div>
          <div class="macro-lbl">Protein</div>
          <div class="body-sm text-surface-variant">Goal: ${proteinGoal}g</div>
        </div>
        <div class="macro-pill">
          <div style="margin-bottom:var(--spacing-2)">${createSVGRing(40, 3, cPct, 'var(--tertiary)')}</div>
          <div class="macro-val text-tertiary">${allTotals.c}g</div>
          <div class="macro-lbl">Carbs</div>
          <div class="body-sm text-surface-variant">Goal: ${carbsGoal}g</div>
        </div>
        <div class="macro-pill">
          <div style="margin-bottom:var(--spacing-2)">${createSVGRing(40, 3, fPct, 'var(--secondary)')}</div>
          <div class="macro-val" style="color:var(--secondary)">${allTotals.f}g</div>
          <div class="macro-lbl">Fats</div>
          <div class="body-sm text-surface-variant">Goal: ${fatsGoal}g</div>
        </div>
      </div>

      <!-- Daily Total -->
      <div class="cal-total-bar">
        <span class="total-label">Total Consumed</span>
        <span class="total-value">${allTotals.cal.toLocaleString()} kcal</span>
      </div>

      <!-- Auto Meal Plan -->
      <div class="section-header">
        <h3 class="section-title">Suggested Meal Plan</h3>
        <button class="section-action" id="gen-meal-plan" style="cursor:pointer">
          <span class="material-symbols-rounded" style="font-size:16px">autorenew</span> Generate
        </button>
      </div>
      ${(() => {
        const plan = Store.getData('meal_plan', null);
        if (!plan) return `<div class="surface-card" style="text-align:center;padding:var(--spacing-5);margin-bottom:var(--spacing-6)">
          <span class="material-symbols-rounded text-surface-variant" style="font-size:32px;margin-bottom:var(--spacing-2)">auto_awesome</span>
          <p class="body-sm text-surface-variant">Tap "Generate" to create a personalized daily meal plan based on your diet preference and fitness goal.</p>
        </div>`;
        const planMeals = [
          { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
          { key: 'lunch', label: 'Lunch', icon: '☀️' },
          { key: 'dinner', label: 'Dinner', icon: '🌙' },
          { key: 'snacks', label: 'Snacks', icon: '🍎' },
        ];
        let totalCal = 0;
        const cards = planMeals.map(pm => {
          const items = plan[pm.key] || [];
          const cal = items.reduce((s, i) => s + Math.round(i.cal * (i.servings || 1)), 0);
          totalCal += cal;
          return `<div class="meal-plan-card">
            <div style="display:flex;align-items:center;gap:var(--spacing-2);margin-bottom:var(--spacing-2)">
              <span>${pm.icon}</span>
              <span class="title-sm">${pm.label}</span>
              <span class="body-sm text-primary" style="margin-left:auto;font-weight:700">${cal} kcal</span>
            </div>
            ${items.map(i => `<div class="body-sm text-surface-variant" style="padding-left:28px">${i.name} <span style="opacity:0.6">(${i.cal} kcal)</span></div>`).join('')}
          </div>`;
        }).join('');
        return `<div class="surface-card" style="margin-bottom:var(--spacing-4)">${cards}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:var(--spacing-3);padding-top:var(--spacing-3);border-top:1px solid var(--surface-variant)">
            <span class="label-sm text-surface-variant">TOTAL</span>
            <span class="title-sm text-primary">${totalCal} kcal</span>
          </div>
        </div>
        <button class="btn-secondary" id="apply-meal-plan" style="margin-bottom:var(--spacing-6)">
          <span class="material-symbols-rounded" style="font-size:18px">playlist_add</span>
          Apply Plan to Today's Log
        </button>`;
      })()}

      <!-- Meals -->
      <div class="section-header"><h3 class="section-title">Daily Fuel Log</h3></div>
      ${mealConfig.map(cfg => renderMealCard(cfg)).join('')}

      <!-- Personalized Suggestions -->
      <div class="section-header" style="margin-top:var(--spacing-4)"><h3 class="section-title">${goal.name} Guide</h3></div>
      <div class="suggestion-card">
        <div class="sug-header">
          <div class="sug-icon" style="background:rgba(107,255,143,0.1)">🥗</div>
          <div><div class="sug-title">Diet Strategy</div><div class="sug-sub">${calGoal.toLocaleString()} kcal / day target</div></div>
        </div>
        <div class="sug-body">${goal.dietTip}</div>
      </div>
      <div class="suggestion-card">
        <div class="sug-header">
          <div class="sug-icon" style="background:rgba(97,194,255,0.1)">🏋️</div>
          <div><div class="sug-title">Workout Strategy</div><div class="sug-sub">Matched to ${goal.name}</div></div>
        </div>
        <div class="sug-body">${goal.workoutTip}</div>
      </div>
    </div>
    ${bottomNav('diet')}
  `;
  bindNav();

  // Generate Meal Plan
  $('#gen-meal-plan')?.addEventListener('click', () => {
    const plan = generateMealPlan(getDietPref(), getSelectedGoal());
    Store.setData('meal_plan', plan);
    renderDiet();
  });
  // Apply Meal Plan to today's log
  $('#apply-meal-plan')?.addEventListener('click', () => {
    const plan = Store.getData('meal_plan', null);
    if (!plan) return;
    const m = getMeals();
    ['breakfast','lunch','dinner','snacks'].forEach(k => {
      (plan[k] || []).forEach(item => m[k].push({ ...item }));
    });
    setMeals(m);
    checkGoalNotifications();
    const btn = $('#apply-meal-plan');
    if (btn) { btn.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px">check_circle</span> Applied!'; btn.style.color = 'var(--primary)'; }
    setTimeout(() => renderDiet(), 1000);
  });

  // Diet preference chips
  $$('.diet-pref-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      setDietPref(chip.dataset.pref);
      renderDiet();
    });
  });

  // Diet suggestion quick-add buttons
  $$('.diet-sug-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const foodName = btn.dataset.sugName;
      const food = FOOD_DB.find(f => f.name === foodName);
      if (food) {
        openAddMealModal('snacks', food);
      }
    });
  });

  // Diet suggestion card clicks (open modal with that food pre-selected category)
  $$('.diet-sug-card').forEach(card => {
    card.addEventListener('click', () => {
      const foodName = card.dataset.sugName;
      openAddMealModal('snacks', FOOD_DB.find(f => f.name === foodName));
    });
  });

  // Bind add meal buttons
  $$('.add-meal-btn').forEach(btn => {
    btn.addEventListener('click', () => openAddMealModal(btn.dataset.meal));
  });

  // Swipe-to-delete/edit gesture on meal items
  $$('.swipe-meal-wrapper').forEach(wrapper => {
    let startX = 0, currentX = 0, isDragging = false;
    const content = wrapper.querySelector('.swipe-meal-content');
    content.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
      content.style.transition = 'none';
    }, { passive: true });
    content.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      currentX = e.touches[0].clientX - startX;
      if (currentX > 0) currentX = 0; // only swipe left
      currentX = Math.max(currentX, -130);
      content.style.transform = `translateX(${currentX}px)`;
    }, { passive: true });
    content.addEventListener('touchend', () => {
      isDragging = false;
      content.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.2,1)';
      if (currentX < -60) {
        content.style.transform = 'translateX(-120px)';
      } else {
        content.style.transform = 'translateX(0)';
      }
      currentX = 0;
    });
  });
  // Cross button delete (always visible)
  $$('.remove-food-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mealKey = btn.dataset.meal;
      const idx = parseInt(btn.dataset.idx);
      const m = getMeals();
      m[mealKey].splice(idx, 1);
      setMeals(m);
      checkGoalNotifications();
      renderDiet();
    });
  });
  // Swipe delete action
  $$('.swipe-action-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const mealKey = btn.dataset.meal;
      const idx = parseInt(btn.dataset.idx);
      const m = getMeals();
      m[mealKey].splice(idx, 1);
      setMeals(m);
      checkGoalNotifications();
      renderDiet();
    });
  });
  // Swipe edit action — open modal to change servings
  $$('.swipe-action-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const mealKey = btn.dataset.meal;
      const idx = parseInt(btn.dataset.idx);
      const m = getMeals();
      const item = m[mealKey][idx];
      if (!item) return;
      const newServings = prompt(`Edit servings for ${item.name}:`, item.servings || 1);
      if (newServings !== null && !isNaN(parseFloat(newServings)) && parseFloat(newServings) > 0) {
        m[mealKey][idx].servings = parseFloat(newServings);
        setMeals(m);
        checkGoalNotifications();
        renderDiet();
      }
    });
  });

  // Goal selection — auto-applies workout schedule
  $$('.goal-card').forEach(card => {
    card.addEventListener('click', () => {
      const newGoal = card.dataset.goal;
      setSelectedGoal(newGoal);
      applyGoalSchedule(newGoal);
      showGoalToast(FITNESS_GOALS[newGoal].name, 'Goal & workout schedule updated', FITNESS_GOALS[newGoal].emoji);
      renderDiet();
    });
  });

}

// --- Add Meal Modal ---
function openAddMealModal(mealKey, preSelectedFood) {
  const dietPref = getDietPref();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'meal-modal';
  overlay.innerHTML = `
    <div class="modal-sheet" style="position:relative">
      <div class="modal-handle"></div>
      <button class="modal-close-btn" id="close-meal-modal"><span class="material-symbols-rounded" style="font-size:18px">close</span></button>
      <div class="modal-title">Add to ${mealKey.charAt(0).toUpperCase() + mealKey.slice(1)}</div>

      <!-- Search Bar (larger) -->
      <div style="position:relative;margin-bottom:var(--spacing-3)">
        <span class="material-symbols-rounded text-surface-variant" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:20px">search</span>
        <input type="text" id="food-search" placeholder="Search foods (e.g. dal, paneer, chicken...)" style="width:100%;padding:14px 60px 14px 44px;border-radius:var(--radius-full);border:1px solid var(--surface-variant);background:var(--surface-container);color:var(--on-surface);font-size:0.9375rem"/>
        <button class="btn-icon" id="btn-show-custom" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:34px;height:34px;background:var(--surface-container-high)" title="Add Custom">
          <span class="material-symbols-rounded" style="font-size:18px">edit</span>
        </button>
      </div>

      <!-- Diet Type Filter -->
      <div style="display:flex;gap:var(--spacing-2);margin-bottom:var(--spacing-4);overflow-x:auto" id="food-filters">
        <button class="food-filter-chip ${dietPref === 'all' ? 'active' : ''}" data-filter="all">All</button>
        <button class="food-filter-chip ${dietPref === 'veg' ? 'active' : ''}" data-filter="veg"><span style="color:#22c55e;font-size:10px;margin-right:3px">●</span> Veg</button>
        <button class="food-filter-chip ${dietPref === 'nonveg' ? 'active' : ''}" data-filter="nonveg"><span style="color:#ef4444;font-size:10px;margin-right:3px">●</span> Non-Veg</button>
        <button class="food-filter-chip ${dietPref === 'vegan' ? 'active' : ''}" data-filter="vegan"><span style="color:#16a34a;font-size:10px;margin-right:3px">●</span> Vegan</button>
      </div>

      <!-- Frequent Foods -->
      ${(() => {
        const freqFoods = Store.getFrequentFoods().slice(0, 5);
        if (freqFoods.length === 0) return '';
        return `<div class="freq-foods-section" style="margin-bottom:var(--spacing-3)">
          <div class="label-sm text-surface-variant" style="margin-bottom:var(--spacing-2)">
            <span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle">bolt</span> FREQUENTLY ADDED
          </div>
          <div style="display:flex;gap:var(--spacing-2);overflow-x:auto;padding-bottom:4px">
            ${freqFoods.map(ff => {
              const food = FOOD_DB.find(f => f.name === ff.name);
              if (!food) return '';
              return `<button class="freq-food-chip" data-fname="${ff.name}">${food.name} <span style="opacity:0.6;font-size:0.6rem">${food.cal}cal</span></button>`;
            }).join('')}
          </div>
        </div>`;
      })()}

      <div id="food-results" style="max-height:220px;overflow-y:auto">
        ${FOOD_DB.map((f, i) => `
          <div class="food-result" data-idx="${i}" data-type="${f.type}">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="food-type-dot food-type-${f.type}"></span>
              <div><div class="food-name">${f.name}</div><div class="food-detail">${f.serving} • P:${f.p}g C:${f.c}g F:${f.f}g</div></div>
            </div>
            <span class="food-cal">${f.cal}</span>
          </div>
        `).join('')}
      </div>

      <div id="selected-food-form" style="display:none;margin-top:var(--spacing-5)">
        <div class="surface-card-high" style="margin-bottom:var(--spacing-4)">
          <div class="title-sm" id="sel-food-name" style="margin-bottom:var(--spacing-1)"></div>
          <div class="body-sm text-surface-variant" id="sel-food-serving"></div>
        </div>
        <div class="inline-form">
          <label>Number of Servings</label>
          <input type="number" id="serving-count" value="1" min="0.25" step="0.25"/>
        </div>
        <div class="cal-total-bar" id="cal-preview">
          <span class="total-label">Calculated Calories</span>
          <span class="total-value" id="cal-preview-val">0 kcal</span>
        </div>
        <div class="body-sm text-surface-variant" id="macro-preview" style="text-align:center;margin-bottom:var(--spacing-4)"></div>
        <button class="btn-primary" id="confirm-add-food">
          <span class="material-symbols-rounded">add</span>
          Add to Meal
        </button>
      </div>

      <div id="custom-food-form" style="display:none;margin-top:var(--spacing-2)">
        <div class="inline-form" style="margin-bottom:var(--spacing-2)">
          <label>Food Name</label>
          <input type="text" id="custom-name" placeholder="e.g. My Protein Smoothie" style="width:100%;padding:var(--spacing-2);border-radius:var(--radius-md);border:1px solid var(--surface-variant);background:var(--surface-container);color:var(--on-surface)"/>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--spacing-2);margin-bottom:var(--spacing-2)">
          <div class="inline-form">
            <label>Calories (kcal)</label>
            <input type="number" id="custom-cal" value="0" style="width:100%;padding:var(--spacing-2);border-radius:var(--radius-md);border:1px solid var(--surface-variant);background:var(--surface-container);color:var(--on-surface)"/>
          </div>
          <div class="inline-form">
            <label>Protein (g)</label>
            <input type="number" id="custom-p" value="0" style="width:100%;padding:var(--spacing-2);border-radius:var(--radius-md);border:1px solid var(--surface-variant);background:var(--surface-container);color:var(--on-surface)"/>
          </div>
          <div class="inline-form">
            <label>Carbs (g)</label>
            <input type="number" id="custom-c" value="0" style="width:100%;padding:var(--spacing-2);border-radius:var(--radius-md);border:1px solid var(--surface-variant);background:var(--surface-container);color:var(--on-surface)"/>
          </div>
          <div class="inline-form">
            <label>Fats (g)</label>
            <input type="number" id="custom-f" value="0" style="width:100%;padding:var(--spacing-2);border-radius:var(--radius-md);border:1px solid var(--surface-variant);background:var(--surface-container);color:var(--on-surface)"/>
          </div>
        </div>
        <button class="btn-primary" id="confirm-custom-food" style="margin-top:var(--spacing-4)">
          <span class="material-symbols-rounded">add</span>
          Add Custom Meal
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let selectedFood = null;

  // Close
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); } });
  $('#close-meal-modal').addEventListener('click', () => overlay.remove());

  // Search + Filter
  const searchInput = $('#food-search');
  searchInput.focus();
  let activeFilter = dietPref;

  function filterFoods() {
    const q = searchInput.value.toLowerCase();
    $$('#food-results .food-result').forEach(el => {
      const idx = parseInt(el.dataset.idx);
      const nameMatch = FOOD_DB[idx].name.toLowerCase().includes(q);
      const typeMatch = activeFilter === 'all' || el.dataset.type === activeFilter;
      el.style.display = (nameMatch && typeMatch) ? '' : 'none';
    });
  }

  // Apply initial filter based on diet preference
  filterFoods();
  searchInput.addEventListener('input', filterFoods);

  // Frequent food chip clicks — quick-select from cache
  $$('.freq-food-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const food = FOOD_DB.find(f => f.name === chip.dataset.fname);
      if (food) {
        selectedFood = { ...food };
        $('#selected-food-form').style.display = 'block';
        $('#sel-food-name').textContent = selectedFood.name;
        $('#sel-food-serving').textContent = `Per serving: ${selectedFood.serving}`;
        $('#serving-count').value = '1';
        $('#food-results').style.display = 'none';
        searchInput.style.display = 'none';
      }
    });
  });

  // Filter chips
  $$('.food-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.food-filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      filterFoods();
    });
  });

  // Select food
  $$('#food-results .food-result').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      selectedFood = { ...FOOD_DB[idx] };
      $('#selected-food-form').style.display = 'block';
      $('#sel-food-name').textContent = selectedFood.name;
      $('#sel-food-serving').textContent = `Per serving: ${selectedFood.serving}`;
      $('#serving-count').value = '1';
      updateCalPreview();
      $('#food-results').style.display = 'none';
      searchInput.style.display = 'none';
    });
  });

  function updateCalPreview() {
    const s = parseFloat($('#serving-count').value) || 1;
    const cal = Math.round(selectedFood.cal * s);
    const p = Math.round(selectedFood.p * s);
    const c = Math.round(selectedFood.c * s);
    const f = Math.round(selectedFood.f * s);
    $('#cal-preview-val').textContent = `${cal} kcal`;
    $('#macro-preview').textContent = `Protein: ${p}g • Carbs: ${c}g • Fat: ${f}g`;
  }

  // If a food was pre-selected (from suggestion cards), auto-select it
  if (preSelectedFood) {
    selectedFood = { ...preSelectedFood };
    $('#selected-food-form').style.display = 'block';
    $('#sel-food-name').textContent = selectedFood.name;
    $('#sel-food-serving').textContent = `Per serving: ${selectedFood.serving}`;
    $('#serving-count').value = '1';
    updateCalPreview();
    $('#food-results').style.display = 'none';
    searchInput.style.display = 'none';
    $('#food-filters').style.display = 'none';
  }

  // Listen to serving changes
  setTimeout(() => {
    const servingInput = $('#serving-count');
    if (servingInput) servingInput.addEventListener('input', updateCalPreview);
  }, 50);

  // Confirm add
  setTimeout(() => {
    const confirmBtn = $('#confirm-add-food');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (!selectedFood) return;
        const s = parseFloat($('#serving-count').value) || 1;
        const m = getMeals();
        m[mealKey].push({ ...selectedFood, servings: s });
        setMeals(m);
        Store.trackFoodUsage(selectedFood.name);
        checkGoalNotifications();
        overlay.remove();
        renderDiet();
      });
    }

    // Custom food handlers
    $('#btn-show-custom')?.addEventListener('click', () => {
      $('#food-results').style.display = 'none';
      $('#food-search').style.display = 'none';
      $('#btn-show-custom').style.display = 'none';
      $('#selected-food-form').style.display = 'none';
      $('#custom-food-form').style.display = 'block';
    });

    $('#confirm-custom-food')?.addEventListener('click', () => {
      const name = $('#custom-name').value.trim() || 'Custom Meal';
      const cal = parseFloat($('#custom-cal').value) || 0;
      const p = parseFloat($('#custom-p').value) || 0;
      const c = parseFloat($('#custom-c').value) || 0;
      const f = parseFloat($('#custom-f').value) || 0;
      
      const customFood = { name, serving: '1 Custom serving', cal, p, c, f, servings: 1 };
      
      const m = getMeals();
      m[mealKey].push(customFood);
      setMeals(m);
      checkGoalNotifications();
      overlay.remove();
      renderDiet();
    });

  }, 50);
}

// ============================================
// WORKOUT SCHEDULE DATA
// ============================================
const DEFAULT_SCHEDULE = [
  { day: 'Mon', workout: 'Upper Body Power', type: 'Chest, Shoulders, Triceps', duration: '55 min' },
  { day: 'Tue', workout: 'Lower Body Power', type: 'Quads, Hamstrings, Glutes', duration: '50 min' },
  { day: 'Wed', workout: 'Rest Day', type: 'Active Recovery / Stretching', duration: '20 min' },
  { day: 'Thu', workout: 'Upper Body Hypertrophy', type: 'Back, Biceps, Rear Delts', duration: '50 min' },
  { day: 'Fri', workout: 'Lower Body Hypertrophy', type: 'Legs & Calves', duration: '45 min' },
  { day: 'Sat', workout: 'Cardio HIIT', type: 'Interval Training', duration: '25 min' },
  { day: 'Sun', workout: 'Rest Day', type: 'Full Rest', duration: '—' },
];

const WORKOUT_OPTIONS = [
  'Upper Body Power', 'Lower Body Power', 'Upper Body Hypertrophy', 'Lower Body Hypertrophy',
  'Push Day', 'Pull Day', 'Leg Day', 'Full Body', 'Cardio HIIT', 'Active Recovery',
  'Yoga & Mobility', 'Core & Abs', 'Arms & Shoulders', 'Back & Biceps',
  'Chest & Triceps', 'Rest Day',
];

function getSchedule() { return Store.getData('workout_schedule', DEFAULT_SCHEDULE); }
function setSchedule(s) { Store.setData('workout_schedule', s); }

const WORKOUT_EXERCISES = {
  'Lower Body Power': [
    { name: 'Barbell Back Squat', tag: 'Compound • Quadriceps focus', badge: 'PR Zone',
      sets: [{ w: '100 kg', r: '8 reps', done: true },{ w: '110 kg', r: '6 reps', done: true },{ w: '120 kg', r: '5 reps', done: true },{ w: '125 kg', r: '4 reps', done: false }]
    },
    { name: 'Leg Press', tag: 'Machine • Quadriceps',
      sets: [{ w: '180 kg', r: '12 reps', done: true },{ w: '200 kg', r: '10 reps', done: true },{ w: '220 kg', r: '8 reps', done: false }]
    },
    { name: 'Romanian Deadlift', tag: 'Compound • Hamstrings & Glutes',
      sets: [{ w: '80 kg', r: '10 reps', done: false },{ w: '90 kg', r: '8 reps', done: false },{ w: '95 kg', r: '8 reps', done: false }]
    },
    { name: 'Walking Lunges', tag: 'Compound • Full Leg',
      sets: [{ w: '20 kg DBs', r: '12/leg', done: false },{ w: '22 kg DBs', r: '10/leg', done: false },{ w: '24 kg DBs', r: '10/leg', done: false }]
    },
  ],
  'Upper Body Power': [
    { name: 'Barbell Bench Press', tag: 'Compound • Chest focus', badge: 'Strength',
      sets: [{ w: '80 kg', r: '8 reps', done: false },{ w: '90 kg', r: '6 reps', done: false },{ w: '95 kg', r: '5 reps', done: false },{ w: '100 kg', r: '3 reps', done: false }]
    },
    { name: 'Overhead Press', tag: 'Compound • Shoulders',
      sets: [{ w: '50 kg', r: '8 reps', done: false },{ w: '55 kg', r: '6 reps', done: false },{ w: '60 kg', r: '5 reps', done: false }]
    },
    { name: 'Barbell Row', tag: 'Compound • Back',
      sets: [{ w: '70 kg', r: '8 reps', done: false },{ w: '80 kg', r: '6 reps', done: false },{ w: '85 kg', r: '6 reps', done: false }]
    },
  ],
  'Upper Body Hypertrophy': [
    { name: 'Incline Dumbbell Press', tag: 'Dumbbell • Upper Chest', sets: [{ w: '30 kg DBs', r: '10 reps', done: false },{ w: '32 kg DBs', r: '8 reps', done: false },{ w: '32 kg DBs', r: '8 reps', done: false }] },
    { name: 'Pull Ups', tag: 'Bodyweight • Lats', sets: [{ w: 'Bodyweight', r: '10 reps', done: false },{ w: 'Bodyweight', r: '10 reps', done: false },{ w: 'Bodyweight', r: '8 reps', done: false }] },
    { name: 'Cable Crossovers', tag: 'Cables • Outer Chest', sets: [{ w: '15 kg', r: '15 reps', done: false },{ w: '17.5 kg', r: '12 reps', done: false }] },
  ],
  'Lower Body Hypertrophy': [
    { name: 'Leg Extensions', tag: 'Machine • Quadriceps Isolation', sets: [{ w: '60 kg', r: '15 reps', done: false },{ w: '65 kg', r: '12 reps', done: false },{ w: '70 kg', r: '10 reps', done: false }] },
    { name: 'Lying Leg Curls', tag: 'Machine • Hamstrings Isol.', sets: [{ w: '45 kg', r: '15 reps', done: false },{ w: '50 kg', r: '12 reps', done: false },{ w: '55 kg', r: '10 reps', done: false }] },
    { name: 'Calf Raises', tag: 'Machine • Calves', sets: [{ w: '80 kg', r: '20 reps', done: false },{ w: '90 kg', r: '15 reps', done: false },{ w: '100 kg', r: '12 reps', done: false }] },
  ],
  'Cardio HIIT': [
    { name: 'Treadmill Sprints', tag: 'Cardio • Intervals', sets: [{ w: 'Level 14', r: '30 sec', done: false },{ w: 'Level 14', r: '30 sec', done: false },{ w: 'Level 15', r: '30 sec', done: false }] },
    { name: 'Jump Rope', tag: 'Cardio • Agility', sets: [{ w: '-', r: '2 min', done: false },{ w: '-', r: '2 min', done: false },{ w: '-', r: '2 min', done: false }] },
  ],
  'Full Body': [
    { name: 'Barbell Back Squat', tag: 'Compound • Legs', sets: [{ w: '80 kg', r: '10 reps', done: false },{ w: '85 kg', r: '8 reps', done: false },{ w: '90 kg', r: '6 reps', done: false }] },
    { name: 'Barbell Bench Press', tag: 'Compound • Chest', sets: [{ w: '70 kg', r: '10 reps', done: false },{ w: '75 kg', r: '8 reps', done: false },{ w: '80 kg', r: '6 reps', done: false }] },
    { name: 'Barbell Row', tag: 'Compound • Back', sets: [{ w: '60 kg', r: '10 reps', done: false },{ w: '65 kg', r: '8 reps', done: false },{ w: '70 kg', r: '6 reps', done: false }] },
    { name: 'Overhead Press', tag: 'Compound • Shoulders', sets: [{ w: '40 kg', r: '10 reps', done: false },{ w: '45 kg', r: '8 reps', done: false },{ w: '50 kg', r: '6 reps', done: false }] },
  ],
  'Active Recovery': [
    { name: 'Walking Lunges', tag: 'Mobility • Legs', sets: [{ w: 'Bodyweight', r: '20 steps', done: false },{ w: 'Bodyweight', r: '20 steps', done: false }] },
    { name: 'Pull Ups', tag: 'Bodyweight • Core/Back', sets: [{ w: 'Bodyweight', r: 'Max reps', done: false },{ w: 'Bodyweight', r: 'Max reps', done: false }] },
  ],
};

const EXERCISE_DETAILS = {
  'Barbell Back Squat': {
    muscles: ['Quadriceps', 'Glutes', 'Hamstrings', 'Core'],
    img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Stand with feet shoulder-width apart, resting the barbell on your upper back or traps.',
      'Brace your core and initiate the movement by pushing your hips back.',
      'Bend your knees and lower your body until your thighs are parallel to the floor.',
      'Drive through your heels to return to the starting position.'
    ],
    variations: ['Front Squat', 'Sumo Squat', 'Goblet Squat', 'Box Squat', 'Pause Squat'],
    benefits: [
      'Builds massive lower body strength and muscle mass',
      'Increases testosterone and growth hormone production',
      'Improves core stability and posture',
      'Enhances athletic performance and explosive power',
      'Strengthens bones and connective tissue'
    ],
    precautions: [
      'Keep your knees tracking over your toes — avoid caving inward',
      'Do not round your lower back at the bottom of the movement',
      'Warm up thoroughly with lighter sets before heavy working sets',
      'Use a spotter or safety pins when lifting heavy',
      'Avoid bouncing at the bottom of the squat'
    ],
    videos: [
      { title: 'Perfect Squat Form Guide', url: 'https://www.youtube.com/results?search_query=barbell+back+squat+proper+form+tutorial' },
      { title: 'Common Squat Mistakes to Avoid', url: 'https://www.youtube.com/results?search_query=barbell+squat+common+mistakes' },
      { title: 'Squat Mobility & Warm-Up', url: 'https://www.youtube.com/results?search_query=squat+mobility+warm+up+routine' }
    ]
  },
  'Leg Press': {
    muscles: ['Quadriceps', 'Glutes', 'Hamstrings'],
    img: 'https://images.unsplash.com/photo-1584735935682-2f2b694b8e88?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Sit on the machine, placing feet shoulder-width apart on the sled.',
      'Unhook the safety latches and lower the sled towards your chest.',
      'Pause when your knees form a 90-degree angle.',
      'Press the sled back up without locking your knees at the top.'
    ],
    variations: ['Wide Stance Leg Press', 'Narrow Stance Leg Press', 'Single Leg Press', 'High Foot Placement', 'Low Foot Placement'],
    benefits: [
      'Safely overload the legs with heavy weight',
      'Reduced spinal compression compared to squats',
      'Great for targeting specific muscle groups via foot placement',
      'Builds quad and glute mass effectively',
      'Ideal for high-volume leg training'
    ],
    precautions: [
      'Never lock your knees fully at the top of the press',
      'Do not let your lower back round off the seat pad',
      'Control the descent — avoid letting the weight drop fast',
      'Keep the safety catches engaged until you are ready',
      'Avoid placing feet too low which stresses the knees'
    ],
    videos: [
      { title: 'Leg Press Form & Foot Placement', url: 'https://www.youtube.com/results?search_query=leg+press+proper+form+foot+placement' },
      { title: 'Leg Press Variations for Growth', url: 'https://www.youtube.com/results?search_query=leg+press+variations+muscle+growth' }
    ]
  },
  'Romanian Deadlift': {
    muscles: ['Hamstrings', 'Glutes', 'Lower Back'],
    img: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Hold a barbell or dumbbells with an overhand grip, feet hip-width apart.',
      'Keeping your back straight and legs slightly bent, push your hips back.',
      'Lower the weight down the front of your legs until you feel a stretch in your hamstrings.',
      'Squeeze your glutes and push your hips forward to stand back up.'
    ],
    variations: ['Dumbbell RDL', 'Single-Leg RDL', 'Stiff-Leg Deadlift', 'Banded RDL', 'Deficit RDL'],
    benefits: [
      'Develops strong and flexible hamstrings',
      'Strengthens the posterior chain for injury prevention',
      'Improves hip hinge mechanics for daily movements',
      'Builds a strong and resilient lower back',
      'Enhances grip strength'
    ],
    precautions: [
      'Keep the bar close to your body throughout the movement',
      'Do not round your back — maintain a neutral spine at all times',
      'Use a controlled tempo, especially on the lowering phase',
      'Start light to master the hip hinge pattern before adding weight',
      'Stop lowering when you feel a strong hamstring stretch, not pain'
    ],
    videos: [
      { title: 'Romanian Deadlift Masterclass', url: 'https://www.youtube.com/results?search_query=romanian+deadlift+proper+form+tutorial' },
      { title: 'RDL vs Stiff-Leg Deadlift', url: 'https://www.youtube.com/results?search_query=romanian+deadlift+vs+stiff+leg+deadlift' }
    ]
  },
  'Walking Lunges': {
    muscles: ['Quadriceps', 'Glutes', 'Hamstrings'],
    img: 'https://images.unsplash.com/photo-1434682881908-b43d0467b798?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Stand tall holding dumbbells by your sides.',
      'Step forward with your right leg, lowering your hips until both knees are bent at a 90-degree angle.',
      'Push off with your left foot to step forward into the next lunge.',
      'Keep your chest up and core engaged throughout.'
    ],
    variations: ['Reverse Lunges', 'Lateral Lunges', 'Curtsy Lunges', 'Overhead Walking Lunges', 'Bodyweight Lunges'],
    benefits: [
      'Improves balance, coordination, and unilateral strength',
      'Activates stabilizer muscles in hips and core',
      'Builds functional leg strength for sports and daily life',
      'Helps correct muscle imbalances between legs',
      'Increases hip flexibility and mobility'
    ],
    precautions: [
      'Keep your front knee aligned with your ankle, not past your toes',
      'Do not let your back knee slam into the ground',
      'Maintain an upright torso — avoid leaning forward',
      'Start with bodyweight to perfect form before adding load',
      'Ensure you have enough space to walk safely'
    ],
    videos: [
      { title: 'Walking Lunge Technique', url: 'https://www.youtube.com/results?search_query=walking+lunges+proper+form+technique' },
      { title: 'Lunge Variations for Legs', url: 'https://www.youtube.com/results?search_query=lunge+variations+leg+workout' }
    ]
  },
  'Bench Press': {
    muscles: ['Chest', 'Anterior Deltoids', 'Triceps'],
    img: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Lie flat on the bench, feet firmly planted on the floor.',
      'Grip the bar slightly wider than shoulder-width.',
      'Lower the bar slowly to your mid-chest while keeping your elbows tucked at a 45-degree angle.',
      'Press the bar back up explosively until your arms are fully extended.'
    ],
    variations: ['Incline Bench Press', 'Decline Bench Press', 'Close-Grip Bench Press', 'Dumbbell Bench Press', 'Paused Bench Press'],
    benefits: [
      'Primary compound exercise for upper body pushing strength',
      'Develops chest, shoulder, and tricep mass simultaneously',
      'Improves upper body pressing power for sports',
      'Strengthens the shoulder girdle and improves stability',
      'One of the best exercises for measuring upper body strength'
    ],
    precautions: [
      'Always use a spotter when going heavy',
      'Keep your shoulder blades retracted and pinched together',
      'Do not bounce the bar off your chest',
      'Avoid flaring your elbows out to 90 degrees — keep them at 45',
      'Ensure your wrists stay straight and stacked over elbows'
    ],
    videos: [
      { title: 'Bench Press Form for Beginners', url: 'https://www.youtube.com/results?search_query=bench+press+proper+form+beginners' },
      { title: 'Increase Your Bench Press', url: 'https://www.youtube.com/results?search_query=how+to+increase+bench+press+strength' }
    ]
  },
  'Barbell Bench Press': {
    muscles: ['Chest', 'Anterior Deltoids', 'Triceps'],
    img: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Lie flat on the bench with eyes under the bar, feet flat on the floor.',
      'Grip the bar slightly wider than shoulder-width with thumbs wrapped around.',
      'Unrack the bar and lower it slowly to your mid-chest, elbows at 45 degrees.',
      'Press the bar back up explosively to full arm extension, locking out at the top.'
    ],
    variations: ['Incline Barbell Press', 'Decline Barbell Press', 'Close-Grip Bench Press', 'Floor Press', 'Spoto Press'],
    benefits: [
      'The king of upper body pressing movements',
      'Builds maximum chest, shoulder, and tricep strength',
      'Highly effective for progressive overload',
      'Transfers to athletic pushing movements',
      'Strengthens stabilizer muscles of the shoulder joint'
    ],
    precautions: [
      'Always use a spotter or safety pins for heavy sets',
      'Retract and depress shoulder blades before unracking',
      'Do not bounce the bar off your chest',
      'Keep feet firmly planted — no lifting heels off the floor',
      'Control the descent for at least 2 seconds'
    ],
    videos: [
      { title: 'Perfect Bench Press Tutorial', url: 'https://www.youtube.com/results?search_query=barbell+bench+press+proper+form+tutorial' },
      { title: 'Fix Common Bench Press Mistakes', url: 'https://www.youtube.com/results?search_query=bench+press+common+mistakes+fix' },
      { title: 'Bench Press Programming for Strength', url: 'https://www.youtube.com/results?search_query=bench+press+strength+program' }
    ]
  },
  'Overhead Press': {
    muscles: ['Shoulders', 'Triceps', 'Upper Chest'],
    img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Stand with feet shoulder-width apart, holding a barbell at shoulder level.',
      'Brace your core and squeeze your glutes.',
      'Press the weight directly overhead until your arms are locked out.',
      'Lower the bar back to the starting position under control.'
    ],
    variations: ['Seated Overhead Press', 'Dumbbell Shoulder Press', 'Arnold Press', 'Push Press', 'Z-Press'],
    benefits: [
      'Builds strong, well-rounded shoulders',
      'Develops overhead pressing strength for daily life',
      'Improves core stability and total body coordination',
      'Strengthens the triceps and upper chest',
      'Enhances shoulder health and mobility when done correctly'
    ],
    precautions: [
      'Do not lean excessively backward during the press',
      'Keep your core tight to protect your lower back',
      'Avoid pressing in front of your face — bar path should be straight up',
      'Warm up the shoulders and rotator cuff before heavy pressing',
      'Start with lighter weight to master the bar path'
    ],
    videos: [
      { title: 'Overhead Press Form Guide', url: 'https://www.youtube.com/results?search_query=overhead+press+proper+form+guide' },
      { title: 'Fix Your Overhead Press', url: 'https://www.youtube.com/results?search_query=overhead+press+mistakes+tips' }
    ]
  },
  'Pull Ups': {
    muscles: ['Lats', 'Biceps', 'Rhomboids'],
    img: 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Grab the pull-up bar with an overhand grip slightly wider than shoulder-width.',
      'Hang with your arms fully extended and engage your core.',
      'Pull yourself up by driving your elbows down toward the floor until your chin clears the bar.',
      'Lower yourself back down with control.'
    ],
    variations: ['Chin-Ups (Underhand)', 'Wide-Grip Pull-Ups', 'Neutral-Grip Pull-Ups', 'Weighted Pull-Ups', 'Band-Assisted Pull-Ups'],
    benefits: [
      'Best bodyweight exercise for building a wide, V-shaped back',
      'Develops grip strength and forearm endurance',
      'Improves posture by strengthening upper back muscles',
      'Builds functional pulling strength',
      'Highly scalable — from assisted to weighted'
    ],
    precautions: [
      'Avoid kipping or using momentum unless specifically training that style',
      'Do not strain your neck by craning chin over the bar',
      'Control the descent — do not drop from the top',
      'If you cannot do a full pull-up, start with band-assisted or negatives',
      'Allow full arm extension at the bottom for full range of motion'
    ],
    videos: [
      { title: 'Pull-Up Progression for Beginners', url: 'https://www.youtube.com/results?search_query=pull+up+progression+beginners+tutorial' },
      { title: 'Advanced Pull-Up Variations', url: 'https://www.youtube.com/results?search_query=advanced+pull+up+variations+workout' }
    ]
  },
  'Barbell Rows': {
    muscles: ['Middle Back', 'Lats', 'Biceps'],
    img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Stand holding a barbell with an overhand grip, hands slightly wider than shoulder-width.',
      'Hinge at the hips until your torso is nearly parallel to the floor.',
      'Pull the bar towards your lower chest/upper abdomen, squeezing your shoulder blades together.',
      'Lower the bar slowly back to the starting position.'
    ],
    variations: ['Underhand Barbell Row', 'Pendlay Row', 'Dumbbell Row', 'T-Bar Row', 'Meadows Row'],
    benefits: [
      'Builds a thick, powerful back',
      'Strengthens the entire posterior chain',
      'Improves posture and counteracts slouching',
      'Develops grip and bicep strength as secondary movers',
      'Transfers to deadlift and other pulling movements'
    ],
    precautions: [
      'Keep your back flat — do not round the spine',
      'Avoid using excessive body momentum to swing the weight',
      'Maintain a controlled tempo throughout the movement',
      'Keep your knees slightly bent to reduce lower back stress',
      'Do not jerk the bar up — initiate the pull with your back muscles'
    ],
    videos: [
      { title: 'Barbell Row Form Guide', url: 'https://www.youtube.com/results?search_query=barbell+row+proper+form+tutorial' },
      { title: 'Row Variations for Back Thickness', url: 'https://www.youtube.com/results?search_query=barbell+row+variations+back+workout' }
    ]
  },
  'Barbell Row': {
    muscles: ['Middle Back', 'Lats', 'Biceps'],
    img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Stand holding a barbell with an overhand grip, hands slightly wider than shoulder-width.',
      'Hinge at the hips until your torso is nearly parallel to the floor.',
      'Pull the bar towards your lower chest/upper abdomen, squeezing your shoulder blades together.',
      'Lower the bar slowly back to the starting position.'
    ],
    variations: ['Underhand Barbell Row', 'Pendlay Row', 'Dumbbell Row', 'T-Bar Row', 'Seal Row'],
    benefits: [
      'Builds a thick, powerful back',
      'Strengthens the entire posterior chain',
      'Improves posture and counteracts slouching',
      'Develops grip and bicep strength as secondary movers',
      'Transfers to deadlift and other pulling movements'
    ],
    precautions: [
      'Keep your back flat — do not round the spine',
      'Avoid using excessive body momentum to swing the weight',
      'Maintain a controlled tempo throughout the movement',
      'Keep your knees slightly bent to reduce lower back stress',
      'Do not jerk the bar up — initiate the pull with your back muscles'
    ],
    videos: [
      { title: 'Barbell Row Technique', url: 'https://www.youtube.com/results?search_query=barbell+row+proper+technique' },
      { title: 'Build a Bigger Back with Rows', url: 'https://www.youtube.com/results?search_query=barbell+row+bigger+back+workout' }
    ]
  },
  'Incline Dumbbell Press': {
    muscles: ['Upper Chest', 'Anterior Deltoids', 'Triceps'],
    img: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Set the bench to a 30-45 degree incline and sit back with a dumbbell in each hand.',
      'Press the dumbbells up from shoulder level until your arms are fully extended.',
      'Lower the dumbbells slowly to the sides of your upper chest.',
      'Press back up, squeezing your chest at the top of the movement.'
    ],
    variations: ['Incline Barbell Press', 'Incline Hammer Press', 'Low Incline Dumbbell Press', 'Incline Flyes', 'Incline Machine Press'],
    benefits: [
      'Targets the upper chest for a fuller, more balanced chest',
      'Provides a greater range of motion than barbell press',
      'Helps correct strength imbalances between sides',
      'Builds shoulder stability through the dumbbell balance demand',
      'Excellent for hypertrophy-focused chest training'
    ],
    precautions: [
      'Do not set the incline too steep (above 45 degrees) — this shifts focus to shoulders',
      'Control the dumbbells throughout — do not let them drift apart',
      'Keep your shoulder blades retracted on the bench',
      'Avoid slamming the dumbbells together at the top',
      'Use a spotter for very heavy sets to help with unracking'
    ],
    videos: [
      { title: 'Incline Dumbbell Press Tutorial', url: 'https://www.youtube.com/results?search_query=incline+dumbbell+press+proper+form' },
      { title: 'Upper Chest Growth Tips', url: 'https://www.youtube.com/results?search_query=upper+chest+workout+incline+press' }
    ]
  },
  'Cable Crossovers': {
    muscles: ['Chest', 'Anterior Deltoids', 'Serratus Anterior'],
    img: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Stand in the center of a cable machine with pulleys set above head height.',
      'Grab both handles and step forward slightly with one foot for balance.',
      'With a slight bend in your elbows, bring your hands together in an arc in front of your chest.',
      'Squeeze your chest at the bottom, then slowly return to the starting position.'
    ],
    variations: ['Low-to-High Cable Fly', 'High-to-Low Cable Fly', 'Single Arm Cable Fly', 'Mid-Level Cable Fly', 'Cable Chest Press'],
    benefits: [
      'Provides constant tension throughout the entire movement',
      'Excellent isolation exercise for chest definition',
      'Highly adjustable — target upper, mid, or lower chest by changing cable height',
      'Low joint stress compared to heavy pressing movements',
      'Great finisher exercise for chest pump'
    ],
    precautions: [
      'Do not use too much weight — this is an isolation movement',
      'Keep your elbows in a fixed, slightly bent position throughout',
      'Avoid rounding your shoulders forward excessively',
      'Control the weight on the return — do not let cables pull your arms back',
      'Focus on chest squeeze, not arm movement'
    ],
    videos: [
      { title: 'Cable Crossover Form Guide', url: 'https://www.youtube.com/results?search_query=cable+crossover+proper+form+chest' },
      { title: 'Cable Fly Variations', url: 'https://www.youtube.com/results?search_query=cable+fly+variations+chest+workout' }
    ]
  },
  'Leg Extensions': {
    muscles: ['Quadriceps'],
    img: 'https://images.unsplash.com/photo-1584735935682-2f2b694b8e88?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Sit on the leg extension machine with your back flat against the pad.',
      'Place your ankles behind the lower pad and grip the side handles.',
      'Extend your legs until they are fully straight, squeezing your quads at the top.',
      'Lower the weight slowly back to the starting position with control.'
    ],
    variations: ['Single-Leg Extension', 'Tempo Leg Extensions', 'Partial Rep Extensions', 'Banded Leg Extensions'],
    benefits: [
      'Directly isolates the quadriceps without other muscle involvement',
      'Excellent for building quad definition and size',
      'Great for rehabilitation and strengthening the knee joint',
      'Easy to learn and perform with consistent form',
      'Effective for pre-exhausting quads before compound movements'
    ],
    precautions: [
      'Do not use explosive or jerky movements — keep it controlled',
      'Avoid locking the knees aggressively at the top',
      'If you have knee issues, use lighter weight and partial range of motion',
      'Adjust the machine pad to sit just above your ankles',
      'Do not swing the weight up using momentum'
    ],
    videos: [
      { title: 'Leg Extension Technique', url: 'https://www.youtube.com/results?search_query=leg+extension+proper+form+technique' },
      { title: 'Leg Extensions for Quad Growth', url: 'https://www.youtube.com/results?search_query=leg+extensions+quad+growth+tips' }
    ]
  },
  'Lying Leg Curls': {
    muscles: ['Hamstrings', 'Calves'],
    img: 'https://images.unsplash.com/photo-1584735935682-2f2b694b8e88?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Lie face down on the leg curl machine with ankles under the pad.',
      'Grip the handles and keep your hips pressed firmly against the bench.',
      'Curl the weight up by bending your knees, bringing your heels toward your glutes.',
      'Lower the weight back down slowly, maintaining tension on the hamstrings.'
    ],
    variations: ['Seated Leg Curls', 'Standing Leg Curls', 'Nordic Curls', 'Dumbbell Leg Curls', 'Swiss Ball Leg Curls'],
    benefits: [
      'Directly isolates the hamstrings for targeted growth',
      'Helps prevent knee injuries by strengthening the hamstrings',
      'Balances quad-dominant leg development',
      'Improves sprinting and jumping performance',
      'Low technical demand — easy to perform with good form'
    ],
    precautions: [
      'Do not lift your hips off the bench during the curl',
      'Avoid using momentum — focus on a controlled contraction',
      'Do not hyperextend your knees at the bottom of the movement',
      'Start with moderate weight to avoid hamstring cramping',
      'Keep your toes pointed straight or slightly inward'
    ],
    videos: [
      { title: 'Lying Leg Curl Form', url: 'https://www.youtube.com/results?search_query=lying+leg+curl+proper+form' },
      { title: 'Hamstring Training Tips', url: 'https://www.youtube.com/results?search_query=hamstring+workout+leg+curl+tips' }
    ]
  },
  'Calf Raises': {
    muscles: ['Gastrocnemius', 'Soleus'],
    img: 'https://images.unsplash.com/photo-1434682881908-b43d0467b798?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Stand on a calf raise machine or a step with the balls of your feet on the edge.',
      'Lower your heels below the platform to get a full stretch in your calves.',
      'Push up onto your toes as high as possible, squeezing your calves at the top.',
      'Hold the top position for 1-2 seconds, then lower slowly back down.'
    ],
    variations: ['Seated Calf Raises', 'Single-Leg Calf Raises', 'Donkey Calf Raises', 'Smith Machine Calf Raises', 'Bodyweight Calf Raises'],
    benefits: [
      'Builds calf size and definition',
      'Improves ankle stability and balance',
      'Enhances jumping and sprinting performance',
      'Supports injury prevention for the lower leg',
      'Essential for complete leg development'
    ],
    precautions: [
      'Use a full range of motion — stretch at the bottom, squeeze at the top',
      'Do not bounce at the bottom of the movement',
      'Avoid using too much weight that limits your range of motion',
      'Keep your knees straight (not locked) during standing raises',
      'Perform seated raises to target the soleus specifically'
    ],
    videos: [
      { title: 'Calf Raise Form & Tips', url: 'https://www.youtube.com/results?search_query=calf+raises+proper+form+tips' },
      { title: 'How to Grow Stubborn Calves', url: 'https://www.youtube.com/results?search_query=grow+bigger+calves+workout' }
    ]
  },
  'Treadmill Sprints': {
    muscles: ['Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Core'],
    img: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Warm up with a 3-5 minute light jog at an easy pace.',
      'Increase the treadmill speed to your sprint pace (85-95% max effort).',
      'Sprint for 20-30 seconds, maintaining proper running form.',
      'Step onto the side rails or reduce speed for a 60-90 second recovery between sprints.'
    ],
    variations: ['Incline Sprints', 'Outdoor Sprints', 'Hill Sprints', 'Sled Sprints', 'Bike Sprints'],
    benefits: [
      'Burns maximum calories in minimum time (EPOC effect)',
      'Boosts cardiovascular fitness and VO2 max rapidly',
      'Preserves muscle mass better than steady-state cardio',
      'Increases metabolic rate for hours after the workout',
      'Improves speed, power, and athletic conditioning'
    ],
    precautions: [
      'Always warm up thoroughly before sprinting',
      'Use the safety clip attached to your clothing',
      'Start with shorter sprints and build up intensity gradually',
      'Ensure the treadmill belt is at the right speed before stepping on',
      'Do not grip the handles while sprinting — use natural arm swing'
    ],
    videos: [
      { title: 'Treadmill HIIT Sprint Workout', url: 'https://www.youtube.com/results?search_query=treadmill+sprint+HIIT+workout' },
      { title: 'Treadmill Sprint Technique', url: 'https://www.youtube.com/results?search_query=treadmill+sprints+proper+technique+beginners' }
    ]
  },
  'Jump Rope': {
    muscles: ['Calves', 'Shoulders', 'Core', 'Forearms', 'Quadriceps'],
    img: 'https://images.unsplash.com/photo-1517344884509-a0c97ec11bcc?q=80&w=400&auto=format&fit=crop',
    steps: [
      'Hold the rope handles at hip height with elbows close to your body.',
      'Swing the rope overhead using your wrists, not your arms.',
      'Jump just high enough to clear the rope (1-2 inches off the ground).',
      'Land softly on the balls of your feet, maintaining a slight bend in your knees.'
    ],
    variations: ['Double Unders', 'Criss-Cross', 'High Knees Jump Rope', 'Single-Leg Hops', 'Boxer Skip'],
    benefits: [
      'Incredible full-body cardio in a small space',
      'Burns more calories per minute than most cardio exercises',
      'Improves coordination, agility, and footwork',
      'Strengthens calves, shoulders, and core simultaneously',
      'Portable and inexpensive — train anywhere'
    ],
    precautions: [
      'Jump on a forgiving surface (rubber mat, wood floor) — avoid concrete',
      'Wear supportive shoes with good cushioning',
      'Keep jumps low and controlled to reduce joint impact',
      'Size your rope correctly — handles should reach your armpits when stood on',
      'Start with short intervals and build up to longer sessions'
    ],
    videos: [
      { title: 'Jump Rope for Beginners', url: 'https://www.youtube.com/results?search_query=jump+rope+tutorial+beginners' },
      { title: 'Jump Rope HIIT Workout', url: 'https://www.youtube.com/results?search_query=jump+rope+HIIT+workout+fat+burn' }
    ]
  }
};

// ============================================
// PAGE: Workouts
// ============================================
function renderWorkouts() {
  const schedule = getSchedule();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayIdx = new Date().getDay();
  const todayDay = days[todayIdx];
  const todaySchedule = schedule.find(s => s.day === todayDay) || schedule[0];

  app().innerHTML = `
    ${topBar('KINETIC')}
    <div class="page-content stagger">
      <h1 class="headline-lg" style="margin-bottom:var(--spacing-1)">Workouts</h1>
      <p class="body-md text-surface-variant" style="margin-bottom:var(--spacing-6)">Tap a day to view full workout</p>

      <!-- Today's Workout Highlight -->
      <div class="today-workout-banner" data-day="${todayDay}">
        <div class="twb-badge">TODAY</div>
        <div class="twb-content">
          <div class="twb-workout">${todaySchedule.workout}</div>
          <div class="twb-meta">${todaySchedule.type} • ${todaySchedule.duration}</div>
          <div class="twb-exercises">${(WORKOUT_EXERCISES[todaySchedule.workout] || []).length} exercises</div>
        </div>
        <span class="material-symbols-rounded twb-arrow">arrow_forward</span>
      </div>

      <!-- Weekly Schedule -->
      <div class="section-header" style="margin-top:var(--spacing-6)">
        <h3 class="section-title">Weekly Schedule</h3>
        <button class="section-action" id="browse-exercises-btn" style="cursor:pointer;color:var(--primary)">
          Exercise Lib <span class="material-symbols-rounded" style="font-size:16px">menu_book</span>
        </button>
      </div>
      ${schedule.map(s => {
        const exCount = (WORKOUT_EXERCISES[s.workout] || []).length;
        const isToday = s.day === todayDay;
        return `
        <div class="schedule-day-card ${isToday ? 'schedule-day-today' : ''}" data-day="${s.day}" style="cursor:pointer">
          <span class="day-label">${s.day}</span>
          <div class="day-workout">
            <div class="dw-name">${s.workout}${isToday ? ' <span class="chip chip-active" style="font-size:0.55rem;padding:2px 8px;vertical-align:middle">TODAY</span>' : ''}</div>
            <div class="dw-sub">${s.type} • ${s.duration}${exCount > 0 ? ` • ${exCount} exercises` : ''}</div>
          </div>
          <span class="material-symbols-rounded" style="color:var(--on-surface-variant);font-size:20px">chevron_right</span>
        </div>`;
      }).join('')}

      <!-- Workout Plans -->
      <div class="section-header" style="margin-top:var(--spacing-6)"><h3 class="section-title">Workout Plans</h3></div>
      <div class="plan-card" data-plan="Full Body" style="cursor:pointer">
        <div class="plan-icon"><span class="material-symbols-rounded">bolt</span></div>
        <div class="plan-info"><h4>Full Body Power</h4><p>Compound focus • 45 min</p></div>
        <span class="material-symbols-rounded plan-arrow">chevron_right</span>
      </div>
      <div class="plan-card" data-plan="Active Recovery" style="cursor:pointer">
        <div class="plan-icon" style="background:rgba(97,194,255,0.1)"><span class="material-symbols-rounded" style="color:var(--tertiary)">self_improvement</span></div>
        <div class="plan-info"><h4>Active Recovery</h4><p>Yoga & stretching • 20 min</p></div>
        <span class="material-symbols-rounded plan-arrow">chevron_right</span>
      </div>
      <div class="plan-card" data-plan="Cardio HIIT" style="cursor:pointer;margin-bottom:var(--spacing-8)">
        <div class="plan-icon" style="background:rgba(213,227,253,0.1)"><span class="material-symbols-rounded" style="color:var(--secondary)">directions_run</span></div>
        <div class="plan-info"><h4>Cardio HIIT</h4><p>3x/week • 25 min intervals</p></div>
        <span class="material-symbols-rounded plan-arrow">chevron_right</span>
      </div>
    </div>
    ${bottomNav('workouts')}
  `;
  bindNav();

  // Today's workout banner click
  $('.today-workout-banner')?.addEventListener('click', () => {
    Store.setData('selected_day', todayDay);
    Router.navigate('day_workout');
  });

  // Day selection -> navigate to dedicated day screen
  $$('.schedule-day-card').forEach(card => {
    card.addEventListener('click', () => {
      Store.setData('selected_day', card.dataset.day);
      Router.navigate('day_workout');
    });
  });

  // Plan selection -> navigate to dedicated day screen with that workout
  $$('.plan-card').forEach(card => {
    card.addEventListener('click', () => {
      const schedule = getSchedule();
      const dayWithPlan = schedule.find(s => s.workout === card.dataset.plan);
      Store.setData('selected_day', dayWithPlan ? dayWithPlan.day : 'Mon');
      Router.navigate('day_workout');
    });
  });

  // Edit schedule button
  const pageContent = $('.page-content');
  const editBtn = document.createElement('button');
  editBtn.className = 'btn-secondary';
  editBtn.style.width = '100%';
  editBtn.style.marginTop = 'var(--spacing-4)';
  editBtn.innerHTML = '<span class="material-symbols-rounded">edit</span> Edit Weekly Schedule';
  editBtn.addEventListener('click', openScheduleModal);
  pageContent.appendChild(editBtn);

  // Browse Library
  $('#browse-exercises-btn')?.addEventListener('click', () => Router.navigate('exercises'));
}

// ============================================
// PAGE: Day Workout (Dedicated Day Screen)
// ============================================
function renderDayWorkout() {
  const schedule = getSchedule();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const fullDayNames = { 'Sun': 'Sunday', 'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday', 'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday' };
  const todayIdx = new Date().getDay();
  const todayDay = days[todayIdx];

  const selectedDay = Store.getData('selected_day', todayDay);
  const daySchedule = schedule.find(s => s.day === selectedDay) || schedule[0];
  // Use custom exercises if set, otherwise default
  const customKey = 'custom_exercises_' + selectedDay;
  const customExercises = Store.getData(customKey, null);
  const exercises = customExercises || (WORKOUT_EXERCISES[daySchedule.workout] || []);
  const isToday = selectedDay === todayDay;
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
  const progressPct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;

  // Workout type icon mapping
  const workoutIcons = {
    'Upper Body Power': 'fitness_center', 'Lower Body Power': 'fitness_center',
    'Upper Body Hypertrophy': 'exercise', 'Lower Body Hypertrophy': 'exercise',
    'Push Day': 'fitness_center', 'Pull Day': 'fitness_center', 'Leg Day': 'fitness_center',
    'Full Body': 'bolt', 'Cardio HIIT': 'directions_run', 'Active Recovery': 'self_improvement',
    'Yoga & Mobility': 'self_improvement', 'Core & Abs': 'exercise',
    'Arms & Shoulders': 'fitness_center', 'Back & Biceps': 'fitness_center',
    'Chest & Triceps': 'fitness_center', 'Rest Day': 'hotel',
  };
  const workoutIcon = workoutIcons[daySchedule.workout] || 'fitness_center';

  app().innerHTML = `
    ${topBar('KINETIC')}
    <div class="page-content stagger">
      <!-- Back + Title -->
      <div style="display:flex;align-items:center;gap:var(--spacing-3);margin-bottom:var(--spacing-4)">
        <button class="btn-icon" id="day-back-btn"><span class="material-symbols-rounded">arrow_back</span></button>
        <div style="flex:1">
          <h1 class="headline-md" style="margin:0">${fullDayNames[selectedDay]}</h1>
          ${isToday ? '<span class="chip chip-active" style="font-size:0.6rem;padding:2px 10px;margin-top:4px;display:inline-block">TODAY</span>' : ''}
        </div>
      </div>

      <!-- Day Hero Card -->
      <div class="day-hero-card">
        <div class="day-hero-icon">
          <span class="material-symbols-rounded">${workoutIcon}</span>
        </div>
        <div class="day-hero-info">
          <div class="day-hero-workout">${daySchedule.workout}</div>
          <div class="day-hero-meta">${daySchedule.type}</div>
          <div class="day-hero-stats">
            <span><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle">timer</span> ${daySchedule.duration}</span>
            <span><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle">fitness_center</span> ${exercises.length} exercises</span>
            <span><span class="material-symbols-rounded" style="font-size:14px;vertical-align:middle">repeat</span> ${totalSets} sets</span>
          </div>
        </div>
      </div>

      ${exercises.length > 0 ? `
      <!-- Progress Bar -->
      <div class="day-progress-section">
        <div class="day-progress-header">
          <span class="body-sm text-surface-variant">Workout Progress</span>
          <span class="body-sm" style="color:var(--primary);font-weight:700">${progressPct}%</span>
        </div>
        <div class="day-progress-bar">
          <div class="day-progress-fill" style="width:${progressPct}%"></div>
        </div>
      </div>

      <!-- Exercise List -->
      <div class="section-header" style="margin-top:var(--spacing-6)">
        <h3 class="section-title">Exercises</h3>
        <span class="body-sm text-surface-variant">${doneSets}/${totalSets} sets done</span>
      </div>

      ${exercises.map((ex, idx) => {
        const det = EXERCISE_DETAILS[ex.name];
        const exImg = det ? det.img : '';
        const exMuscles = det ? det.muscles : [];
        const exDoneSets = ex.sets.filter(s => s.done).length;
        const allDone = exDoneSets === ex.sets.length;
        return `
        <div class="day-exercise-card ${allDone ? 'day-exercise-done' : ''}" data-ex="${ex.name}">
          <div class="day-ex-left">
            <div class="day-ex-number ${allDone ? 'day-ex-number-done' : ''}">${allDone ? '<span class="material-symbols-rounded" style="font-size:14px">check</span>' : idx + 1}</div>
            ${exImg ? `<div class="day-ex-thumb" style="background-image:url(${exImg})"></div>` : `<div class="day-ex-thumb day-ex-thumb-placeholder"><span class="material-symbols-rounded">fitness_center</span></div>`}
          </div>
          <div class="day-ex-info">
            <div class="day-ex-name">${ex.name}</div>
            <div class="day-ex-tag">${ex.tag}</div>
            <div class="day-ex-sets-row">
              ${ex.sets.map((s, si) => `<div class="day-ex-set-dot ${s.done ? 'done' : ''}"></div>`).join('')}
              <span class="day-ex-set-text">${exDoneSets}/${ex.sets.length}</span>
              ${ex.badge ? `<span class="exercise-badge" style="margin-left:auto">${ex.badge}</span>` : ''}
            </div>
          </div>
          <span class="material-symbols-rounded day-ex-arrow">chevron_right</span>
        </div>`;
      }).join('')}

      <!-- Buttons -->
      <div style="display:flex;gap:var(--spacing-3);margin-top:var(--spacing-6);margin-bottom:var(--spacing-3);align-items:stretch">
        <button class="btn-primary" id="start-workout-btn" style="flex:1;padding:var(--spacing-5) var(--spacing-6);font-size:1.1rem;font-weight:800;min-height:56px;letter-spacing:0.02em">
          <span class="material-symbols-rounded" style="font-size:24px">play_arrow</span>
          Start Workout
        </button>
        <button class="btn-secondary" id="customize-exercises-btn" style="width:44px;min-width:44px;max-width:44px;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.75rem" title="Customize Exercises">
          <span class="material-symbols-rounded" style="font-size:18px">tune</span>
        </button>
      </div>
      <div style="display:flex;justify-content:center;margin-bottom:var(--spacing-6)">
        <button class="day-reset-btn" id="reset-day-btn">
          <span class="material-symbols-rounded">restart_alt</span>
          Reset All to Defaults
        </button>
      </div>
      ` : `
      <!-- Rest Day / No Exercises -->
      <div class="day-rest-card">
        <span class="material-symbols-rounded" style="font-size:64px;color:var(--on-surface-variant);opacity:0.5;display:block;margin-bottom:var(--spacing-4)">self_improvement</span>
        <div class="headline-sm" style="margin-bottom:var(--spacing-2)">${daySchedule.workout}</div>
        <p class="body-md text-surface-variant" style="margin-bottom:var(--spacing-6)">${daySchedule.type}</p>
        ${daySchedule.workout === 'Rest Day' ? `
          <div class="day-rest-tips">
            <div class="day-rest-tip">
              <span class="material-symbols-rounded" style="color:var(--tertiary);font-size:18px">bedtime</span>
              <span>Get 7-9 hours of quality sleep</span>
            </div>
            <div class="day-rest-tip">
              <span class="material-symbols-rounded" style="color:var(--tertiary);font-size:18px">water_drop</span>
              <span>Stay hydrated throughout the day</span>
            </div>
            <div class="day-rest-tip">
              <span class="material-symbols-rounded" style="color:var(--tertiary);font-size:18px">restaurant</span>
              <span>Focus on protein-rich nutrition</span>
            </div>
            <div class="day-rest-tip">
              <span class="material-symbols-rounded" style="color:var(--tertiary);font-size:18px">directions_walk</span>
              <span>Light walking or stretching is encouraged</span>
            </div>
          </div>
        ` : ''}
      </div>
      `}

      <!-- Quick Nav: Other Days -->
      <div class="section-header" style="margin-top:var(--spacing-2)"><h3 class="section-title">Other Days</h3></div>
      <div class="day-nav-row">
        ${days.map(d => {
          const ds = schedule.find(s => s.day === d);
          const isSelected = d === selectedDay;
          const isDayToday = d === todayDay;
          return `
          <div class="day-nav-chip ${isSelected ? 'day-nav-active' : ''} ${isDayToday && !isSelected ? 'day-nav-today' : ''}" data-nav-day="${d}">
            <div class="day-nav-label">${d}</div>
            <div class="day-nav-type">${ds ? ds.workout.split(' ')[0] : ''}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    ${bottomNav('workouts')}
  `;
  bindNav();

  // Back button
  $('#day-back-btn')?.addEventListener('click', () => Router.navigate('workouts'));

  // Exercise card clicks -> exercise detail
  $$('.day-exercise-card').forEach(el => {
    el.addEventListener('click', () => {
      Store.setData('current_ex', el.dataset.ex);
      Router.navigate('exercise_detail');
    });
  });

  // Day nav chips -> switch day
  $$('.day-nav-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      Store.setData('selected_day', chip.dataset.navDay);
      renderDayWorkout();
      window.scrollTo(0, 0);
    });
  });

  // Start Workout -> open active workout session
  $('#start-workout-btn')?.addEventListener('click', () => {
    Store.setData('active_workout_day', selectedDay);
    Router.navigate('active_workout');
  });

  // Customize exercises
  $('#customize-exercises-btn')?.addEventListener('click', () => {
    openExercisePickerModal(selectedDay);
  });

  // Reset all to defaults
  $('#reset-day-btn')?.addEventListener('click', () => {
    const customKey = 'custom_exercises_' + selectedDay;
    // Remove custom exercises (revert to default workout exercises)
    localStorage.removeItem(`kinetic_${customKey}`);
    // Reset completion status: clear any stored done-state for this day
    const defaultExercises = WORKOUT_EXERCISES[daySchedule.workout];
    if (defaultExercises) {
      const resetExercises = JSON.parse(JSON.stringify(defaultExercises));
      resetExercises.forEach(ex => ex.sets.forEach(s => s.done = false));
      Store.setData(customKey, resetExercises);
    }
    // Visual feedback
    const btn = $('#reset-day-btn');
    if (btn) {
      btn.innerHTML = '<span class="material-symbols-rounded">check_circle</span> Reset Done!';
      btn.style.borderColor = 'var(--primary)';
      btn.style.color = 'var(--primary)';
    }
    setTimeout(() => renderDayWorkout(), 800);
  });
}

// ============================================
// PAGE: Active Workout Session
// ============================================
function renderActiveWorkout() {
  const schedule = getSchedule();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const selectedDay = Store.getData('active_workout_day', days[new Date().getDay()]);
  const daySchedule = schedule.find(s => s.day === selectedDay) || schedule[0];

  // Load custom exercises if set, otherwise use default
  const customKey = 'custom_exercises_' + selectedDay;
  let exercises = Store.getData(customKey, null);
  if (!exercises) exercises = WORKOUT_EXERCISES[daySchedule.workout] || [];
  // Deep clone so we can mutate
  exercises = JSON.parse(JSON.stringify(exercises));

  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0);

  app().innerHTML = `
    <div class="active-workout-container">
      <!-- Header -->
      <div class="aw-header">
        <button class="btn-icon" id="aw-back"><span class="material-symbols-rounded">close</span></button>
        <div class="aw-header-info">
          <div class="aw-header-title">${daySchedule.workout}</div>
          <div class="aw-header-sub" id="aw-timer">00:00</div>
        </div>
        <div id="aw-set-count" class="aw-set-counter">0/${totalSets}</div>
      </div>

      <!-- Exercise Navigator -->
      <div class="aw-exercise-tabs" id="aw-exercise-tabs">
        ${exercises.map((_, i) => `<div class="aw-ex-tab ${i === 0 ? 'active' : ''}" data-idx="${i}">${i + 1}</div>`).join('')}
      </div>

      <!-- Current Exercise -->
      <div id="aw-exercise-area"></div>

      <!-- Rest Timer Overlay -->
      <div class="aw-rest-overlay" id="aw-rest-overlay" style="display:none">
        <div class="aw-rest-content">
          <span class="material-symbols-rounded" style="font-size:48px;color:var(--tertiary);margin-bottom:var(--spacing-3)">timer</span>
          <div class="display-lg text-tertiary" id="aw-rest-time">60</div>
          <div class="body-md text-surface-variant" style="margin-bottom:var(--spacing-6)">Rest Period</div>
          <div style="display:flex;gap:var(--spacing-3)">
            <button class="btn-secondary" id="aw-rest-minus">-15s</button>
            <button class="btn-primary" id="aw-rest-skip">Skip Rest</button>
            <button class="btn-secondary" id="aw-rest-plus">+15s</button>
          </div>
        </div>
      </div>
    </div>
  `;

  let currentExIdx = 0;
  let completedSets = 0;
  // Resume from WorkoutPlayer if already active, else start fresh
  let workoutStartTime = WorkoutPlayer.isActive() ? Store.getData('wp_start', Date.now()) : Date.now();
  if (!WorkoutPlayer.isActive()) WorkoutPlayer.start(daySchedule.workout);
  WorkoutPlayer.removeBar(); // hide bar while on active workout page
  let timerInterval = null;
  let restInterval = null;
  let restSeconds = 60;

  // Workout timer
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - workoutStartTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const el = $('#aw-timer');
    if (el) el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, 1000);

  function renderExercise() {
    const ex = exercises[currentExIdx];
    if (!ex) return;
    const det = EXERCISE_DETAILS[ex.name];
    const exImg = det ? det.img : '';

    const area = $('#aw-exercise-area');
    if (!area) return;
    area.innerHTML = `
      <div class="aw-ex-card">
        ${exImg ? `<div class="aw-ex-image" style="background-image:url(${exImg})"></div>` : ''}
        <div class="aw-ex-name">${ex.name}</div>
        <div class="aw-ex-tag">${ex.tag}</div>

        <div class="aw-sets-list">
          ${ex.sets.map((s, si) => `
            <div class="aw-set-row ${s.done ? 'aw-set-done' : ''}" data-set="${si}">
              <div class="aw-set-num">Set ${si + 1}</div>
              <div class="aw-set-info">
                <span class="aw-set-weight">${s.w}</span>
                <span class="aw-set-reps">${s.r}</span>
              </div>
              <button class="aw-set-check ${s.done ? 'checked' : ''}" data-set="${si}">
                <span class="material-symbols-rounded" style="font-size:18px">${s.done ? 'check_circle' : 'radio_button_unchecked'}</span>
              </button>
            </div>
          `).join('')}
        </div>

        <div class="aw-nav-btns">
          ${currentExIdx > 0 ? `<button class="btn-secondary" id="aw-prev-ex"><span class="material-symbols-rounded">chevron_left</span> Previous</button>` : '<div></div>'}
          ${currentExIdx < exercises.length - 1 ? `<button class="btn-primary" id="aw-next-ex">Next <span class="material-symbols-rounded">chevron_right</span></button>` : `<button class="btn-primary" id="aw-finish-workout"><span class="material-symbols-rounded">emoji_events</span> Finish</button>`}
        </div>
      </div>
    `;

    // Set completion toggles
    $$('.aw-set-check').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const si = parseInt(btn.dataset.set);
        ex.sets[si].done = !ex.sets[si].done;
        // Recount completed sets
        completedSets = exercises.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
        const counter = $('#aw-set-count');
        if (counter) counter.textContent = `${completedSets}/${totalSets}`;
        renderExercise();
        // Start rest timer if set was completed
        if (ex.sets[si].done) startRestTimer();
      });
    });

    // Nav
    $('#aw-prev-ex')?.addEventListener('click', () => { currentExIdx--; renderExercise(); updateTabs(); });
    $('#aw-next-ex')?.addEventListener('click', () => { currentExIdx++; renderExercise(); updateTabs(); });
    $('#aw-finish-workout')?.addEventListener('click', finishWorkout);
  }

  function updateTabs() {
    $$('.aw-ex-tab').forEach(tab => {
      const idx = parseInt(tab.dataset.idx);
      tab.classList.toggle('active', idx === currentExIdx);
      // Mark completed exercise tabs
      const ex = exercises[idx];
      const allDone = ex.sets.every(s => s.done);
      tab.classList.toggle('completed', allDone);
    });
  }

  function startRestTimer() {
    restSeconds = 60;
    const overlay = $('#aw-rest-overlay');
    const timeEl = $('#aw-rest-time');
    if (!overlay || !timeEl) return;
    overlay.style.display = 'flex';
    timeEl.textContent = restSeconds;

    if (restInterval) clearInterval(restInterval);
    restInterval = setInterval(() => {
      restSeconds--;
      if (timeEl) timeEl.textContent = Math.max(0, restSeconds);
      if (restSeconds <= 0) {
        clearInterval(restInterval);
        overlay.style.display = 'none';
      }
    }, 1000);
  }

  function finishWorkout() {
    clearInterval(timerInterval);
    if (restInterval) clearInterval(restInterval);
    WorkoutPlayer.stop();
    const elapsed = Date.now() - workoutStartTime;
    const mins = Math.floor(elapsed / 60000);
    // Log workout to history
    const wHist = Store.getData('workout_history', []);
    wHist.push({ date: Date.now(), name: daySchedule.workout, duration: mins, sets: completedSets, totalSets });
    if (wHist.length > 60) wHist.shift();
    Store.setData('workout_history', wHist);
    showGoalToast('Workout Complete!', `${daySchedule.workout} finished in ${mins} min. ${completedSets}/${totalSets} sets completed!`, '🏆');
    // Navigate back
    setTimeout(() => {
      Store.setData('selected_day', selectedDay);
      Router.navigate('day_workout');
    }, 1500);
  }

  // Tab clicks
  $$('.aw-ex-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentExIdx = parseInt(tab.dataset.idx);
      renderExercise();
      updateTabs();
    });
  });

  // Rest timer controls
  $('#aw-rest-skip')?.addEventListener('click', () => {
    if (restInterval) clearInterval(restInterval);
    const overlay = $('#aw-rest-overlay');
    if (overlay) overlay.style.display = 'none';
  });
  $('#aw-rest-minus')?.addEventListener('click', () => {
    restSeconds = Math.max(0, restSeconds - 15);
    const el = $('#aw-rest-time');
    if (el) el.textContent = restSeconds;
  });
  $('#aw-rest-plus')?.addEventListener('click', () => {
    restSeconds += 15;
    const el = $('#aw-rest-time');
    if (el) el.textContent = restSeconds;
  });

  // Back / close — keep player running in background
  $('#aw-back')?.addEventListener('click', () => {
    clearInterval(timerInterval);
    if (restInterval) clearInterval(restInterval);
    Store.setData('selected_day', selectedDay);
    Router.navigate('day_workout');
  });

  renderExercise();
}

// ============================================
// Exercise Picker Modal (Custom Day Exercises)
// ============================================
function openExercisePickerModal(day) {
  const schedule = getSchedule();
  const daySchedule = schedule.find(s => s.day === day);
  const customKey = 'custom_exercises_' + day;
  const currentCustom = Store.getData(customKey, null);

  // Get currently selected exercise names
  let selectedNames = [];
  if (currentCustom) {
    selectedNames = currentCustom.map(e => e.name);
  } else {
    const defaults = WORKOUT_EXERCISES[daySchedule.workout] || [];
    selectedNames = defaults.map(e => e.name);
  }

  const allExNames = Object.keys(EXERCISE_DETAILS);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'exercise-picker-modal';

  function renderPicker() {
    const searchVal = overlay.querySelector('#ep-search')?.value?.toLowerCase() || '';
    const filtered = allExNames.filter(n => n.toLowerCase().includes(searchVal));
    const count = selectedNames.length;
    const canAdd = count < 8;
    const canSave = count >= 4 && count <= 8;

    overlay.innerHTML = `
      <div class="modal-sheet" style="position:relative;max-height:85vh;overflow-y:auto">
        <div class="modal-handle"></div>
        <button class="modal-close-btn" id="ep-close"><span class="material-symbols-rounded" style="font-size:18px">close</span></button>
        <div class="modal-title">Customize Exercises</div>
        <div class="body-sm text-surface-variant" style="margin-bottom:var(--spacing-4)">Select 4-8 exercises for ${day}'s workout</div>

        <div class="ep-counter ${canSave ? 'ep-counter-valid' : 'ep-counter-invalid'}">
          <span class="material-symbols-rounded" style="font-size:16px">${canSave ? 'check_circle' : 'info'}</span>
          ${count} / 8 selected ${count < 4 ? `(need ${4 - count} more)` : ''}
        </div>

        <div style="position:relative;margin-bottom:var(--spacing-4)">
          <span class="material-symbols-rounded text-surface-variant" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:18px">search</span>
          <input type="text" id="ep-search" placeholder="Search exercises..." value="${searchVal}" style="width:100%;padding:12px 14px 12px 42px;border-radius:var(--radius-full);border:1px solid var(--surface-variant);background:var(--surface-container);color:var(--on-surface);font-size:0.875rem"/>
        </div>

        <div class="ep-list">
          ${filtered.map(exName => {
            const det = EXERCISE_DETAILS[exName];
            const isSelected = selectedNames.includes(exName);
            const disabled = !isSelected && !canAdd;
            return `
            <div class="ep-item ${isSelected ? 'ep-item-selected' : ''} ${disabled ? 'ep-item-disabled' : ''}" data-name="${exName}">
              <div class="ep-item-thumb" style="background-image:url(${det.img})"></div>
              <div class="ep-item-info">
                <div class="ep-item-name">${exName}</div>
                <div class="ep-item-muscles">${det.muscles.slice(0, 2).join(', ')}</div>
              </div>
              <div class="ep-item-check ${isSelected ? 'checked' : ''}">
                <span class="material-symbols-rounded" style="font-size:18px">${isSelected ? 'check_circle' : 'add_circle_outline'}</span>
              </div>
            </div>`;
          }).join('')}
        </div>

        <div style="display:flex;gap:var(--spacing-3);margin-top:var(--spacing-4);position:sticky;bottom:0;background:var(--surface-container-low);padding:var(--spacing-3) 0">
          <button class="btn-secondary" id="ep-reset" style="flex:1">Reset Default</button>
          <button class="btn-primary ${canSave ? '' : 'btn-disabled'}" id="ep-save" style="flex:1" ${canSave ? '' : 'disabled'}>
            Save (${count})
          </button>
        </div>
      </div>
    `;

    // Bind events
    overlay.querySelector('#ep-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#ep-search')?.addEventListener('input', () => renderPicker());

    overlay.querySelectorAll('.ep-item:not(.ep-item-disabled)').forEach(item => {
      item.addEventListener('click', () => {
        const name = item.dataset.name;
        const idx = selectedNames.indexOf(name);
        if (idx > -1) {
          selectedNames.splice(idx, 1);
        } else if (selectedNames.length < 8) {
          selectedNames.push(name);
        }
        renderPicker();
      });
    });

    overlay.querySelector('#ep-reset')?.addEventListener('click', () => {
      Store.setData(customKey, null);
      overlay.remove();
      renderDayWorkout();
    });

    overlay.querySelector('#ep-save')?.addEventListener('click', () => {
      if (selectedNames.length < 4 || selectedNames.length > 8) return;
      // Build exercise objects with default 3 sets
      const customExercises = selectedNames.map(name => {
        // Try to find from existing workout exercises first
        for (const key in WORKOUT_EXERCISES) {
          const found = WORKOUT_EXERCISES[key].find(e => e.name === name);
          if (found) return JSON.parse(JSON.stringify(found));
        }
        // Fallback: create from details
        const det = EXERCISE_DETAILS[name];
        return {
          name: name,
          tag: det ? det.muscles.slice(0, 2).join(' • ') : 'Custom',
          sets: [
            { w: '—', r: '10 reps', done: false },
            { w: '—', r: '10 reps', done: false },
            { w: '—', r: '10 reps', done: false },
          ]
        };
      });
      Store.setData(customKey, customExercises);
      overlay.remove();
      renderDayWorkout();
    });
  }

  document.body.appendChild(overlay);
  renderPicker();
}

// --- Schedule Edit Modal ---
function openScheduleModal() {
  const schedule = getSchedule();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'schedule-modal';
  overlay.innerHTML = `
    <div class="modal-sheet" style="position:relative">
      <div class="modal-handle"></div>
      <button class="modal-close-btn" id="close-sched-modal"><span class="material-symbols-rounded" style="font-size:18px">close</span></button>
      <div class="modal-title">Edit Weekly Schedule</div>
      <div id="sched-form">
        ${schedule.map((s, i) => `
          <div class="schedule-day-card" style="margin-bottom:var(--spacing-3)">
            <span class="day-label">${s.day}</span>
            <div style="flex:1">
              <select class="search-input sched-select" data-idx="${i}" style="padding:var(--spacing-2) var(--spacing-3);font-size:0.8125rem">
                ${WORKOUT_OPTIONS.map(opt => `<option value="${opt}" ${opt === s.workout ? 'selected' : ''}>${opt}</option>`).join('')}
              </select>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn-primary" id="save-schedule-btn" style="margin-top:var(--spacing-4)">
        <span class="material-symbols-rounded">save</span>
        Save Schedule
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  $('#close-sched-modal').addEventListener('click', () => overlay.remove());

  const typeMap = {
    'Upper Body Power': { type: 'Chest, Shoulders, Triceps', duration: '55 min' },
    'Lower Body Power': { type: 'Quads, Hamstrings, Glutes', duration: '50 min' },
    'Upper Body Hypertrophy': { type: 'Back, Biceps, Rear Delts', duration: '50 min' },
    'Lower Body Hypertrophy': { type: 'Legs & Calves', duration: '45 min' },
    'Push Day': { type: 'Chest, Shoulders, Triceps', duration: '50 min' },
    'Pull Day': { type: 'Back, Biceps, Rear Delts', duration: '50 min' },
    'Leg Day': { type: 'Quads, Hamstrings, Glutes, Calves', duration: '55 min' },
    'Full Body': { type: 'All Major Muscle Groups', duration: '60 min' },
    'Cardio HIIT': { type: 'Interval Training', duration: '25 min' },
    'Active Recovery': { type: 'Active Recovery / Stretching', duration: '20 min' },
    'Yoga & Mobility': { type: 'Flexibility & Balance', duration: '30 min' },
    'Core & Abs': { type: 'Core Stability & Abs', duration: '25 min' },
    'Arms & Shoulders': { type: 'Biceps, Triceps, Delts', duration: '40 min' },
    'Back & Biceps': { type: 'Pull Muscles', duration: '45 min' },
    'Chest & Triceps': { type: 'Push Muscles', duration: '45 min' },
    'Rest Day': { type: 'Full Rest', duration: '—' },
  };

  $('#save-schedule-btn').addEventListener('click', () => {
    const newSchedule = [...schedule];
    $$('.sched-select').forEach(sel => {
      const idx = parseInt(sel.dataset.idx);
      const workout = sel.value;
      const meta = typeMap[workout] || { type: workout, duration: '45 min' };
      newSchedule[idx] = { ...newSchedule[idx], workout, type: meta.type, duration: meta.duration };
    });
    setSchedule(newSchedule);
    overlay.remove();
    renderWorkouts();
  });
}

// ============================================
// PEDOMETER — Accelerometer-based step counter
// ============================================
const Pedometer = {
  active: false,
  _listener: null,
  // Peak-detection state
  _lastMag: 0,
  _lastTime: 0,
  _rising: false,
  // Thresholds tuned for walking cadence
  PEAK_THRESHOLD: 11.5,   // magnitude threshold to register a peak (m/s^2)
  MIN_STEP_INTERVAL: 250, // minimum ms between steps (prevents double-count)
  // Low-pass filter
  _filteredX: 0,
  _filteredY: 0,
  _filteredZ: 0,
  FILTER_ALPHA: 0.2,

  isSupported() {
    return 'DeviceMotionEvent' in window;
  },

  async requestPermission() {
    // iOS 13+ requires explicit permission
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const perm = await DeviceMotionEvent.requestPermission();
      return perm === 'granted';
    }
    return true; // Android / desktop don't need permission
  },

  start() {
    if (this.active) return;
    this.active = true;
    Store.setData('pedometer_active', true);

    this._listener = (e) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null) return;

      // Low-pass filter to smooth noise
      this._filteredX = this._filteredX + this.FILTER_ALPHA * (acc.x - this._filteredX);
      this._filteredY = this._filteredY + this.FILTER_ALPHA * (acc.y - this._filteredY);
      this._filteredZ = this._filteredZ + this.FILTER_ALPHA * (acc.z - this._filteredZ);

      const mag = Math.sqrt(
        this._filteredX ** 2 + this._filteredY ** 2 + this._filteredZ ** 2
      );

      const now = Date.now();

      // Detect peak: magnitude was rising and now falling past threshold
      if (this._rising && mag < this._lastMag && this._lastMag > this.PEAK_THRESHOLD) {
        if (now - this._lastTime > this.MIN_STEP_INTERVAL) {
          this._lastTime = now;
          this._recordStep();
        }
      }

      this._rising = mag > this._lastMag;
      this._lastMag = mag;
    };

    window.addEventListener('devicemotion', this._listener);
  },

  stop() {
    if (!this.active) return;
    this.active = false;
    Store.setData('pedometer_active', false);
    if (this._listener) {
      window.removeEventListener('devicemotion', this._listener);
      this._listener = null;
    }
  },

  _recordStep() {
    const steps = Store.getData('steps_today', 0) + 1;
    Store.setData('steps_today', steps);

    // Update hourly bucket
    const hourIdx = Math.max(0, Math.min(new Date().getHours() - 6, 15));
    const hourly = Store.getData('steps_hourly', null) || new Array(16).fill(0);
    hourly[hourIdx] = (hourly[hourIdx] || 0) + 1;
    Store.setData('steps_hourly', hourly);

    // Update weekly bucket
    const todayDayIdx = (new Date().getDay() + 6) % 7;
    const week = Store.getData('steps_week', [0, 0, 0, 0, 0, 0, 0]);
    week[todayDayIdx] = steps;
    Store.setData('steps_week', week);

    // Live UI update if on steps page
    const ringText = document.querySelector('.ring-center-text .display-md');
    if (ringText) {
      ringText.textContent = steps.toLocaleString();
    }
    const liveCounter = document.getElementById('pedometer-live-count');
    if (liveCounter) {
      liveCounter.textContent = steps.toLocaleString();
    }

    // Check goal
    const goal = Store.getData('steps_goal', 10000);
    if (steps >= goal && (steps - 1) < goal) {
      const cs = Store.getData('steps_current_streak', 0) + 1;
      Store.setData('steps_current_streak', cs);
      const bs = Store.getData('steps_best_streak', 0);
      if (cs > bs) Store.setData('steps_best_streak', cs);
      checkGoalNotifications();
    }
  },

  // Resume on app load if was previously active
  resume() {
    if (Store.getData('pedometer_active', false) && this.isSupported()) {
      this.start();
    }
  }
};

// Auto-resume pedometer on load
Pedometer.resume();

// ============================================
// HEART RATE MONITOR — Simulated live HR
// ============================================
const HeartRateMonitor = {
  active: false,
  _interval: null,
  _baseBPM: 72,
  _drift: 0,

  start() {
    if (this.active) return;
    this.active = true;
    this._baseBPM = 68 + Math.random() * 7; // base resting 68-75
    this._drift = 0;
    Store.setData('hr_active', true);
    this._tick();
    this._interval = setInterval(() => this._tick(), 2000);
  },

  stop() {
    if (!this.active) return;
    this.active = false;
    Store.setData('hr_active', false);
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  },

  _tick() {
    // Smoothed random walk for natural fluctuation
    this._drift += (Math.random() - 0.5) * 2;
    this._drift = Math.max(-6, Math.min(6, this._drift)) * 0.9;
    const bpm = Math.round(this._baseBPM + this._drift);
    const clamped = Math.max(55, Math.min(110, bpm));
    Store.setData('hr_current', clamped);

    // Store history (keep last 20)
    const hist = Store.getData('hr_history', []);
    hist.push(clamped);
    if (hist.length > 20) hist.shift();
    Store.setData('hr_history', hist);

    // Live UI update
    const bpmEl = document.getElementById('hr-bpm-value');
    if (bpmEl) bpmEl.textContent = clamped;
    const zoneEl = document.getElementById('hr-zone-badge');
    if (zoneEl) {
      const z = this.getZone(clamped);
      zoneEl.textContent = z.name;
      zoneEl.style.background = z.bg;
      zoneEl.style.color = z.color;
    }
    // Update sparkline
    const sparkEl = document.getElementById('hr-sparkline');
    if (sparkEl) sparkEl.innerHTML = this._renderSparkline();
    // Update stats
    const avgEl = document.getElementById('hr-avg');
    const minEl = document.getElementById('hr-min');
    const maxEl = document.getElementById('hr-max');
    if (avgEl && hist.length > 0) avgEl.textContent = Math.round(hist.reduce((a, b) => a + b, 0) / hist.length);
    if (minEl && hist.length > 0) minEl.textContent = Math.min(...hist);
    if (maxEl && hist.length > 0) maxEl.textContent = Math.max(...hist);
    // Update pulse animation speed
    const pulseEl = document.getElementById('hr-pulse-icon');
    if (pulseEl) pulseEl.style.animationDuration = (60 / clamped).toFixed(2) + 's';
  },

  getZone(bpm) {
    if (bpm < 60) return { name: 'Low', bg: 'rgba(97,194,255,0.15)', color: 'var(--tertiary)' };
    if (bpm < 80) return { name: 'Resting', bg: 'rgba(76,175,80,0.15)', color: '#4caf50' };
    if (bpm < 100) return { name: 'Fat Burn', bg: 'rgba(255,183,77,0.15)', color: '#ffb74d' };
    if (bpm < 140) return { name: 'Cardio', bg: 'rgba(255,107,107,0.15)', color: 'var(--error)' };
    return { name: 'Peak', bg: 'rgba(213,0,0,0.2)', color: '#d50000' };
  },

  getCurrentBPM() {
    return Store.getData('hr_current', 72);
  },

  _renderSparkline() {
    const hist = Store.getData('hr_history', []);
    if (hist.length < 2) return '';
    const min = Math.min(...hist) - 2;
    const max = Math.max(...hist) + 2;
    const range = max - min || 1;
    const w = 200, h = 40;
    const points = hist.map((v, i) => {
      const x = (i / (hist.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;width:100%;height:${h}px">
      <polyline points="${points}" fill="none" stroke="var(--error)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
      <circle cx="${(w).toFixed(1)}" cy="${(h - ((hist[hist.length-1] - min) / range) * h).toFixed(1)}" r="3" fill="var(--error)"/>
    </svg>`;
  },

  resume() {
    if (Store.getData('hr_active', false)) {
      this.start();
    }
  }
};

// Auto-resume heart rate monitor on load
HeartRateMonitor.resume();

// ============================================
// PAGE: Step Tracking
// ============================================
function renderSteps() {
  const steps = Store.getData('steps_today', 0);
  const goal = Store.getData('steps_goal', 10000);
  const pct = Math.round((steps / goal) * 100);
  const distance = (steps * 0.000762).toFixed(1); // approx stride
  const cals = Math.round(steps * 0.04);

  // Weekly step history from storage
  const storedWeekSteps = Store.getData('steps_week', [0, 0, 0, 0, 0, 0, 0]);
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekData = dayLabels.map((label, i) => ({
    label,
    value: i < storedWeekSteps.length ? storedWeekSteps[i] : (i === dayLabels.length - 1 ? steps : 0),
  }));
  // Ensure today's steps are in the week
  const todayDayIdx = (new Date().getDay() + 6) % 7; // Mon=0..Sun=6
  weekData[todayDayIdx].value = steps;

  // Hourly breakdown — distribute today's steps across hours up to current hour
  const currentHour = new Date().getHours();
  const hourLabels = ['6a','7a','8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p','8p','9p'];
  const storedHourSteps = Store.getData('steps_hourly', null);
  let hourData;
  if (storedHourSteps && storedHourSteps.length > 0) {
    hourData = hourLabels.map((label, i) => ({ label, value: storedHourSteps[i] || 0 }));
  } else {
    // Distribute steps realistically across active hours
    const activeHours = Math.max(1, Math.min(currentHour - 6, hourLabels.length));
    let remaining = steps;
    hourData = hourLabels.map((label, i) => {
      if (i >= activeHours) return { label, value: 0 };
      // Distribute with some variation (peak at morning & lunch)
      const weights = [0.05, 0.15, 0.1, 0.05, 0.08, 0.12, 0.14, 0.09, 0.06, 0.04, 0.08, 0.04, 0.0, 0.0, 0.0, 0.0];
      const val = Math.round(steps * (weights[i] || 0.05));
      remaining -= val;
      return { label, value: Math.max(0, val) };
    });
    // Put any remainder in the last active hour
    if (activeHours > 0 && remaining > 0) hourData[activeHours - 1].value += remaining;
  }

  const avgSteps = Math.round(weekData.reduce((a, b) => a + b.value, 0) / 7);

  // Streaks from storage
  const currentStreak = Store.getData('steps_current_streak', 0);
  const bestStreak = Store.getData('steps_best_streak', 0);

  // Distance goal — 8km typical daily walk goal
  const distGoal = 8;
  const distPct = Math.min(100, Math.round((parseFloat(distance) / distGoal) * 100));
  // Calorie burn goal — ~400 kcal from walking
  const calBurnGoal = 400;
  const calBurnPct = Math.min(100, Math.round((cals / calBurnGoal) * 100));

  app().innerHTML = `
    ${topBar('KINETIC')}
    <div class="page-content stagger">
      <h1 class="headline-lg" style="margin-bottom:var(--spacing-1)">Step Tracking</h1>
      <p class="body-md text-surface-variant" style="margin-bottom:var(--spacing-8)">Every step counts towards your goal</p>

      <!-- Main Ring -->
      <div style="text-align:center;margin-bottom:var(--spacing-6)">
        <div class="progress-ring-container" style="display:inline-block">
          ${createSVGRing(200, 12, pct)}
          <div class="ring-center-text" style="top:50%;left:50%;transform:translate(-50%,-50%)">
            <div class="display-md text-primary">${steps.toLocaleString()}</div>
            <div class="body-sm text-surface-variant">of ${goal.toLocaleString()}</div>
          </div>
        </div>
        <div style="margin-top:var(--spacing-3)">
          <span class="chip chip-active">${pct}% COMPLETED</span>
        </div>
      </div>

      <!-- Distance & Calories -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--spacing-3);margin-bottom:var(--spacing-6)">
        <div class="stat-card">
          <div style="display:flex;align-items:center;gap:var(--spacing-2)">
            <span class="material-symbols-rounded text-primary" style="font-size:20px">straighten</span>
            <span class="stat-label">Distance</span>
          </div>
          <div class="stat-value">${distance} km</div>
          <div style="height:4px;background:var(--surface-variant);border-radius:var(--radius-full);margin-top:var(--spacing-2);overflow:hidden">
            <div style="height:100%;width:${distPct}%;background:var(--primary);border-radius:var(--radius-full)"></div>
          </div>
        </div>
        <div class="stat-card">
          <div style="display:flex;align-items:center;gap:var(--spacing-2)">
            <span class="material-symbols-rounded text-tertiary" style="font-size:20px">local_fire_department</span>
            <span class="stat-label">Calories Burned</span>
          </div>
          <div class="stat-value" style="color:var(--tertiary)">${cals} kcal</div>
          <div style="height:4px;background:var(--surface-variant);border-radius:var(--radius-full);margin-top:var(--spacing-2);overflow:hidden">
            <div style="height:100%;width:${calBurnPct}%;background:var(--tertiary);border-radius:var(--radius-full)"></div>
          </div>
        </div>
      </div>

      <!-- Auto Step Tracking -->
      <div class="surface-card-high" style="margin-bottom:var(--spacing-6)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--spacing-3)">
          <div>
            <div class="title-md">Auto Step Tracking</div>
            <p class="body-sm text-surface-variant">${Pedometer.isSupported() ? 'Uses your device accelerometer' : 'Not supported on this device'}</p>
          </div>
          <label class="pedometer-toggle" style="position:relative;display:inline-block;width:52px;height:28px;flex-shrink:0">
            <input type="checkbox" id="pedometer-switch" ${Pedometer.active ? 'checked' : ''} ${!Pedometer.isSupported() ? 'disabled' : ''} style="opacity:0;width:0;height:0">
            <span class="pedometer-slider" style="position:absolute;cursor:pointer;inset:0;background:var(--surface-variant);border-radius:var(--radius-full);transition:all var(--transition-fast)"></span>
          </label>
        </div>
        ${Pedometer.active ? `
        <div style="display:flex;align-items:center;gap:var(--spacing-3);padding:var(--spacing-3);background:rgba(107,255,143,0.08);border-radius:var(--radius-lg)">
          <span class="material-symbols-rounded text-primary" style="font-size:20px;animation:pulse 1.5s infinite">directions_walk</span>
          <div>
            <div class="body-sm text-surface-variant">Live count</div>
            <div class="title-md text-primary" id="pedometer-live-count">${steps.toLocaleString()}</div>
          </div>
        </div>` : ''}
      </div>

      <!-- Live GPS Run Tracking -->
      <div class="surface-card-high" style="margin-bottom:var(--spacing-8);display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="window.location.hash='runner'">
        <div>
          <div class="title-md">GPS Running Tracker</div>
          <p class="body-sm text-surface-variant">Live metrics, map & sharing</p>
        </div>
        <button class="btn-primary" style="padding:10px 16px;font-size:0.875rem">
          Start Run <span class="material-symbols-rounded" style="font-size:16px;margin-left:4px">play_arrow</span>
        </button>
      </div>

      <!-- Hourly Breakdown -->
      <div class="section-header"><h3 class="section-title">Hourly Breakdown</h3></div>
      <div class="surface-card" style="margin-bottom:var(--spacing-8)">
        ${barChart(hourData, 1200)}
      </div>

      <!-- Weekly History -->
      <div class="section-header"><h3 class="section-title">Weekly History</h3></div>
      <div class="surface-card" style="margin-bottom:var(--spacing-6)">
        ${barChart(weekData, 12000)}
      </div>

      <!-- Average -->
      <div class="stat-card" style="margin-bottom:var(--spacing-6)">
        <span class="stat-label">Average Daily Steps</span>
        <div class="stat-value">${avgSteps.toLocaleString()}</div>
      </div>

      <!-- Streaks -->
      <div class="section-header"><h3 class="section-title">Step Streaks</h3></div>
      <div class="streak-grid" style="margin-bottom:var(--spacing-6)">
        <div class="streak-card">
          <div class="streak-icon">⚡</div>
          <div class="streak-value">${currentStreak}</div>
          <div class="streak-label">Current Streak (Days)</div>
        </div>
        <div class="streak-card">
          <div class="streak-icon">🏆</div>
          <div class="streak-value">${bestStreak}</div>
          <div class="streak-label">Best Streak (Days)</div>
        </div>
      </div>

      <!-- Manual Add -->
      <button class="btn-primary" id="add-steps-btn" style="margin-bottom:var(--spacing-6)">
        <span class="material-symbols-rounded">add</span>
        Log Steps Manually
      </button>
    </div>
    ${bottomNav('steps')}
  `;
  bindNav();

  // Pedometer toggle
  $('#pedometer-switch')?.addEventListener('change', async (e) => {
    if (e.target.checked) {
      const granted = await Pedometer.requestPermission();
      if (granted) {
        Pedometer.start();
        renderSteps();
      } else {
        e.target.checked = false;
        alert('Motion sensor permission is required for automatic step tracking.');
      }
    } else {
      Pedometer.stop();
      renderSteps();
    }
  });

  // Manual add
  $('#add-steps-btn')?.addEventListener('click', () => {
    const val = prompt('Enter steps to add:');
    if (val && !isNaN(val)) {
      const newSteps = steps + parseInt(val);
      Store.setData('steps_today', newSteps);
      // Update streak if goal met
      if (newSteps >= goal && steps < goal) {
        const cs = Store.getData('steps_current_streak', 0) + 1;
        Store.setData('steps_current_streak', cs);
        const bs = Store.getData('steps_best_streak', 0);
        if (cs > bs) Store.setData('steps_best_streak', cs);
      }
      checkGoalNotifications();
      renderSteps();
    }
  });
}

// ============================================
// PAGE: Water Intake
// ============================================
function renderWater() {
  const water = Store.getData('water_today', 0);
  const goal = Store.getData('water_goal', 3000);
  const pct = Math.round((water / goal) * 100);
  const logs = Store.getData('water_logs', []);

  const storedWeekWater = Store.getData('water_week', [0, 0, 0, 0, 0, 0, 0]);
  const waterDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekWater = waterDayLabels.map((label, i) => ({ label, value: storedWeekWater[i] || 0 }));
  const waterTodayIdx = (new Date().getDay() + 6) % 7;
  weekWater[waterTodayIdx].value = water;

  function addWater(ml) {
    const newW = water + ml;
    Store.setData('water_today', newW);
    const now = new Date();
    const h = now.getHours(); const m = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const timeStr = `${((h%12)||12).toString().padStart(2,'0')}:${m.toString().padStart(2,'0')} ${ampm}`;
    logs.push({ time: timeStr, amount: ml });
    Store.setData('water_logs', logs);
    checkGoalNotifications();
    renderWater();
  }

  app().innerHTML = `
    ${topBar('KINETIC')}
    <div class="page-content stagger">
      <h1 class="headline-lg" style="margin-bottom:var(--spacing-1)">Hydration</h1>
      <p class="body-md text-surface-variant" style="margin-bottom:var(--spacing-8)">Stay hydrated, stay powerful</p>

      <!-- Main Ring -->
      <div style="text-align:center;margin-bottom:var(--spacing-6)">
        <div class="progress-ring-container" style="display:inline-block">
          ${createSVGRing(200, 12, pct, 'var(--tertiary)')}
          <div class="ring-center-text" style="top:50%;left:50%;transform:translate(-50%,-50%)">
            <span class="material-symbols-rounded" style="font-size:28px;color:var(--tertiary);display:block;margin-bottom:4px">water_drop</span>
            <div class="display-sm" style="color:var(--tertiary)">${(water/1000).toFixed(1)}L</div>
            <div class="body-sm text-surface-variant">of ${(goal/1000).toFixed(1)}L</div>
          </div>
        </div>
        <div style="margin-top:var(--spacing-3)">
          <span class="chip chip-active" style="background:var(--tertiary);color:var(--on-tertiary)">${pct}% COMPLETED</span>
        </div>
      </div>

      <!-- Quick Add -->
      <div class="section-header"><h3 class="section-title">Quick Add</h3></div>
      <div class="quick-add-grid" style="margin-bottom:var(--spacing-8)">
        <div class="quick-add-btn" data-ml="250"><span class="material-symbols-rounded">water_drop</span>+250ml</div>
        <div class="quick-add-btn" data-ml="500"><span class="material-symbols-rounded">water_drop</span>+500ml</div>
        <div class="quick-add-btn" data-ml="750"><span class="material-symbols-rounded">water_drop</span>+750ml</div>
        <div class="quick-add-btn" data-ml="custom"><span class="material-symbols-rounded">tune</span>Custom</div>
      </div>

      <!-- Weekly -->
      <div class="section-header"><h3 class="section-title">Weekly Intake</h3></div>
      <div class="surface-card" style="margin-bottom:var(--spacing-8)">
        ${barChart(weekWater, 3500)}
      </div>

      <!-- Today's Log -->
      <div class="section-header"><h3 class="section-title">Today's Log</h3></div>
      <div class="surface-card" style="margin-bottom:var(--spacing-6)">
        ${logs.map((l, i) => `
          <div class="timeline-item ${i < logs.length - 1 ? 'timeline-line' : ''}">
            <div class="timeline-dot" style="background:var(--tertiary);box-shadow:0 0 8px rgba(97,194,255,0.3)"></div>
            <div class="timeline-content">
              <h4>${l.amount}ml</h4>
              <p>${l.time}</p>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Tips -->
      <div class="section-header"><h3 class="section-title">Hydration Tips</h3></div>
      <div class="tip-card" style="margin-bottom:var(--spacing-4)">
        <span class="material-symbols-rounded tip-icon">tips_and_updates</span>
        <div class="tip-text"><strong>Pro Tip:</strong> Drink 500ml of water within 30 minutes of waking up to kickstart your metabolism.</div>
      </div>
      <div class="tip-card" style="margin-bottom:var(--spacing-6)">
        <span class="material-symbols-rounded tip-icon">tips_and_updates</span>
        <div class="tip-text"><strong>Performance:</strong> Even 2% dehydration can reduce workout performance by up to 25%.</div>
      </div>

      <!-- Reminders Toggle -->
      <div class="surface-card" style="margin-bottom:var(--spacing-6)">
        <div class="toggle-row">
          <div>
            <div class="title-sm">Water Reminders</div>
            <div class="body-sm text-surface-variant">Get notified every 30 minutes</div>
          </div>
          <div class="toggle-switch ${Store.getData('water_reminder_on', true) ? 'active' : ''}" id="water-reminder-toggle">
            <div class="toggle-knob"></div>
          </div>
        </div>
      </div>
    </div>
    ${bottomNav('water')}
  `;
  bindNav();

  // Quick add buttons
  $$('.quick-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ml = btn.dataset.ml;
      if (ml === 'custom') {
        const val = prompt('Enter amount in ml:');
        if (val && !isNaN(val)) addWater(parseInt(val));
      } else {
        addWater(parseInt(ml));
      }
    });
  });

  // Water reminder toggle
  $('#water-reminder-toggle')?.addEventListener('click', function() {
    const isActive = this.classList.toggle('active');
    Store.setData('water_reminder_on', isActive);
    if (isActive) {
      startWaterReminder();
    } else {
      stopWaterReminder();
    }
  });
}

// ============================================
// Weekly weight reminder
// ============================================
let weightReminderInterval = null;
function startWeightReminder() {
  if (weightReminderInterval) clearInterval(weightReminderInterval);
  // Check every hour if it's been 7+ days
  weightReminderInterval = setInterval(() => {
    const last = Store.getData('last_weigh_date', 0);
    if (Date.now() - last > 7 * 24 * 60 * 60 * 1000) {
      alert('⚖️ Weekly Weigh-In Reminder\n\nIt\'s been a week since your last weigh-in. Head to Health Trends to log your weight!');
      addNotification('⚖️', 'Weekly Weigh-In', 'Time to log your weight in Health Trends.');
    }
  }, 60 * 60 * 1000); // check every hour
}
startWeightReminder();

// ============================================
// PAGE: Health Trends
// ============================================
function renderTrends() {
  const goalKey = Store.getData('fitness_goal', 'maintenance');
  const goal = FITNESS_GOALS[goalKey] || FITNESS_GOALS['maintenance'];

  // Get today's actual calorie intake from meals
  const trendMeals = getMeals();
  let todayCals = 0;
  for (const key in trendMeals) { todayCals += calcMealTotals(trendMeals[key]).cal; }

  const weightData = Store.getData('weight_history', []);
  const weightDates = Store.getData('weight_dates', []);
  const goalWeight = Store.getData('goal_weight', 0);
  const sleepData = Store.getData('sleep_history', []);
  const calHistory = Store.getData('cal_history', []);
  const calData = calHistory.length > 0 ? [...calHistory, todayCals || calHistory[calHistory.length - 1]] : (todayCals > 0 ? [todayCals] : []);
  const workoutHist = Store.getData('workout_history', []);
  const stepsWeek = Store.getData('steps_week', [0, 0, 0, 0, 0, 0, 0]);
  const waterWeek = Store.getData('water_week', [0, 0, 0, 0, 0, 0, 0]);

  // Computed metrics from actual data
  const weightChange = weightData.length >= 2 ? (weightData[weightData.length - 1] - weightData[0]).toFixed(1) : '0.0';
  const weeklyWeightChange = weightData.length >= 7 ? ((weightData[weightData.length - 1] - weightData[Math.max(0, weightData.length - 7)]) / 1).toFixed(1) : weightChange;
  const avgSleep = sleepData.length > 0 ? (sleepData.reduce((a, b) => a + b, 0) / sleepData.length).toFixed(1) : '0.0';
  const avgCals = calData.length > 0 ? Math.round(calData.reduce((a, b) => a + b, 0) / calData.length) : 0;

  // Macro accuracy: how close today's macros are to goal
  const trendAllTotals = { p: 0, c: 0, f: 0 };
  for (const key in trendMeals) {
    const t = calcMealTotals(trendMeals[key]);
    trendAllTotals.p += t.p; trendAllTotals.c += t.c; trendAllTotals.f += t.f;
  }
  const pAcc = goal.p > 0 ? Math.min(100, Math.round((trendAllTotals.p / goal.p) * 100)) : 0;
  const cAcc = goal.c > 0 ? Math.min(100, Math.round((trendAllTotals.c / goal.c) * 100)) : 0;
  const fAcc = goal.f > 0 ? Math.min(100, Math.round((trendAllTotals.f / goal.f) * 100)) : 0;
  const macroAccuracy = Math.round((pAcc + cAcc + fAcc) / 3);

  // Workout stats
  const totalWorkouts = workoutHist.length;
  const thisWeekWorkouts = workoutHist.filter(w => Date.now() - w.date < 7 * 24 * 60 * 60 * 1000).length;
  const totalWorkoutMins = workoutHist.reduce((a, w) => a + (w.duration || 0), 0);
  const avgWorkoutMins = totalWorkouts > 0 ? Math.round(totalWorkoutMins / totalWorkouts) : 0;

  // Steps this week
  const totalStepsWeek = stepsWeek.reduce((a, b) => a + b, 0);
  const avgStepsDay = Math.round(totalStepsWeek / 7);
  const stepsToday = Store.getData('steps_today', 0);

  // Water this week
  const totalWaterWeek = waterWeek.reduce((a, b) => a + b, 0);
  const avgWaterDay = Math.round(totalWaterWeek / 7);

  // Weight goal progress
  const currentWeight = weightData.length > 0 ? weightData[weightData.length - 1] : 0;
  const weightToGo = goalWeight > 0 && currentWeight > 0 ? (goalWeight - currentWeight).toFixed(1) : null;
  const weightGoalPct = goalWeight > 0 && weightData.length >= 2 ? Math.min(100, Math.max(0, Math.round(Math.abs(weightData[0] - currentWeight) / Math.abs(weightData[0] - goalWeight) * 100))) : 0;

  // Last weigh-in info
  const lastWeighDate = Store.getData('last_weigh_date', 0);
  const daysSinceWeigh = lastWeighDate > 0 ? Math.floor((Date.now() - lastWeighDate) / (24 * 60 * 60 * 1000)) : null;

  function sparklinePath(data, width, height, pad = 4) {
    const minV = Math.min(...data);
    const maxV = Math.max(...data);
    const range = maxV - minV || 1;
    const step = (width - pad * 2) / (data.length - 1);
    return data.map((v, i) => {
      const x = pad + i * step;
      const y = height - pad - ((v - minV) / range) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }
  function sparklineArea(data, width, height, pad = 4) {
    const path = sparklinePath(data, width, height, pad);
    const step = (width - pad * 2) / (data.length - 1);
    const lastX = pad + (data.length - 1) * step;
    return `${path} L ${lastX} ${height} L ${pad} ${height} Z`;
  }

  // --- Calorie-based diet insights ---
  const trendCalPct = Math.round((todayCals / goal.cal) * 100);
  const trendCalDiff = todayCals - goal.cal;
  const trendDietPref = getDietPref();
  let tInsightIcon, tInsightColor, tInsightTitle, tInsightDesc, tInsightTips, tInsightAvoid, tInsightAdd;

  if (trendCalPct > 100) {
    tInsightIcon = '⚠️';
    tInsightColor = 'var(--error)';
    tInsightTitle = 'Over Calorie Target';
    tInsightDesc = "You've consumed " + todayCals.toLocaleString() + " kcal — that's " + Math.abs(trendCalDiff) + " kcal over your " + goal.cal + " target.";
    tInsightTips = [
      'Skip calorie-dense snacks for the rest of the day',
      'Opt for a lighter dinner — salads, soups, or grilled veggies',
      'Add a 20-30 min walk or light cardio to offset surplus',
      'Drink plenty of water to curb unnecessary hunger pangs',
    ];
    tInsightAvoid = (goalKey === 'weight_loss' || goalKey === 'competition')
      ? ['Fried foods (samosa, paratha, pakora)', 'Sugary drinks & desserts', 'Extra rice/naan servings', 'Heavy curries with cream/butter']
      : ['Excess oil/ghee in cooking', 'Second helpings of carb-heavy dishes', 'Sweetened beverages', 'Late-night heavy meals'];
    tInsightAdd = trendDietPref === 'nonveg'
      ? ['Grilled chicken salad', 'Clear chicken soup', 'Boiled eggs', 'Tandoori fish (no cream)']
      : trendDietPref === 'vegan'
      ? ['Vegetable clear soup', 'Cucumber & tomato salad', 'Moong dal water', 'Steamed veggies']
      : ['Raita with cucumber', 'Steamed idli (no oil)', 'Clear dal soup', 'Buttermilk/chaas'];
  } else if (trendCalPct < 70) {
    tInsightIcon = '📉';
    tInsightColor = 'var(--tertiary)';
    tInsightTitle = 'Below Calorie Target';
    tInsightDesc = 'Only ' + todayCals.toLocaleString() + ' kcal consumed — you need ' + Math.abs(trendCalDiff) + ' more kcal to hit your ' + goal.cal + ' target.';
    tInsightTips = [
      'Add a calorie-dense, nutritious meal or snack soon',
      'Include healthy fats — peanut butter, ghee, nuts, avocado',
      "Don't skip meals; undereating slows metabolism long-term",
      goalKey === 'muscle_gain' ? 'Protein shake with banana is a quick 400+ kcal boost' : 'A balanced snack with protein + carbs helps fill the gap',
    ];
    tInsightAvoid = ['Skipping dinner or meals', 'Filling up on only water/coffee', 'Zero-calorie foods only', 'Ignoring hunger signals'];
    tInsightAdd = trendDietPref === 'nonveg'
      ? ['Chicken biryani', 'Egg bhurji with roti', 'Butter chicken + naan', 'Protein shake + banana']
      : trendDietPref === 'vegan'
      ? ['Peanut butter on roti', 'Chana masala + rice', 'Banana smoothie', 'Aloo paratha with chutney']
      : ['Paneer butter masala + naan', 'Dal makhani + rice', 'Protein shake with milk', 'Paratha with curd'];
  } else if (trendCalPct < 90) {
    tInsightIcon = '💡';
    tInsightColor = 'var(--secondary)';
    tInsightTitle = 'Almost There — Keep Going!';
    tInsightDesc = todayCals.toLocaleString() + ' of ' + goal.cal + ' kcal consumed (' + trendCalPct + '%). Just ' + Math.abs(trendCalDiff) + ' kcal to go!';
    tInsightTips = [
      'A well-balanced meal or snack will get you to your target',
      'Focus on protein to hit both calorie and macro goals',
      'Avoid overeating in a rush — spread remaining calories wisely',
    ];
    tInsightAvoid = ['Junk food binge to fill the gap', 'Sugary snacks that spike insulin', 'Skipping the remaining calories entirely'];
    tInsightAdd = trendDietPref === 'nonveg'
      ? ['Grilled chicken with salad', 'Egg roll/wrap', 'Chicken tikka (4-5 pcs)']
      : trendDietPref === 'vegan'
      ? ['Moong dal + roti', 'Hummus with veggies', 'Peanut butter banana toast']
      : ['Paneer tikka', 'Curd rice', 'Whey protein shake'];
  } else {
    tInsightIcon = '✅';
    tInsightColor = 'var(--primary)';
    tInsightTitle = 'Calorie Goal On Track!';
    tInsightDesc = 'Great job! ' + todayCals.toLocaleString() + ' kcal consumed — right on target for your ' + goal.name + ' goal.';
    tInsightTips = [
      'Maintain this consistency for best results',
      'Ensure your protein intake is also hitting the target',
      'Stay hydrated — aim for 3L+ water daily',
      'Good nutrition + consistent workouts = unstoppable progress',
    ];
    tInsightAvoid = ['Overeating in celebration', 'Skipping workouts since diet is on point', 'Late-night snacking out of habit'];
    tInsightAdd = trendDietPref === 'nonveg'
      ? ['Tandoori chicken for dinner', 'Boiled egg whites as snack', 'Fish curry (light gravy)']
      : trendDietPref === 'vegan'
      ? ['Sprout salad', 'Sambhar with idli', 'Fresh fruit bowl']
      : ['Greek yogurt with nuts', 'Paneer bhurji', 'Mixed dal with roti'];
  }

  const trendInsightHTML = `
    <div class="section-header" style="margin-top:var(--spacing-2)"><h3 class="section-title">Diet Insights</h3></div>
    <div class="trend-insight-card" style="border-left:3px solid ${tInsightColor}">
      <div class="trend-insight-header">
        <span class="trend-insight-icon">${tInsightIcon}</span>
        <div>
          <div class="trend-insight-title" style="color:${tInsightColor}">${tInsightTitle}</div>
          <div class="trend-insight-desc">${tInsightDesc}</div>
        </div>
      </div>
      <div class="trend-insight-tips">
        ${tInsightTips.map(t => '<div class="trend-tip"><span class="material-symbols-rounded" style="font-size:14px;color:' + tInsightColor + ';flex-shrink:0">lightbulb</span><span>' + t + '</span></div>').join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--spacing-3);margin-top:var(--spacing-4)">
        <div class="trend-list-card trend-avoid">
          <div class="trend-list-header"><span class="material-symbols-rounded" style="font-size:14px;color:var(--error)">block</span> Avoid</div>
          ${tInsightAvoid.map(a => '<div class="trend-list-item">' + a + '</div>').join('')}
        </div>
        <div class="trend-list-card trend-add">
          <div class="trend-list-header"><span class="material-symbols-rounded" style="font-size:14px;color:var(--primary)">add_circle</span> Add</div>
          ${tInsightAdd.map(a => '<div class="trend-list-item">' + a + '</div>').join('')}
        </div>
      </div>
    </div>`;

  app().innerHTML = `
    ${topBar('KINETIC')}
    <div class="page-content stagger">
      <h1 class="headline-lg" style="margin-bottom:var(--spacing-1)">Health Trends</h1>
      <p class="body-md text-surface-variant" style="margin-bottom:var(--spacing-6)">Your progress over time</p>

      <!-- Goal Progress Hero -->
      <div style="background:linear-gradient(135deg, var(--surface-container) 0%, var(--surface-container-high) 100%);border-radius:var(--radius-xl);padding:var(--spacing-5);margin-bottom:var(--spacing-6);border:1px solid rgba(107,255,143,0.2)">
        <div style="display:flex;align-items:center;gap:var(--spacing-3);margin-bottom:var(--spacing-4)">
          <div style="width:44px;height:44px;border-radius:var(--radius-lg);background:rgba(107,255,143,0.12);display:flex;align-items:center;justify-content:center">
            <span style="font-size:1.5rem">${goal.emoji}</span>
          </div>
          <div style="flex:1">
            <div class="title-md text-primary">${goal.name}</div>
            <div class="body-sm text-surface-variant">${goal.desc}</div>
          </div>
          <span class="material-symbols-rounded text-primary" style="font-size:28px">emoji_events</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--spacing-3)">
          <div style="background:var(--surface-container);padding:var(--spacing-3);border-radius:var(--radius-lg);text-align:center">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--primary);display:block;margin-bottom:2px">local_fire_department</span>
            <div style="font-family:var(--font-display);font-size:1.2rem;font-weight:800;color:var(--on-surface)">${goal.cal}</div>
            <div class="label-sm text-surface-variant">KCAL/DAY</div>
          </div>
          <div style="background:var(--surface-container);padding:var(--spacing-3);border-radius:var(--radius-lg);text-align:center">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--tertiary);display:block;margin-bottom:2px">egg_alt</span>
            <div style="font-family:var(--font-display);font-size:1.2rem;font-weight:800;color:var(--on-surface)">${goal.p}g</div>
            <div class="label-sm text-surface-variant">PROTEIN</div>
          </div>
          <div style="background:var(--surface-container);padding:var(--spacing-3);border-radius:var(--radius-lg);text-align:center">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--secondary);display:block;margin-bottom:2px">grain</span>
            <div style="font-family:var(--font-display);font-size:1.2rem;font-weight:800;color:var(--on-surface)">${goal.c}g</div>
            <div class="label-sm text-surface-variant">CARBS</div>
          </div>
        </div>
      </div>

      <!-- Weight Log & Goal -->
      <div style="background:linear-gradient(135deg, var(--surface-container) 0%, var(--surface-container-high) 100%);border-radius:var(--radius-xl);padding:var(--spacing-5);margin-bottom:var(--spacing-6);border:1px solid rgba(64,72,93,0.12)">
        <div style="display:flex;align-items:center;gap:var(--spacing-2);margin-bottom:var(--spacing-4)">
          <span class="material-symbols-rounded" style="font-size:22px;color:var(--primary)">monitor_weight</span>
          <span class="title-md">Weight Tracker</span>
          ${daysSinceWeigh !== null ? `<span class="body-sm text-surface-variant" style="margin-left:auto">${daysSinceWeigh === 0 ? 'Logged today' : daysSinceWeigh + 'd ago'}</span>` : ''}
        </div>
        <!-- Current & Goal -->
        <div style="display:flex;gap:var(--spacing-3);margin-bottom:var(--spacing-4)">
          <div style="flex:1;background:var(--surface-container);border-radius:var(--radius-lg);padding:var(--spacing-3);text-align:center">
            <div class="label-sm text-surface-variant" style="margin-bottom:4px">CURRENT</div>
            <div style="font-family:var(--font-display);font-size:1.8rem;font-weight:900;color:var(--on-surface)">${currentWeight > 0 ? currentWeight : '--'}</div>
            <div class="body-sm text-surface-variant">kg</div>
          </div>
          <div style="display:flex;align-items:center">
            <span class="material-symbols-rounded" style="font-size:20px;color:var(--surface-variant)">arrow_forward</span>
          </div>
          <div style="flex:1;background:var(--surface-container);border-radius:var(--radius-lg);padding:var(--spacing-3);text-align:center">
            <div class="label-sm text-surface-variant" style="margin-bottom:4px">GOAL</div>
            <div style="font-family:var(--font-display);font-size:1.8rem;font-weight:900;color:var(--primary)">${goalWeight > 0 ? goalWeight : '--'}</div>
            <div class="body-sm text-surface-variant">kg</div>
          </div>
        </div>
        ${goalWeight > 0 && currentWeight > 0 ? `
        <!-- Goal progress bar -->
        <div style="margin-bottom:var(--spacing-3)">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span class="body-sm text-surface-variant">${weightGoalPct}% to goal</span>
            <span class="body-sm" style="color:var(--primary);font-weight:700">${weightToGo > 0 ? '+' : ''}${weightToGo} kg to go</span>
          </div>
          <div style="height:8px;background:var(--surface-container-high);border-radius:var(--radius-full);overflow:hidden">
            <div style="height:100%;width:${Math.min(100, weightGoalPct)}%;background:linear-gradient(90deg,var(--primary),var(--primary-container));border-radius:var(--radius-full);transition:width 0.5s ease"></div>
          </div>
        </div>
        ` : ''}
        <!-- Input Row -->
        <div style="display:flex;gap:var(--spacing-2)">
          <input type="number" id="trend-weight-input" placeholder="Weight (kg)" step="0.1" min="20" max="300" inputmode="decimal" style="flex:1;padding:var(--spacing-2) var(--spacing-3);border-radius:var(--radius-lg);border:1px solid var(--surface-variant);background:var(--surface-container-high);color:var(--on-surface);font-size:0.9rem;font-family:var(--font-body)" value="${currentWeight > 0 ? currentWeight : ''}"/>
          <button class="btn-primary" id="trend-log-weight" style="padding:var(--spacing-2) var(--spacing-4);white-space:nowrap">
            <span class="material-symbols-rounded" style="font-size:16px">add</span> Log
          </button>
        </div>
        <div style="display:flex;gap:var(--spacing-2);margin-top:var(--spacing-2)">
          <input type="number" id="trend-goal-weight" placeholder="Goal weight (kg)" step="0.1" min="20" max="300" inputmode="decimal" style="flex:1;padding:var(--spacing-2) var(--spacing-3);border-radius:var(--radius-lg);border:1px solid var(--surface-variant);background:var(--surface-container-high);color:var(--on-surface);font-size:0.9rem;font-family:var(--font-body)" value="${goalWeight > 0 ? goalWeight : ''}"/>
          <button class="btn-secondary" id="trend-set-goal-weight" style="padding:var(--spacing-2) var(--spacing-4);white-space:nowrap">
            <span class="material-symbols-rounded" style="font-size:16px">flag</span> Set Goal
          </button>
        </div>
        <!-- Weight sparkline -->
        ${weightData.length >= 2 ? `
        <div style="margin-top:var(--spacing-4)">
          <svg class="sparkline-svg" viewBox="0 0 320 80">
            <defs><linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.3"/>
              <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
            </linearGradient></defs>
            <path class="area" d="${sparklineArea(weightData, 320, 80)}"/>
            <path class="line" d="${sparklinePath(weightData, 320, 80)}"/>
            ${goalWeight > 0 ? `<line x1="0" y1="${80 - 4 - ((goalWeight - Math.min(...weightData) + 2) / ((Math.max(...weightData) + 2) - (Math.min(...weightData) - 2) || 1)) * 72}" x2="320" y2="${80 - 4 - ((goalWeight - Math.min(...weightData) + 2) / ((Math.max(...weightData) + 2) - (Math.min(...weightData) - 2) || 1)) * 72}" stroke="var(--primary)" stroke-width="1" stroke-dasharray="6,4" opacity="0.5"/>` : ''}
          </svg>
          <div style="display:flex;justify-content:space-between">
            <span class="label-sm text-surface-variant">${weightData.length} entries</span>
            <span class="label-sm" style="color:var(--primary)">${weightChange > 0 ? '+' : ''}${weightChange} kg total</span>
          </div>
        </div>
        ` : '<div class="body-sm text-surface-variant" style="text-align:center;margin-top:var(--spacing-3)">Log your weight to see the trend chart</div>'}
      </div>

      <!-- Weekly Overview Cards -->
      <div class="section-header"><h3 class="section-title">This Week</h3></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--spacing-3);margin-bottom:var(--spacing-6)">
        <!-- Workouts -->
        <div style="background:var(--surface-container);border-radius:var(--radius-xl);padding:var(--spacing-4)">
          <div style="display:flex;align-items:center;gap:var(--spacing-2);margin-bottom:var(--spacing-3)">
            <div style="width:32px;height:32px;border-radius:var(--radius-full);background:rgba(107,255,143,0.1);display:flex;align-items:center;justify-content:center">
              <span class="material-symbols-rounded" style="font-size:16px;color:var(--primary)">fitness_center</span>
            </div>
            <span class="title-sm">Workouts</span>
          </div>
          <div style="font-family:var(--font-display);font-size:2rem;font-weight:900;color:var(--on-surface);line-height:1">${thisWeekWorkouts}</div>
          <div class="body-sm text-surface-variant">sessions this week</div>
          <div style="margin-top:var(--spacing-2);font-family:var(--font-display);font-size:0.85rem;font-weight:700;color:var(--primary)">${avgWorkoutMins} min avg</div>
        </div>
        <!-- Steps -->
        <div style="background:var(--surface-container);border-radius:var(--radius-xl);padding:var(--spacing-4)">
          <div style="display:flex;align-items:center;gap:var(--spacing-2);margin-bottom:var(--spacing-3)">
            <div style="width:32px;height:32px;border-radius:var(--radius-full);background:rgba(107,255,143,0.1);display:flex;align-items:center;justify-content:center">
              <span class="material-symbols-rounded" style="font-size:16px;color:var(--primary)">directions_walk</span>
            </div>
            <span class="title-sm">Steps</span>
          </div>
          <div style="font-family:var(--font-display);font-size:2rem;font-weight:900;color:var(--on-surface);line-height:1">${stepsToday.toLocaleString()}</div>
          <div class="body-sm text-surface-variant">today</div>
          <div style="margin-top:var(--spacing-2);font-family:var(--font-display);font-size:0.85rem;font-weight:700;color:var(--primary)">${avgStepsDay.toLocaleString()} avg/day</div>
        </div>
        <!-- Calories -->
        <div style="background:var(--surface-container);border-radius:var(--radius-xl);padding:var(--spacing-4)">
          <div style="display:flex;align-items:center;gap:var(--spacing-2);margin-bottom:var(--spacing-3)">
            <div style="width:32px;height:32px;border-radius:var(--radius-full);background:rgba(255,183,77,0.1);display:flex;align-items:center;justify-content:center">
              <span class="material-symbols-rounded" style="font-size:16px;color:var(--secondary)">local_fire_department</span>
            </div>
            <span class="title-sm">Calories</span>
          </div>
          <div style="font-family:var(--font-display);font-size:2rem;font-weight:900;color:var(--on-surface);line-height:1">${todayCals.toLocaleString()}</div>
          <div class="body-sm text-surface-variant">kcal today</div>
          <div style="margin-top:var(--spacing-2);font-family:var(--font-display);font-size:0.85rem;font-weight:700;color:var(--secondary)">${avgCals.toLocaleString()} avg</div>
        </div>
        <!-- Water -->
        <div style="background:var(--surface-container);border-radius:var(--radius-xl);padding:var(--spacing-4)">
          <div style="display:flex;align-items:center;gap:var(--spacing-2);margin-bottom:var(--spacing-3)">
            <div style="width:32px;height:32px;border-radius:var(--radius-full);background:rgba(97,194,255,0.1);display:flex;align-items:center;justify-content:center">
              <span class="material-symbols-rounded" style="font-size:16px;color:var(--tertiary)">water_drop</span>
            </div>
            <span class="title-sm">Water</span>
          </div>
          <div style="font-family:var(--font-display);font-size:2rem;font-weight:900;color:var(--on-surface);line-height:1">${(Store.getData('water_today', 0) / 1000).toFixed(1)}L</div>
          <div class="body-sm text-surface-variant">today</div>
          <div style="margin-top:var(--spacing-2);font-family:var(--font-display);font-size:0.85rem;font-weight:700;color:var(--tertiary)">${(avgWaterDay / 1000).toFixed(1)}L avg</div>
        </div>
      </div>

      <!-- Key Metrics -->
      <div class="section-header"><h3 class="section-title">Key Metrics</h3></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--spacing-3);margin-bottom:var(--spacing-6)">
        <div style="background:var(--surface-container);border-radius:var(--radius-xl);padding:var(--spacing-4);text-align:center">
          <div style="width:36px;height:36px;border-radius:var(--radius-full);background:rgba(107,255,143,0.1);display:inline-flex;align-items:center;justify-content:center;margin-bottom:var(--spacing-2)">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--primary)">trending_${parseFloat(weeklyWeightChange) >= 0 ? 'up' : 'down'}</span>
          </div>
          <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:800;color:var(--on-surface)">${weeklyWeightChange > 0 ? '+' : ''}${weeklyWeightChange}</div>
          <div class="label-sm text-surface-variant" style="margin-top:2px">KG/WEEK</div>
        </div>
        <div style="background:var(--surface-container);border-radius:var(--radius-xl);padding:var(--spacing-4);text-align:center">
          <div style="width:36px;height:36px;border-radius:var(--radius-full);background:rgba(97,194,255,0.1);display:inline-flex;align-items:center;justify-content:center;margin-bottom:var(--spacing-2)">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--tertiary)">target</span>
          </div>
          <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:800;color:var(--tertiary)">${macroAccuracy}%</div>
          <div class="label-sm text-surface-variant" style="margin-top:2px">MACRO HIT</div>
        </div>
        <div style="background:var(--surface-container);border-radius:var(--radius-xl);padding:var(--spacing-4);text-align:center">
          <div style="width:36px;height:36px;border-radius:var(--radius-full);background:rgba(255,183,77,0.1);display:inline-flex;align-items:center;justify-content:center;margin-bottom:var(--spacing-2)">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--secondary)">restaurant</span>
          </div>
          <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:800;color:var(--secondary)">${avgCals.toLocaleString()}</div>
          <div class="label-sm text-surface-variant" style="margin-top:2px">KCAL/DAY</div>
        </div>
      </div>

      <!-- Sleep Trend -->
      <div class="trend-chart-container">
        <div class="trend-chart-header">
          <div style="display:flex;align-items:center;gap:var(--spacing-2)">
            <span class="material-symbols-rounded" style="font-size:20px;color:var(--tertiary)">bedtime</span>
            <div>
              <div class="title-md">Sleep Quality</div>
              <div class="body-sm text-surface-variant">Recovery & rest</div>
            </div>
          </div>
          <div class="trend-mini-stat">
            <div class="value" style="color:var(--tertiary)">${avgSleep}h</div>
            <div class="label">Average</div>
          </div>
        </div>
        <svg class="sparkline-svg" viewBox="0 0 320 80">
          <defs><linearGradient id="sleepGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--tertiary)" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="var(--tertiary)" stop-opacity="0"/>
          </linearGradient></defs>
          <path class="area" d="${sparklineArea(sleepData, 320, 80)}" style="fill:url(#sleepGrad)"/>
          <path class="line" d="${sparklinePath(sleepData, 320, 80)}" style="stroke:var(--tertiary)"/>
        </svg>
        <!-- Log sleep -->
        <div style="display:flex;gap:var(--spacing-2);margin-top:var(--spacing-3)">
          <input type="number" id="trend-sleep-input" placeholder="Hours slept" step="0.5" min="0" max="24" inputmode="decimal" style="flex:1;padding:var(--spacing-2) var(--spacing-3);border-radius:var(--radius-lg);border:1px solid var(--surface-variant);background:var(--surface-container-high);color:var(--on-surface);font-size:0.9rem;font-family:var(--font-body)"/>
          <button class="btn-primary" id="trend-log-sleep" style="padding:var(--spacing-2) var(--spacing-4);white-space:nowrap">
            <span class="material-symbols-rounded" style="font-size:16px">add</span> Log
          </button>
        </div>
      </div>

      <!-- Calorie Trend -->
      <div class="trend-chart-container">
        <div class="trend-chart-header">
          <div style="display:flex;align-items:center;gap:var(--spacing-2)">
            <span class="material-symbols-rounded" style="font-size:20px;color:var(--secondary)">local_fire_department</span>
            <div>
              <div class="title-md">Calorie Intake</div>
              <div class="body-sm text-surface-variant">Daily fuel tracking</div>
            </div>
          </div>
          <div class="trend-mini-stat">
            <div class="value" style="color:var(--secondary)">${calData.length > 0 ? Math.round(calData.reduce((a,b) => a+b, 0) / calData.length).toLocaleString() : '0'}</div>
            <div class="label">Average</div>
          </div>
        </div>
        ${calData.length >= 2 ? `
        <svg class="sparkline-svg" viewBox="0 0 320 80">
          <defs><linearGradient id="calGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--secondary)" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="var(--secondary)" stop-opacity="0"/>
          </linearGradient></defs>
          <path class="area" d="${sparklineArea(calData, 320, 80)}" style="fill:url(#calGrad)"/>
          <path class="line" d="${sparklinePath(calData, 320, 80)}" style="stroke:var(--secondary)"/>
        </svg>
        ` : '<div class="body-sm text-surface-variant" style="text-align:center;padding:var(--spacing-4)">Track meals in the Diet tab to see calorie trends</div>'}
      </div>

      <!-- Workout History -->
      ${workoutHist.length > 0 ? `
      <div class="section-header"><h3 class="section-title">Recent Workouts</h3></div>
      <div style="margin-bottom:var(--spacing-6)">
        ${workoutHist.slice(-5).reverse().map(w => `
        <div style="display:flex;align-items:center;gap:var(--spacing-3);padding:var(--spacing-3);background:var(--surface-container);border-radius:var(--radius-lg);margin-bottom:var(--spacing-2)">
          <div style="width:36px;height:36px;border-radius:var(--radius-full);background:rgba(107,255,143,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--primary)">fitness_center</span>
          </div>
          <div style="flex:1;min-width:0">
            <div class="title-sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${w.name}</div>
            <div class="body-sm text-surface-variant">${new Date(w.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="title-sm text-primary">${w.duration} min</div>
            <div class="body-sm text-surface-variant">${w.sets}/${w.totalSets} sets</div>
          </div>
        </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Steps Weekly Bar Chart -->
      <div class="section-header"><h3 class="section-title">Steps This Week</h3></div>
      <div style="background:var(--surface-container);border-radius:var(--radius-xl);padding:var(--spacing-4);margin-bottom:var(--spacing-6)">
        <div style="display:flex;align-items:flex-end;justify-content:space-between;height:100px;gap:var(--spacing-1)">
          ${['M','T','W','T','F','S','S'].map((d, i) => {
            const val = stepsWeek[i] || 0;
            const maxS = Math.max(...stepsWeek, 1);
            const hPct = Math.max(4, (val / maxS) * 100);
            const todayIdx = (new Date().getDay() + 6) % 7;
            const isToday = i === todayIdx;
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
              <div class="label-sm" style="color:${isToday ? 'var(--primary)' : 'var(--on-surface-variant)'};font-size:0.55rem">${val > 999 ? (val / 1000).toFixed(1) + 'k' : val}</div>
              <div style="width:100%;max-width:28px;height:${hPct}%;background:${isToday ? 'linear-gradient(180deg,var(--primary),var(--primary-container))' : 'var(--surface-container-high)'};border-radius:var(--radius-md);min-height:4px;transition:height 0.5s ease"></div>
              <div class="label-sm" style="color:${isToday ? 'var(--primary)' : 'var(--on-surface-variant)'};font-weight:${isToday ? '800' : '600'}">${d}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Smart Diet Suggestions Based on Calorie Status -->
      ${trendInsightHTML}
    </div>
    ${bottomNav('trends')}
  `;
  bindNav();

  // Log weight
  $('#trend-log-weight')?.addEventListener('click', () => {
    const val = parseFloat($('#trend-weight-input')?.value);
    if (!val || val < 20 || val > 300) return alert('Enter a valid weight (20-300 kg).');
    const wh = Store.getData('weight_history', []);
    wh.push(val);
    if (wh.length > 60) wh.shift();
    Store.setData('weight_history', wh);
    const wd = Store.getData('weight_dates', []);
    wd.push(Date.now());
    if (wd.length > 60) wd.shift();
    Store.setData('weight_dates', wd);
    Store.setData('last_weigh_date', Date.now());
    showGoalToast('Weight Logged', `${val} kg recorded`, '⚖️');
    renderTrends();
  });

  // Set goal weight
  $('#trend-set-goal-weight')?.addEventListener('click', () => {
    const val = parseFloat($('#trend-goal-weight')?.value);
    if (!val || val < 20 || val > 300) return alert('Enter a valid goal weight (20-300 kg).');
    Store.setData('goal_weight', val);
    showGoalToast('Goal Set', `Target: ${val} kg`, '🎯');
    renderTrends();
  });

  // Log sleep
  $('#trend-log-sleep')?.addEventListener('click', () => {
    const val = parseFloat($('#trend-sleep-input')?.value);
    if (!val || val < 0 || val > 24) return alert('Enter valid hours (0-24).');
    const sh = Store.getData('sleep_history', []);
    sh.push(val);
    if (sh.length > 30) sh.shift();
    Store.setData('sleep_history', sh);
    showGoalToast('Sleep Logged', `${val}h recorded`, '😴');
    renderTrends();
  });
}

// ============================================
// PAGE: GPS Runner
// ============================================
function renderRunner() {
  app().innerHTML = `
    <div class="runner-container pb-safe">
      <button class="btn-icon" id="runner-back-btn" style="position:absolute;top:16px;left:16px;z-index:1000;background:rgba(0,0,0,0.6);color:#fff;backdrop-filter:blur(4px)">
        <span class="material-symbols-rounded">arrow_back</span>
      </button>
      <div id="gps-status-badge" style="position:absolute;top:16px;right:16px;z-index:1000;background:rgba(0,0,0,0.6);color:var(--on-surface-variant);padding:6px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;display:flex;align-items:center;gap:6px;backdrop-filter:blur(4px)">
        <span class="material-symbols-rounded" style="font-size:14px" id="gps-icon">location_searching</span>
        <span id="gps-label">Acquiring GPS...</span>
      </div>
      <div id="runner-map" style="flex:1;min-height:250px;z-index:1"></div>
      <!-- Live Map Overlay Stats -->
      <div class="runner-map-overlay" id="runner-map-overlay" style="display:none">
        <div class="rmo-stat"><span class="rmo-val" id="rmo-dist">0.00</span><span class="rmo-lbl">KM</span></div>
        <div class="rmo-divider"></div>
        <div class="rmo-stat"><span class="rmo-val" id="rmo-pace">0:00</span><span class="rmo-lbl">MIN/KM</span></div>
        <div class="rmo-divider"></div>
        <div class="rmo-stat"><span class="rmo-val" id="rmo-cal">0</span><span class="rmo-lbl">KCAL</span></div>
      </div>
      <div class="runner-dashboard stagger">
        <div class="runner-timer" id="run-time">00:00:00</div>
        <div class="runner-metrics">
          <div>
            <div class="runner-metric-val" id="run-dist">0.00</div>
            <div class="runner-metric-lbl">Kilometers</div>
          </div>
          <div>
            <div class="runner-metric-val" id="run-speed">0.0</div>
            <div class="runner-metric-lbl">Pace (min/km)</div>
          </div>
          <div>
            <div class="runner-metric-val" id="run-elev">0</div>
            <div class="runner-metric-lbl">Elev Gain (m)</div>
          </div>
        </div>
        <div class="runner-controls">
          <button class="runner-btn runner-btn-stop" id="run-stop" style="display:none">
            <span class="material-symbols-rounded">stop</span>
          </button>
          <button class="runner-btn runner-btn-play" id="run-toggle">
            <span class="material-symbols-rounded">play_arrow</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // --- Leaflet Map Setup ---
  const defaultLat = 28.6139; // Default: New Delhi
  const defaultLng = 77.2090;
  const map = L.map('runner-map', {
    zoomControl: false,
    attributionControl: false,
  }).setView([defaultLat, defaultLng], 16);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  // Force map to recalculate its size after render
  setTimeout(() => map.invalidateSize(), 300);

  // Custom runner marker
  const runnerIcon = L.divIcon({
    className: 'runner-marker',
    html: '<div class="runner-marker-dot"><div class="runner-marker-pulse"></div></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  let runnerMarker = L.marker([defaultLat, defaultLng], { icon: runnerIcon }).addTo(map);
  let routePath = L.polyline([], { color: '#6bff8f', weight: 4, opacity: 0.9, smoothFactor: 1 }).addTo(map);
  let routeCoords = [];

  // --- Run State ---
  let isRunning = false;
  let startTime = 0;
  let elapsedTime = 0;
  let timerInterval = null;
  let geoWatchId = null;
  let totalDistance = 0;
  let currentSpeed = 0;
  let elevationGain = 0;
  let lastPos = null;
  let gpsLocked = false;

  // Mock GPS state for simulating movement
  let mockLat = defaultLat;
  let mockLng = defaultLng;
  let mockAngle = Math.random() * Math.PI * 2;

  function setGpsStatus(status) {
    const badge = $('#gps-status-badge');
    const icon = $('#gps-icon');
    const label = $('#gps-label');
    if (!badge || !icon || !label) return;
    if (status === 'locked') {
      icon.textContent = 'my_location';
      label.textContent = 'GPS Live';
      badge.style.color = 'var(--primary)';
      badge.style.borderColor = 'rgba(107,255,143,0.3)';
    } else if (status === 'mock') {
      icon.textContent = 'location_disabled';
      label.textContent = 'Simulated';
      badge.style.color = 'var(--tertiary)';
    } else {
      icon.textContent = 'location_searching';
      label.textContent = 'Acquiring GPS...';
      badge.style.color = 'var(--on-surface-variant)';
    }
  }

  // Try to center map on user's location immediately
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 16);
      runnerMarker.setLatLng([latitude, longitude]);
      // Update mock start coordinates to user's real position
      mockLat = latitude;
      mockLng = longitude;
      gpsLocked = true;
      setGpsStatus('locked');
    }, () => {
      setGpsStatus('mock');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  } else {
    setGpsStatus('mock');
  }

  function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function formatTime(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateUI() {
    const timeEl = $('#run-time');
    const distEl = $('#run-dist');
    const speedEl = $('#run-speed');
    const elevEl = $('#run-elev');
    if (timeEl) timeEl.textContent = formatTime(elapsedTime);
    if (distEl) distEl.textContent = totalDistance.toFixed(2);
    if (speedEl) speedEl.textContent = currentSpeed > 0 ? currentSpeed.toFixed(1) : '–';
    if (elevEl) elevEl.textContent = Math.round(elevationGain);
    // Update map overlay stats
    const calsBurned = Math.round(totalDistance * 65); // ~65 kcal per km
    const overlay = $('#runner-map-overlay');
    if (overlay && isRunning) overlay.style.display = 'flex';
    const rmoDist = $('#rmo-dist');
    const rmoPace = $('#rmo-pace');
    const rmoCal = $('#rmo-cal');
    if (rmoDist) rmoDist.textContent = totalDistance.toFixed(2);
    if (rmoPace) {
      if (currentSpeed > 0) { const m = Math.floor(currentSpeed); const s = Math.round((currentSpeed - m) * 60); rmoPace.textContent = `${m}:${String(s).padStart(2, '0')}`; }
      else rmoPace.textContent = '–';
    }
    if (rmoCal) rmoCal.textContent = calsBurned;
  }

  function addRoutePoint(lat, lng) {
    routeCoords.push([lat, lng]);
    routePath.setLatLngs(routeCoords);
    runnerMarker.setLatLng([lat, lng]);
    map.panTo([lat, lng], { animate: true, duration: 0.5 });
  }

  function mockGPS() {
    // Simulate a runner moving in a slightly curving path
    mockAngle += (Math.random() - 0.5) * 0.3;
    const stepSize = 0.00004; // ~4-5 meters per tick
    mockLat += Math.cos(mockAngle) * stepSize;
    mockLng += Math.sin(mockAngle) * stepSize;
    totalDistance += 0.005;
    currentSpeed = 5.3;
    elevationGain += Math.random() > 0.8 ? 1 : 0;
    addRoutePoint(mockLat, mockLng);
    updateUI();
  }

  function handleGeoPosition(pos) {
    const { latitude, longitude, speed, altitude, accuracy } = pos.coords;
    // Update mock coords so fallback continues from real position
    mockLat = latitude;
    mockLng = longitude;

    if (lastPos) {
      const d = calcDistance(lastPos.coords.latitude, lastPos.coords.longitude, latitude, longitude);
      // Only count movement if > 2m (filter GPS jitter) and accuracy is reasonable
      if (d > 0.002 && (!accuracy || accuracy < 50)) {
        totalDistance += d;
        if (speed && speed > 0) {
          currentSpeed = (1 / (speed * 3.6)) * 60; // m/s → min/km
        } else {
          currentSpeed = totalDistance > 0 ? (elapsedTime / 60000) / totalDistance : 0;
        }
        if (altitude && lastPos.coords.altitude && altitude > lastPos.coords.altitude) {
          elevationGain += (altitude - lastPos.coords.altitude);
        }
        addRoutePoint(latitude, longitude);
      } else if (d > 0.002) {
        // Low accuracy but still moving — update route without counting distance
        addRoutePoint(latitude, longitude);
      }
    } else {
      // First position — set the route start
      addRoutePoint(latitude, longitude);
    }
    lastPos = pos;
    updateUI();
  }

  // --- Play/Pause ---
  $('#run-toggle').addEventListener('click', () => {
    if (!isRunning) {
      isRunning = true;
      startTime = Date.now() - elapsedTime;
      $('#run-toggle').innerHTML = '<span class="material-symbols-rounded">pause</span>';
      $('#run-stop').style.display = 'flex';

      timerInterval = setInterval(() => {
        elapsedTime = Date.now() - startTime;
        updateUI();
      }, 1000);

      if ('geolocation' in navigator) {
        let gpsTimeout = setTimeout(() => {
          // If no GPS position received within 8s, start mock
          if (!gpsLocked && !window.mockGpsInterval) {
            setGpsStatus('mock');
            map.setView([mockLat, mockLng], 16);
            window.mockGpsInterval = setInterval(mockGPS, 1000);
          }
        }, 8000);

        geoWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            clearTimeout(gpsTimeout);
            gpsLocked = true;
            setGpsStatus('locked');
            // Stop mock if running
            if (window.mockGpsInterval) { clearInterval(window.mockGpsInterval); window.mockGpsInterval = null; }
            handleGeoPosition(pos);
          },
          () => {
            clearTimeout(gpsTimeout);
            setGpsStatus('mock');
            map.setView([mockLat, mockLng], 16);
            if (!window.mockGpsInterval) window.mockGpsInterval = setInterval(mockGPS, 1000);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      } else {
        setGpsStatus('mock');
        map.setView([mockLat, mockLng], 16);
        if (!window.mockGpsInterval) window.mockGpsInterval = setInterval(mockGPS, 1000);
      }
    } else {
      isRunning = false;
      $('#run-toggle').innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
      clearInterval(timerInterval);
      if (geoWatchId) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
      if (window.mockGpsInterval) { clearInterval(window.mockGpsInterval); window.mockGpsInterval = null; }
    }
  });

  // --- Stop (Finish Run) ---
  $('#run-stop').addEventListener('click', () => {
    isRunning = false;
    clearInterval(timerInterval);
    if (geoWatchId) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
    if (window.mockGpsInterval) { clearInterval(window.mockGpsInterval); window.mockGpsInterval = null; }

    // Fit map to the route
    if (routeCoords.length > 1) {
      map.fitBounds(routePath.getBounds(), { padding: [30, 30] });
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet" style="position:relative">
        <div class="modal-handle"></div>
        <button class="modal-close-btn" id="close-share"><span class="material-symbols-rounded">close</span></button>
        <div class="modal-title">Run Complete!</div>

        <div class="share-modal-content" id="share-card">
          <div class="share-preview">
            <div class="share-preview-brand">KINETIC</div>
            <div class="display-md text-primary" style="margin-top:var(--spacing-6)">${totalDistance.toFixed(2)} km</div>
            <div class="body-sm text-surface-variant" style="margin-bottom:var(--spacing-2)">${formatTime(elapsedTime)} • ${currentSpeed > 0 ? currentSpeed.toFixed(1) : '–'} min/km</div>
            <div class="share-preview-map">
               <span class="material-symbols-rounded" style="color:var(--primary);font-size:32px">route</span>
            </div>
            <div class="body-xs text-surface-variant">Conquered with KINETIC</div>
          </div>
        </div>

        <button class="btn-primary" id="btn-share" style="width:100%">
          <span class="material-symbols-rounded">ios_share</span>
          Share to Social
        </button>
        <button class="btn-ghost" id="btn-finish" style="width:100%;margin-top:var(--spacing-2)">Save & Finish</button>
      </div>
    `;
    document.body.appendChild(overlay);

    $('#close-share').addEventListener('click', () => overlay.remove());
    $('#btn-finish').addEventListener('click', () => { overlay.remove(); window.location.hash = 'steps'; });

    $('#btn-share').addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'My KINETIC Run',
            text: `I just crushed a ${totalDistance.toFixed(2)}km run in ${formatTime(elapsedTime)} with KINETIC!`,
            url: window.location.href
          });
        } catch (e) { console.log(e); }
      } else {
        alert('Screenshot saved! Ready to share to social media (Simulated)');
      }
    });
  });

  // --- Back Button ---
  $('#runner-back-btn')?.addEventListener('click', () => {
    if (isRunning) {
      if (!confirm('Running session is active. Are you sure you want to leave?')) return;
      isRunning = false;
      clearInterval(timerInterval);
      if (geoWatchId) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
      if (window.mockGpsInterval) { clearInterval(window.mockGpsInterval); window.mockGpsInterval = null; }
    }
    // Clean up map to prevent memory leaks
    if (map) map.remove();
    Router.navigate('steps');
  });
}

// ============================================
// Register Routes
// ============================================
// ============================================
// PAGE: Social Crew Feed
// ============================================
function renderCrewFeed() {
  const user = Store.getUser();
  const userName = user?.name || 'Athlete';
  const posts = Store.getData('crew_posts', []);
  const steps = Store.getData('steps_today', 0);
  const meals = getMeals();
  let totalCals = 0;
  for (const key in meals) { totalCals += calcMealTotals(meals[key]).cal; }

  // Generate feed items from user activity
  const activityFeed = [];
  if (steps > 0) activityFeed.push({ user: userName, icon: '🚶', text: `walked ${steps.toLocaleString()} steps today`, time: Date.now() - 300000, type: 'steps' });
  if (totalCals > 0) activityFeed.push({ user: userName, icon: '🍽️', text: `logged ${totalCals.toLocaleString()} kcal so far`, time: Date.now() - 600000, type: 'diet' });
  const water = Store.getData('water_today', 0);
  if (water > 0) activityFeed.push({ user: userName, icon: '💧', text: `drank ${(water/1000).toFixed(1)}L of water`, time: Date.now() - 900000, type: 'water' });

  // Sample crew posts for social feel
  const samplePosts = [
    { user: 'Arjun S.', icon: '🏋️', text: 'Finished Chest & Triceps — 12 sets, feeling strong!', time: Date.now() - 1800000, type: 'workout', avatar: 'AS' },
    { user: 'Priya M.', icon: '🏃', text: 'Morning 5K run — 28:42 pace. New personal best!', time: Date.now() - 3600000, type: 'run', avatar: 'PM' },
    { user: 'Rahul K.', icon: '🔥', text: 'Hit calorie goal for 7 days straight. Consistency pays!', time: Date.now() - 7200000, type: 'streak', avatar: 'RK' },
    { user: 'Sneha D.', icon: '🧘', text: 'Rest day yoga — 30 min flow. Recovery is growth.', time: Date.now() - 14400000, type: 'workout', avatar: 'SD' },
    { user: 'Vikram T.', icon: '💪', text: 'New deadlift PR: 140kg x 3 reps!', time: Date.now() - 21600000, type: 'pr', avatar: 'VT' },
  ];

  const allPosts = [...posts, ...activityFeed.map(a => ({ ...a, avatar: userName.substring(0, 2).toUpperCase() })), ...samplePosts]
    .sort((a, b) => b.time - a.time);

  app().innerHTML = `
    ${topBar('KINETIC')}
    <div class="page-content stagger">
      <h1 class="headline-lg" style="margin-bottom:var(--spacing-2)">Crew Feed</h1>
      <p class="body-md text-surface-variant" style="margin-bottom:var(--spacing-6)">See what your fitness crew is up to.</p>

      <!-- Share Activity -->
      <div class="surface-card" style="margin-bottom:var(--spacing-6)">
        <div style="display:flex;gap:var(--spacing-3);margin-bottom:var(--spacing-3)">
          <div class="avatar" style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-container));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;color:var(--on-primary);flex-shrink:0">${userName.substring(0, 2).toUpperCase()}</div>
          <input type="text" id="crew-post-input" placeholder="Share your progress with the crew..." style="flex:1;padding:var(--spacing-3);border-radius:var(--radius-full);border:1px solid var(--surface-variant);background:var(--surface-container-high);color:var(--on-surface);font-size:0.875rem"/>
        </div>
        <div style="display:flex;gap:var(--spacing-2)">
          <button class="btn-secondary crew-share-btn" data-type="workout" style="flex:1;padding:var(--spacing-2);font-size:0.7rem">
            <span class="material-symbols-rounded" style="font-size:16px">fitness_center</span> Workout
          </button>
          <button class="btn-secondary crew-share-btn" data-type="run" style="flex:1;padding:var(--spacing-2);font-size:0.7rem">
            <span class="material-symbols-rounded" style="font-size:16px">directions_run</span> Run
          </button>
          <button class="btn-secondary crew-share-btn" data-type="meal" style="flex:1;padding:var(--spacing-2);font-size:0.7rem">
            <span class="material-symbols-rounded" style="font-size:16px">restaurant</span> Meal
          </button>
          <button class="btn-primary" id="crew-post-btn" style="padding:var(--spacing-2) var(--spacing-4);font-size:0.75rem">Post</button>
        </div>
      </div>

      <!-- Feed -->
      <div class="section-header"><h3 class="section-title">Activity Feed</h3></div>
      ${allPosts.map(p => `
        <div class="crew-post-card">
          <div class="crew-post-header">
            <div class="crew-avatar">${p.avatar || p.user.substring(0, 2).toUpperCase()}</div>
            <div class="crew-post-meta">
              <span class="crew-post-user">${p.user}</span>
              <span class="crew-post-time">${formatTimeAgo(p.time)}</span>
            </div>
            <span class="crew-post-icon">${p.icon}</span>
          </div>
          <div class="crew-post-body">${p.text}</div>
          <div class="crew-post-actions">
            <button class="crew-action-btn"><span class="material-symbols-rounded" style="font-size:16px">favorite</span> Like</button>
            <button class="crew-action-btn"><span class="material-symbols-rounded" style="font-size:16px">chat_bubble</span> Comment</button>
            <button class="crew-action-btn crew-share-web"><span class="material-symbols-rounded" style="font-size:16px">share</span> Share</button>
          </div>
        </div>
      `).join('')}
    </div>
    ${bottomNav('dashboard')}
  `;
  bindNav();

  // Post handler
  $('#crew-post-btn')?.addEventListener('click', () => {
    const input = $('#crew-post-input');
    const text = input?.value.trim();
    if (!text) return;
    const newPost = { user: userName, avatar: userName.substring(0, 2).toUpperCase(), icon: '💬', text, time: Date.now(), type: 'post' };
    const existing = Store.getData('crew_posts', []);
    existing.unshift(newPost);
    if (existing.length > 30) existing.length = 30;
    Store.setData('crew_posts', existing);
    renderCrewFeed();
  });

  // Quick share buttons pre-fill input
  $$('.crew-share-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $('#crew-post-input');
      const type = btn.dataset.type;
      if (type === 'workout') input.value = 'Just finished my workout session! 💪';
      else if (type === 'run') input.value = `Completed a run — ${steps.toLocaleString()} steps today! 🏃`;
      else if (type === 'meal') input.value = `Logged ${totalCals.toLocaleString()} kcal so far today 🍽️`;
      input.focus();
    });
  });

  // Share to Web Share API
  $$('.crew-share-web').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postBody = btn.closest('.crew-post-card')?.querySelector('.crew-post-body')?.textContent;
      if (navigator.share) {
        try { await navigator.share({ title: 'KINETIC Crew', text: postBody || 'Check out my fitness progress on KINETIC!' }); } catch {}
      } else {
        alert('Shared! (Simulated)');
      }
    });
  });
}

Router.register('login', renderLogin);
Router.register('signup', renderSignup);
Router.register('dashboard', renderDashboard);
Router.register('diet', renderDiet);
Router.register('workouts', renderWorkouts);
Router.register('steps', renderSteps);
Router.register('water', renderWater);
Router.register('trends', renderTrends);
Router.register('runner', renderRunner);
Router.register('exercises', renderExercises);
Router.register('exercise_detail', renderExerciseDetail);
Router.register('day_workout', renderDayWorkout);
Router.register('active_workout', renderActiveWorkout);
Router.register('crew', renderCrewFeed);

Router.init();
WorkoutPlayer.resume();

// ============================================
// PAGE: Exercises Library
// ============================================
function renderExercises() {
  const allExNames = Object.keys(EXERCISE_DETAILS);
  
  app().innerHTML = `
    ${topBar('KINETIC')}
    <div class="page-content stagger">
      <div style="display:flex;align-items:center;gap:var(--spacing-3);margin-bottom:var(--spacing-6)">
        <button class="btn-icon" id="back-to-workouts"><span class="material-symbols-rounded">arrow_back</span></button>
        <h1 class="headline-md" style="margin:0">Exercise Library</h1>
      </div>
      
      <div class="search-bar" style="margin-bottom:var(--spacing-6);position:relative">
        <span class="material-symbols-rounded text-surface-variant" style="position:absolute;left:16px;top:50%;transform:translateY(-50%)">search</span>
        <input type="text" id="ex-search" placeholder="Search exercises..." style="width:100%;padding:14px 16px 14px 48px;border-radius:var(--radius-full);border:1px solid var(--surface-variant);background:var(--surface-container);color:var(--on-surface)"/>
      </div>
      
      <div id="ex-list">
        ${allExNames.map(exName => {
          const det = EXERCISE_DETAILS[exName];
          return `
            <div class="surface-card exercise-lib-item" data-ex="${exName}" style="display:flex;align-items:center;gap:var(--spacing-4);padding:var(--spacing-2);margin-bottom:var(--spacing-3);cursor:pointer">
              <div style="width:64px;height:64px;border-radius:var(--radius-md);background:url(${det.img}) center/cover"></div>
              <div style="flex:1">
                <div class="title-sm">${exName}</div>
                <div class="body-sm text-surface-variant" style="font-size:0.7rem;margin-top:4px">${det.muscles.join(', ')}</div>
              </div>
              <span class="material-symbols-rounded text-surface-variant">chevron_right</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  
  $('#back-to-workouts')?.addEventListener('click', () => Router.navigate('workouts'));
  
  $('#ex-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('.exercise-lib-item').forEach(el => {
      const match = el.dataset.ex.toLowerCase().includes(q);
      el.style.display = match ? 'flex' : 'none';
    });
  });
  
  $$('.exercise-lib-item').forEach(el => {
    el.addEventListener('click', () => {
      Store.setData('current_ex', el.dataset.ex);
      Router.navigate('exercise_detail');
    });
  });
}

// ============================================
// PAGE: Exercise Detail
// ============================================
function renderExerciseDetail() {
  const exName = Store.getData('current_ex', 'Barbell Back Squat');
  const details = EXERCISE_DETAILS[exName] || {
    muscles: ['Target Muscles'],
    img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=400&auto=format&fit=crop',
    steps: ['Assume proper starting position.', 'Perform movement with control.', 'Return to starting position.'],
    variations: [], benefits: [], precautions: [], videos: []
  };
  const variations = details.variations || [];
  const benefits = details.benefits || [];
  const precautions = details.precautions || [];
  const videos = details.videos || [];

  // Load logged sets for this exercise
  const loggedSets = Store.getData('logged_sets_' + exName.replace(/\s+/g, '_'), []);

  app().innerHTML = `
    ${topBar('KINETIC')}
    <div class="ex-detail-page">
      <!-- Hero Image -->
      <div class="exercise-detail-hero" style="background-image:url(${details.img})">
        <button class="btn-icon" id="ex-detail-back" style="position:absolute;top:16px;left:16px;z-index:20;background:rgba(0,0,0,0.5);color:#fff;backdrop-filter:blur(4px)">
          <span class="material-symbols-rounded">arrow_back</span>
        </button>
        <div class="exercise-detail-title">${exName}</div>
      </div>

      <div class="ex-detail-body">
        <!-- Muscle Tags -->
        <div class="exercise-tags">
          ${details.muscles.map(m => `<span class="exercise-tag">${m}</span>`).join('')}
        </div>

        <!-- How to Perform -->
        <div class="detail-section">
          <div class="detail-section-header">
            <span class="material-symbols-rounded detail-section-icon">checklist</span>
            <h3 class="section-title">How to Perform</h3>
          </div>
          <ul class="exercise-steps">
            ${details.steps.map(s => `<li>${s}</li>`).join('')}
          </ul>
        </div>

        <!-- Muscles Targeted -->
        <div class="detail-section">
          <div class="detail-section-header">
            <span class="material-symbols-rounded detail-section-icon" style="color:var(--error)">my_location</span>
            <h3 class="section-title">Muscles Targeted</h3>
          </div>
          <div class="muscle-target-grid">
            ${details.muscles.map((m, i) => `
              <div class="muscle-target-card">
                <div class="muscle-target-icon">${i === 0 ? '<span class="material-symbols-rounded">star</span>' : '<span class="material-symbols-rounded">fiber_manual_record</span>'}</div>
                <div>
                  <div class="muscle-target-name">${m}</div>
                  <div class="muscle-target-role">${i === 0 ? 'Primary' : 'Secondary'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Variations & Styles -->
        ${variations.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-header">
            <span class="material-symbols-rounded detail-section-icon" style="color:var(--tertiary)">swap_horiz</span>
            <h3 class="section-title">Variations & Styles</h3>
          </div>
          <div class="variation-list">
            ${variations.map(v => `
              <div class="variation-chip">
                <span class="material-symbols-rounded" style="font-size:16px">fitness_center</span>
                ${v}
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Benefits -->
        ${benefits.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-header">
            <span class="material-symbols-rounded detail-section-icon" style="color:#6bff8f">bolt</span>
            <h3 class="section-title">Benefits</h3>
          </div>
          <div class="benefit-list">
            ${benefits.map(b => `
              <div class="benefit-item">
                <span class="material-symbols-rounded benefit-icon">check_circle</span>
                <span>${b}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Precautions -->
        ${precautions.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-header">
            <span class="material-symbols-rounded detail-section-icon" style="color:var(--error)">warning</span>
            <h3 class="section-title">Precautions</h3>
          </div>
          <div class="precaution-list">
            ${precautions.map(p => `
              <div class="precaution-item">
                <span class="material-symbols-rounded precaution-icon">shield</span>
                <span>${p}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Suggested Videos -->
        ${videos.length > 0 ? `
        <div class="detail-section">
          <div class="detail-section-header">
            <span class="material-symbols-rounded detail-section-icon" style="color:#ff4444">play_circle</span>
            <h3 class="section-title">Suggested Videos</h3>
          </div>
          <div class="video-list">
            ${videos.map(v => `
              <a href="${v.url}" target="_blank" rel="noopener noreferrer" class="video-card">
                <div class="video-card-icon">
                  <span class="material-symbols-rounded">play_circle</span>
                </div>
                <div class="video-card-info">
                  <div class="video-card-title">${v.title}</div>
                  <div class="video-card-sub">YouTube</div>
                </div>
                <span class="material-symbols-rounded video-card-arrow">open_in_new</span>
              </a>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Log Set -->
        <div class="detail-section">
          <div class="detail-section-header">
            <span class="material-symbols-rounded detail-section-icon">edit_note</span>
            <h3 class="section-title">Log Set</h3>
          </div>
          <div class="log-set-card">
            <div class="log-set-inputs">
              <div class="log-set-field">
                <label class="log-set-label">Weight</label>
                <div class="log-set-input-wrap">
                  <input type="number" id="log-weight" placeholder="0" min="0"/>
                  <span class="log-set-unit">kg</span>
                </div>
              </div>
              <div class="log-set-field">
                <label class="log-set-label">Reps</label>
                <div class="log-set-input-wrap">
                  <input type="number" id="log-reps" placeholder="0" min="0"/>
                  <span class="log-set-unit">reps</span>
                </div>
              </div>
            </div>
            <button class="btn-primary" id="log-set-btn" style="width:100%">
              <span class="material-symbols-rounded">add</span>
              Log Set
            </button>
          </div>

          <!-- Logged Sets History -->
          ${loggedSets.length > 0 ? `
          <div class="logged-sets-list">
            <div class="logged-sets-header">
              <span class="body-sm text-surface-variant">Today's Sets</span>
              <span class="body-sm text-primary" style="font-weight:700">${loggedSets.length} sets</span>
            </div>
            ${loggedSets.map((s, i) => `
              <div class="logged-set-item">
                <div class="logged-set-num">${i + 1}</div>
                <div class="logged-set-info">
                  <span class="logged-set-weight">${s.weight} kg</span>
                  <span class="logged-set-sep">×</span>
                  <span class="logged-set-reps">${s.reps} reps</span>
                </div>
                <span class="body-sm text-surface-variant">${s.time}</span>
              </div>
            `).join('')}
          </div>
          ` : ''}
        </div>

      </div>
    </div>
  `;

  // Back button
  $('#ex-detail-back')?.addEventListener('click', () => {
    window.history.back();
  });

  // Log Set button
  $('#log-set-btn')?.addEventListener('click', () => {
    const weight = parseFloat($('#log-weight')?.value) || 0;
    const reps = parseInt($('#log-reps')?.value) || 0;
    if (weight <= 0 && reps <= 0) return;
    const now = new Date();
    const h = now.getHours(); const m = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const timeStr = ((h % 12) || 12).toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0') + ' ' + ampm;
    const sets = Store.getData('logged_sets_' + exName.replace(/\s+/g, '_'), []);
    sets.push({ weight, reps, time: timeStr });
    Store.setData('logged_sets_' + exName.replace(/\s+/g, '_'), sets);
    renderExerciseDetail();
  });
}
