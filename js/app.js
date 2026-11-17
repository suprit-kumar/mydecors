"use strict";

// Update these two values when connecting a different creator account.
const socialConfig = {
  instagramUrl: "https://www.instagram.com/maisonmora.home/",
  instagramDmUrl: "https://ig.me/m/maisonmora.home"
};

// Products are loaded from the public GitHub catalog written by the GitHub Workspace page.
const catalogSource = {
  owner: "suprit-kumar",
  repo: "mydecors",
  branch: "main",
  root: "product-catalog"
};
const rawBase = `https://raw.githubusercontent.com/${catalogSource.owner}/${catalogSource.repo}/${catalogSource.branch}`;
const encodePath = path => path.split("/").map(encodeURIComponent).join("/");
const rawUrl = path => `${rawBase}/${encodePath(path)}`;
let products = [];
let catalogStatus = "loading";
const reviews = [
  {quote:"You can feel the care in every little detail. My vase has become my favourite thing in the room.",name:"PRIYA S.",place:"Mumbai",image:"https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80"},
  {quote:"The pieces have such a lovely, soulful quality. They make our home feel a little more like us.",name:"ANANYA M.",place:"Bengaluru",image:"https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80"},
  {quote:"Beautifully made and even more special in person. It's the kind of piece you want to keep forever.",name:"MEERA K.",place:"New Delhi",image:"https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=100&q=80"}
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat("en-IN", {style:"currency",currency:"INR",maximumFractionDigits:0}).format(value);
const productById = id => products.find(product => product.id === String(id));
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const fetchJson = async path => {
  const response = await fetch(rawUrl(path), {cache: "no-cache"});
  if (!response.ok) {
    const error = new Error(`Could not load ${path} (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response.json();
};
function toStoreProduct(record) {
  if (!record || typeof record.id !== "string" || typeof record.name !== "string" || !record.price || !Number.isFinite(record.price.amount)) return null;
  const images = (Array.isArray(record.images) ? record.images : [])
    .filter(image => image && typeof image.path === "string")
    .sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true) || (a.sortOrder || 0) - (b.sortOrder || 0))
    .map(image => rawUrl(image.path));
  if (!images.length) return null;
  return {
    id: record.id,
    name: record.name,
    price: record.price.amount,
    category: record.categoryName || "Uncategorised",
    description: record.description || "",
    dimensions: record.dimensions || "",
    image: images[0],
    alternate: images[1] || images[0],
    gallery: images,
    createdAt: Date.parse(record.createdAt) || 0
  };
}
async function loadCatalog() {
  try {
    const index = await fetchJson(`${catalogSource.root}/catalog.json`);
    const ids = Array.isArray(index.products) ? index.products.map(entry => entry && entry.id).filter(id => typeof id === "string") : [];
    const records = await Promise.all(ids.map(id => fetchJson(`${catalogSource.root}/products/${encodeURIComponent(id)}/product.json`).catch(error => {
      console.warn("Skipping product:", error.message);
      return null;
    })));
    products = records.map(toStoreProduct).filter(Boolean);
    catalogStatus = "ready";
  } catch (error) {
    console.warn("Could not load product catalog:", error.message);
    products = [];
    catalogStatus = error.status === 404 ? "ready" : "error";
  }
}
const storage = {
  get(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch (error) { console.warn("Could not read local storage:", error); return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { console.warn("Could not save local storage:", error); showToast("Your browser could not save this change."); }
  }
};
let wishlist = storage.get("aarna-wishlist", []);
let cart = storage.get("aarna-cart", []);
if (!Array.isArray(wishlist)) wishlist = [];
if (!Array.isArray(cart)) cart = [];
function pruneSavedItems() {
  wishlist = wishlist.filter(id => productById(id));
  cart = cart.filter(item => item && productById(item.id) && Number.isInteger(item.quantity) && item.quantity > 0);
  storage.set("aarna-wishlist", wishlist);
  storage.set("aarna-cart", cart);
}
let modalProduct = null;
let modalQuantity = 1;
let drawerMode = "cart";
let reviewIndex = 0;
let toastTimer;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

$$("[data-instagram]").forEach(link => { link.href = socialConfig.instagramUrl; });
$$("[data-instagram-contact]").forEach(link => { link.href = socialConfig.instagramDmUrl; });
$(".instagram-handle").textContent = `@${new URL(socialConfig.instagramUrl).pathname.split("/").filter(Boolean)[0]}`;

function showToast(message) {
  const toast = $(".toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}
function copyInstagramMessage(message) {
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    showToast("Instagram opened. Copy the details and image links; attach photos separately.");
    return;
  }
  navigator.clipboard.writeText(message).then(
    () => showToast("Order message copied. Paste it into Instagram; attach photos separately."),
    error => {
      console.warn("Could not copy Instagram message:", error);
      showToast("Instagram opened. Copy the details and image links; attach photos separately.");
    }
  );
}
function productInquiryMessage(product, quantity = 1) {
  return `Hello, I would like to buy this product from MAISON MORA:\n\nProduct Name: ${product.name}\nPrice: ${money(product.price)}\nQuantity: ${quantity}\nProduct Image: ${product.image}\n\nPlease confirm availability, delivery, and payment details.`;
}
function cartInquiryMessage() {
  const lines = cart.map(item => {
    const product = productById(item.id);
    return `${item.quantity} x ${product.name} — ${money(product.price * item.quantity)}\nProduct Image: ${product.image}`;
  });
  const total = cart.reduce((sum, item) => sum + productById(item.id).price * item.quantity, 0);
  return `Hello, I would like to order these products from MAISON MORA:\n\n${lines.join("\n\n")}\n\nSubtotal: ${money(total)}\n\nPlease confirm availability, delivery, and payment details.`;
}
function productCard(product) {
  const saved = wishlist.includes(product.id);
  return `<article class="product-card">
    <div class="product-image-wrap">
      <img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy">
      <img class="product-image-alt" src="${esc(product.alternate)}" alt="" loading="lazy">
      <button class="heart-button ${saved ? "saved" : ""}" data-wishlist="${esc(product.id)}" aria-label="${saved ? "Remove " + esc(product.name) + " from wishlist" : "Add " + esc(product.name) + " to wishlist"}" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>
    </div>
    <div class="product-meta"><span class="product-category">${esc(product.category)}</span><div class="product-title-row"><h3>${esc(product.name)}</h3><strong>${money(product.price)}</strong></div><div class="product-actions"><button data-quick-view="${esc(product.id)}">VIEW DETAILS ↗</button><a href="${socialConfig.instagramDmUrl}" data-instagram-product="${esc(product.id)}" target="_blank" rel="noopener noreferrer">ASK ON INSTAGRAM ↗</a></div></div>
  </article>`;
}
function renderProducts() {
  const category = $("#category-filter").value;
  const price = $("#price-filter").value;
  const query = $("#product-search").value.trim().toLowerCase();
  const sort = $("#sort-filter").value;
  const filtered = products.filter(product => {
    const matchesPrice = price === "all" || (price === "1000" && product.price < 1000) || (price === "2000" && product.price >= 1000 && product.price <= 2000) || (price === "above" && product.price > 2000);
    return (category === "All" || product.category === category) && matchesPrice && `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query);
  });
  filtered.sort((a,b) => sort === "low" ? a.price - b.price : sort === "high" ? b.price - a.price : b.createdAt - a.createdAt);
  $("#product-grid").innerHTML = filtered.map(productCard).join("");
  $("#results-count").textContent = `${filtered.length} ${filtered.length === 1 ? "OBJECT" : "OBJECTS"}`;
  $("#empty-state").hidden = filtered.length !== 0;
}
function renderBestsellers() {
  $("#bestseller-slider").innerHTML = [...products].sort((a,b) => b.createdAt - a.createdAt).slice(0,8).map(productCard).join("");
}
function updateCounts() {
  const total = cart.reduce((sum,item) => sum + item.quantity,0);
  $(".cart-count").textContent = total;
  $(".cart-count").hidden = !total;
  $(".wishlist-count").textContent = wishlist.length;
  $(".wishlist-count").hidden = !wishlist.length;
}
function animateAction(selector) {
  const element = $(selector);
  element.classList.remove("action-pop");
  void element.offsetWidth;
  element.classList.add("action-pop");
}
function toggleWishlist(id) {
  const product = productById(id);
  if (!product) return;
  const saved = wishlist.includes(product.id);
  wishlist = saved ? wishlist.filter(item => item !== product.id) : [...wishlist,product.id];
  storage.set("aarna-wishlist",wishlist);
  updateCounts(); renderProducts(); renderBestsellers();
  animateAction(".wishlist-trigger");
  if ($("#drawer").open && drawerMode === "wishlist") renderDrawer();
  showToast(saved ? "Removed from your wishlist." : "Added to your wishlist ♡");
}
function addToCart(id, quantity) {
  const product = productById(id);
  if (!product) return;
  const existing = cart.find(item => item.id === product.id);
  if (existing) existing.quantity += quantity;
  else cart.push({id:product.id,quantity});
  storage.set("aarna-cart",cart);
  updateCounts();
  animateAction(".cart-trigger");
  showToast(`${product.name} added to your bag.`);
}
function openQuickView(id) {
  modalProduct = productById(id);
  if (!modalProduct) return;
  modalQuantity = 1;
  $("#modal-body").innerHTML = `<div class="modal-gallery"><img class="modal-main-image" src="${esc(modalProduct.image)}" alt="${esc(modalProduct.name)}">${modalProduct.gallery.length > 1 ? `<div class="modal-thumbs">${modalProduct.gallery.map((src, index) => `<button class="${index === 0 ? "selected" : ""}" data-image="${esc(src)}" aria-label="View image ${index + 1}"><img src="${esc(src)}" alt=""></button>`).join("")}</div>` : ""}</div>
    <div class="modal-info"><span class="eyebrow">${esc(modalProduct.category)} / HANDMADE WITH LOVE</span><h2 id="modal-title">${esc(modalProduct.name)}</h2><p class="modal-price">${money(modalProduct.price)}</p><p class="modal-description">${esc(modalProduct.description)}</p>${modalProduct.dimensions ? `<p class="modal-description">Dimensions: ${esc(modalProduct.dimensions)}</p>` : ""}<div class="quantity-row"><span>Quantity</span><div class="quantity-control"><button data-quantity="-1" aria-label="Decrease quantity">−</button><span id="modal-quantity">1</span><button data-quantity="1" aria-label="Increase quantity">+</button></div></div><div class="modal-actions"><a class="button button-dark" href="${socialConfig.instagramDmUrl}" data-instagram-product="${esc(modalProduct.id)}" data-instagram-modal-product target="_blank" rel="noopener noreferrer">ASK ABOUT THIS ON INSTAGRAM <span>↗</span></a><button class="button button-outline" id="add-to-cart">ADD TO BAG <span>↗</span></button></div><p class="modal-note">Instagram opens a direct message. Paste the copied item details and image link; attach the image separately if needed.<br>Availability is confirmed in conversation.</p></div>`;
  $("#quick-view").showModal();
}
function renderDrawer() {
  const isCart = drawerMode === "cart";
  $("#drawer-title").textContent = isCart ? "Your bag." : "Your wishlist.";
  const entries = (isCart ? cart : wishlist.map(id => ({id,quantity:1}))).filter(item => productById(item.id));
  const content = $("#drawer-content");
  if (!entries.length) {
    content.innerHTML = `<p class="drawer-empty">Your ${isCart ? "bag" : "wishlist"} is waiting for something lovely.</p><a class="under-link drawer-shop" href="#collection">EXPLORE THE COLLECTION ↗</a>`;
    return;
  }
  content.innerHTML = entries.map(item => {
    const product = productById(item.id);
    return `<article class="drawer-item"><img src="${esc(product.image)}" alt="" loading="lazy"><div><h3>${esc(product.name)}</h3><p>${money(product.price)}${isCart ? ` · Qty ${item.quantity}` : ""}</p></div><button data-remove="${esc(product.id)}">REMOVE ×</button></article>`;
  }).join("") + (isCart ? `<div class="drawer-total"><span>Subtotal</span><span>${money(cart.reduce((sum,item) => sum + productById(item.id).price * item.quantity,0))}</span></div><a class="button button-dark" href="${socialConfig.instagramDmUrl}" data-instagram-cart target="_blank" rel="noopener noreferrer">CONTACT US ON INSTAGRAM <span>↗</span></a><p class="drawer-disclaimer">Instagram opens a direct message. Paste the copied order details and image links; attach images separately if needed.</p>` : `<p class="drawer-disclaimer">Your favourite pieces are saved in this browser.</p>`);
}
function openDrawer(mode) {
  drawerMode = mode;
  renderDrawer();
  $("#drawer").showModal();
}
function renderReview() {
  const review = reviews[reviewIndex];
  $("#testimonial-content").innerHTML = `<div class="review-stars" aria-label="5 out of 5 stars">★★★★★</div><p class="review-quote">${review.quote}</p><img class="review-avatar" src="${review.image}" alt="" loading="lazy"><div class="review-author">${review.name}<span>${review.place}</span></div>`;
  $("#review-position").textContent = `${String(reviewIndex + 1).padStart(2,"0")} / ${String(reviews.length).padStart(2,"0")}`;
}

function populateCategories() {
  const select = $("#category-filter");
  const current = select.value;
  const names = [...new Set(products.map(product => product.category))].sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="All">All objects</option>${names.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join("")}`;
  select.value = names.includes(current) ? current : "All";
}
function renderEmptyMessage() {
  const message = catalogStatus === "loading" ? "Loading our latest pieces…"
    : catalogStatus === "error" ? "We couldn't load the collection right now. Please try again shortly."
    : products.length ? "No pieces found. Try a different search or filter." : "New pieces are on their way. Please check back soon.";
  $("#empty-state").textContent = message;
}
function renderAll() {
  populateCategories(); renderProducts(); renderBestsellers(); updateCounts(); renderEmptyMessage();
}

renderReview(); renderAll();
loadCatalog().then(() => { pruneSavedItems(); renderAll(); });

document.addEventListener("click", event => {
  const wishlistButton = event.target.closest("[data-wishlist]");
  const quickButton = event.target.closest("[data-quick-view]");
  const productInquiryLink = event.target.closest("[data-instagram-product]");
  const cartInquiryLink = event.target.closest("[data-instagram-cart]");
  if (wishlistButton) toggleWishlist(wishlistButton.dataset.wishlist);
  if (quickButton) openQuickView(quickButton.dataset.quickView);
  if (productInquiryLink) {
    const product = productById(productInquiryLink.dataset.instagramProduct);
    if (product) copyInstagramMessage(productInquiryMessage(product, productInquiryLink.hasAttribute("data-instagram-modal-product") ? modalQuantity : 1));
  }
  if (cartInquiryLink && cart.length) copyInstagramMessage(cartInquiryMessage());
});
["category-filter","price-filter","sort-filter"].forEach(id => $(`#${id}`).addEventListener("change",renderProducts));
$("#product-search").addEventListener("input",renderProducts);
$(".reset-filters").addEventListener("click",() => {
  $("#category-filter").value = "All"; $("#price-filter").value = "all"; $("#sort-filter").value = "newest"; $("#product-search").value = ""; renderProducts();
});
$$("[data-category]").forEach(link => link.addEventListener("click",() => {
  $("#category-filter").value = link.dataset.category; $("#price-filter").value = "all"; $("#product-search").value = ""; renderProducts();
}));
$(".search-trigger").addEventListener("click",() => { $("#collection").scrollIntoView({behavior:reducedMotion.matches ? "auto" : "smooth"}); $("#product-search").focus({preventScroll:true}); });
$(".wishlist-trigger").addEventListener("click",() => openDrawer("wishlist"));
$(".cart-trigger").addEventListener("click",() => openDrawer("cart"));
$(".modal-close").addEventListener("click",() => $("#quick-view").close());
$(".drawer-close").addEventListener("click",() => $("#drawer").close());
$$("dialog").forEach(dialog => dialog.addEventListener("click",event => { if (event.target === dialog) dialog.close(); }));
$("#modal-body").addEventListener("click",event => {
  const thumb = event.target.closest("[data-image]");
  const quantityButton = event.target.closest("[data-quantity]");
  if (thumb) { $(".modal-main-image").src = thumb.dataset.image; $$(".modal-thumbs button").forEach(button => button.classList.toggle("selected",button === thumb)); }
  if (quantityButton) { modalQuantity = Math.max(1,Math.min(99,modalQuantity + Number(quantityButton.dataset.quantity))); $("#modal-quantity").textContent = modalQuantity; }
  if (event.target.closest("#add-to-cart")) { addToCart(modalProduct.id,modalQuantity); $("#quick-view").close(); }
});
$("#drawer-content").addEventListener("click",event => {
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    const id = remove.dataset.remove;
    if (drawerMode === "cart") { cart = cart.filter(item => item.id !== id); storage.set("aarna-cart",cart); updateCounts(); renderDrawer(); showToast("Removed from your bag."); }
    else toggleWishlist(id);
  }
  if (event.target.closest(".drawer-shop")) $("#drawer").close();
});
const slider = $("#bestseller-slider");
$$("[data-slide]").forEach(button => button.addEventListener("click",() => {
  slider.scrollBy({left:(button.dataset.slide === "next" ? 1 : -1) * (slider.firstElementChild.offsetWidth + 20),behavior:reducedMotion.matches ? "auto" : "smooth"});
}));
let dragStart = null;
let dragScroll = 0;
let dragged = false;
slider.addEventListener("pointerdown",event => {
  if (event.pointerType !== "mouse" || event.target.closest("button")) return;
  dragStart = event.clientX; dragScroll = slider.scrollLeft; dragged = false; slider.classList.add("dragging");
});
window.addEventListener("pointermove",event => {
  if (dragStart === null) return;
  const distance = event.clientX - dragStart;
  if (Math.abs(distance) > 5) dragged = true;
  slider.scrollLeft = dragScroll - distance;
});
window.addEventListener("pointerup",() => { dragStart = null; slider.classList.remove("dragging"); });
slider.addEventListener("click",event => { if (dragged) { event.preventDefault(); dragged = false; } },true);
$("#review-prev").addEventListener("click",() => { reviewIndex = (reviewIndex + reviews.length - 1) % reviews.length; renderReview(); });
$("#review-next").addEventListener("click",() => { reviewIndex = (reviewIndex + 1) % reviews.length; renderReview(); });
setInterval(() => {
  if (!reducedMotion.matches && !document.hidden && !$(".testimonial-stage").matches(":hover") && !$(".testimonial-stage").contains(document.activeElement)) {
    reviewIndex = (reviewIndex + 1) % reviews.length; renderReview();
  }
},6000);
const menuToggle = $(".menu-toggle");
menuToggle.addEventListener("click",() => {
  const nav = $("#mobile-nav"); nav.hidden = !nav.hidden;
  menuToggle.setAttribute("aria-expanded",String(!nav.hidden));
  menuToggle.setAttribute("aria-label",nav.hidden ? "Open menu" : "Close menu");
});
$$(".mobile-nav a").forEach(link => link.addEventListener("click",() => { $("#mobile-nav").hidden = true; menuToggle.setAttribute("aria-expanded","false"); menuToggle.setAttribute("aria-label","Open menu"); }));
function applyTheme(dark) {
  document.body.classList.toggle("dark",dark);
  $(".theme-toggle").setAttribute("aria-label",dark ? "Switch to light mode" : "Switch to dark mode");
}
applyTheme(storage.get("aarna-dark",false) === true);
$(".theme-toggle").addEventListener("click",() => { const dark = !document.body.classList.contains("dark"); applyTheme(dark); storage.set("aarna-dark",dark); });
$(".back-to-top").addEventListener("click",() => window.scrollTo({top:0,behavior:reducedMotion.matches ? "auto" : "smooth"}));
let scrollQueued = false;
function updateScroll() {
  const distance = document.documentElement.scrollHeight - window.innerHeight;
  $(".scroll-progress").style.transform = `scaleX(${distance > 0 ? window.scrollY / distance : 0})`;
  $("#header").classList.toggle("scrolled",window.scrollY > 20);
  $(".back-to-top").classList.toggle("visible",window.scrollY > 600);
  if (!reducedMotion.matches && window.scrollY < window.innerHeight) $(".hero-image").style.transform = `translateY(${window.scrollY * .13}px)`;
  scrollQueued = false;
}
window.addEventListener("scroll",() => { if (!scrollQueued) { requestAnimationFrame(updateScroll); scrollQueued = true; } },{passive:true});
updateScroll();
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add("in-view"); observer.unobserve(entry.target); }
  }),{threshold:.08});
  $$(".reveal").forEach(element => observer.observe(element));
} else $$(".reveal").forEach(element => element.classList.add("in-view"));
window.addEventListener("load",() => $(".page-loader").classList.add("is-loaded"));
setTimeout(() => $(".page-loader").classList.add("is-loaded"),2500);
