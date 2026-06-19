// Starfield: generates random stars, anchors cluster to form center, handles resize
// Uses box-shadow technique for rendering, radial-gradient mask for fade effect
(function () {
  const RESIZE_DEBOUNCE_MS = 120;
  function makeStars(count, colors, spread, maxRadius) {
    var shadows = [];
    for (var i = 0; i < count; i++) {
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

  function anchorToForm() {
    var starfield = document.querySelector(".starfield");
    var form = null;
    var wraps = document.querySelectorAll(".form-wrap");
    for (var i = 0; i < wraps.length; i++) {
      if (wraps[i].offsetParent !== null) { form = wraps[i]; break; }
    }
    if (!starfield || !form) return;

    var rect    = form.getBoundingClientRect();
    var centerY = rect.top + window.scrollY + rect.height / 2;
    var centerX = rect.left + rect.width / 2;

    var layers = document.querySelectorAll(".star-layer");
    for (var j = 0; j < layers.length; j++) {
      layers[j].style.top  = centerY + "px";
      layers[j].style.left = centerX + "px";
    }

    var mask = "radial-gradient(ellipse 65% 60% at " +
               centerX + "px " + centerY + "px, " +
               "#000 0%, rgba(0,0,0,0.95) 35%, " +
               "rgba(0,0,0,0.4) 75%, transparent 100%)";
    starfield.style.webkitMaskImage = mask;
    starfield.style.maskImage       = mask;
  }

  paintStars();
  anchorToForm();

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(anchorToForm, RESIZE_DEBOUNCE_MS);
  });

  window.dawatReanchorStars = anchorToForm;
})();
