/* ========================================
   CONFIGURATION & CONSTANTS
   ======================================== */

// Base URL for API - adjust if your backend runs on a different port
const API_BASE_URL = "http://localhost:3000";

/* ========================================
   HELPER FUNCTIONS
   ======================================== */

/**
 * Helper function to handle fetch with callbacks
 * Wraps the fetch API to use callback-style error handling
 * @param {string} url - API endpoint (relative or absolute)
 * @param {object} options - Fetch options (method, headers, body, etc.)
 * @param {function} callback - Callback function(err, data)
 */
function fetchWithCallback(url, options, callback) {
  const fullUrl = url.startsWith("http") ? url : API_BASE_URL + url;
  
  fetch(fullUrl, options)
    .then((response) => {
      if (!response.ok) {
        return response.text().then((text) => {
          throw new Error(text || `HTTP error! status: ${response.status}`);
        });
      }
      return response.json();
    })
    .then((data) => {
      callback(null, data);
    })
    .catch((error) => {
      callback(error, null);
    });
}

/* ========================================
   VUE APPLICATION INSTANCE
   ======================================== */

new Vue({
  // Mount point: Attach Vue instance to #app element in HTML
  el: "#app",
  
  /* ========================================
     DATA PROPERTIES
     ======================================== */
  
  data: {
    // Lessons array: All available lessons fetched from API
    lessons: [],
    
    // Search term: User input for searching lessons
    searchTerm: "",
    
    // Sort key: Current sorting option (e.g., "subject-asc", "price-desc")
    sortKey: "subject-asc",
    
    // Filter key: Stock filter option ("all", "available", "soldout")
    filterKey: "all",
    
    // Min/Max price: Price range filter bounds
    minPrice: 0,
    maxPrice: 9999,
    
    // Location filter: Selected location for filtering lessons
    locationFilter: "",
    
    // Cart: Array of lesson items added to shopping cart
    cart: [],
    
    // Page: Current page/view ("catalog", "cart", "checkout", "success")
    page: "catalog",
    
    // Form: Customer information for order submission
    form: {
      name: "",
      phone: "",
      email: "",
      address: "",
    },
    
    // Loading: Boolean flag indicating API request in progress
    loading: false,
    
    // Error: Error message string for displaying API errors
    error: "",
  },
  
  /* ========================================
     LIFECYCLE HOOKS
     ======================================== */
  
  // Created: Called when Vue instance is created, fetches initial lessons data
  created() {
    this.fetchLessons();
  },
  
  /* ========================================
     COMPUTED PROPERTIES
     ======================================== */
  
  computed: {
    // Cart count: Total number of items in shopping cart
    cartCount() {
      return this.cart.length;
    },
    
    // Cart summary: Aggregates cart items by lesson ID with quantities and availability
    cartSummary() {
      const map = {};
      this.cart.forEach((item) => {
        const id = item._id;
        if (!map[id]) {
          map[id] = { ...item, qty: 0, canIncrease: true };
        }
        map[id].qty += 1;
      });
      // reflect current spaces from lessons list
      Object.values(map).forEach((entry) => {
        const match = this.lessons.find((l) => l._id === entry._id);
        entry.canIncrease = match ? match.spaces > 0 : false;
      });
      return Object.values(map);
    },
    
    // Cart total: Calculates total price of all items in cart
    cartTotal() {
      return this.cart.reduce((sum, item) => sum + Number(item.price || 0), 0);
    },
    
    // Location options: Unique list of all lesson locations for filter dropdown
    locationOptions() {
      return Array.from(new Set(this.lessons.map((l) => l.location))).filter(
        Boolean
      );
    },
    
    // Displayed lessons: Filtered and sorted lessons based on user selections
    // Applies price range, location, stock filters, and sorting
    displayedLessons() {
      let list = [...this.lessons];

      // price bounds
      list = list.filter(
        (l) => Number(l.price) >= this.minPrice && Number(l.price) <= this.maxPrice
      );

      // location filter
      if (this.locationFilter) {
        list = list.filter((l) => l.location === this.locationFilter);
      }

      // stock filter
      if (this.filterKey === "available") {
        list = list.filter((l) => l.spaces > 0);
      } else if (this.filterKey === "soldout") {
        list = list.filter((l) => l.spaces === 0);
      }

      // sorting
      const [key, dir] = this.sortKey.split("-");
      const asc = dir === "asc" ? 1 : -1;
      list.sort((a, b) => {
        if (key === "price") return (a.price - b.price) * asc;
        if (key === "spaces") return (a.spaces - b.spaces) * asc;
        return a[key].toString().localeCompare(b[key].toString()) * asc;
      });

      return list;
    },
    
    // Valid customer: Validates customer form data for order submission
    // Checks name (letters/spaces only), phone (numbers/symbols), and required fields
    validCustomer() {
      const nameOk = /^[a-zA-Z\s]+$/.test(this.form.name.trim());
      const phoneOk = /^[0-9\s+-]+$/.test(this.form.phone.trim());
      return (
        nameOk &&
        phoneOk &&
        this.form.name.trim() &&
        this.form.phone.trim() &&
        this.form.address.trim()
      );
    },
  },
  
  /* ========================================
     METHODS - API CALLS
     ======================================== */
  
  methods: {
    /**
     * GET /lessons - Fetch all lessons from API
     * Loads all available lessons and updates the lessons array
     */
    fetchLessons() {
      this.loading = true;
      this.error = "";
      
      fetchWithCallback("/lessons", { method: "GET" }, (err, data) => {
        if (err) {
          this.error = err.message || "Failed to load lessons";
        } else {
          this.lessons = data;
        }
        this.loading = false;
      });
    },
    
    /**
     * GET /search - Search lessons by query term
     * If search term is empty, fetches all lessons instead
     */
    onSearch() {
      const term = this.searchTerm.trim();
      if (!term) {
        this.fetchLessons();
        return;
      }
      
      this.loading = true;
      this.error = "";
      
      const searchUrl = `/search?q=${encodeURIComponent(term)}`;
      fetchWithCallback(searchUrl, { method: "GET" }, (err, data) => {
        if (err) {
          this.error = err.message || "Search failed";
        } else {
          this.lessons = data;
        }
        this.loading = false;
      });
    },
    
    /* ========================================
       METHODS - CART OPERATIONS
       ======================================== */
    
    /**
     * Check if a lesson can be added to cart
     * Returns true if lesson exists and has available spaces
     */
    canAdd(lesson) {
      return lesson && lesson.spaces > 0;
    },
    
    /**
     * Get quantity of a specific lesson in cart
     * Returns count of items with matching lesson ID
     */
    cartQuantity(lesson) {
      return this.cart.filter((item) => item._id === lesson._id).length;
    },
    
    /**
     * PUT /lessons/:id - Add lesson to cart and decrease availability
     * Adds lesson to cart array and sends API request to decrease spaces by 1
     * Updates lesson spaces in real-time when API responds
     */
    addToCart(lesson) {
      if (!this.canAdd(lesson)) return;
      
      this.cart.push({
        _id: lesson._id,
        subject: lesson.subject,
        location: lesson.location,
        price: Number(lesson.price) || 0,
      });
      
      const updateUrl = `/lessons/${lesson._id}`;
      const updateOptions = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spacesDelta: -1,
        }),
      };
      
      fetchWithCallback(updateUrl, updateOptions, (err, updated) => {
        if (!err && updated && typeof updated.spaces === "number") {
          lesson.spaces = updated.spaces;
        }
      });
    },
    
    /**
     * PUT /lessons/:id - Remove lesson from cart and increase availability
     * Removes one instance of lesson from cart and sends API request to increase spaces by 1
     * Updates lesson spaces in real-time when API responds
     */
    decreaseFromCart(lesson) {
      const idx = this.cart.findIndex((item) => item._id === lesson._id);
      if (idx === -1) return;
      
      const [removed] = this.cart.splice(idx, 1);
      const updateUrl = `/lessons/${removed._id}`;
      const updateOptions = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spacesDelta: 1,
        }),
      };
      
      fetchWithCallback(updateUrl, updateOptions, (err, updated) => {
        if (!err && updated && typeof updated.spaces === "number") {
          const match = this.lessons.find((l) => l._id === removed._id);
          if (match) {
            match.spaces = updated.spaces;
          }
        }
      });
    },
    
    /* ========================================
       METHODS - NAVIGATION
       ======================================== */
    
    /**
     * Navigate to a different page/view
     * Updates the page data property to show/hide different sections
     */
    goTo(page) {
      this.page = page;
    },
    
    /* ========================================
       METHODS - ORDER SUBMISSION
       ======================================== */
    
    /**
     * POST /orders - Submit order to API
     * Validates customer data and cart, then sends order with customer info and items
     * On success: resets cart/form, navigates to success page, and refreshes lessons
     */
    submitOrder() {
      if (!this.validCustomer || !this.cartCount) return;
      
      const order = {
        name: this.form.name.trim(),
        phone: this.form.phone.trim(),
        email: this.form.email.trim(),
        address: this.form.address.trim(),
        items: this.cartSummary.map((c) => ({
          lessonId: c._id,
          quantity: c.qty,
        })),
        total: this.cartTotal,
      };
      
      const orderOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(order),
      };
      
      fetchWithCallback("/orders", orderOptions, (err, data) => {
        if (err) {
          this.error = err.message || "Failed to submit order";
          return;
        }
        
        this.resetAll();
        this.page = "success";
        this.fetchLessons();
      });
    },
    
    /**
     * Reset all form data and filters to initial state
     * Clears cart, resets form fields, search, filters, and sorting options
     */
    resetAll() {
      this.cart = [];
      this.form = { name: "", phone: "", email: "", address: "" };
      this.searchTerm = "";
      this.filterKey = "all";
      this.sortKey = "subject-asc";
      this.locationFilter = "";
      this.minPrice = 0;
      this.maxPrice = 9999;
    },
  },
});


