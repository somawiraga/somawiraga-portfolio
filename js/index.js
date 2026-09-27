/* Home page — hero name typing, back-to-top control and card stagger. */
(function () {
  "use strict";

  /* ---- Hero name (3:742) ---------------------------------------------
     Each line converges on a target string one character at a time: it
     backspaces to the longest prefix it shares with the target, then types
     the rest. English and Korean share no prefix, so a hover clears the
     line and retypes it — and because every tick re-reads the target,
     flicking the pointer in and out just turns the typer around mid-word
     instead of queueing up a backlog.
     -------------------------------------------------------------------- */
  var TYPE_MS = 34;
  var ERASE_MS = 18;
  var NAME_DELAY_MS = 230;
  var CYCLE_MS = 3000;

  function makeTyper(line, onSettle) {
    var el = line.querySelector(".hero-name__type");
    var en = el.getAttribute("data-en");
    var ko = el.getAttribute("data-ko");
    var current = el.textContent;
    var target = current;
    var timer = 0;

    function paint() {
      el.textContent = current;
      /* Tag the language only once the line actually holds Korean, so the
         Latin backspace still renders in Inter. */
      el.lang = current.length > 0 && ko.indexOf(current) === 0 ? "ko" : "en";
    }

    function tick() {
      timer = 0;

      if (current === target) {
        if (onSettle) onSettle(line);
        return;
      }

      var max = Math.min(current.length, target.length);
      var shared = 0;
      while (shared < max && current.charAt(shared) === target.charAt(shared)) {
        shared += 1;
      }

      var delay;
      if (current.length > shared) {
        current = current.slice(0, -1);
        delay = ERASE_MS;
      } else {
        current = target.slice(0, current.length + 1);
        delay = TYPE_MS;
      }

      paint();
      timer = window.setTimeout(tick, delay);
    }

    return {
      /* Jumps straight to the string with no animation. */
      set: function (lang) {
        window.clearTimeout(timer);
        timer = 0;
        current = lang === "ko" ? ko : en;
        target = current;
        paint();
      },

      to: function (lang, startDelay) {
        target = lang === "ko" ? ko : en;
        if (current === target || timer) return;
        timer = window.setTimeout(tick, startDelay || 0);
      }
    };
  }

  function initHeroName() {
    var block = document.querySelector(".hero-name");
    if (!block) return;

    var greetingLine = block.querySelector(".hero-name__line--greeting");
    var nameLine = block.querySelector(".hero-name__line--name");
    if (!greetingLine || !nameLine) return;

    /* Phones have no hover, so the name alternates languages by itself,
       holding each one for CYCLE_MS once it has finished typing. */
    var mobile = window.matchMedia("(max-width: 620px)");
    var cycleTimer = 0;

    function scheduleCycle() {
      window.clearTimeout(cycleTimer);
      cycleTimer = 0;
      if (!mobile.matches || Site.reduceMotion.matches) return;
      cycleTimer = window.setTimeout(function () {
        show(lang === "en" ? "ko" : "en");
      }, CYCLE_MS);
    }

    mobile.addEventListener("change", function () {
      if (mobile.matches) {
        if (block.classList.contains("is-ready")) scheduleCycle();
      } else {
        scheduleCycle();
        show("en");
      }
    });

    function settle(line) {
      if (line !== nameLine) return;
      block.classList.add("is-ready");
      scheduleCycle();
    }

    /* Clearing the markup's English before the typers read it means they
       start from empty and the intro needs no second construction. */
    var animate = !Site.reduceMotion.matches;
    if (animate) {
      block.classList.add("is-animated");
      greetingLine.querySelector(".hero-name__type").textContent = "";
      nameLine.querySelector(".hero-name__type").textContent = "";
    }

    var greeting = makeTyper(greetingLine, settle);
    var name = makeTyper(nameLine, settle);
    var lang = "en";

    function show(next) {
      if (lang === next) return;
      lang = next;
      if (Site.reduceMotion.matches) {
        greeting.set(next);
        name.set(next);
        return;
      }
      /* Both lines turn together — a stagger reads as lag on a hover. */
      greeting.to(next, 0);
      name.to(next, 0);
    }

    block.addEventListener("mouseenter", function () {
      show("ko");
    });
    block.addEventListener("mouseleave", function () {
      show("en");
    });

    /* Without a pointer there is no hover, so a tap toggles instead. */
    if (window.matchMedia("(hover: none)").matches) {
      block.addEventListener("click", function () {
        show(lang === "en" ? "ko" : "en");
      });
    }

    if (!animate) {
      settle(nameLine);
      return;
    }

    greeting.to("en", 260);
    name.to("en", NAME_DELAY_MS);
  }

  function init() {
    initHeroName();

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
