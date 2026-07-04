const ENTRY_STORAGE_KEY = "eiyokanri.entries.v1";
const MILK_STORAGE_KEY = "eiyokanri.milk.v1";
const FOOD_STATE_STORAGE_KEY = "eiyokanri.foodStates.v1";
const MEAL_TEMPLATE_STORAGE_KEY = "eiyokanri.mealTemplates.v1";
const FOOD_PREF_STORAGE_KEY = "eiyokanri.foodPrefs.v1";
const BACKUP_VERSION = 1;

const FOOD_STATES = [
  { key: "not_introduced", label: "未導入", color: "#9aa49c" },
  { key: "introduced", label: "導入済み", color: "#24786a" },
  { key: "caution", label: "注意中", color: "#d99f32" },
  { key: "avoid", label: "避ける", color: "#da6f50" },
];
const foodStateByKey = new Map(FOOD_STATES.map((state) => [state.key, state]));
const foodStateOverrides = loadStoredFoodStates();
const defaultFoodStates = new Map(FOOD_MASTER.map((food) => [food.id, food.state]));

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function createEntry({ foodId, amount, meal, inputAmount = amount, inputUnit = "g", createdAt = new Date() }) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    foodId,
    amount,
    inputAmount,
    inputUnit,
    meal,
    date: toDateKey(createdAt),
    createdAt: createdAt.toISOString(),
  };
}

const memoryStore = createMemoryStore();

function createMemoryStore() {
  let entries = loadStoredEntries();

  function persistEntries() {
    try {
      window.localStorage.setItem(ENTRY_STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      // Keep the in-memory store usable when localStorage is blocked or full.
    }
  }

  return {
    getEntries() {
      return [...entries];
    },
    getAllEntries() {
      return [...entries];
    },
    getTodayEntries() {
      return entries.filter((entry) => entry.date === todayKey);
    },
    addEntry(entry) {
      entries = [entry, ...entries];
      persistEntries();
    },
    addEntries(newEntries) {
      entries = [...newEntries, ...entries];
      persistEntries();
    },
    removeEntry(id) {
      entries = entries.filter((entry) => entry.id !== id);
      persistEntries();
    },
    resetToday() {
      entries = entries.filter((entry) => entry.date !== todayKey);
      persistEntries();
    },
    replaceAllEntries(newEntries) {
      entries = [...newEntries];
      persistEntries();
    },
  };
}

function loadStoredEntries() {
  try {
    const storedEntries = window.localStorage.getItem(ENTRY_STORAGE_KEY);
    if (!storedEntries) return [];

    const parsedEntries = JSON.parse(storedEntries);
    return Array.isArray(parsedEntries) ? parsedEntries : [];
  } catch (error) {
    return [];
  }
}

const milkStore = createMilkStore();

function createMilkStore() {
  let feeds = loadStoredMilkFeeds();

  function persistFeeds() {
    try {
      window.localStorage.setItem(MILK_STORAGE_KEY, JSON.stringify(feeds));
    } catch (error) {
      // Keep the in-memory store usable when localStorage is blocked or full.
    }
  }

  return {
    getAllFeeds() {
      return [...feeds];
    },
    getTodayFeeds() {
      return feeds.filter((feed) => feed.date === todayKey);
    },
    addFeed(ml) {
      const createdAt = new Date();
      feeds = [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          ml,
          date: toDateKey(createdAt),
          createdAt: createdAt.toISOString(),
        },
        ...feeds,
      ];
      persistFeeds();
    },
    removeFeed(id) {
      feeds = feeds.filter((feed) => feed.id !== id);
      persistFeeds();
    },
    replaceAllFeeds(newFeeds) {
      feeds = [...newFeeds];
      persistFeeds();
    },
  };
}

function loadStoredMilkFeeds() {
  try {
    const stored = window.localStorage.getItem(MILK_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

const mealTemplateStore = createMealTemplateStore();

function createMealTemplateStore() {
  let templates = loadStoredMealTemplates();

  function persistTemplates() {
    try {
      window.localStorage.setItem(MEAL_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
    } catch (error) {
      // Keep the in-memory store usable when localStorage is blocked or full.
    }
  }

  return {
    getAllTemplates() {
      return [...templates];
    },
    addTemplate(template) {
      templates = [template, ...templates];
      persistTemplates();
    },
    removeTemplate(id) {
      templates = templates.filter((template) => template.id !== id);
      persistTemplates();
    },
    replaceAllTemplates(newTemplates) {
      templates = [...newTemplates];
      persistTemplates();
    },
  };
}

function loadStoredMealTemplates() {
  try {
    const stored = window.localStorage.getItem(MEAL_TEMPLATE_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

const foodPreferenceStore = createFoodPreferenceStore();

function createFoodPreferenceStore() {
  let preferences = loadStoredFoodPreferences();

  function persistPreferences() {
    try {
      window.localStorage.setItem(FOOD_PREF_STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      // Keep the in-memory store usable when localStorage is blocked or full.
    }
  }

  return {
    getPreference(foodId) {
      return preferences[foodId] ?? null;
    },
    getAllPreferences() {
      return { ...preferences };
    },
    remember(foodId, unit, amount) {
      preferences[foodId] = { unit, amount };
      persistPreferences();
    },
    replaceAllPreferences(nextPreferences) {
      preferences = { ...nextPreferences };
      persistPreferences();
    },
  };
}

function loadStoredFoodPreferences() {
  try {
    const stored = window.localStorage.getItem(FOOD_PREF_STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function loadStoredFoodStates() {
  try {
    const raw = window.localStorage.getItem(FOOD_STATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function persistFoodStates() {
  try {
    window.localStorage.setItem(FOOD_STATE_STORAGE_KEY, JSON.stringify(foodStateOverrides));
  } catch (error) {
    // Keep the in-memory states usable when localStorage is blocked or full.
  }
}

function applyStoredFoodStates() {
  for (const food of FOOD_MASTER) {
    const override = foodStateOverrides[food.id];
    food.state = foodStateByKey.has(override) ? override : defaultFoodStates.get(food.id);
  }
}

function setFoodState(foodId, stateKey) {
  const food = foodById.get(foodId);
  if (!food || !foodStateByKey.has(stateKey)) return;
  food.state = stateKey;
  foodStateOverrides[foodId] = stateKey;
  persistFoodStates();
  render();
}
