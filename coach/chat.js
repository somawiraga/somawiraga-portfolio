// Soma's portfolio assistant: a chat window with a Rive avatar, answered by the
// RAG backend in backend/. Each page includes coach/chat.css, rive.js and this
// file (as a module); the widget's markup is added here so it lives in one place.

// Backend URL, no trailing slash. Local pages talk to the local backend; set
// PRODUCTION_API to the hosted backend once it is deployed (BUILD_GUIDE step 11).
// Until then the widget stays hidden on the live site.
const LOCAL_API = "http://127.0.0.1:8000";
const PRODUCTION_API = "";
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = isLocal ? LOCAL_API : PRODUCTION_API;

const MARKUP = `
<!-- The window starts closed; chat.js opens it from the avatar on the bottom right. -->
<section class="chat is-closed" id="chat" aria-label="Chat with Soma's assistant">
  <!-- Outside the clipped area so it can overhang the top edge of the window -->
  <div class="avatar avatar-header">
    <canvas class="avatar-canvas" width="360" height="360" aria-hidden="true"></canvas>
  </div>

  <div class="chat-clip">
    <div class="chat-inner">
      <header class="chat-header">
        <div class="chat-title">Ask me Questions</div>
        <div class="chat-subtitle">Ask about my CV, Qualification, AI Design and more.</div>
        <button class="chat-close" id="chat-close" type="button" aria-label="Close chat">&times;</button>
      </header>

      <div class="chat-messages" id="chat-messages" aria-live="polite"></div>

      <form class="chat-form" id="chat-form">
        <textarea id="chat-input" rows="1" placeholder="Ask about Soma's work…" maxlength="2000" required></textarea>
        <button id="chat-send" type="submit" aria-label="Send">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </button>
      </form>
    </div>
  </div>
</section>

<!-- Minimised: shown while the chat window is closed -->
<div class="chat-dock" id="chat-dock">
  <span class="chat-tip" aria-hidden="true">Ask me Questions</span>
  <button class="chat-launcher avatar" id="chat-launcher" type="button" aria-label="Open chat about Soma" aria-controls="chat" aria-expanded="false">
    <canvas class="avatar-canvas" width="360" height="360" aria-hidden="true"></canvas>
  </button>
</div>`;

if (API_BASE) {
  document.body.insertAdjacentHTML("beforeend", MARKUP);
  start();
}

function start() {
  const chat = document.getElementById("chat");
  const dock = document.getElementById("chat-dock");
  const launcher = document.getElementById("chat-launcher");
  const closeButton = document.getElementById("chat-close");
  const messages = document.getElementById("chat-messages");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const sendButton = document.getElementById("chat-send");

  const history = [];

  // The site is a set of separate pages, so the conversation and the open/closed
  // state are kept for the browser session and restored on each page.
  const STORE_KEY = "soma-chat";
  const log = [];
  function save(open) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}");
      sessionStorage.setItem(
        STORE_KEY,
        JSON.stringify({ open: open === undefined ? !!saved.open : open, log: log, history: history })
      );
    } catch (e) {}
  }

  // Relative to the page; every page sits at the site root.
  const AVATAR_SRC = "avatar/soma.riv";
  const AVATAR_ARTBOARD = "Chibi Face";
  const AVATAR_STATE_MACHINE = "State Machine 1";
  const avatars = [];
  // Values of the "expression" number in the Rive file's Face view model.
  const EXPRESSION = { neutral: 0, confuse: 1, thinking: 2, happy: 3, sad: 4 };
  const SAD_RESET_MS = 6000;
  const GREET_MS = 5000;
  let resetTimer;
  let greetTimer;
  // What the conversation currently calls for (Neutral / Thinking / Sad).
  let flowExpression = EXPRESSION.neutral;

  function setAvatarExpression(avatar, value) {
    if (!avatar) return;
    avatar.value = value;
    if (avatar.expression) avatar.expression.value = value;
  }

  function setExpression(value) {
    clearTimeout(resetTimer);
    clearTimeout(greetTimer);
    flowExpression = value;
    // Drives the shine on the avatar background (see .is-thinking in chat.css).
    document.body.classList.toggle("is-thinking", value === EXPRESSION.thinking);
    avatars.forEach((avatar) => setAvatarExpression(avatar, value));
    // Sad is a reaction, not a resting state: go back to Neutral after a while.
    if (value === EXPRESSION.sad) {
      resetTimer = setTimeout(() => setExpression(EXPRESSION.neutral), SAD_RESET_MS);
    }
  }

  function headerAvatar() {
    return avatars.find((avatar) => avatar.isHeader);
  }

  // Opening the chat: the header avatar is Happy for a few seconds, then settles
  // back to whatever the conversation calls for (Neutral at the start).
  function greet() {
    clearTimeout(greetTimer);
    setAvatarExpression(headerAvatar(), EXPRESSION.happy);
    greetTimer = setTimeout(() => setAvatarExpression(headerAvatar(), flowExpression), GREET_MS);
  }

  function endGreeting() {
    clearTimeout(greetTimer);
    setAvatarExpression(headerAvatar(), flowExpression);
  }

  // One Rive instance per canvas: the header avatar and the minimised launcher.
  function loadAvatars() {
    if (!window.rive) return;
    document.querySelectorAll(".avatar-canvas").forEach((canvas) => {
      const avatar = {
        canvas: canvas,
        isHeader: !!canvas.closest(".avatar-header"),
        expression: null,
        value: flowExpression,
      };
      avatar.rive = new rive.Rive({
        src: AVATAR_SRC,
        canvas: canvas,
        artboard: AVATAR_ARTBOARD,
        stateMachines: AVATAR_STATE_MACHINE,
        autoplay: true,
        autoBind: true,
        onLoad: () => {
          const instance = avatar.rive.viewModelInstance;
          avatar.expression = instance ? instance.number("expression") : null;
          if (avatar.expression) avatar.expression.value = avatar.value;
          else console.warn("Avatar: no 'expression' property found.");
        },
      });
      avatars.push(avatar);
    });
  }

  // The scrollbar stays hidden until the user scrolls, then fades out again.
  let scrollTimer;
  messages.addEventListener("scroll", () => {
    messages.classList.add("scrolling");
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => messages.classList.remove("scrolling"), 800);
  });

  // The window grows out from the launcher's spot (see .chat in chat.css); the
  // launcher fades out while it is open.
  function setOpen(open) {
    chat.classList.toggle("is-closed", !open);
    dock.classList.toggle("is-hidden", open);
    launcher.setAttribute("aria-expanded", String(open));
    save(open);
    if (open) {
      greet();
      input.focus();
    } else {
      endGreeting();
    }
  }

  // Show a long answer from its first line instead of jumping to its end.
  function scrollToTopOf(bubble) {
    const offset = bubble.getBoundingClientRect().top - messages.getBoundingClientRect().top;
    const padding = parseFloat(getComputedStyle(messages).paddingTop) || 0;
    messages.scrollTo({ top: messages.scrollTop + offset - padding, behavior: "smooth" });
  }

  // align "top": scroll so the new bubble starts at the top of the list.
  // Otherwise the list follows the conversation to the bottom.
  function addMessage(kind, text, align) {
    if (kind === "user" || kind === "assistant" || kind === "error") {
      log.push({ kind: kind, text: text });
      save();
    }
    const bubble = document.createElement("div");
    bubble.className = "message " + kind;
    bubble.textContent = text;
    messages.appendChild(bubble);
    if (align === "top") scrollToTopOf(bubble);
    else messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  async function send(question) {
    addMessage("user", question);
    const pending = addMessage("assistant pending", "Thinking…");
    sendButton.disabled = true;
    setExpression(EXPRESSION.thinking);

    try {
      const response = await fetch(API_BASE + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, history: history }),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = typeof data.detail === "string" ? data.detail : "Request failed.";
        throw new Error(detail);
      }
      pending.remove();
      addMessage("assistant", data.answer, "top");
      history.push({ role: "user", content: question });
      history.push({ role: "assistant", content: data.answer });
      save();
      // found === false: the knowledge had nothing relevant to answer from.
      setExpression(data.found === false ? EXPRESSION.sad : EXPRESSION.neutral);
    } catch (error) {
      pending.remove();
      addMessage("error", error.message || "Something went wrong.");
      setExpression(EXPRESSION.sad);
    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || sendButton.disabled) return;
    input.value = "";
    input.style.height = "auto";
    send(question);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  // Grow the box with its text. scrollHeight leaves out the border, which the
  // border-box height includes, so add it back or the text always overflows by
  // a few pixels and a scrollbar appears.
  input.addEventListener("input", () => {
    input.style.height = "auto";
    const border = input.offsetHeight - input.clientHeight;
    input.style.height = input.scrollHeight + border + "px";
  });

  launcher.addEventListener("click", () => setOpen(true));
  closeButton.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !chat.classList.contains("is-closed")) {
      setOpen(false);
      launcher.focus();
    }
  });

  loadAvatars();
  let saved = {};
  try {
    saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}");
  } catch (e) {}
  if (saved.log && saved.log.length) {
    saved.log.forEach((m) => addMessage(m.kind, m.text));
    history.push(...(saved.history || []));
  } else {
    addMessage(
      "assistant",
      "Hi! I'm Soma's assistant. Ask me about his experience, projects, talks or patent."
    );
  }
  // The dock is in the markup from the start, so it is there as soon as the page is.
  if (saved.open) setOpen(true);
}
