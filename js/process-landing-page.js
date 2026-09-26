/* Process — 1-Day Landing Page delivery. Steps reveal in reading order. */
(function () {
  "use strict";

  function init() {
    var steps = document.querySelectorAll(".step");

    Array.prototype.forEach.call(steps, function (step) {
      Site.stagger(step.querySelectorAll(".reveal"), 120);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
