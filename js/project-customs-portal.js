/* Project — AI Powered Custom Clearance Portal. */
(function () {
  "use strict";

  function init() {
    Site.stagger(document.querySelectorAll(".feature-stack .reveal"), 120);
    Site.stagger(document.querySelectorAll(".feature-row .reveal"), 120);

    var heroBg = document.querySelector(".project-hero__bg");
    if (!heroBg || Site.reduceMotion.matches) return;

    var ticking = false;

    var sync = function () {
      var offset = Math.min(window.scrollY, 986) * 0.12;
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
