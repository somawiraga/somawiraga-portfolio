/* Shared behaviour for every page: navigation transitions and scroll reveals.
   Loaded before each page's own script. */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.remove("no-js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------------------------------------------------------------------
     Page transitions
     Internal links fade + lift the page out, then navigate. The incoming
     page plays its entry animation from CSS, so the two halves meet.
     --------------------------------------------------------------------- */
  var LEAVE_MS = 340;
  var navigating = false;

  function isInternalNavigation(link, event) {
    if (event.defaultPrevented) return false;
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (link.target && link.target !== "_self") return false;
    if (link.hasAttribute("download")) return false;

    var href = link.getAttribute("href");
    if (!href || href.charAt(0) === "#") return false;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;

    var url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return false;

    // Same page, different anchor — let the browser scroll instead.
    if (url.pathname === window.location.pathname && url.hash) return false;

    return true;
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest ? event.target.closest("a[href]") : null;
    if (!link || !isInternalNavigation(link, event)) return;

    event.preventDefault();
    if (navigating) return;
    navigating = true;

    var destination = link.href;

    if (reduceMotion.matches) {
      window.location.href = destination;
      return;
    }

    document.body.classList.add("is-leaving");
    window.setTimeout(function () {
      window.location.href = destination;
    }, LEAVE_MS);
  });

  // Coming back via the bfcache restores the faded-out DOM — reset it.
  window.addEventListener("pageshow", function (event) {
    navigating = false;
    document.body.classList.remove("is-leaving");
    if (event.persisted) {
      revealAll();
    }
  });

  /* ---------------------------------------------------------------------
     Scroll reveals
     --------------------------------------------------------------------- */
  function revealAll() {
    var nodes = document.querySelectorAll(".reveal");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.add("is-visible");
    }
  }

  function initReveals() {
    var targets = document.querySelectorAll(".reveal");
    if (!targets.length) return;

    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      revealAll();
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          var delay = entry.target.getAttribute("data-reveal-delay");
          if (delay) {
            entry.target.style.transitionDelay = delay + "ms";
          }
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );

    for (var i = 0; i < targets.length; i++) {
      observer.observe(targets[i]);
    }

    // Images settling can shift the layout after the observer was wired up.
    // Once everything has loaded, show anything already on screen so no
    // section can be left stranded at opacity 0.
    window.addEventListener("load", revealInView);
  }

  function revealInView() {
    var viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    var pending = document.querySelectorAll(".reveal:not(.is-visible)");

    for (var i = 0; i < pending.length; i++) {
      if (pending[i].getBoundingClientRect().top < viewportHeight) {
        pending[i].classList.add("is-visible");
      }
    }
  }

  /* Expose a tiny shared surface for the per-page scripts. */
  window.Site = {
    reduceMotion: reduceMotion,
    revealAll: revealAll,

    /* Staggers a NodeList of .reveal elements by a fixed step. */
    stagger: function (nodes, stepMs) {
      var step = typeof stepMs === "number" ? stepMs : 90;
      Array.prototype.forEach.call(nodes, function (node, index) {
        node.setAttribute("data-reveal-delay", String(index * step));
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReveals);
  } else {
    initReveals();
  }
})();
