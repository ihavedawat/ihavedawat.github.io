// ===== Starfield: randomize positions AND anchor cluster to the form =====
// Two responsibilities:
//   1. Generate a fresh field of stars on every page load (box-shadow trick).
//   2. Measure the form's actual center on the page and anchor both star
//      layers + the radial mask to it, so the cluster sits BEHIND the form
//      no matter the viewport size. Re-runs on resize.
//
// Shared across every page that has .starfield + a .form-wrap.
(function () {
  // ----- Random star generator -----
  function makeStars(count, colors, spread, maxRadius) {
    var shadows = [];
    for (var i = 0; i < count; i++) {
      // Sample radius with a gentle centre bias so stars cluster around
      // the form but still scatter outward. ^1.15 ≈ wide soft halo.
      var r     = maxRadius * Math.pow(Math.random(), 1.15);
      var theta = Math.random() * Math.PI * 2;
      var x     = Math.round(Math.cos(theta) * r);
      var y     = Math.round(Math.sin(theta) * r);
      var color = colors[Math.floor(Math.random() * colors.length)];
      shadows.push(x + "px " + y + "px " + spread + " " + color);
    }
    return shadows.join(", ");
  }

  function paintStars() {
    var maxR  = Math.max(window.innerWidth, window.innerHeight, 1000);
    var small = document.querySelector(".s-small");
    var big   = document.querySelector(".s-big");
    if (small) {
      small.style.boxShadow = makeStars(140, ["#fff"], "0", maxR * 0.9);
    }
    if (big) {
      big.style.boxShadow = makeStars(55,
        ["#fff", "#fff", "#fff", "#ffd166", "#ffd166", "#ff3b6b", "#4cc9f0"],
        "1px", maxR * 1.0);
    }
  }

  // ----- Anchor star cluster to the form's actual centre -----
  // The .starfield is position:absolute at top:0, so element offsetTop
  // values (relative to document) line up with positions inside the
  // starfield's coordinate system. We override the CSS top:60% on the
  // .star-layer children and the mask center on .starfield itself.
  function anchorToForm() {
    var starfield = document.querySelector(".starfield");
    // Prefer a VISIBLE .form-wrap (admin.html has two, one is hidden).
    var form = null;
    var wraps = document.querySelectorAll(".form-wrap");
    for (var i = 0; i < wraps.length; i++) {
      if (wraps[i].offsetParent !== null) { form = wraps[i]; break; }
    }
    if (!starfield || !form) return;

    var rect    = form.getBoundingClientRect();
    var centerY = rect.top + window.scrollY + rect.height / 2;
    var centerX = rect.left + rect.width / 2;

    // Anchor the star layers exactly on the form centre.
    var layers = document.querySelectorAll(".star-layer");
    for (var j = 0; j < layers.length; j++) {
      layers[j].style.top  = centerY + "px";
      layers[j].style.left = centerX + "px";
    }

    // Move the radial mask centre to the same spot (in px).
    var mask = "radial-gradient(ellipse 65% 60% at " +
               centerX + "px " + centerY + "px, " +
               "#000 0%, rgba(0,0,0,0.95) 35%, " +
               "rgba(0,0,0,0.4) 75%, transparent 100%)";
    starfield.style.webkitMaskImage = mask;
    starfield.style.maskImage       = mask;
  }

  // Run on initial load.
  paintStars();
  anchorToForm();

  // Re-anchor on resize (debounced) so the cluster follows when the
  // window changes. We don't re-paint stars on resize — that would
  // shuffle every star on every drag — only re-anchor.
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(anchorToForm, 120);
  });

  // Expose for pages whose form appears/disappears (e.g. admin.html
  // swapping between login view and applications list). Those pages
  // can call window.dawatReanchorStars() after toggling visibility.
  window.dawatReanchorStars = anchorToForm;
})();
