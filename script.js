
const form = document.getElementById("applicationForm");
const steps = [...document.querySelectorAll(".step")];
const next = document.getElementById("next");
const back = document.getElementById("back");
const submit = document.getElementById("submit");
const error = document.getElementById("error");
const bar = document.getElementById("bar");
const stepLabel = document.getElementById("stepLabel");
const percent = document.getElementById("percent");
const actions = document.querySelector(".actions");
const stepPips = [...document.querySelectorAll("#stepPips li")];
const submissionEndpoint = "/api/submit";
let current = 0;

function showError(msg) {
  error.textContent = msg;
  error.classList.add("show");
}

function clearError() {
  error.textContent = "";
  error.classList.remove("show");
}

function update() {
  steps.forEach((step, index) => step.classList.toggle("active", index === current));
  const pct = Math.round(((current + 1) / steps.length) * 100);
  bar.style.width = `${pct}%`;
  percent.textContent = `${pct}% complete`;
  stepLabel.textContent = `Step ${current + 1} of ${steps.length}`;
  stepPips.forEach((pip, index) => {
    pip.classList.toggle("active", index === current);
    pip.classList.toggle("complete", index < current);
    if (index === current) pip.setAttribute("aria-current", "step");
    else pip.removeAttribute("aria-current");
  });
  actions.classList.toggle("first-step", current === 0);
  back.classList.toggle("hidden", current === 0);
  next.classList.toggle("hidden", current === steps.length - 1);
  submit.classList.toggle("hidden", current !== steps.length - 1);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function validateProfileEmails() {
  if (!steps[current].querySelector("[name='email2']")) return true;
  const email = form.elements.email;
  const email2 = form.elements.email2;
  if (!email || !email2) return true;
  if (email.value.trim().toLowerCase() === email2.value.trim().toLowerCase()) return true;
  showError("The email addresses do not match.");
  email2.focus();
  return false;
}

function validateStep() {
  clearError();
  const fields = [...steps[current].querySelectorAll("input,select,textarea")].filter((el) => el.required);
  for (const field of fields) {
    if (field.type === "radio") {
      const group = steps[current].querySelectorAll(`input[name="${field.name}"]`);
      if (![...group].some((x) => x.checked)) {
        showError("Please complete the required fields.");
        return false;
      }
    } else if (field.type === "checkbox" && !field.checked) {
      showError("Please accept the required checkbox to continue.");
      return false;
    } else if (!field.value.trim()) {
      showError("Please complete the required fields.");
      field.focus();
      return false;
    } else if (!field.checkValidity()) {
      showError("Please enter a valid value.");
      field.focus();
      return false;
    }
  }
  return validateProfileEmails();
}

function buildSubmissionPayload() {
  return Object.fromEntries(new FormData(form).entries());
}

function setSubmitting(isSubmitting) {
  submit.disabled = isSubmitting;
  back.disabled = isSubmitting;
  next.disabled = isSubmitting;
  submit.textContent = isSubmitting ? "Submitting..." : "Complete application";
}

function isLocalHost() {
  return ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
}

function submissionErrorMessage(response, result = {}) {
  if (window.location.protocol === "file:") {
    return "The secure submission service is unavailable from a local file. Please open the application from the hosted site.";
  }
  if (isLocalHost() && result.detail) {
    return result.detail;
  }
  if (response && response.status === 404) {
    return "The secure submission service is not available. Please try again shortly.";
  }
  return result.message || result.error || "Your application could not be submitted right now. Please try again shortly.";
}

function showSuccess() {
  form.innerHTML = `<div class="success-state"><div class="success-icon" aria-hidden="true"></div><p class="eyebrow">Application received</p><h3 class="step-title">Application submitted</h3><p class="muted">Thank you — we've received your application and will be in touch.</p></div>`;
}

next.addEventListener("click", () => {
  if (validateStep()) {
    current += 1;
    update();
  }
});

back.addEventListener("click", () => {
  clearError();
  if (current > 0) {
    current -= 1;
    update();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateStep()) return;
  setSubmitting(true);
  clearError();

  try {
    const response = await fetch(submissionEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(buildSubmissionPayload())
    });

    const json = await response.json().catch(() => ({}));

    // Expect { success: true } from Pages Function
    if (!response.ok || !json.success) {
      throw new Error(submissionErrorMessage(response, json));
    }

    showSuccess();
  } catch (error) {
    const message = error instanceof TypeError ? submissionErrorMessage() : error.message;
    showError(message || "Your application could not be submitted right now. Please try again shortly.");
    setSubmitting(false);
  }
});

update();
