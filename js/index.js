/* Home page — back-to-top control and card stagger. */
(function () {
  "use strict";

  function init() {
    /* Cards in each row animate in one after another. */
    Site.stagger(document.querySelectorAll(".card-row .reveal"), 110);
    Site.stagger(document.querySelectorAll(".testimonials__cards .reveal"), 110);

    /* ---- Back to top (3:822) ---------------------------------------- */
    var toTop = document.querySelector(".to-top");
    if (toTop) {
      var ticking = false;

      var sync = function () {
        toTop.classList.toggle("is-visible", window.scrollY > 600);
        ticking = false;
      };

      window.addEventListener(
        "scroll",
        function () {
          if (ticking) return;
          ticking = true;
          window.requestAnimationFrame(sync);
        },
        { passive: true }
      );

      toTop.addEventListener("click", function () {
        window.scrollTo({
          top: 0,
          behavior: Site.reduceMotion.matches ? "auto" : "smooth"
        });
      });

      sync();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
