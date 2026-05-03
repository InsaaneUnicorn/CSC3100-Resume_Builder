
// ===============================
// ResumeCraft Renderer Script
// ===============================
// This file runs in the browser context of the Electron app window.
// It handles all UI logic, DOM updates, and communication with the backend API (Express server in index.js).
//
// Key responsibilities:
// - Fetch and save user data (profile, entries, settings) via API
// - Render the resume preview and entry lists
// - Handle all user interactions (forms, dialogs, navigation)
// - Bridge to Electron main process for printing (via preload.js)

// The base URL for all API requests to the local Express server (see index.js)
// All data (profile, entries, settings) is fetched and saved via this endpoint
const URL_BASE = 'http://localhost:8000';


// Global state object for the app
// - profile: stores the user's profile information (name, email, etc.)
// - entries: array of all resume items (jobs, skills, certifications, awards)
// - activePanel: which sidebar panel is currently visible (profile, jobs, etc.)
// whenever data is fetched or updated, it modifies this object and then triggers to re-render the UI to reflect the latest state so that the screen stays in sync with the data.
const state = {
  profile: {},
  entries: [],
  activePanel: 'profilePanel', // to show which sidebar tab is open/active
};


// Maps entry type keys to human-readable labels for UI display
// Used for dialog titles and section headers
const typeLabels = {
  jobs: 'Job',
  skills: 'Skill Group',
  certifications: 'Certification',
  awards: 'Award',
};


// Defines which fields are shown for each entry type in the add/edit dialog
// Used by configureEntryDialog() to dynamically show/hide form fields
// Structure: { [type]: { [field]: label } }
const entryFieldRules = {
  jobs: {
    title: 'Job title',
    organization: 'Employer',
    category: 'Category',
    location: 'Location',
    startDate: 'Start date',
    endDate: 'End date',
  },
  skills: {
    title: 'Skill group name',
    category: 'Category',
  },
  certifications: {
    title: 'Certification name',
    organization: 'Issuer',
    category: 'Category',
    location: 'Credential ID or URL',
    startDate: 'Date earned',
    endDate: 'Expiration date',
  },
  awards: {
    title: 'Award name',
    category: 'Category',
  },
};


// Maps entry types to their corresponding DOM containers
// Used by renderCollections() to insert entry cards into the correct section
const listTargets = {
  jobs: document.querySelector('#jobsList'), // <div id="jobsList">
  skills: document.querySelector('#skillsList'), // <div id="skillsList">
  certifications: document.querySelector('#certificationsList'), // <div id="certificationsList">
  awards: document.querySelector('#awardsList'), // <div id="awardsList">
};


// DOM element references for main UI components
// These are used throughout the file to read/write form values and update the UI
const profileForm = document.querySelector('#profileForm'); // The main profile form (name, email, etc.)
const saveStatus = document.querySelector('#saveStatus'); // Status message for save operations
const resumePreview = document.querySelector('#resumePreview'); // The right-side resume preview pane
const entryDialog = document.querySelector('#entryDialog'); // Modal dialog for adding/editing entries
const entryForm = document.querySelector('#entryForm'); // The form inside the entry dialog
const attributionDialog = document.querySelector('#attributionDialog'); // Modal for attribution info


// Helper function to make API calls to the backend Express server & to access the REST APIs or the database (The database isn't able to be accessed directly from the renderer/user for security purposes). This is a wrapper over fetch to do this.
/**
 * Wrapper for the fetch API to communicate with the local Express backend.
 * @param {string} path - The API endpoint path (e.g., '/profile').
 * @param {Object} options - Fetch options like method, headers, and body.
 * @returns {Promise<Object|null>} A promise that resolves to the JSON response or null for 204 No Content.
 */
async function backendRoutes(path, options = {}) {
  const response = await fetch(`${URL_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/**
 * Updates the UI status indicator for save operations.
 * @param {string} message - The text to display (e.g., 'Saving', 'Saved').
 * @param {string} type - The status type ('ready', 'error') which determines the color styling.
 */
function setSaveStatus(message, type = 'ready') {
  saveStatus.textContent = message;
  saveStatus.style.color = type === 'error' ? '#a12828' : '#1f7a4d';
  saveStatus.style.background = type === 'error' ? '#fdecec' : '#eaf6ef';
}


// Escape HTML to prevent XSS in dynamic content
/**
 * Escapes special characters in a string to prevent Cross-Site Scripting (XSS) when rendering dynamic HTML.
 * @param {string} value - The raw string to escape.
 * @returns {string} The escaped HTML-safe string.
 */
function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


// Fill the profile form fields from state
/**
 * Populates the profile form inputs using the data currently stored in the global state.
 * Takes no inputs.
 */
function fillProfileForm() {
  Object.entries(state.profile).forEach(([key, value]) => {
    const field = profileForm.elements[key];
    if (field) {
      field.value = value || '';
    }
  });
}

/**
 * Extracts and bundles all current input values from the profile HTML form.
 * Takes no inputs.
 * @returns {Object} An object containing the profile form data as key-value pairs.
 */
function collectProfileForm() {
  const formData = new FormData(profileForm);
  return Object.fromEntries(formData.entries());
}

/**
 * Sends the current profile form data to the backend API to be saved in the database.
 * Updates the global state and triggers a re-render of the resume preview.
 * Takes no inputs.
 */
async function saveProfile() {
  setSaveStatus('Saving');
  try {
    state.profile = await backendRoutes('/profile', {
      method: 'PUT',
      body: JSON.stringify(collectProfileForm()),
    });
    renderResume();
    setSaveStatus('Saved');
  } catch (error) {
    setSaveStatus('Error', 'error');
    console.error(error);
  }
}

/**
 * Converts an array of detail strings into a single newline-separated string for display in a textarea.
 * @param {string[]} details - Array of string details (e.g., bullet points).
 * @returns {string} Newline-separated string.
 */
function detailsToTextarea(details) {
  return (details || []).join('\n');
}

/**
 * Converts a newline-separated string from a textarea back into an array of individual trimmed detail strings.
 * @param {string} value - The raw textarea string value.
 * @returns {string[]} Array of non-empty string details.
 */
function textareaToDetails(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Opens the modal dialog for adding or editing a resume entry (job, skill, etc.) and populates its fields.
 * @param {string} type - The type of entry being added/edited (e.g., 'jobs', 'skills').
 * @param {Object|null} entry - The existing entry object to edit, or null if creating a new one.
 */
function openEntryDialog(type, entry = null) {
  entryForm.reset();
  configureEntryDialog(type);
  entryForm.elements.type.value = type;
  entryForm.elements.id.value = entry?.id || '';
  entryForm.elements.title.value = entry?.title || '';
  entryForm.elements.organization.value = entryFieldRules[type].organization ? entry?.organization || '' : '';
  entryForm.elements.category.value = entryFieldRules[type].category ? entry?.category || '' : '';
  entryForm.elements.location.value = entryFieldRules[type].location ? entry?.location || '' : '';
  entryForm.elements.startDate.value = entryFieldRules[type].startDate ? entry?.startDate || '' : '';
  entryForm.elements.endDate.value = entryFieldRules[type].endDate ? entry?.endDate || '' : '';
  entryForm.elements.details.value = detailsToTextarea(entry?.details || []);
  entryForm.elements.isSelected.checked = entry?.isSelected !== false;
  document.querySelector('#entryDialogTitle').textContent = `${entry ? 'Edit' : 'Add'} ${typeLabels[type]}`;
  entryDialog.showModal();
}

/**
 * Dynamically shows or hides form fields in the entry dialog based on the specific requirements of the entry type.
 * @param {string} type - The type of entry (e.g., 'jobs' needs a date, 'skills' does not).
 */
function configureEntryDialog(type) {
  const rules = entryFieldRules[type];
  document.querySelectorAll('[data-entry-field]').forEach((wrapper) => {
    const fieldName = wrapper.dataset.entryField;
    const input = wrapper.querySelector('input');
    const labelText = rules[fieldName];

    if (!labelText) {
      wrapper.hidden = true;
      if (input) {
        input.value = '';
      }
      return;
    }

    wrapper.hidden = false;
    wrapper.childNodes[0].textContent = labelText;
  });
}

/**
 * Handles the submission of the entry form, saving the new or edited entry to the backend API.
 * Refreshes the local state data upon success.
 * @param {Event} event - The form submission event.
 */
async function saveEntry(event) {
  event.preventDefault();
  const formData = new FormData(entryForm);
  const id = formData.get('id');
  const type = formData.get('type');
  const rules = entryFieldRules[type];
  const entry = {
    type,
    title: formData.get('title'),
    organization: rules.organization ? formData.get('organization') || '' : '',
    category: rules.category ? formData.get('category') || '' : '',
    location: rules.location ? formData.get('location') || '' : '',
    startDate: rules.startDate ? formData.get('startDate') || '' : '',
    endDate: rules.endDate ? formData.get('endDate') || '' : '',
    details: textareaToDetails(formData.get('details')),
    isSelected: entryForm.elements.isSelected.checked,
  };
  entry.selectedDetails = entry.details;

  if (id) {
    await backendRoutes(`/entries/${id}`, { method: 'PUT', body: JSON.stringify(entry) });
  } else {
    await backendRoutes('/entries', { method: 'POST', body: JSON.stringify(entry) });
  }

  entryDialog.close();
  await loadData();
}

/**
 * Updates a specific field of an entry (typically used for toggling the 'isSelected' state) and saves it to the backend.
 * @param {Object} entry - The entry object to update.
 * @param {string} field - The key of the field to update.
 * @param {any} value - The new value for the field.
 */
async function toggleEntry(entry, field, value) {
  const updated = { ...entry, [field]: value };
  await backendRoutes(`/entries/${entry.id}`, { method: 'PUT', body: JSON.stringify(updated) });
  await loadData();
}

/**
 * Adds or removes a specific bullet point detail from an entry's 'selectedDetails' array and saves the change.
 * @param {Object} entry - The entry object to update.
 * @param {string} detail - The exact string detail to toggle.
 * @param {boolean} checked - True to include the detail, false to remove it.
 */
async function toggleDetail(entry, detail, checked) {
  const selected = new Set(entry.selectedDetails || []);
  if (checked) {
    selected.add(detail);
  } else {
    selected.delete(detail);
  }
  await toggleEntry(entry, 'selectedDetails', Array.from(selected));
}

/**
 * Generates the HTML DOM element for a single interactive entry card (used in the sidebar lists).
 * @param {Object} entry - The entry data object.
 * @returns {HTMLElement} The constructed <article> element representing the card.
 */
function renderEntryCard(entry) {
  const details = entry.details || [];
  const selected = new Set(entry.selectedDetails || []);
  const card = document.createElement('article');
  card.className = 'entry-card';
  card.innerHTML = `
    <div class="entry-card-header">
      <div>
        <h3>${escapeHtml(entry.title)}</h3>
        <p class="entry-meta">${escapeHtml([entry.organization, entry.location, entry.startDate, entry.endDate].filter(Boolean).join(' | '))}</p>
      </div>
      <label class="form-check-label">
        <input class="form-check-input js-entry-selected" type="checkbox" ${entry.isSelected ? 'checked' : ''}>
        Include
      </label>
    </div>
    <div class="detail-picker">
      ${details
        .map(
          (detail) => `
            <label>
              <input class="form-check-input js-detail-selected" type="checkbox" data-detail="${escapeHtml(detail)}" ${selected.has(detail) ? 'checked' : ''}>
              <span>${escapeHtml(detail)}</span>
            </label>
          `,
        )
        .join('')}
    </div>
    <div class="entry-actions">
      <button class="btn btn-sm btn-outline-primary js-edit-entry" type="button">Edit</button>
      <button class="btn btn-sm btn-outline-danger js-delete-entry" type="button">Delete</button>
    </div>
  `;

  card.querySelector('.js-entry-selected').addEventListener('change', (event) => {
    toggleEntry(entry, 'isSelected', event.target.checked);
  });

  card.querySelectorAll('.js-detail-selected').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      toggleDetail(entry, event.target.dataset.detail, event.target.checked);
    });
  });

  card.querySelector('.js-edit-entry').addEventListener('click', () => openEntryDialog(entry.type, entry));
  card.querySelector('.js-delete-entry').addEventListener('click', async () => {
    await backendRoutes(`/entries/${entry.id}`, { method: 'DELETE' });
    await loadData();
  });

  return card;
}


// Loops over each entry types and renders interactive cards with edit/delete buttons and checkboxes in the builder panels.
/**
 * Clears and populates all sidebar entry lists (Jobs, Skills, etc.) by creating cards for each entry in the state.
 * Takes no inputs.
 */
function renderCollections() {
  Object.entries(listTargets).forEach(([type, target]) => {
    target.innerHTML = '';
    const entries = state.entries.filter((entry) => entry.type === type);
    if (entries.length === 0) {
      target.innerHTML = '<p class="text-muted">No items yet. Add one to build this resume section.</p>';
      return;
    }
    entries.forEach((entry) => target.appendChild(renderEntryCard(entry)));
  });
}

/**
 * Builds a single formatted contact line string (e.g., "Email | Phone | Location") from the profile object.
 * @param {Object} profile - The user profile data object.
 * @returns {string} The pipe-separated contact line.
 */
function contactLine(profile) {
  return [profile.email, profile.phone, profile.location, profile.website].filter(Boolean).join(' | ');
}

// marks entries as selected for the renderResume() function and puts the entry section headings that have selected data within them into the resume preview and formats each section
/**
 * Generates the HTML string for a complete section of the resume (e.g., the "Experience" block) 
 * containing only the currently selected entries.
 * @param {string} title - The visible header for the section.
 * @param {Object[]} entries - The array of entry objects belonging to this section.
 * @returns {string} The HTML string for the section, or an empty string if no entries are selected.
 */
function renderResumeSectionHeadings(title, entries) {
  const selectedEntries = entries.filter((entry) => entry.isSelected);
  if (selectedEntries.length === 0) {
    return '';
  }

  return `
    <section class="resume-section">
      <h2>${escapeHtml(title)}</h2>
      ${selectedEntries
        .map((entry) => {
          const selectedDetails = entry.selectedDetails?.length ? entry.selectedDetails : entry.details;
          return `
            <div class="resume-item">
              <div class="resume-item-heading">
                <span>${escapeHtml(entry.title)}</span>
                <span>${escapeHtml([entry.startDate, entry.endDate].filter(Boolean).join(' - '))}</span>
              </div>
              <div class="resume-item-meta">${escapeHtml([entry.organization, entry.location, entry.category].filter(Boolean).join(' | '))}</div>
              ${
                selectedDetails?.length
                  ? `<ul>${selectedDetails.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>`
                  : ''
              }
            </div>
          `;
        })
        .join('')}
    </section>
  `;
}


// Takes the profile on any entries marked as included/is selected is true and generates the HTML for the live resume preview.
/**
 * Rebuilds the entire live HTML preview of the resume based on the current state (profile and selected entries).
 * Takes no inputs.
 */
function renderResume() {
  const profile = state.profile;
  const hasProfile = Boolean(profile.fullName || profile.headline || contactLine(profile) || profile.summary);
  const hasSelectedEntries = state.entries.some((entry) => entry.isSelected);

  if (!hasProfile && !hasSelectedEntries) {
    resumePreview.innerHTML = `
      <section class="resume-section">
        <h2>Start Your Resume</h2>
        <p>Add your profile information, then enter your own jobs, skills, certifications, and awards. Selected items will appear here automatically.</p>
      </section>
    `;
    return;
  }

  resumePreview.innerHTML = `
    <header>
      <h1 class="resume-name">${escapeHtml(profile.fullName || 'Your Name')}</h1>
      <p class="resume-headline">${escapeHtml(profile.headline || 'Resume Headline')}</p>
      <p class="resume-contact">${escapeHtml(contactLine(profile))}</p>
    </header>
    ${
      profile.summary
        ? `<section class="resume-section"><h2>Summary</h2><p>${escapeHtml(profile.summary)}</p></section>`
        : ''
    }
    ${renderResumeSectionHeadings('Experience', state.entries.filter((entry) => entry.type === 'jobs'))}
    ${renderResumeSectionHeadings('Skills', state.entries.filter((entry) => entry.type === 'skills'))}
    ${renderResumeSectionHeadings('Certifications', state.entries.filter((entry) => entry.type === 'certifications'))}
    ${renderResumeSectionHeadings('Awards', state.entries.filter((entry) => entry.type === 'awards'))}
  `;
}

/**
 * Fetches the latest profile and entry data from the backend API, updates the global state, and re-renders the UI.
 * Takes no inputs.
 */
async function loadData() {
  const [profile, entries] = await Promise.all([backendRoutes('/profile'), backendRoutes('/entries')]);
  state.profile = profile;
  state.entries = entries;
  fillProfileForm();
  renderCollections();
  renderResume();
}

/**
 * Attaches click event listeners to the sidebar navigation pills to handle switching between UI panels.
 * Takes no inputs.
 */
function setupNavigation() {
  document.querySelectorAll('.nav-pill').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-pill').forEach((nav) => nav.classList.remove('active'));
      document.querySelectorAll('.builder-panel').forEach((panel) => panel.classList.remove('active'));
      button.classList.add('active');
      document.querySelector(`#${button.dataset.panel}`).classList.add('active');
    });
  });
}

/**
 * Reads the Gemini API key from the settings input and saves it securely to the local SQLite database via the API.
 * Takes no inputs.
 */
async function saveGeminiKey() {
  const input = document.querySelector('#geminiKeyInput');
  await backendRoutes('/settings/gemini-key', {
    method: 'PUT',
    body: JSON.stringify({ geminiApiKey: input.value.trim() }),
  });
  input.value = '';
  document.querySelector('#suggestionsBox').textContent = 'Gemini API key saved locally in SQLite.';
}

/**
 * Sends the user's resume text to the backend API to be reviewed by the Gemini AI and displays the resulting suggestions.
 * Takes no inputs.
 */
async function reviewWithAi() {
  const text = document.querySelector('#aiTextInput').value.trim();
  const box = document.querySelector('#suggestionsBox');
  if (!text) {
    box.textContent = 'Enter resume content first.';
    return;
  }

  box.textContent = 'Reviewing...';
  try {
    const result = await backendRoutes('/suggestions', {
      method: 'POST',
      body: JSON.stringify({ text, context: state.profile.headline }),
    });
    box.innerHTML = `<ul>${(result.suggestions || []).map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`).join('')}</ul>
    `;
  } catch (error) {
    box.textContent = 'AI review failed. Check the API key and try again.';
    console.error(error);
  }
}
// Binds the JS logic to the HTML buttons and form elements in the html. Also implements a 700 ms debounce timer that automatically pushes changes to the backend aka. Autosaving. The dialogs are also provided through this function.
// Clicking the buttons to add an entry opens a html dialog element and opens the form specific to that entry type. It also handles the AI review in that it grabs the text from the ai-panel text area and sends it to the backend suggestions route.
/**
 * Binds all necessary global event listeners, including auto-saving for the profile form, printing, and dialog buttons.
 * Takes no inputs.
 */
function setupEvents() {
  let profileTimer;
  profileForm.addEventListener('input', () => {
    state.profile = collectProfileForm();
    renderResume();
    setSaveStatus('Unsaved');
    clearTimeout(profileTimer);
    profileTimer = setTimeout(saveProfile, 700);
  });

  document.querySelector('#saveAllButton').addEventListener('click', saveProfile);
  document.querySelector('#printButton').addEventListener('click', () => window.resumeCraft.printResume());
  document.querySelector('#copyHtmlButton').addEventListener('click', async () => {
    await navigator.clipboard.writeText(resumePreview.outerHTML);
  });

  document.querySelectorAll('[data-add-type]').forEach((button) => {
    button.addEventListener('click', () => openEntryDialog(button.dataset.addType));
  });

  entryForm.addEventListener('submit', saveEntry);
  document.querySelector('#cancelEntryButton').addEventListener('click', () => entryDialog.close());
  document.querySelector('#saveKeyButton').addEventListener('click', saveGeminiKey);
  document.querySelector('#reviewButton').addEventListener('click', reviewWithAi);
  document.querySelector('#openAttributionButton').addEventListener('click', () => attributionDialog.showModal());
  document.querySelector('#closeAttributionButton').addEventListener('click', () => attributionDialog.close());
}

/**
 * Main application function. Sets up navigation, binds events, and loads the initial data from the backend.
 */
async function initialize() {
  setupNavigation();
  setupEvents();
  await loadData();
}

initialize().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<main class="p-4"><h1>ResumeCraft could not start</h1><p>${escapeHtml(error.message)}</p></main>`;
});
