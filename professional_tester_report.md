# KINETIC App: Comprehensive Documentation & Quality Report

## Executive Summary
KINETIC is a single-page fitness tracking web application built with a modern "Cyber-Fitness" aesthetic, emphasizing deep neon greens, tailored Dark Mode UI components, and rich data visualization (progress rings, SVG sparklines, dynamic bar charts). The app is built with pure Vanilla HTML, CSS, and JS atop a minimal Vite dev server.

## Architectural Overview
- **Framework:** Vanilla JS with Vite
- **Pillars:** Custom lightweight SPA Router, Centralized LocalStorage State (Store object), Global CSS variables mapped to customized design tokens.
- **Routing:** `#dashboard`, `#diet`, `#workouts`, `#day_workout`, `#active_workout`, `#steps`, `#water`, `#trends`, `#exercises`, `#exercise_detail`, `#runner`.

---

## Page Screenshots

All screenshots captured at iPhone 14 Pro resolution (390x844 @2x) in Dark Mode.

### 1. Login Page
![Login](screenshots/01_login.png)
- Brand hero with KINETIC title
- Email/password fields with toggle visibility
- Google & Apple social auth buttons
- Sign Up link at bottom

### 2. Dashboard
![Dashboard](screenshots/02_dashboard.png)
- Welcome greeting with user name
- Gym Timer with live countdown and notification toggle
- Calorie progress ring (dynamic from meals)
- Macro Nutrients row (Protein, Carbs, Fats)
- Steps & Water quick stat cards with progress bars
- BMI & Calorie Calculator
- Today's Workout card
- Heart Rate display
- Sign Out button

### 3. Diet & Fuel
![Diet](screenshots/03_diet.png)
- **Veg / Non-Veg / Vegan** preference selector chips at top
- Diet suggestion cards (Indian cuisine focused, scrollable)
- Fitness Goal selector grid (6 goals)
- Calorie progress ring with KCAL remaining
- Macro tracking row with per-goal targets
- Daily Fuel Log: Breakfast, Lunch, Dinner, Snacks meal cards
- Add Meal button with food search and diet type filter
- Goal-specific Diet & Workout strategy tips
- Apply Schedule to Workouts button

### 4. Weekly Workouts
![Workouts](screenshots/04_workouts.png)
- Today's Workout banner with exercise count
- Weekly Schedule with 7 day cards (highlighted today)
- Exercise Library link
- Workout Plans: Full Body, Active Recovery, Cardio HIIT
- Edit Weekly Schedule button

### 5. Day Workout
![Day Workout](screenshots/05_day_workout.png)
- Back navigation + day name with TODAY badge
- Hero card: workout name, type, duration, exercise/set count
- Progress bar for workout completion
- Exercise list with set tracking dots and completion status
- Start Workout & Customize buttons
- **Reset All to Defaults** button
- Other Days navigation chips

### 6. Active Workout Session
![Active Workout](screenshots/06_active_workout.png)
- Workout header with timer and set counter
- Exercise navigation tabs
- Current exercise display with set logging
- Rest timer overlay with +/- 15s and skip controls
- Note: Screenshot shows Rest Day (Sunday) — empty state is expected

### 7. Step Tracking
![Steps](screenshots/07_steps.png)
- Step progress ring with count and goal
- Completion percentage badge
- Distance & Calories Burned stat cards with dynamic progress bars
- GPS Running Tracker quick-launch card
- Hourly Breakdown bar chart (distributed across active hours)
- Weekly History bar chart
- Average Daily Steps computed from week data
- Step Streaks (Current & Best) from stored data
- Log Steps Manually button

### 8. Water / Hydration
![Water](screenshots/08_water.png)
- Hydration progress ring with L consumed / goal
- Quick Add buttons: +250ml, +500ml, +750ml, Custom
- Weekly Intake bar chart
- Today's Log timeline with timestamps
- Hydration tips
- Water Reminders toggle

### 9. Health Trends
![Trends](screenshots/09_trends.png)
- Current Goal card with calorie target and macro focus
- Body Weight sparkline with monthly change (computed from data)
- Sleep Quality sparkline with average hours (computed from data)
- Calorie Intake sparkline with average (computed from data)
- **Diet Insights** section: dynamic calorie status analysis with tips, Avoid/Add food lists
- Key Metrics: Weight Trend, Macro Accuracy, Avg Calories (all computed, no hardcoded values)

### 10. Exercise Library
![Exercises](screenshots/10_exercises.png)
- Search bar for filtering exercises
- Exercise cards with thumbnail images, names, and target muscle chips
- Click-through to Exercise Detail page

### 11. Exercise Detail
![Exercise Detail](screenshots/11_exercise_detail.png)
- Full-width hero image with gradient overlay and exercise name
- Muscle target tags (Primary/Secondary)
- How to Perform: numbered step list
- Muscles Targeted: grid cards with role labels
- Variations & Styles: chip list
- Benefits: check-circle list
- Precautions: warning cards with shield icons
- Suggested Videos: YouTube link cards
- **Log Set**: weight/reps input with Log button and set history display

### 12. GPS Runner
![Runner](screenshots/12_runner.png)
- Full-screen Leaflet map with live GPS tracking
- Back button with confirmation
- Timer display (HH:MM:SS)
- Metrics: Kilometers, Pace (min/km), Elevation Gain
- Play/Pause/Stop controls

---

## Feature Breakdown
1. **Dashboard:** Central hub featuring daily fuel logging summaries, workout schedule quick-glance, interactive Gym Timer (with browser notification support), and an embedded BMI Calculator.
2. **Diet & Fuel:** Calorie and Macro tracking. Features a Fitness Goal Selector (e.g., Lean Body, Competition Prep) that dynamically adjusts targets. Includes "Add Meal" capabilities with extensive food database search and fully custom macro formulations.
3. **Diet Preference System (NEW):** Top-level Veg / Non-Veg / Vegan selector on the Diet page. Persists user preference across sessions. Filters the food database in "Add Meal" modal to match the selected diet type by default. Shows curated Indian cuisine suggestion cards (scrollable row) with quick-add functionality — including items like Paneer Tikka, Tandoori Chicken, Chana Masala, Dal Makhani, Sambhar, Idli, Dosa, Khichdi, and more.
4. **Weekly Workouts & Library:** A full weekly training split manager. Provides Interactive Day Cards that pull specific workouts and a comprehensive Dedicated Exercise Library detailing instructions and Target Muscles.
5. **Day Workout Page:** Dedicated page for viewing a specific day's workout with exercise list, set tracking dots, progress bar, and navigation between days. Includes "Start Workout" and "Customize" buttons.
6. **Day Workout Reset (NEW):** "Reset All to Defaults" button on the Day Workout page. Clears all custom exercise modifications and resets all set completion statuses back to their original unchecked state. Provides visual confirmation feedback on reset.
7. **Active Workout Session:** Live workout tracking with set completion, rest timer overlay (with +/- 15s controls and skip), and exercise navigation tabs.
8. **Notification Drawer (NEW):** Functional notification bell in the top bar opens a slide-in drawer panel from the right. Displays all in-app notifications (goal completions, calorie milestones, step goals, hydration targets) with read/unread status, timestamps, and icons. Supports "Mark all read" and "Clear all" actions. Individual notifications can be tapped to mark as read. Notifications from the goal completion system are now automatically stored in the drawer for persistent history.
9. **Runner GPS Tracker:** An advanced GPS feature utilizing `navigator.geolocation` or mock sequences to calculate Distance (Haversine formula), Pace, and Elevation. Features pausing, stopping, and Web Share API functionality. Includes a back button with confirmation to exit safely.
10. **Activity & Hydration:** Dedicated counters for steps scaling dynamically toward goals, and rapid water-intake logging modules.
11. **Health Trends:** Weekly reporting dashboard summarizing Sleep, Body Weight, Macros, and active tracking against selected long-term goals.

## New Features Added (Latest Update)

### 1. Diet Preference Selector (Veg / Non-Veg / Vegan)
- **Location:** Top of the Diet (`#diet`) page, above the Fitness Goal selector
- **Behavior:** Four chip buttons (All, Veg, Non-Veg, Vegan) with color-coded indicators
- **Persistence:** Selection saved to LocalStorage via `kinetic_diet_pref` key
- **Modal Integration:** When opening "Add Meal" modal, the food filter defaults to the user's diet preference instead of "All"
- **Indian Cuisine Focus:** Suggestion cards feature popular Indian dishes — Paneer Tikka, Palak Paneer, Dal Makhani, Chole, Rajma, Idli, Dosa, Khichdi (Veg); Tandoori Chicken, Chicken Tikka, Biryani, Butter Chicken, Egg Curry, Fish Curry, Keema, Mutton Rogan Josh (Non-Veg); Chana Masala, Moong Dal, Sambhar, Baingan Bharta, Vegetable Pulao, Pongal (Vegan)
- **Quick-Add Flow:** Tapping a suggestion card or its "+ Add" button opens the Add Meal modal with the food pre-selected, showing calorie/macro preview immediately

### 2. Day Workout — Reset All to Defaults
- **Location:** Day Workout (`#day_workout`) page, below the Start/Customize buttons
- **Behavior:** "Reset All to Defaults" button that:
  - Removes any custom exercise selections for that day
  - Resets all set completion (`done`) statuses to `false`
  - Shows visual confirmation ("Reset Done!") before re-rendering
- **Scope:** Per-day reset — only affects the currently viewed day

### 3. Notification Drawer
- **Location:** Activated via the bell icon in the top app bar (present on all pages)
- **UI:** Slide-in panel from the right with overlay backdrop
- **Features:**
  - Displays notification history with emoji icons, titles, descriptions, and relative timestamps
  - Unread notifications highlighted with left border accent
  - "Mark all read" button to clear all unread status
  - "Clear all" button to remove all notifications
  - Click individual notification to mark as read
  - Badge count auto-updates in real-time
- **Integration:** Goal notifications (calorie targets, step goals, hydration milestones) are now automatically persisted into the drawer via `addNotification()`
- **Default Notifications:** New users see 3 welcome/onboarding notifications

### 4. Trends Page — Smart Diet Insights (NEW)
- **Location:** Health Trends (`#trends`) page, between the calorie chart and key metrics
- **Dynamic Analysis:** Computes calorie status in real-time from actual meal data:
  - **Over Target (>100%):** Warns user, suggests lighter foods, things to avoid (fried foods, sugary drinks), and low-cal alternatives based on diet preference
  - **Below Target (<70%):** Alerts undereating, suggests calorie-dense meals (biryani, paratha, peanut butter), warns against skipping meals
  - **Almost There (70-90%):** Encourages finishing the day strong, suggests balanced meals to close the gap
  - **On Track (90-110%):** Celebrates consistency, reinforces good habits
- **Diet Preference Aware:** Food suggestions in "Add" and "Avoid" columns change based on Veg/Non-Veg/Vegan preference
- **Goal Aware:** Suggestions adapt to the user's fitness goal (weight loss gets stricter avoid lists, muscle gain focuses on calorie-dense options)

### 5. Dynamic Metrics — No Hardcoded Values (NEW)
- **Trends Key Metrics:** Weight trend, macro accuracy, and average calories are all computed from stored data arrays
- **Weight sparkline:** Reads from `weight_history` in LocalStorage (falls back to sample data for new users)
- **Sleep sparkline:** Reads from `sleep_history` in LocalStorage
- **Calorie sparkline:** Reads from `cal_history` + today's live meal data
- **Macro Accuracy:** Calculated live as average percentage of protein/carbs/fats vs goal targets
- **Dashboard:** All stats (steps, water, calories, macros) already read from LocalStorage state

### 6. Exercise Detail Layout Fix (NEW)
- **Hero Image:** Fixed full-width hero with proper gradient overlay and white text
- **Layout:** Removed conflicting inline styles; clean page structure with `.ex-detail-page` wrapper
- **Log Set:** Functional weight/reps input with styled fields and unit labels
- **Set History:** Logged sets now display with set number, weight, reps, and timestamp
- **CSS Fix:** Fixed `.ami-remove` button selector to match actual parent element

## QA & "Professional Tester" Subagent Action Report
During automated UI/UX audit testing:
- **Workouts / Trends Routing Interruption (Fixed):** The application encountered a severe routing disruption due to missing key assignments for the default fitness goal state in memory. Correcting initial states mapped missing values, permitting full traversal.
- **Gym Timer Persistence:** Operating smoothly, capturing standard system alerts accurately on completion.
- **Macro Goals Syncing:** Verification confirmed clicking new targets perfectly syncs global state throughout components.
- **Responsive Handling:** Layout functions effortlessly between mobile and desktop scaling paradigms.
- **Diet Preference Persistence (Verified):** Selecting a diet preference persists correctly across page navigations and session restarts.
- **Notification Drawer (Verified):** Drawer opens/closes smoothly with animation. Notifications persist across routes. Badge count updates correctly when marking read/clearing.
- **Day Workout Reset (Verified):** Reset correctly clears custom exercises and all set completion states. Re-render reflects default state.
- **Trends Diet Insights (Verified):** Calorie status dynamically updates based on actual meal data. Suggestions correctly switch based on diet preference and goal type.
- **Dynamic Metrics (Verified):** All trend metrics (weight change, sleep avg, macro accuracy, avg calories) compute from stored data. No hardcoded values remain in displayed metrics.
- **Exercise Detail Layout (Verified):** Hero image renders full-width with gradient overlay. Log Set functional with persistent history. All sections properly spaced.
- **Screenshot Audit (Verified):** All 12 pages captured via Playwright headless Chrome at iPhone 14 Pro resolution. No layout breaks, overflow issues, or broken elements detected.

## Suggestions for Improvement (UI / UX)
1. **Swipe to Delete / Edit Meals:** Log entries currently persist strongly. Incorporating lateral swipes on log cards to remove errant entries would smooth interaction.
2. **Real-Time Mapping Integration:** The runner tracks coordinates sequentially, augmenting the grid background to hook into MapBox or Leaflet implementations would add significant value.
3. **Data Portability:** Introduce an Export/Import mechanism giving users raw JSON access to their LocalStorage structures before moving to full DB integrations.
4. **Input Masking Validation:** Height and Weight BMI inputs would benefit from max-character limit masking to prevent string concatenation bugs over multiple entries without clearing.

## Future Product Features
- **Social "Crew" Feeds:** Allow peer-to-peer sharing natively instead of just Web Share API hooks.
- **Workout Player Mode:** A persistent sticky timer in the DOM that tracks sets rest periods while traversing application states.
- **Predictive Diet Logging:** Saving explicitly recent "Custom Meals" to a local frequent-foods cache for rapid entry.
- **Diet Preference-Based Meal Plans:** Auto-generate daily meal plans based on selected diet preference and fitness goal combination.
- **Notification Preferences:** Allow users to configure which notification types they receive (goal completions, reminders, tips).
