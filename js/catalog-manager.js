"use strict";

(() => {
  const github = window.MaisonMoraGitHub;
  if (!github) throw new Error("The GitHub authentication client must load before the catalog manager.");

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const state = {
    config: null,
    categories: [],
    products: [],
    imageState: [],
    editingProduct: null,
    pendingUpload: null,
    pendingDelete: null,
    pendingCleanup: null,
    pendingCategoryRename: null,
    objectUrls: new Map(),
    previewUrls: new Set(),
    branchLoadId: 0,
    loadGeneration: 0,
    activities: []
  };
  const $ = selector => document.querySelector(selector);
  const pages = [...document.querySelectorAll("[data-page-panel]")];
  const navItems = [...document.querySelectorAll("[data-workspace-page]")];
  const productForm = $("#product-form");
  const fileInput = $("#product-images");
  const productGrid = $("#product-grid");
  const productDialog = $("#product-dialog");

  function showStatus(element, message, kind = "error") {
    element.textContent = message;
    element.className = `status-message ${kind}`;
    element.hidden = false;
  }

  function hideStatus(element) {
    element.hidden = true;
    element.textContent = "";
    element.className = "status-message";
  }

  function setWorkspaceBusy(busy, reason = "catalog") {
    state.busy = busy;
    document.dispatchEvent(new CustomEvent("github:workspace-busy", {detail: {busy, reason}}));
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function addActivity(message) {
    state.activities.unshift({message, at: new Date()});
    state.activities = state.activities.slice(0, 6);
    renderActivity();
  }

  function renderActivity() {
    const container = $("#recent-activity");
    container.replaceChildren();
    if (!state.activities.length) {
      container.append(element("p", "empty-message", "Activity from this session will appear here."));
      return;
    }
    state.activities.forEach(item => {
      const row = element("div", "activity-row");
      row.append(element("span", "", item.message), element("time", "", item.at.toLocaleTimeString()));
      container.append(row);
    });
  }

  function showPage(name) {
    pages.forEach(page => { page.hidden = page.dataset.pagePanel !== name; });
    navItems.forEach(item => {
      const active = item.dataset.workspacePage === name;
      item.classList.toggle("active", active);
      item.setAttribute("aria-current", active ? "page" : "false");
    });
    if (name === "catalog") renderCatalog();
    if (name === "categories") renderCategories();
  }

  navItems.forEach(item => item.addEventListener("click", () => showPage(item.dataset.workspacePage)));
  document.querySelectorAll("[data-go-page]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.goPage)));

  function configRoot() {
    if (!state.config) throw new Error("Verify a GitHub repository in Repository Settings before continuing.");
    if (!/^[A-Za-z0-9._/-]+$/.test(state.config.root) || state.config.root.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error("The configured destination folder is not valid. Update it in Repository Settings.");
    }
    return state.config.root;
  }

  function contentsPath(path) {
    const config = state.config;
    if (!config) throw new Error("No verified GitHub repository is configured.");
    return `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.name)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(config.branch)}`;
  }

  function productDirectory(id) {
    return `${configRoot()}/products/${id}`;
  }

  function productJsonPath(id) {
    return `${productDirectory(id)}/product.json`;
  }

  function categoriesPath() {
    return `${configRoot()}/categories/categories.json`;
  }

  function catalogPath() {
    return `${configRoot()}/catalog.json`;
  }

  function isNotFound(error) {
    return error && error.status === 404;
  }

  function decodeBase64(text) {
    const binary = atob(text.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let offset = 0; offset < binary.length; offset += 0x8000) {
      const limit = Math.min(offset + 0x8000, binary.length);
      for (let index = offset; index < limit; index += 1) bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    }
    return btoa(binary);
  }

  async function readJsonFile(path) {
    try {
      const response = await github.request(contentsPath(path));
      if (!response || response.type !== "file" || typeof response.content !== "string" || typeof response.sha !== "string") {
        throw new Error(`GitHub did not return a readable file for ${path}.`);
      }
      const text = decodeBase64(response.content);
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`${path} is not valid JSON. Correct it in the repository before continuing.`);
      }
      return {data, sha: response.sha, text};
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async function readFileMetadata(path) {
    try {
      const response = await github.request(contentsPath(path));
      if (!response || response.type !== "file" || typeof response.sha !== "string") {
        throw new Error(`GitHub did not return file metadata for ${path}.`);
      }
      return response;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async function writeTextFile(path, text, options = {}) {
    const body = {
      message: options.message || `Update ${path}`,
      content: bytesToBase64(new TextEncoder().encode(text)),
      branch: state.config.branch
    };
    if (options.sha) body.sha = options.sha;
    return github.request(contentsPath(path), {method: "PUT", body});
  }

  function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function safeProduct(value) {
    return value && typeof value.id === "string" && /^[\da-f-]{36}$/i.test(value.id) &&
      typeof value.name === "string" && typeof value.sku === "string" &&
      value.price && value.price.currency === "INR" && typeof value.price.amount === "number" &&
      Number.isFinite(value.price.amount) && value.price.amount >= 0 &&
      typeof value.description === "string" && Array.isArray(value.images) &&
      (value.dimensions == null || (
        ["length", "width", "height"].every(key => Number.isFinite(Number(value.dimensions[key])) && Number(value.dimensions[key]) >= 0) &&
        ["mm", "cm", "m", "inch", "ft"].includes(value.dimensions.unit)
      )) &&
      value.images.every(image => image && typeof image.path === "string" && typeof image.filename === "string");
  }

  function safeProductImage(product, image) {
    const expectedPrefix = `${productDirectory(product.id)}/images/`;
    return typeof image.id === "string" && image.path.startsWith(expectedPrefix) &&
      image.path.split("/").every(part => part && part !== "." && part !== ".." && /^[A-Za-z0-9._-]+$/.test(part)) &&
      image.filename === image.path.slice(image.path.lastIndexOf("/") + 1);
  }

  function validateCategoryList(data) {
    if (!data || !Array.isArray(data.categories)) throw new Error("categories.json must contain a categories array.");
    const seen = new Set();
    return data.categories.map(category => {
      if (!category || typeof category.id !== "string" || typeof category.name !== "string" || !category.name.trim()) {
        throw new Error("categories.json contains an invalid category record.");
      }
      const key = category.name.trim().toLocaleLowerCase();
      if (seen.has(key)) throw new Error(`categories.json contains duplicate category names: ${category.name}.`);
      seen.add(key);
      return {id: category.id, name: category.name.trim(), createdAt: category.createdAt || null, updatedAt: category.updatedAt || null};
    });
  }

  async function discoverProducts() {
    const path = `${configRoot()}/products`;
    let entries;
    try {
      entries = await github.request(contentsPath(path));
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry.type !== "string" || typeof entry.name !== "string")) {
      throw new Error(`GitHub did not return a valid product directory listing for ${path}.`);
    }
    const discovered = [];
    for (const entry of entries) {
      if (entry.type !== "dir" || !/^[\da-f-]{36}$/i.test(entry.name)) continue;
      const file = await readJsonFile(`${path}/${entry.name}/product.json`);
      if (!file) continue;
      if (!safeProduct(file.data) || file.data.id !== entry.name) {
        throw new Error(`Product metadata in ${entry.name} is invalid or does not match its directory.`);
      }
      if (!file.data.images.every(image => safeProductImage(file.data, image))) {
        throw new Error(`Product ${entry.name} contains an unsafe image path.`);
      }
      file.data._sha = file.sha;
      discovered.push(file.data);
    }
    return discovered;
  }

  async function loadProducts() {
    const index = await readJsonFile(catalogPath());
    if (!index) return discoverProducts();
    if (!index.data || !Array.isArray(index.data.products)) {
      throw new Error("catalog.json must contain a products array.");
    }
    const products = [];
    for (const entry of index.data.products) {
      if (!entry || typeof entry.id !== "string" || !/^[\da-f-]{36}$/i.test(entry.id)) {
        throw new Error("catalog.json contains an invalid product ID.");
      }
      const file = await readJsonFile(productJsonPath(entry.id));
      if (!file) {
        showStatus($("#catalog-status"), `The catalog index references missing product ${entry.id}. The index was not changed.`, "info");
        continue;
      }
      if (!safeProduct(file.data) || file.data.id !== entry.id) {
        throw new Error(`Product metadata for ${entry.id} is invalid.`);
      }
      if (!file.data.images.every(image => safeProductImage(file.data, image))) {
        throw new Error(`Product ${entry.id} contains an unsafe image path.`);
      }
      file.data._sha = file.sha;
      products.push(file.data);
    }
    return products;
  }

  function revokeObjectUrls() {
    state.objectUrls.forEach(url => URL.revokeObjectURL(url));
    state.objectUrls.clear();
    state.previewUrls.forEach(url => URL.revokeObjectURL(url));
    state.previewUrls.clear();
  }

  async function imageObjectUrl(path) {
    if (state.objectUrls.has(path)) return state.objectUrls.get(path);
    const response = await github.request(contentsPath(path), {raw: true});
    const url = URL.createObjectURL(response);
    state.objectUrls.set(path, url);
    return url;
  }

  async function loadWorkspace() {
    const config = github.getConfiguration();
    if (!config) return;
    state.config = config;
    const loadId = ++state.loadGeneration;
    const busyReason = `catalog-load-${loadId}`;
    setWorkspaceBusy(true, busyReason);
    revokeObjectUrls();
    state.products = [];
    state.categories = [];
    $("#product-grid").replaceChildren(element("p", "empty-message", "Loading products from GitHub…"));
    hideStatus($("#catalog-status"));
    hideStatus($("#category-status"));
    try {
      const [categoryFile, products] = await Promise.all([
        readJsonFile(categoriesPath()),
        loadProducts()
      ]);
      if (state.config !== config) return;
      state.categories = categoryFile ? validateCategoryList(categoryFile.data) : [];
      state.products = products.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
      renderCatalog();
      renderCategories();
      renderCategorySelect();
      renderDashboard();
      addActivity(`Loaded ${state.products.length} product${state.products.length === 1 ? "" : "s"} from ${config.fullName}.`);
    } catch (error) {
      if (state.config !== config) return;
      showStatus($("#catalog-status"), error.message || "Could not load catalog data from GitHub.");
      $("#product-grid").replaceChildren(element("p", "empty-message", "Catalog data could not be loaded."));
      renderCategories();
      renderDashboard();
    } finally {
      setWorkspaceBusy(false, busyReason);
    }
  }

  function renderDashboard() {
    $("#stat-products").textContent = String(state.products.length);
    $("#stat-categories").textContent = String(state.categories.length);
    $("#stat-images").textContent = String(state.products.reduce((total, product) => total + product.images.length, 0));
    const recent = $("#recent-products");
    recent.replaceChildren();
    if (!state.products.length) {
      recent.append(element("p", "empty-message", "No products yet. Add your first product to get started."));
      return;
    }
    state.products.slice(0, 4).forEach(product => {
      const row = element("button", "recent-product", product.name);
      row.type = "button";
      row.append(element("span", "", product.sku));
      row.addEventListener("click", () => openProductDetails(product));
      recent.append(row);
    });
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("en-IN", {style: "currency", currency: "INR", minimumFractionDigits: 2}).format(Number(value) || 0);
  }

  function categoryName(id) {
    const category = state.categories.find(item => item.id === id);
    return category ? category.name : "Uncategorized";
  }

  function productDimensions(product) {
    const dimensions = product.dimensions;
    if (!dimensions || !["length", "width", "height"].every(key => Number.isFinite(Number(dimensions[key])))) return "Dimensions not specified";
    return `${dimensions.length} × ${dimensions.width} × ${dimensions.height} ${dimensions.unit}`;
  }

  function renderCatalog() {
    if (!productGrid || !state.config) return;
    const query = $("#catalog-search").value.trim().toLocaleLowerCase();
    const categoryFilter = $("#catalog-category-filter").value;
    const priceFilter = $("#catalog-price-filter").value;
    const sort = $("#catalog-sort").value;
    let products = state.products.filter(product => {
      const text = `${product.name} ${product.sku} ${product.description}`.toLocaleLowerCase();
      if (query && !text.includes(query)) return false;
      if (categoryFilter && product.categoryId !== categoryFilter) return false;
      const price = Number(product.price.amount);
      if (priceFilter === "0-1000" && price >= 1000) return false;
      if (priceFilter === "1000-5000" && (price < 1000 || price >= 5000)) return false;
      if (priceFilter === "5000+" && price < 5000) return false;
      return true;
    });
    products = [...products];
    if (sort === "oldest") products.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    if (sort === "price-asc") products.sort((a, b) => Number(a.price.amount) - Number(b.price.amount));
    if (sort === "price-desc") products.sort((a, b) => Number(b.price.amount) - Number(a.price.amount));
    if (sort === "name") products.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "newest") products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    $("#catalog-count").textContent = `${products.length} product${products.length === 1 ? "" : "s"}`;
    productGrid.replaceChildren();
    if (!products.length) {
      productGrid.append(element("p", "empty-message", state.products.length ? "No products match these filters." : "No products in this repository yet. Add your first product."));
      return;
    }
    products.forEach(product => productGrid.append(createProductCard(product)));
  }

  function createProductCard(product) {
    const card = element("article", "product-card");
    const open = element("button", "product-card-main");
    open.type = "button";
    const image = element("img", "product-card-image");
    image.alt = `Product image: ${product.name}`;
    image.loading = "lazy";
    image.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 280'%3E%3Crect width='400' height='280' fill='%23f1ebe4'/%3E%3Cpath d='M175 110h50v60h-50z' fill='%23d1c3b5'/%3E%3C/svg%3E";
    const main = element("div", "product-card-copy");
    main.append(element("span", "product-category", categoryName(product.categoryId)));
    main.append(element("h3", "", product.name));
    main.append(element("span", "product-sku", product.sku));
    main.append(element("p", "product-card-description", product.description));
    main.append(element("strong", "product-price", formatPrice(product.price.amount)));
    main.append(element("span", "product-dimensions", productDimensions(product)));
    open.append(image, main);
    open.addEventListener("click", () => openProductDetails(product));
    card.append(open);
    const footer = element("div", "product-card-footer");
    footer.append(element("span", "image-count", `${product.images.length} image${product.images.length === 1 ? "" : "s"}`));
    const edit = element("button", "text-button", "Edit");
    edit.type = "button";
    edit.addEventListener("click", () => editProduct(product));
    footer.append(edit);
    const deleteButton = element("button", "text-button delete-action", "Delete");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => deleteProduct(product));
    footer.append(deleteButton);
    card.append(footer);
    const primary = product.images.find(item => item.isPrimary) || product.images[0];
    if (primary) {
      imageObjectUrl(primary.path).then(url => {
        if (image.isConnected) image.src = url;
      }).catch(() => {
        if (image.isConnected) image.alt = `Image unavailable for ${product.name}`;
      });
    }
    return card;
  }

  function renderCategorySelect(selectedId) {
    const select = $("#product-category");
    const filter = $("#catalog-category-filter");
    const selectedFilter = filter.value;
    select.replaceChildren(new Option("Choose a category", ""));
    state.categories.forEach(category => select.add(new Option(category.name, category.id)));
    if (selectedId) select.value = selectedId;
    filter.replaceChildren(new Option("All categories", ""));
    state.categories.forEach(category => filter.add(new Option(category.name, category.id)));
    filter.value = selectedFilter;
  }

  function renderCategories() {
    const container = $("#category-list");
    if (!container) return;
    container.replaceChildren();
    if (!state.config) {
      container.append(element("p", "empty-message", "Configure a repository to manage categories."));
      return;
    }
    if (!state.categories.length) {
      container.append(element("p", "empty-message", "No categories yet. Add a category before creating a product."));
      return;
    }
    state.categories.forEach(category => {
      const row = element("article", "category-row");
      const count = state.products.filter(product => product.categoryId === category.id).length;
      const details = element("div", "category-copy");
      details.append(element("strong", "", category.name));
      details.append(element("span", "", `${count} product${count === 1 ? "" : "s"}`));
      row.append(details);
      const actions = element("div", "category-actions");
      const edit = element("button", "text-button", "Edit");
      edit.type = "button";
      edit.addEventListener("click", () => editCategory(category));
      const remove = element("button", "text-button delete-action", "Delete");
      remove.type = "button";
      remove.disabled = count > 0;
      remove.title = count ? "Reassign products before deleting this category." : "Delete category";
      remove.addEventListener("click", () => deleteCategory(category));
      actions.append(edit, remove);
      row.append(actions);
      container.append(row);
    });
  }

  function openProductDetails(product) {
    const content = $("#product-detail-content");
    content.replaceChildren();
    const heading = element("div", "detail-heading");
    heading.append(element("span", "product-category", categoryName(product.categoryId)));
    heading.append(element("h2", "", product.name));
    heading.append(element("p", "product-sku", product.sku));
    content.append(heading);
    const gallery = element("div", "detail-gallery");
    product.images.forEach((image, index) => {
      const img = element("img");
      img.alt = `${product.name} image ${index + 1}${image.isPrimary ? ", primary image" : ""}`;
      img.loading = "lazy";
      gallery.append(img);
      imageObjectUrl(image.path).then(url => {
        if (img.isConnected) img.src = url;
      }).catch(() => {
        img.alt = `Image unavailable: ${image.filename}`;
      });
    });
    if (!product.images.length) gallery.append(element("p", "empty-message", "No images are attached to this product."));
    content.append(gallery);
    const summary = element("div", "detail-summary");
    summary.append(element("strong", "product-price", formatPrice(product.price.amount)));
    summary.append(element("span", "product-category", categoryName(product.categoryId)));
    summary.append(element("p", "detail-description", product.description));
    summary.append(element("p", "product-dimensions", productDimensions(product)));
    summary.append(element("p", "detail-date", `Created ${formatDate(product.createdAt)} · Updated ${formatDate(product.updatedAt)}`));
    content.append(summary);
    const actions = element("div", "detail-actions");
    const edit = element("button", "primary-button", "Edit product");
    edit.type = "button";
    edit.addEventListener("click", () => {
      productDialog.close();
      editProduct(product);
    });
    const remove = element("button", "secondary-button delete-action", "Delete product");
    remove.type = "button";
    remove.addEventListener("click", () => {
      productDialog.close();
      deleteProduct(product);
    });
    actions.append(edit, remove);
    content.append(actions);
    productDialog.showModal();
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "date unavailable" : date.toLocaleDateString();
  }

  $("#close-product-dialog").addEventListener("click", () => productDialog.close());
  productDialog.addEventListener("click", event => {
    if (event.target === productDialog) productDialog.close();
  });

  ["#catalog-search", "#catalog-category-filter", "#catalog-price-filter", "#catalog-sort"].forEach(selector => {
    $(selector).addEventListener(selector === "#catalog-search" ? "input" : "change", renderCatalog);
  });

  async function loadBranches(repository) {
    const select = $("#branch-select");
    const verify = $("#verify-button");
    const loadId = ++state.branchLoadId;
    github.clearConfiguration();
    select.replaceChildren(new Option("Loading branches…", ""));
    select.disabled = true;
    verify.disabled = true;
    if (!repository) {
      select.replaceChildren(new Option("Choose a repository first", ""));
      return;
    }
    try {
      const branches = [];
      let page = 1;
      while (true) {
        const batch = await github.request(`/repos/${encodeURIComponent(repository.owner.login)}/${encodeURIComponent(repository.name)}/branches?per_page=100&page=${page}`);
        if (!Array.isArray(batch)) throw new Error("GitHub did not return a valid branch list.");
        branches.push(...batch);
        if (batch.length < 100) break;
        page += 1;
      }
      if (loadId !== state.branchLoadId) return;
      select.replaceChildren(new Option(branches.length ? "Select a branch…" : "No branches found", ""));
      branches.forEach(branch => select.add(new Option(branch.name, branch.name)));
      const preferred = branches.find(branch => branch.name === repository.default_branch);
      if (preferred) select.value = preferred.name;
      select.disabled = !branches.length;
      verify.disabled = !branches.length;
    } catch (error) {
      if (loadId !== state.branchLoadId) return;
      select.replaceChildren(new Option("Could not load branches", ""));
      select.disabled = true;
      showStatus($("#settings-status"), error.message || "Could not load repository branches.");
    }
  }

  document.addEventListener("github:repository-selected", event => loadBranches(event.detail));
  document.addEventListener("github:configured", loadWorkspace);

  function clearWorkspace() {
    state.config = null;
    setWorkspaceBusy(false);
    state.categories = [];
    state.products = [];
    state.imageState.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
    state.imageState = [];
    state.editingProduct = null;
    state.pendingUpload = null;
    state.pendingDelete = null;
    state.pendingCleanup = null;
    state.pendingCategoryRename = null;
    state.activities = [];
    revokeObjectUrls();
    productGrid.replaceChildren(element("p", "empty-message", "Configure a repository to load your products."));
    $("#category-list").replaceChildren(element("p", "empty-message", "Configure a repository to manage categories."));
    $("#catalog-recovery").replaceChildren();
    $("#category-recovery").replaceChildren();
    $("#recent-products").replaceChildren(element("p", "empty-message", "Connect a repository to load your products."));
    renderActivity();
    renderDashboard();
    renderCategorySelect();
    clearProductForm();
    resetCategoryForm();
    renderCategories();
  }

  document.addEventListener("github:configuration-cleared", clearWorkspace);
  document.addEventListener("github:disconnected", clearWorkspace);

  function formatBytes(size) {
    return size < 1024 * 1024 ? `${(size / 1024).toFixed(0)} KB` : `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function imageDimensions(file) {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      const dimensions = {width: bitmap.width, height: bitmap.height};
      bitmap.close();
      return dimensions;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return {width: image.naturalWidth, height: image.naturalHeight};
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function validateImage(file) {
    if (file.size <= 0) throw new Error("The file is empty.");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("The file exceeds the 5 MB per-image limit.");
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    let extension;
    let mime;
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      extension = "jpg";
      mime = "image/jpeg";
    } else if (header.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte)) {
      extension = "png";
      mime = "image/png";
    } else if (header.length >= 12 && String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...header.slice(8, 12)) === "WEBP") {
      extension = "webp";
      mime = "image/webp";
    } else {
      throw new Error("Only valid JPG, PNG, and WEBP image content is supported.");
    }
    const dimensions = await imageDimensions(file);
    if (!dimensions.width || !dimensions.height) throw new Error("Could not read the image dimensions.");
    return {...dimensions, extension, mime};
  }

  async function addSelectedFiles(files) {
    const error = $("#image-error");
    error.textContent = "";
    for (const file of files) {
      try {
        const details = await validateImage(file);
        const id = newId();
        const previewUrl = URL.createObjectURL(file);
        state.previewUrls.add(previewUrl);
        state.imageState.push({
          id,
          filename: `image-${id}.${details.extension}`,
          file,
          existing: false,
          previewUrl,
          width: details.width,
          height: details.height,
          size: file.size
        });
      } catch (failure) {
        error.textContent += `${file.name}: ${failure.message} `;
      }
    }
    fileInput.value = "";
    renderImagePreviews();
  }

  $("#choose-images").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => addSelectedFiles([...fileInput.files]));
  const dropZone = $("#image-drop-zone");
  ["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  }));
  ["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
  }));
  dropZone.addEventListener("drop", event => addSelectedFiles([...event.dataTransfer.files]));

  function renderImagePreviews() {
    const container = $("#image-preview-grid");
    container.replaceChildren();
    state.imageState.forEach((item, index) => {
      const card = element("article", "image-preview-card");
      const image = element("img");
      image.alt = `${item.filename}, ${item.width ? `${item.width} × ${item.height} pixels` : "saved product image"}`;
      image.src = item.previewUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 150'%3E%3Crect width='200' height='150' fill='%23f1ebe4'/%3E%3C/svg%3E";
      if (item.existing && !item.previewUrl) {
        imageObjectUrl(item.path).then(url => {
          if (image.isConnected) image.src = url;
        }).catch(() => { image.alt = `Image unavailable: ${item.filename}`; });
      }
      const info = element("div", "image-preview-info");
      info.append(element("strong", "", item.filename));
      info.append(element("span", "", `${item.width ? `${item.width} × ${item.height} px · ` : ""}${item.size ? formatBytes(item.size) : "saved"}`));
      const controls = element("div", "image-preview-controls");
      const primaryLabel = element("label", "primary-image-choice");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "primary-image";
      radio.checked = item.isPrimary === true || (!state.imageState.some(imageItem => imageItem.isPrimary) && index === 0);
      radio.addEventListener("change", () => {
        state.imageState.forEach(imageItem => { imageItem.isPrimary = imageItem.id === item.id; });
        renderImagePreviews();
      });
      primaryLabel.append(radio, document.createTextNode("Primary"));
      controls.append(primaryLabel);
      const up = element("button", "icon-button", "↑");
      up.type = "button";
      up.title = "Move image earlier";
      up.setAttribute("aria-label", `Move ${item.filename} earlier`);
      up.disabled = index === 0;
      up.addEventListener("click", () => moveImage(index, -1));
      const down = element("button", "icon-button", "↓");
      down.type = "button";
      down.title = "Move image later";
      down.setAttribute("aria-label", `Move ${item.filename} later`);
      down.disabled = index === state.imageState.length - 1;
      down.addEventListener("click", () => moveImage(index, 1));
      const remove = element("button", "icon-button remove-image", "×");
      remove.type = "button";
      remove.title = "Remove image";
      remove.setAttribute("aria-label", `Remove ${item.filename}`);
      remove.addEventListener("click", () => removeImage(index));
      controls.append(up, down, remove);
      card.append(image, info, controls);
      container.append(card);
    });
  }

  function moveImage(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= state.imageState.length) return;
    [state.imageState[index], state.imageState[target]] = [state.imageState[target], state.imageState[index]];
    renderImagePreviews();
  }

  function removeImage(index) {
    const [item] = state.imageState.splice(index, 1);
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      state.previewUrls.delete(item.previewUrl);
    }
    if (state.imageState.length && !state.imageState.some(image => image.isPrimary)) state.imageState[0].isPrimary = true;
    renderImagePreviews();
  }

  $("#product-description").addEventListener("input", event => {
    $("#description-count").textContent = `${event.target.value.length.toLocaleString()} / 2,000`;
  });

  function resetFormStatus() {
    hideStatus($("#form-status"));
    $("#upload-progress").hidden = true;
    $("#upload-progress").textContent = "";
    $("#resume-upload").hidden = true;
  }

  function setFormBusy(busy, pending = false) {
    productForm.querySelectorAll("input,select,textarea,button").forEach(control => {
      if (control.id === "resume-upload") control.disabled = busy || !pending;
      else control.disabled = busy || pending;
    });
    $("#save-product").textContent = busy ? "Saving to GitHub…" : state.editingProduct ? "Update product" : "Save product";
  }

  function clearProductForm() {
    productForm.reset();
    state.imageState.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
    state.previewUrls.clear();
    state.imageState = [];
    state.editingProduct = null;
    $("#product-form-title").textContent = "Add Product";
    $("#product-form-eyebrow").textContent = "ADD SOMETHING LOVELY";
    $("#cancel-edit").hidden = true;
    $("#resume-upload").hidden = true;
    $("#description-count").textContent = "0 / 2,000";
    $("#image-error").textContent = "";
    $("#dimension-error").textContent = "";
    renderImagePreviews();
    renderCategorySelect();
    setFormBusy(false);
    resetFormStatus();
  }

  function newSku() {
    return `PROD-${Date.now().toString(36).toUpperCase()}`;
  }

  function startNewProduct() {
    if (state.busy) return;
    if (state.pendingUpload) {
      showPage("add-product");
      showStatus($("#form-status"), "Resume the pending save before starting another product.");
      return;
    }
    clearProductForm();
    $("#product-sku").value = newSku();
    $("#product-form-title").textContent = "Add Product";
    showPage("add-product");
    $("#product-name").focus();
  }

  function editProduct(product) {
    if (!state.config || state.busy) return;
    if (state.pendingUpload || state.pendingCategoryRename) {
      showPage(state.pendingUpload ? "add-product" : "categories");
      showStatus(state.pendingUpload ? $("#form-status") : $("#category-status"), "Resume the pending repository operation before editing another record.");
      return;
    }
    clearProductForm();
    state.editingProduct = product;
    $("#product-form-title").textContent = "Edit Product";
    $("#product-form-eyebrow").textContent = "REFINE THIS PIECE";
    $("#product-name").value = product.name;
    $("#product-category").value = product.categoryId;
    $("#product-sku").value = product.sku;
    $("#product-price").value = product.price.amount;
    $("#product-description").value = product.description;
    $("#description-count").textContent = `${product.description.length.toLocaleString()} / 2,000`;
    if (product.dimensions) {
      $("#dimension-length").value = product.dimensions.length;
      $("#dimension-width").value = product.dimensions.width;
      $("#dimension-height").value = product.dimensions.height;
      $("#dimension-unit").value = product.dimensions.unit;
    }
    state.imageState = product.images.map(image => ({...image, size: image.sizeBytes, existing: true, isPrimary: image.isPrimary === true}));
    if (state.imageState.length && !state.imageState.some(image => image.isPrimary)) state.imageState[0].isPrimary = true;
    $("#cancel-edit").hidden = false;
    renderImagePreviews();
    showPage("add-product");
  }

  $("#cancel-edit").addEventListener("click", () => {
    clearProductForm();
    showPage("catalog");
  });
  $("#page-overview [data-go-page='add-product']").addEventListener("click", startNewProduct);
  $("#page-catalog [data-go-page='add-product']").addEventListener("click", startNewProduct);
  function validateProductForm() {
    if (!state.config) throw new Error("Verify a repository in Repository Settings before saving a product.");
    if (state.pendingUpload) throw new Error("Resume or finish the pending upload before starting another product.");
    if (state.pendingDelete || state.pendingCategoryRename) throw new Error("Resume the pending repository operation before saving another product.");
    if (!productForm.reportValidity()) throw new Error("Please correct the highlighted product fields.");
    const name = $("#product-name").value.trim().replace(/\s+/g, " ");
    const description = $("#product-description").value.trim();
    const sku = $("#product-sku").value.trim();
    const categoryId = $("#product-category").value;
    const category = state.categories.find(item => item.id === categoryId);
    if (!category) throw new Error("Choose a valid category. Add one in Categories if the list is empty.");
    if (name.length < 3 || name.length > 120) throw new Error("Product name must be between 3 and 120 characters.");
    if (description.length < 10 || description.length > 2000) throw new Error("Description must be between 10 and 2,000 characters.");
    if (sku.length < 2 || sku.length > 40) throw new Error("SKU must be between 2 and 40 characters.");
    if (state.products.some(product => product.sku.toLocaleLowerCase() === sku.toLocaleLowerCase() &&
      (!state.editingProduct || product.id !== state.editingProduct.id))) {
      throw new Error(`SKU ${sku} is already assigned to another product.`);
    }
    const price = Number($("#product-price").value);
    if (!Number.isFinite(price) || price < 0) throw new Error("Enter a valid non-negative INR price.");
    const dimensionValues = ["#dimension-length", "#dimension-width", "#dimension-height"].map(selector => $(selector).value.trim());
    const filledDimensions = dimensionValues.filter(Boolean).length;
    if (filledDimensions !== 0 && filledDimensions !== 3) {
      $("#dimension-error").textContent = "Enter length, width, and height together, or leave all three blank.";
      throw new Error("Complete all three dimensions or leave them blank.");
    }
    $("#dimension-error").textContent = "";
    const dimensions = filledDimensions
      ? {
          length: Number(dimensionValues[0]),
          width: Number(dimensionValues[1]),
          height: Number(dimensionValues[2]),
          unit: $("#dimension-unit").value
        }
      : null;
    if (dimensions && Object.values(dimensions).slice(0, 3).some(value => !Number.isFinite(value) || value < 0)) {
      throw new Error("Dimensions must be valid non-negative numbers.");
    }
    if (!state.imageState.length) throw new Error("Add at least one valid product image.");
    return {name, description, sku, category, price, dimensions};
  }

  function buildProductOperation() {
    const fields = validateProductForm();
    const previous = state.editingProduct;
    const id = previous ? previous.id : newId();
    const imageEntries = state.imageState.map((image, index) => {
      const path = image.existing ? image.path : `${productDirectory(id)}/images/${image.filename}`;
      return {
        id: image.id,
        filename: image.filename,
        path,
        isPrimary: image.isPrimary === true || (!state.imageState.some(item => item.isPrimary) && index === 0),
        sortOrder: index + 1,
        width: image.width,
        height: image.height,
        sizeBytes: image.size || image.sizeBytes,
        entry: image
      };
    });
    const product = {
      id,
      sku: fields.sku,
      name: fields.name,
      categoryId: fields.category.id,
      categoryName: fields.category.name,
      price: {amount: fields.price, currency: "INR"},
      description: fields.description,
      dimensions: fields.dimensions,
      images: imageEntries.map(({id: imageId, filename, path, isPrimary, sortOrder, width, height, sizeBytes}) => ({
        id: imageId,
        filename,
        path,
        isPrimary,
        sortOrder,
        width,
        height,
        sizeBytes
      })),
      createdAt: previous ? previous.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const retainedPaths = new Set(product.images.map(image => image.path));
    const removedImages = previous ? previous.images.filter(image => !retainedPaths.has(image.path)) : [];
    return {
      product,
      imageEntries,
      newImages: imageEntries.filter(image => !image.entry.existing),
      removedImages,
      existingSha: previous ? previous._sha : null,
      uploadedPaths: new Set(),
      productText: `${JSON.stringify(product, null, 2)}\n`,
      productSaved: false,
      indexSaved: false,
      currentPath: null
    };
  }

  async function gitBlobSha(bytes) {
    const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const blob = new Uint8Array(header.length + bytes.length);
    blob.set(header);
    blob.set(bytes, header.length);
    const digest = await crypto.subtle.digest("SHA-1", blob);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  }

  async function uploadImage(image) {
    const bytes = new Uint8Array(await image.entry.file.arrayBuffer());
    const expectedSha = await gitBlobSha(bytes);
    const existing = await readFileMetadata(image.path);
    if (existing) {
      if (existing.sha === expectedSha) return existing.sha;
      throw new Error(`Refusing to overwrite existing file ${image.path}; it does not match this upload.`);
    }
    const result = await github.request(contentsPath(image.path), {
      method: "PUT",
      body: {
        message: `Add product image ${image.filename}`,
        content: bytesToBase64(bytes),
        branch: state.config.branch
      }
    });
    return result && result.content ? result.content.sha : expectedSha;
  }

  async function saveProductJson(operation) {
    const path = productJsonPath(operation.product.id);
    const current = await readJsonFile(path);
    if (current && current.text === operation.productText) {
      operation.product._sha = current.sha;
      operation.productSaved = true;
      return;
    }
    if (operation.existingSha) {
      if (!current || current.sha !== operation.existingSha) {
        throw new Error(`Product metadata changed in GitHub since it was loaded. Reload the product before updating it.`);
      }
      const result = await writeTextFile(path, operation.productText, {
        sha: current.sha,
        message: `Update product ${operation.product.sku}`
      });
      operation.product._sha = result && result.content ? result.content.sha : null;
    } else {
      if (current) throw new Error(`Product file ${path} already exists. No existing file was overwritten.`);
      const result = await writeTextFile(path, operation.productText, {message: `Add product ${operation.product.sku}`});
      operation.product._sha = result && result.content ? result.content.sha : null;
    }
    operation.productSaved = true;
    if (!operation.product._sha) {
      const saved = await readJsonFile(path);
      if (!saved) throw new Error(`GitHub did not return a SHA for ${path}.`);
      operation.product._sha = saved.sha;
    }
  }

  async function updateCatalogIndex(operation) {
    const path = catalogPath();
    const current = await readJsonFile(path);
    const entries = current ? current.data.products : state.products.map(product => ({id: product.id}));
    if (!Array.isArray(entries)) throw new Error("catalog.json is invalid; its products array is missing.");
    if (entries.some(entry => !entry || typeof entry.id !== "string")) {
      throw new Error("catalog.json contains an invalid product entry. It was not changed.");
    }
    if (entries.some(entry => entry && entry.id === operation.product.id)) {
      operation.indexSaved = true;
      return;
    }
    const next = entries.filter(entry => entry && entry.id !== operation.product.id);
    next.push({id: operation.product.id});
    const text = `${JSON.stringify({schemaVersion: 1, updatedAt: new Date().toISOString(), products: next}, null, 2)}\n`;
    if (current && current.text === text) return;
    await writeTextFile(path, text, {
      sha: current ? current.sha : undefined,
      message: `Update product catalog index`
    });
    operation.indexSaved = true;
  }

  async function deleteRemoteFile(path, expectedSha) {
    const current = await readFileMetadata(path);
    if (!current) return;
    if (expectedSha && current.sha !== expectedSha) {
      throw new Error(`${path} changed in GitHub after it was selected for removal. Reload and confirm the change again.`);
    }
    await github.request(contentsPath(path), {
      method: "DELETE",
      body: {
        message: `Remove ${path}`,
        sha: current.sha,
        branch: state.config.branch
      }
    });
  }

  async function runProductSave(operation) {
    if (state.busy) return;
    setWorkspaceBusy(true);
    setFormBusy(true);
    $("#upload-progress").hidden = false;
    hideStatus($("#form-status"));
    try {
      if (operation.removedImages.length && !operation.removalConfirmed) {
        for (const image of operation.removedImages) {
          const current = await readFileMetadata(image.path);
          if (current) image.sha = current.sha;
        }
        if (!window.confirm(`Remove ${operation.removedImages.length} image file(s) from GitHub after saving this product?`)) {
          state.pendingUpload = null;
          setFormBusy(false);
          $("#upload-progress").hidden = true;
          return;
        }
        operation.removalConfirmed = true;
      }
      for (let index = 0; index < operation.newImages.length; index += 1) {
        const image = operation.newImages[index];
        if (operation.uploadedPaths.has(image.path)) continue;
        operation.currentPath = image.path;
        $("#upload-progress").textContent = `Uploading image ${index + 1} of ${operation.newImages.length}: ${image.filename}`;
        await uploadImage(image);
        operation.uploadedPaths.add(image.path);
        operation.currentPath = null;
      }
      $("#upload-progress").textContent = "Saving product metadata…";
      operation.currentPath = productJsonPath(operation.product.id);
      await saveProductJson(operation);
      operation.currentPath = null;
      $("#upload-progress").textContent = "Updating catalog index…";
      operation.currentPath = catalogPath();
      await updateCatalogIndex(operation);
      operation.currentPath = null;
      if (operation.removedImages.length) {
        state.pendingCleanup = {
          paths: operation.removedImages.map(image => ({path: image.path, sha: image.sha})),
          deletedPaths: new Set(),
          productName: operation.product.name
        };
        try {
          await runImageCleanup();
        } catch (error) {
          state.products = state.products.filter(product => product.id !== operation.product.id);
          const index = state.products.findIndex(product => product.id === operation.product.id);
          if (index >= 0) state.products[index] = operation.product;
          else state.products.push(operation.product);
          renderCatalog();
          renderDashboard();
          renderRecoveryActions();
          addActivity(`Updated ${operation.product.name}; image cleanup needs attention.`);
          const remaining = state.pendingCleanup.paths.filter(item => !state.pendingCleanup.deletedPaths.has(item.path)).map(item => item.path);
          showStatus($("#form-status"), `Product data was saved, but removed image cleanup is incomplete: ${error.message}${remaining.length ? ` Remaining files: ${remaining.join(", ")}.` : ""}`, "info");
          state.pendingUpload = null;
          setFormBusy(false);
          return;
        }
      }
      state.products = state.products.filter(product => product.id !== operation.product.id);
      state.products.push(operation.product);
      state.products.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
      addActivity(`${operation.existingSha ? "Updated" : "Added"} ${operation.product.name}.`);
      state.pendingUpload = null;
      clearProductForm();
      renderCatalog();
      renderDashboard();
      renderRecoveryActions();
      showPage("catalog");
    } catch (error) {
      if (!github.isConnected()) {
        state.pendingUpload = null;
        return;
      }
      state.pendingUpload = operation;
      const completed = [...operation.uploadedPaths];
      if (operation.productSaved) completed.push(productJsonPath(operation.product.id));
      if (operation.indexSaved) completed.push(catalogPath());
      const detail = completed.length ? ` Saved: ${completed.join(", ")}.` : "";
      const current = operation.currentPath ? ` The request for ${operation.currentPath} may have reached GitHub; resume checks before retrying.` : "";
      showStatus($("#form-status"), `${error.message || "The save did not finish."}${detail}${current} No full success was reported; resume safely to continue.`, "error");
      $("#resume-upload").hidden = false;
      $("#resume-upload").disabled = false;
      setFormBusy(false, true);
      $("#upload-progress").hidden = true;
      renderRecoveryActions();
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function runImageCleanup() {
    if (!state.pendingCleanup) return;
    const pending = state.pendingCleanup;
    for (const item of pending.paths) {
      if (pending.deletedPaths.has(item.path)) continue;
      await deleteRemoteFile(item.path, item.sha);
      pending.deletedPaths.add(item.path);
    }
    state.pendingCleanup = null;
  }

  productForm.addEventListener("submit", async event => {
    event.preventDefault();
    hideStatus($("#form-status"));
    if (state.busy) {
      showStatus($("#form-status"), "Wait for the current GitHub operation to finish.");
      return;
    }
    try {
      const operation = buildProductOperation();
      state.pendingUpload = operation;
      await runProductSave(operation);
    } catch (error) {
      showStatus($("#form-status"), error.message || "Please correct the product details.");
    }
  });

  $("#resume-upload").addEventListener("click", () => {
    if (state.pendingUpload) runProductSave(state.pendingUpload);
  });

  function renderRecoveryActions() {
    const container = $("#catalog-recovery");
    const categoryContainer = $("#category-recovery");
    container.replaceChildren();
    categoryContainer.replaceChildren();
    if (state.pendingUpload) {
      const resume = element("button", "secondary-button", `Resume saving ${state.pendingUpload.product.name}`);
      resume.type = "button";
      resume.addEventListener("click", () => runProductSave(state.pendingUpload));
      container.append(resume);
    }
    if (state.pendingDelete) {
      const resume = element("button", "secondary-button", `Resume deleting ${state.pendingDelete.product.name}`);
      resume.type = "button";
      resume.addEventListener("click", runPendingDelete);
      container.append(resume);
    }
    if (state.pendingCleanup) {
      const remaining = state.pendingCleanup.paths.filter(item => !state.pendingCleanup.deletedPaths.has(item.path)).length;
      const resume = element("button", "secondary-button", `Finish removing ${remaining} image file(s)`);
      resume.type = "button";
      resume.addEventListener("click", async () => {
        if (state.busy) return;
        setWorkspaceBusy(true);
        try {
          await runImageCleanup();
          renderRecoveryActions();
          showStatus($("#catalog-status"), "Removed image files were cleaned up successfully.", "success");
        } catch (error) {
          showStatus($("#catalog-status"), `Image cleanup is still incomplete: ${error.message}`);
        } finally {
          setWorkspaceBusy(false);
        }
      });
      container.append(resume);
    }
    if (state.pendingCategoryRename) {
      const resume = element("button", "secondary-button", `Resume category rename to ${state.pendingCategoryRename.newName}`);
      resume.type = "button";
      resume.addEventListener("click", () => runCategoryRename());
      container.append(resume);
      const categoryResume = element("button", "secondary-button", `Resume category rename to ${state.pendingCategoryRename.newName}`);
      categoryResume.type = "button";
      categoryResume.addEventListener("click", () => runCategoryRename());
      categoryContainer.append(categoryResume);
    }
  }

  async function deleteProduct(product) {
    if (!state.config || state.busy) return;
    if (state.pendingUpload || state.pendingDelete || state.pendingCategoryRename) {
      showStatus($("#catalog-status"), "Resume the pending repository operation before starting another deletion.");
      return;
    }
    const config = state.config;
    setWorkspaceBusy(true);
    const files = [];
    let started = false;
    try {
      for (const image of product.images) {
        if (!safeProductImage(product, image)) throw new Error(`Unsafe image path in product ${product.id}; delete stopped.`);
        const metadata = await readFileMetadata(image.path);
        if (state.config !== config) throw new Error("Repository settings changed. Product deletion was stopped.");
        if (metadata) files.push({path: image.path, sha: metadata.sha});
      }
      const productPath = productJsonPath(product.id);
      const metadata = await readFileMetadata(productPath);
      if (state.config !== config) throw new Error("Repository settings changed. Product deletion was stopped.");
      if (metadata && product._sha && metadata.sha !== product._sha) {
        throw new Error("Product metadata changed in GitHub since it was loaded. Reload the product before deleting it.");
      }
      if (metadata) files.push({path: productPath, sha: metadata.sha});
      if (state.config !== config) throw new Error("Repository settings changed. Product deletion was stopped.");
      const confirmed = window.confirm(`Permanently delete "${product.name}" and its ${files.length} GitHub file(s) from ${config.fullName}? This cannot be undone.`);
      if (!confirmed) return;
      state.pendingDelete = {product, files, deletedPaths: new Set()};
      started = true;
    } catch (error) {
      showStatus($("#catalog-status"), `Could not prepare product deletion: ${error.message}`);
    } finally {
      setWorkspaceBusy(false);
    }
    if (started) await runPendingDelete();
  }

  async function runPendingDelete() {
    const pending = state.pendingDelete;
    if (!pending || state.busy) return;
    setWorkspaceBusy(true);
    try {
      for (const file of pending.files) {
        if (pending.deletedPaths.has(file.path)) continue;
        await deleteRemoteFile(file.path, file.sha);
        pending.deletedPaths.add(file.path);
      }
      const current = await readJsonFile(catalogPath());
      if (current) {
        const products = current.data.products;
        if (!Array.isArray(products)) throw new Error("catalog.json is invalid; the product index could not be updated.");
        const next = products.filter(entry => entry && entry.id !== pending.product.id);
        const text = `${JSON.stringify({schemaVersion: 1, updatedAt: new Date().toISOString(), products: next}, null, 2)}\n`;
        await writeTextFile(catalogPath(), text, {sha: current.sha, message: `Remove product ${pending.product.sku} from catalog`});
      }
      state.products = state.products.filter(product => product.id !== pending.product.id);
      state.pendingDelete = null;
      renderCatalog();
      renderDashboard();
      renderRecoveryActions();
      addActivity(`Deleted ${pending.product.name}.`);
      showStatus($("#catalog-status"), `${pending.product.name} and its repository files were deleted.`, "success");
    } catch (error) {
      renderRecoveryActions();
      const removed = [...pending.deletedPaths];
      showStatus($("#catalog-status"), `Deletion is incomplete: ${error.message}${removed.length ? ` Files already deleted: ${removed.join(", ")}.` : ""} Resume to safely continue.`, "error");
    } finally {
      setWorkspaceBusy(false);
    }
  }

  function categorySlug(name) {
    return name.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "category";
  }

  function uniqueCategoryId(name, categories = state.categories) {
    const base = categorySlug(name);
    let id = base;
    let suffix = 2;
    while (categories.some(category => category.id === id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    return id;
  }

  function categoryJsonText(categories) {
    return `${JSON.stringify({schemaVersion: 1, updatedAt: new Date().toISOString(), categories}, null, 2)}\n`;
  }

  async function updateCategoryProducts(rename) {
    for (const product of rename.products) {
      const current = await readJsonFile(productJsonPath(product.id));
      if (!current) throw new Error(`Product ${product.sku} is missing from GitHub.`);
      if (current.text === product.text) {
        product.savedSha = current.sha;
        continue;
      }
      if (current.sha !== product.expectedSha) {
        throw new Error(`Product ${product.sku} changed in GitHub. Rename paused to avoid overwriting it.`);
      }
      const result = await writeTextFile(productJsonPath(product.id), product.text, {
        sha: current.sha,
        message: `Update category name for ${product.sku}`
      });
      product.savedSha = result && result.content ? result.content.sha : null;
      if (!product.savedSha) {
        const saved = await readJsonFile(productJsonPath(product.id));
        if (!saved) throw new Error(`Could not verify the saved product record for ${product.sku}.`);
        product.savedSha = saved.sha;
      }
    }
  }

  async function runCategoryRename(alreadyBusy = false) {
    const rename = state.pendingCategoryRename;
    if (!rename || (state.busy && !alreadyBusy)) return;
    if (!alreadyBusy) setWorkspaceBusy(true);
    try {
      await updateCategoryProducts(rename);
      const current = await readJsonFile(categoriesPath());
      if (!current) throw new Error("The categories file is missing in GitHub. Reload categories before continuing.");
      if (current.text !== rename.categoryText) {
        const remoteCategories = validateCategoryList(current.data);
        const remoteCategory = remoteCategories.find(category => category.id === rename.categoryId);
        if (!remoteCategory || remoteCategory.name !== rename.oldName) {
          throw new Error("The category changed in GitHub. Reload categories before continuing.");
        }
        if (remoteCategories.some(category => category.id !== rename.categoryId && category.name.toLocaleLowerCase() === rename.newName.toLocaleLowerCase())) {
          throw new Error(`Another category is already named ${rename.newName}.`);
        }
        const updatedCategories = remoteCategories.map(category => category.id === rename.categoryId
          ? {...category, name: rename.newName, updatedAt: rename.updatedAt}
          : category);
        rename.categories = updatedCategories;
        rename.categoryText = `${JSON.stringify({schemaVersion: 1, updatedAt: rename.updatedAt, categories: updatedCategories}, null, 2)}\n`;
        await writeTextFile(categoriesPath(), rename.categoryText, {
          sha: current.sha,
          message: `Rename category ${rename.oldName}`
        });
      }
      const productById = new Map(rename.products.map(item => [item.id, item]));
      state.products = state.products.map(product => {
        const update = productById.get(product.id);
        if (!update) return product;
        product.categoryName = rename.newName;
        product.updatedAt = rename.updatedAt;
        if (update.savedSha) product._sha = update.savedSha;
        return product;
      });
      state.categories = rename.categories;
      state.pendingCategoryRename = null;
      renderCategories();
      renderCatalog();
      renderCategorySelect();
      renderDashboard();
      renderRecoveryActions();
      resetCategoryForm();
      addActivity(`Renamed category ${rename.oldName} to ${rename.newName}.`);
      showStatus($("#category-status"), "Category and assigned product records were updated.", "success");
    } catch (error) {
      renderRecoveryActions();
      const updated = rename.products.filter(product => product.savedSha).map(product => product.id);
      const detail = updated.length ? ` Product files already updated: ${updated.join(", ")}.` : "";
      showStatus($("#category-status"), `Category rename is incomplete: ${error.message}.${detail} Resume to continue.`, "error");
    } finally {
      if (!alreadyBusy) setWorkspaceBusy(false);
    }
  }

  function resetCategoryForm() {
    $("#category-form").reset();
    state.editingCategoryId = null;
    $("#category-form-title").textContent = "Add a category";
    $("#save-category").textContent = "Add category";
    $("#cancel-category-edit").hidden = true;
  }

  function editCategory(category) {
    state.editingCategoryId = category.id;
    $("#category-name").value = category.name;
    $("#category-form-title").textContent = `Edit ${category.name}`;
    $("#save-category").textContent = "Save changes";
    $("#cancel-category-edit").hidden = false;
    $("#category-name").focus();
  }

  $("#cancel-category-edit").addEventListener("click", resetCategoryForm);

  $("#category-form").addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("#category-name").value.trim().replace(/\s+/g, " ");
    hideStatus($("#category-status"));
    if (state.busy) {
      showStatus($("#category-status"), "Wait for the current GitHub operation to finish.");
      return;
    }
    if (state.pendingUpload || state.pendingDelete || state.pendingCategoryRename) {
      showStatus($("#category-status"), "Resume the pending repository operation before changing categories.");
      return;
    }
    if (!state.config) {
      showStatus($("#category-status"), "Verify a repository in Repository Settings before saving categories.");
      return;
    }
    if (name.length < 2 || name.length > 80) {
      showStatus($("#category-status"), "Category name must be between 2 and 80 characters.");
      return;
    }
    if (state.categories.some(category => category.name.toLocaleLowerCase() === name.toLocaleLowerCase() && category.id !== state.editingCategoryId)) {
      showStatus($("#category-status"), "A category with this name already exists.");
      return;
    }
    setWorkspaceBusy(true);
    try {
      if (state.editingCategoryId) {
        const config = state.config;
        state.products = await loadProducts();
        if (state.config !== config) throw new Error("Repository settings changed. Category update was stopped.");
        const old = state.categories.find(category => category.id === state.editingCategoryId);
        if (!old) throw new Error("The selected category no longer exists.");
        if (old.name === name) return;
        const timestamp = new Date().toISOString();
        const nextCategories = state.categories.map(category => category.id === old.id
          ? {...category, name, updatedAt: timestamp}
          : category);
        const products = state.products.filter(product => product.categoryId === old.id).map(product => {
          const nextProduct = {...product, categoryName: name, updatedAt: timestamp};
          delete nextProduct._sha;
          return {
            id: product.id,
            sku: product.sku,
            expectedSha: product._sha,
            text: `${JSON.stringify(nextProduct, null, 2)}\n`
          };
        });
        state.pendingCategoryRename = {
          categoryId: old.id,
          oldName: old.name,
          newName: name,
          updatedAt: timestamp,
          categories: nextCategories,
          categoryText: `${JSON.stringify({schemaVersion: 1, updatedAt: timestamp, categories: nextCategories}, null, 2)}\n`,
          products
        };
        await runCategoryRename(true);
      } else {
        const file = await readJsonFile(categoriesPath());
        const remoteCategories = file ? validateCategoryList(file.data) : [];
        if (remoteCategories.some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
          throw new Error("A category with this name already exists in GitHub. Reload categories.");
        }
        const timestamp = new Date().toISOString();
        const category = {id: uniqueCategoryId(name, remoteCategories), name, createdAt: timestamp, updatedAt: timestamp};
        const text = categoryJsonText([...remoteCategories, category]);
        await writeTextFile(categoriesPath(), text, {sha: file ? file.sha : undefined, message: `Add category ${name}`});
        state.categories = [...remoteCategories, category];
        renderCategories();
        renderCategorySelect();
        renderDashboard();
        resetCategoryForm();
        addActivity(`Added category ${name}.`);
        showStatus($("#category-status"), "Category saved to GitHub.", "success");
      }
    } catch (error) {
      showStatus($("#category-status"), error.message || "Could not save this category.");
    } finally {
      setWorkspaceBusy(false);
    }
  });

  async function deleteCategory(category) {
    if (state.busy) return;
    if (state.pendingUpload || state.pendingDelete || state.pendingCategoryRename) {
      showStatus($("#category-status"), "Resume the pending repository operation before changing categories.");
      return;
    }
    const config = state.config;
    if (!config) return;
    setWorkspaceBusy(true);
    try {
      const currentProducts = await loadProducts();
      if (state.config !== config) throw new Error("Repository settings changed. Category deletion was stopped.");
      state.products = currentProducts;
      const count = currentProducts.filter(product => product.categoryId === category.id).length;
      if (count) {
        showStatus($("#category-status"), `Reassign ${count} product${count === 1 ? "" : "s"} before deleting ${category.name}.`);
        return;
      }
      if (!window.confirm(`Delete category "${category.name}" from this repository?`)) return;
      const file = await readJsonFile(categoriesPath());
      if (state.config !== config) throw new Error("Repository settings changed. Category deletion was stopped.");
      if (!file) throw new Error("The categories file no longer exists in GitHub.");
      const categories = validateCategoryList(file.data);
      const currentCategory = categories.find(item => item.id === category.id);
      if (!currentCategory || currentCategory.name !== category.name) {
        throw new Error("This category changed in GitHub. Reload categories before deleting it.");
      }
      const next = categories.filter(item => item.id !== category.id);
      if (next.length === categories.length) throw new Error("The category no longer exists in GitHub.");
      const text = categoryJsonText(next);
      await writeTextFile(categoriesPath(), text, {sha: file.sha, message: `Delete category ${category.name}`});
      state.categories = next;
      renderCategories();
      renderCategorySelect();
      renderDashboard();
      addActivity(`Deleted category ${category.name}.`);
      showStatus($("#category-status"), "Category deleted.", "success");
    } catch (error) {
      showStatus($("#category-status"), error.message || "Could not delete this category.");
    } finally {
      setWorkspaceBusy(false);
    }
  }

  document.addEventListener("github:connected", () => {
    if (!github.getConfiguration()) showPage("overview");
  });

  $("#page-overview [data-go-page='catalog']").addEventListener("click", () => showPage("catalog"));
})();
