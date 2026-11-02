const chat = document.getElementById("chat");
const dock = document.getElementById("chat-dock");
const launcher = document.getElementById("chat-launcher");
const closeButton = document.getElementById("chat-close");
const messages = document.getElementById("chat-messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const sendButton = document.getElementById("chat-send");

const history = [];

const AVATAR_SRC = "/avatar/soma.riv";
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
  // Drives the shine on the avatar background (see .is-thinking in style.css).
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

// The window grows upward from the corner (see .chat in style.css); the
// launcher fades out while it is open.
function setOpen(open) {
  chat.classList.toggle("is-closed", !open);
  dock.classList.toggle("is-hidden", open);
  launcher.setAttribute("aria-expanded", String(open));
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
    const response = await fetch("/api/chat", {
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
    // found === false: the course material had nothing relevant to answer from.
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

dock.addEventListener("click", () => setOpen(true));
closeButton.addEventListener("click", () => setOpen(false));

loadAvatars();
addMessage("assistant", "Hi! Ask me anything about your course material.");
// Open shortly after load so the opening animation is seen.
setTimeout(() => setOpen(true), 300);
