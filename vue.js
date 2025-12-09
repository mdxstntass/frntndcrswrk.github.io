// Base URL for API - adjust if your backend runs on a different port
const API_BASE_URL = "http://localhost:3003";

// Helper function to handle fetch with callbacks
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

new Vue({
  el: "#app",
  data: {
    lessons: [],
    searchTerm: "",
    sortKey: "subject-asc",
    filterKey: "all",
    minPrice: 0,
    maxPrice: 9999,
    locationFilter: "",
    cart: [],
    page: "catalog",
    form: {
      name: "",
      phone: "",
      email: "",
      address: "",
    },
    loading: false,
    error: "",
  },
  created() {
    this.fetchLessons();
  },
  computed: {
    cartCount() {
      return this.cart.length;
    },
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
    cartTotal() {
      return this.cart.reduce((sum, item) => sum + Number(item.price || 0), 0);
    },
    locationOptions() {
      return Array.from(new Set(this.lessons.map((l) => l.location))).filter(
        Boolean
      );
    },
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
  methods: {
    // GET /lessons - Fetch all lessons
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
    // GET /search - Search lessons
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
    canAdd(lesson) {
      return lesson && lesson.spaces > 0;
    },
    cartQuantity(lesson) {
      return this.cart.filter((item) => item._id === lesson._id).length;
    },
    // PUT /lessons/:id - Update lesson availability (decrease spaces)
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
    // PUT /lessons/:id - Update lesson availability (increase spaces)
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
    goTo(page) {
      this.page = page;
    },
    // POST /orders - Submit order
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


