/* Project — AI Education Agent. Hero drift plus staggered feature reveals. */
(function () {
  "use strict";

  function init() {
    Site.stagger(document.querySelectorAll(".feature-row .reveal"), 120);

    /* Slow drift on the hero backdrop as the page scrolls. */
    var heroBg = document.querySelector(".project-hero__bg");
    if (!heroBg || Site.reduceMotion.matches) return;

    var ticking = false;

    var sync = function () {
      var offset = Math.min(window.scrollY, 750) * 0.12;
      heroBg.style.transform = "translate3d(0, " + offset + "px, 0) scale(1.06)";
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

    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
