// Consent Widget Script - DSCI Event
(function() {
const {
  consentFormId,
  apiUrl,
  submitApiUrl,
  showButtons,
  showLanguageDropdown,
  enableCheckboxes,
  enableRadioButtons,
  enableDropdowns,
  tenantToken,
  signatureServiceUrl,
  customAttributes,
  receivedType
} = window.consentWidgetConfig;

let createConsentRequestList = [];
let dataPrincipalIdList = [];
let clickEvent = function () {};
let currentConsentData = null;
let currentSelectedLang = 'en';
let consentJwt = null;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization-SDP": tenantToken || ""
  };
}

// ── ECDSA signing helpers (IndexedDB-backed key pair) ──
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("consent-signing-store", 2);
    req.onupgradeneeded = function (e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys");
    };
    req.onsuccess = e => resolve({
      put: (store, val, key) => new Promise((res, rej) => {
        const tx = e.target.result.transaction(store, "readwrite");
        const r = tx.objectStore(store).put(val, key);
        r.onsuccess = () => res(); r.onerror = () => rej(r.error);
      }),
      get: (store, key) => new Promise((res, rej) => {
        const tx = e.target.result.transaction(store, "readonly");
        const r = tx.objectStore(store).get(key);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      }),
    });
    req.onerror = () => reject(req.error);
  });
}

async function initSigningKey() {
  try {
    const db = await openDB();
    const existing = await db.get("keys", "signingKeyEC");
    if (existing) return;

    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"]
    );

    await db.put("keys", keyPair.privateKey, "signingKeyEC");

    const pubKeyBuffer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const pubKeyB64 = btoa(String.fromCharCode(...new Uint8Array(pubKeyBuffer)));
    await db.put("keys", pubKeyB64, "signingPublicKeyB64");
  } catch (e) {
    console.error("Signing key initialization failed:", e);
  }
}

async function getPublicKeyB64() {
  try {
    const db = await openDB();
    return await db.get("keys", "signingPublicKeyB64");
  } catch (e) {
    return null;
  }
}

// Produces canonical JSON (sorted keys, no whitespace) matching the backend's canonicalizer.
function canonicalizePayload(obj) {
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalizePayload).join(",") + "]";
  }
  if (obj !== null && typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalizePayload(obj[k])).join(",") + "}";
  }
  return JSON.stringify(obj);
}

// Signs the payload using ECDSA-P256; returns base64url IEEE P1363 signature (the "bss").
async function signPayload(payload) {
  try {
    const db = await openDB();
    const privateKey = await db.get("keys", "signingKeyEC");
    if (!privateKey) return null;

    const encoded = new TextEncoder().encode(canonicalizePayload(payload));
    const sigBuffer = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      encoded
    );
    return btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
      .replace(/[+]/g, "-").replace(/[/]/g, "_").replace(/=/g, "");
  } catch (e) {
    console.error("Payload signing failed:", e);
    return null;
  }
}

// Signs the given payload and calls the signature service to obtain the server-side "sss".
async function getSigningExtras(payload) {
  const bss = await signPayload(payload);
  const bssPublicKey = await getPublicKeyB64();
  let sss = null;

  if (bss && bssPublicKey && signatureServiceUrl) {
    try {
      const res = await fetch(signatureServiceUrl + "/v1/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, bss, bss_pkey: bssPublicKey })
      });
      if (res.ok) {
        const signData = await res.json();
        sss = signData.sss;
      }
    } catch (e) {
      console.error("Signature service call failed:", e);
    }
  }

  return { bss, sss, jwt: consentJwt };
}

// Expose signing helper so Angular can attach bss/sss/jwt to its own submit payload.
window.getConsentSigningExtras = getSigningExtras;

// Decodes a JWT's payload segment (base64url) without verifying the signature.
function decodeJwt(token) {
  const payloadSegment = token.split(".")[1];
  const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)) % 4, "=");
  const json = decodeURIComponent(
    atob(padded)
      .split("")
      .map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
  );
  return JSON.parse(json);
}

async function fetchConsentData() {
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ consentFormId })
    });
    const result = await res.json();

    // The API now wraps the consent form data inside a signed JWT payload.
    const jwtPayload = result?.response?.payload;
    consentJwt = jwtPayload || null;
    const decoded = jwtPayload ? decodeJwt(jwtPayload) : result;

    const data =
      decoded?.data?.response?.data?.response?.[0] ||
      decoded?.data?.response?.[0] ||
      decoded?.response?.[0] ||
      decoded?.[0];

    if (!data) {
      document.getElementById("consent-root").innerText = "Consent data not found.";
      return;
    }

    currentConsentData = data;
    renderConsent(data, data.languages?.[0]?.toLowerCase() || "en");
  } catch (e) {
    document.getElementById("consent-root").innerText = "Error loading consent.";
  }
}

function setDataPrincipalIdList() {
  dataPrincipalIdList = [];
  // Get email from Angular's window function if available
  const email = window.getRegistrationEmail ? window.getRegistrationEmail() : "";
  dataPrincipalIdList.push({ key: "email", value: email });
}

function showToast(message, type) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.style.backgroundColor =
    type === "success" ? "#4CAF50" : "#f44336";

  toast.style.visibility = "visible";
  toast.classList.remove("show");
  void toast.offsetHeight;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
    toast.style.visibility = "hidden";
  }, 3000);
}

// Check if at least one consent is selected
function hasSelectedConsent() {
  const consentDiv = document.getElementById("consent-root");
  if (!consentDiv) return false;

  const checkboxes = consentDiv.querySelectorAll('input[type="checkbox"]:checked');
  const radioButtons = consentDiv.querySelectorAll('input[type="radio"]:checked');
  const dropdowns = consentDiv.querySelectorAll("select");

  // Check if any checkbox is checked
  if (checkboxes.length > 0) return true;

  // Check if any radio button is selected
  if (radioButtons.length > 0) return true;

  // Check if any dropdown has a non-empty selection
  for (let drop of dropdowns) {
    if (drop.selectedIndex > 0) return true;
  }

  return false;
}

// Expose function globally for Angular
window.hasSelectedConsent = hasSelectedConsent;

function captureConsentData() {
  setDataPrincipalIdList();
  createConsentRequestList = [];

  const consentDiv = document.getElementById("consent-root");
  if (!consentDiv) {
    return { createConsentRequestList: [], dataPrincipalIdList: [] };
  }

  const checkboxes = consentDiv.querySelectorAll('input[type="checkbox"]:checked');
  const radioButtons = consentDiv.querySelectorAll('input[type="radio"]:checked');
  const dropdowns = consentDiv.querySelectorAll("select");

  const pushConsent = (permissionId, optionIndex) => {
    let existing = createConsentRequestList.find(req => req.permissionId === permissionId);
    if (existing) {
      existing.optedForIndexes.push(optionIndex);
    } else {
      createConsentRequestList.push({
        dataPrincipalIdList,
        permissionId,
        consentReceivedType: receivedType || "FORMS",
        customAttributes: customAttributes || {},
        optedForIndexes: [optionIndex],
        consentLanguage: currentSelectedLang
      });
    }
  };

  checkboxes.forEach(checkbox => {
    if (!enableCheckboxes) return;
    const optionIndex = Number.parseInt(checkbox.value, 10);
    if (!Number.isNaN(optionIndex)) {
      pushConsent(checkbox.name, optionIndex);
    }
  });

  radioButtons.forEach(radio => {
    if (!enableRadioButtons) return;
    const optionIndex = Number.parseInt(radio.value, 10);
    if (!Number.isNaN(optionIndex)) {
      pushConsent(radio.name, optionIndex);
    }
  });

  dropdowns.forEach(drop => {
    if (!enableDropdowns) return;
    if (drop.selectedIndex > 0) {
      const optionIndex = Number.parseInt(drop.value, 10);
      if (!Number.isNaN(optionIndex)) {
        pushConsent(drop.name, optionIndex);
      }
    }
  });

  // Include all permission fields even if not selected (with empty optedForIndexes)
  document.querySelectorAll("#consent-root [name]").forEach(el => {
    if (!createConsentRequestList.some(req => req.permissionId === el.name)) {
      createConsentRequestList.push({
        dataPrincipalIdList,
        permissionId: el.name,
        consentReceivedType: receivedType || "FORMS",
        customAttributes: customAttributes || {},
        optedForIndexes: [],
        consentLanguage: currentSelectedLang
      });
    }
  });

  console.log("Final Consent Payload:", createConsentRequestList);

  return {
    createConsentRequestList,
    dataPrincipalIdList
  };
}

// Expose capture function globally for Angular
window.captureConsentData = captureConsentData;

function setFormDisabled(disabled = true) {
  const root = document.getElementById("consent-root");
  if (!root) return;
  const inputs = root.querySelectorAll("input, select, textarea, button");
  inputs.forEach(input => input.disabled = disabled);
}

function renderConsent(data, selectedLang) {
  currentSelectedLang = selectedLang;
  const root = document.getElementById("consent-root");
  root.innerHTML = "";
  const branding = data.branding || {};

  let permissions = [];
  if (Array.isArray(data.consentForm)) {
    permissions = data.consentForm.flatMap(cf => cf.permissions || []);
  } else if (Array.isArray(data.permissions)) {
    permissions = data.permissions;
  }

  const logoArea = document.getElementById("logo-area");
  if (logoArea) {
    logoArea.innerHTML = "";
    logoArea.classList.remove("left", "center", "right");

    const align = (branding.logoAlignment || "left").toLowerCase();
    logoArea.classList.add(["left", "center", "right"].includes(align) ? align : "left");

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";

    if (align === "center") {
      wrapper.style.flexDirection = "column";
    } else if (align === "right") {
      wrapper.style.flexDirection = "row-reverse";
    } else {
      wrapper.style.flexDirection = "row";
    }

    wrapper.style.alignItems = "center";
    wrapper.style.gap = "5px";

    if (branding.logo) {
      const img = document.createElement("img");
      img.src = branding.logo;
      img.alt = branding.companyName || "Logo";
      img.className = "branding-logo";
      img.onerror = () => img.classList.add("hidden");
      wrapper.appendChild(img);
    }

    if (branding.companyName) {
      const nameDiv = document.createElement("div");
      nameDiv.innerText = branding.companyName;
      nameDiv.classList.add("company-name");

      if (branding.headerFontColor) nameDiv.style.color = branding.headerFontColor;
      if (branding.headerFontFamily) nameDiv.style.fontFamily = branding.headerFontFamily;
      if (branding.headerFontSize) {
        const sizeMap = { small: "14px", medium: "16px", large: "20px" };
        const sz = String(branding.headerFontSize).toLowerCase();
        nameDiv.style.fontSize = sizeMap[sz] || branding.headerFontSize;
      }
      if (branding.headerFontStyle) {
        const styleLower = String(branding.headerFontStyle).toLowerCase();
        if (styleLower.includes("italic")) nameDiv.style.fontStyle = "italic";
        if (styleLower.includes("bold")) nameDiv.style.fontWeight = "bold";
        if (styleLower.includes("normal")) {
          nameDiv.style.fontStyle = "normal";
          nameDiv.style.fontWeight = "400";
        }
      }

      if (branding.companySubtitle) {
        const subEl = document.createElement("div");
        subEl.className = "company-subtitle";
        subEl.innerText = branding.companySubtitle;
        if (branding.subtitleFontSize) subEl.style.fontSize = branding.subtitleFontSize;
        if (branding.subtitleFontColor) subEl.style.color = branding.subtitleFontColor;
        nameDiv.appendChild(subEl);
      }

      wrapper.appendChild(nameDiv);
    }

    logoArea.appendChild(wrapper);
  }

  const langWrapper = document.getElementById("language-wrapper");
  const langSelect = document.getElementById("langSelect");
  if (showLanguageDropdown && data.languages?.length >= 1 && langWrapper && langSelect) {
    langWrapper.style.display = "block";
    langSelect.innerHTML = "";
    data.languages.forEach(lang => {
      const opt = document.createElement("option");
      opt.value = lang.toLowerCase();
      opt.text = lang;
      if (opt.value === selectedLang) opt.selected = true;
      langSelect.appendChild(opt);
    });
    langSelect.onchange = () => renderConsent(data, langSelect.value);
  } else if (langWrapper) {
    langWrapper.style.display = "none";
  }

  if (!permissions.length) {
    root.innerHTML = "<p>No consent items found.</p>";
    return;
  }

  permissions.forEach(perm => {
    const block = document.createElement("div");
    block.className = "permission-block";

    const tr = perm.permissionTranslation?.find(pt => pt.language.toLowerCase() === selectedLang);
    const htmlString = (tr?.text || perm.text || "").trim();

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;

    const children = Array.from(tempDiv.children);

    if (children.length > 0) {
      children.forEach((child, index) => {
        const el = document.createElement(child.tagName.toLowerCase());
        el.innerHTML = child.innerHTML;

        if (child.getAttribute("style")) {
          el.setAttribute("style", child.getAttribute("style"));
        }

        if (
          /^h[1-6]$/i.test(child.tagName) &&
          !/font-weight/i.test(child.getAttribute("style") || "")
        ) {
          el.style.fontWeight = "normal";
        }

        el.style.display = "block";
        el.style.margin = "2px 0";
        el.style.lineHeight = "1.4";
        el.setAttribute("data-translate-text", perm.id);

        if (perm.mandatory && index === children.length - 1) {
          el.innerHTML += ' <span class="mandatory">*</span>';
        }

        block.appendChild(el);
      });
    } else {
      const p = document.createElement("p");
      p.textContent = htmlString.replace(/<[^>]*>/g, "").trim();
      p.setAttribute("data-translate-text", perm.id);

      if (perm.mandatory) {
        p.innerHTML += ' <span class="mandatory">*</span>';
      }

      block.appendChild(p);
    }

    const options = tr?.options || perm.options || [];

    if (perm.elementType === 'CHECKBOX' && enableCheckboxes) {
      options.forEach((opt, idx) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = perm.id;
        input.value = String(idx);
        label.appendChild(input);
        label.append(" " + opt);
        block.appendChild(label);
      });
    }

    if (perm.elementType === 'RADIOBUTTON' && enableRadioButtons) {
      options.forEach((opt, idx) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = perm.id;
        input.value = String(idx);
        label.appendChild(input);
        label.append(" " + opt);
        block.appendChild(label);
      });
    }

    if (perm.elementType === 'DROPDOWN' && enableDropdowns) {
      const select = document.createElement("select");
      select.name = perm.id;
      // Add empty first option
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.text = "Select an option";
      select.appendChild(emptyOpt);

      options.forEach((opt, idx) => {
        const option = document.createElement("option");
        option.value = String(idx);
        option.text = opt;
        select.appendChild(option);
      });
      block.appendChild(select);
    }

    root.appendChild(block);
  });

  // Hide the default buttons since Angular handles submission
  const cancelBtn = document.getElementById("cancelBtn");
  const submitBtn = document.getElementById("submitBtn");
  if (cancelBtn) cancelBtn.style.display = "none";
  if (submitBtn) submitBtn.style.display = "none";
}

// Auto-fetch consent data when script loads (after ensuring a signing key exists)
initSigningKey().then(fetchConsentData);

})();
