"use strict";

// Update these two values when connecting a different creator account.
const socialConfig = {
  instagramUrl: "https://www.instagram.com/maisonmora.home/",
  instagramDmUrl: "https://ig.me/m/maisonmora.home"
};

// Sample data is deliberately separate from rendering so it can later come from an API.
const images = {
  vase: "https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=800&q=80",
  pottery: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=800&q=80",
  pot: "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=800&q=80",
  candle: "https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=800&q=80",
  interior: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&q=80",
  ceramics: "https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=800&q=80",
  table: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80",
  room: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80"
};
const products = [
  {id:24,name:"The Sora Vase",price:1890,category:"Vases",rating:4.9,description:"A softly sculpted statement vase, inspired by the quiet curves of nature.",image:images.vase,alternate:images.ceramics,badge:"BESTSELLER",popular:99},
  {id:23,name:"The Earth Pot",price:1290,category:"Pots",rating:4.8,description:"An earthy little home for your favourite greenery, shaped with character.",image:images.pot,alternate:images.pottery,badge:"MOST LOVED",popular:96},
  {id:22,name:"The Glow Holder",price:890,category:"Candle Holders",rating:4.9,description:"A warm, handmade accent for slow evenings and candlelit corners.",image:images.candle,alternate:images.ceramics,badge:"BESTSELLER",popular:95},
  {id:21,name:"The Form Study",price:2490,category:"Sculptures",rating:5.0,description:"An expressive little sculpture that brings a touch of art to the everyday.",image:images.pottery,alternate:images.vase,badge:"LIMITED",popular:92},
  {id:20,name:"Mira Bud Vase",price:990,category:"Vases",rating:4.8,description:"A petite vessel for a single stem, with a quietly beautiful silhouette.",image:images.ceramics,alternate:images.vase,popular:91},
  {id:19,name:"Terra Planter",price:1590,category:"Pots",rating:4.7,description:"A natural, tactile planter made to bring a little life indoors.",image:images.pot,alternate:images.pottery,popular:87},
  {id:18,name:"Moonlit Wall Disc",price:1790,category:"Wall Decor",rating:4.8,description:"An organic wall accent that adds depth and warmth to your favourite corner.",image:images.interior,alternate:images.room,badge:"NEW",popular:85},
  {id:17,name:"Ritual Candle Cup",price:790,category:"Candle Holders",rating:4.7,description:"A simple clay candle cup made for moments of pause.",image:images.candle,alternate:images.pottery,popular:82},
  {id:16,name:"The Gathering Bowl",price:1490,category:"Table Decor",rating:4.9,description:"A sculptural table accent for the objects and moments you love.",image:images.pottery,alternate:images.ceramics,popular:90},
  {id:15,name:"Stillness Sculpture",price:2790,category:"Sculptures",rating:4.9,description:"An abstract form with gentle lines and a beautifully tactile finish.",image:images.ceramics,alternate:images.pottery,popular:88},
  {id:14,name:"The Arch Vase",price:2190,category:"Vases",rating:4.8,description:"A graceful silhouette to make flowers and spaces feel extra special.",image:images.vase,alternate:images.ceramics,popular:86},
  {id:13,name:"Little Earth Pot",price:690,category:"Pots",rating:4.7,description:"A little clay pot with a lot of personality.",image:images.pot,alternate:images.pottery,popular:80},
  {id:12,name:"Sol Wall Hanging",price:1990,category:"Wall Decor",rating:4.8,description:"A sun-inspired handmade detail for a considered wall.",image:images.table,alternate:images.interior,popular:78},
  {id:11,name:"The Dusk Duo",price:1690,category:"Candle Holders",rating:4.9,description:"A pair of candle holders for a softer kind of evening.",image:images.candle,alternate:images.ceramics,popular:84},
  {id:10,name:"Clay Nest Tray",price:1190,category:"Table Decor",rating:4.8,description:"A small catch-all for the things you reach for every day.",image:images.pottery,alternate:images.table,popular:77},
  {id:9,name:"The Muse Object",price:2290,category:"Sculptures",rating:4.8,description:"A conversation-starting shape, made slowly and finished by hand.",image:images.ceramics,alternate:images.vase,popular:79},
  {id:8,name:"Petal Vase",price:1390,category:"Vases",rating:4.7,description:"A delicate form inspired by petals and the beauty of new beginnings.",image:images.vase,alternate:images.pottery,popular:75},
  {id:7,name:"Pebble Incense Rest",price:590,category:"Accessories",rating:4.8,description:"A little ritual object for a calmer corner of your home.",image:images.pottery,alternate:images.ceramics,popular:83},
  {id:6,name:"The Everyday Dish",price:790,category:"Table Decor",rating:4.7,description:"A hand-shaped dish for treasured trinkets and everyday rituals.",image:images.ceramics,alternate:images.pottery,popular:73},
  {id:5,name:"Organic Wall Accent",price:2490,category:"Wall Decor",rating:4.9,description:"A textural, earth-inspired piece for walls with a story to tell.",image:images.interior,alternate:images.table,popular:74},
  {id:4,name:"The Keepsake Box",price:1590,category:"Accessories",rating:4.8,description:"A thoughtful home for the little things that mean the most.",image:images.pottery,alternate:images.ceramics,popular:72},
  {id:3,name:"Your Story Vase",price:2990,category:"Custom Designs",rating:5.0,description:"A sample custom vase concept. Get in touch to discuss your own design.",image:images.vase,alternate:images.ceramics,badge:"CUSTOM",popular:76},
  {id:2,name:"The Personal Piece",price:3490,category:"Custom Designs",rating:4.9,description:"A sample bespoke clay object, imagined around your space and story.",image:images.pottery,alternate:images.vase,badge:"CUSTOM",popular:70},
  {id:1,name:"Soft Light Holder",price:1090,category:"Candle Holders",rating:4.7,description:"A gentle glow and an organic form for your most peaceful evenings.",image:images.candle,alternate:images.pottery,popular:71}
];
const reviews = [
  {quote:"You can feel the care in every little detail. My vase has become my favourite thing in the room.",name:"PRIYA S.",place:"Mumbai",image:"https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80"},
  {quote:"The pieces have such a lovely, soulful quality. They make our home feel a little more like us.",name:"ANANYA M.",place:"Bengaluru",image:"https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&q=80"},
  {quote:"Beautifully made and even more special in person. It's the kind of piece you want to keep forever.",name:"MEERA K.",place:"New Delhi",image:"https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=100&q=80"}
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat("en-IN", {style:"currency",currency:"INR",maximumFractionDigits:0}).format(value);
const productById = id => products.find(product => product.id === Number(id));
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
wishlist = wishlist.filter(id => productById(id));
cart = cart.filter(item => item && productById(item.id) && Number.isInteger(item.quantity) && item.quantity > 0);
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
  return `Hello, I would like to buy this product from Maisonmora.Home:\n\nProduct Name: ${product.name}\nPrice: ${money(product.price)}\nQuantity: ${quantity}\nProduct Image: ${product.image}\n\nPlease confirm availability, delivery, and payment details.`;
}
function cartInquiryMessage() {
  const lines = cart.map(item => {
    const product = productById(item.id);
    return `${item.quantity} x ${product.name} — ${money(product.price * item.quantity)}\nProduct Image: ${product.image}`;
  });
  const total = cart.reduce((sum, item) => sum + productById(item.id).price * item.quantity, 0);
  return `Hello, I would like to order these products from Maisonmora.Home:\n\n${lines.join("\n\n")}\n\nSubtotal: ${money(total)}\n\nPlease confirm availability, delivery, and payment details.`;
}
function productCard(product) {
  const saved = wishlist.includes(product.id);
  return `<article class="product-card">
    <div class="product-image-wrap">
      <img src="${product.image}" alt="${product.name}" loading="lazy">
      <img class="product-image-alt" src="${product.alternate}" alt="" loading="lazy">
      ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ""}
      <button class="heart-button ${saved ? "saved" : ""}" data-wishlist="${product.id}" aria-label="${saved ? "Remove " + product.name + " from wishlist" : "Add " + product.name + " to wishlist"}" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>
    </div>
    <div class="product-meta"><span class="product-category">${product.category}</span><div class="product-title-row"><h3>${product.name}</h3><strong>${money(product.price)}</strong></div><div class="rating" aria-label="Rated ${product.rating} out of 5">★★★★★ <span>${product.rating.toFixed(1)}</span></div><div class="product-actions"><button data-quick-view="${product.id}">VIEW DETAILS ↗</button><a href="${socialConfig.instagramDmUrl}" data-instagram-product="${product.id}" target="_blank" rel="noopener noreferrer">ASK ON INSTAGRAM ↗</a></div></div>
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
  filtered.sort((a,b) => sort === "low" ? a.price - b.price : sort === "high" ? b.price - a.price : sort === "popular" ? b.popular - a.popular : b.id - a.id);
  $("#product-grid").innerHTML = filtered.map(productCard).join("");
  $("#results-count").textContent = `${filtered.length} ${filtered.length === 1 ? "OBJECT" : "OBJECTS"}`;
  $("#empty-state").hidden = filtered.length !== 0;
}
function renderBestsellers() {
  $("#bestseller-slider").innerHTML = [...products].sort((a,b) => b.popular - a.popular).slice(0,8).map(productCard).join("");
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
  $("#modal-body").innerHTML = `<div class="modal-gallery"><img class="modal-main-image" src="${modalProduct.image}" alt="${modalProduct.name}"><div class="modal-thumbs"><button class="selected" data-image="${modalProduct.image}" aria-label="View first image"><img src="${modalProduct.image}" alt=""></button><button data-image="${modalProduct.alternate}" aria-label="View second image"><img src="${modalProduct.alternate}" alt=""></button></div></div>
    <div class="modal-info"><span class="eyebrow">${modalProduct.category} / HANDMADE WITH LOVE</span><h2 id="modal-title">${modalProduct.name}</h2><div class="rating">★★★★★ <span>${modalProduct.rating.toFixed(1)} / 5</span></div><p class="modal-price">${money(modalProduct.price)}</p><p class="modal-description">${modalProduct.description}</p><div class="quantity-row"><span>Quantity</span><div class="quantity-control"><button data-quantity="-1" aria-label="Decrease quantity">−</button><span id="modal-quantity">1</span><button data-quantity="1" aria-label="Increase quantity">+</button></div></div><div class="modal-actions"><a class="button button-dark" href="${socialConfig.instagramDmUrl}" data-instagram-product="${modalProduct.id}" data-instagram-modal-product target="_blank" rel="noopener noreferrer">ASK ABOUT THIS ON INSTAGRAM <span>↗</span></a><button class="button button-outline" id="add-to-cart">ADD TO BAG <span>↗</span></button></div><p class="modal-note">Instagram opens a direct message. Paste the copied item details and image link; attach the image separately if needed.<br>Sample products and imagery; availability is confirmed in conversation.</p></div>`;
  $("#quick-view").showModal();
}
function renderDrawer() {
  const isCart = drawerMode === "cart";
  $("#drawer-title").textContent = isCart ? "Your bag." : "Your wishlist.";
  const entries = isCart ? cart : wishlist.map(id => ({id,quantity:1}));
  const content = $("#drawer-content");
  if (!entries.length) {
    content.innerHTML = `<p class="drawer-empty">Your ${isCart ? "bag" : "wishlist"} is waiting for something lovely.</p><a class="under-link drawer-shop" href="#collection">EXPLORE THE COLLECTION ↗</a>`;
    return;
  }
  content.innerHTML = entries.map(item => {
    const product = productById(item.id);
    return `<article class="drawer-item"><img src="${product.image}" alt="" loading="lazy"><div><h3>${product.name}</h3><p>${money(product.price)}${isCart ? ` · Qty ${item.quantity}` : ""}</p></div><button data-remove="${product.id}">REMOVE ×</button></article>`;
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

renderProducts(); renderBestsellers(); updateCounts(); renderReview();

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
    const id = Number(remove.dataset.remove);
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
