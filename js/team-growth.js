/* Team — 5x Team Growth. Each chapter's text and image arrive in sequence. */
(function () {
  "use strict";

  function init() {
    var chapters = document.querySelectorAll(".chapter");

    Array.prototype.forEach.call(chapters, function (chapter) {
      Site.stagger(chapter.querySelectorAll(".reveal"), 140);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
