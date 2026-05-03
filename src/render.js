const API_BASE = 'http://localhost:8000/api';

const state = {
  profile: {},
  entries: [],
  activePanel: 'profilePanel',
};

const typeLabels = {
  jobs: 'Job',
  skills: 'Skill Group',
  certifications: 'Certification',
  awards: 'Award',
};

const listTargets = {
  jobs: document.querySelector('#jobsList'),
  skills: document.querySelector('#skillsList'),
  certifications: document.querySelector('#certificationsList'),
  awards: document.querySelector('#awardsList'),
};

const profileForm = document.querySelector('#profileForm');
const saveStatus = document.querySelector('#saveStatus');
const resumePreview = document.querySelector('#resumePreview');
const entryDialog = document.querySelector('#entryDialog');
const entryForm = document.querySelector('#entryForm');
const attributionDialog = document.querySelector('#attributionDialog');

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
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

function setSaveStatus(message, type = 'ready') {
  saveStatus.textContent = message;
  saveStatus.style.color = type === 'error' ? '#a12828' : '#1f7a4d';
  saveStatus.style.background = type === 'error' ? '#fdecec' : '#eaf6ef';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fillProfileForm() {
  Object.entries(state.profile).forEach(([key, value]) => {
    const field = profileForm.elements[key];
    if (field) {
      field.value = value || '';
    }
  });
}

function collectProfileForm() {
  const formData = new FormData(profileForm);
  return Object.fromEntries(formData.entries());
}

async function saveProfile() {
  setSaveStatus('Saving');
  try {
    state.profile = await api('/profile', {
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

function detailsToTextarea(details) {
  return (details || []).join('\n');
}

function textareaToDetails(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function openEntryDialog(type, entry = null) {
  entryForm.reset();
  entryForm.elements.type.value = type;
  entryForm.elements.id.value = entry?.id || '';
  entryForm.elements.title.value = entry?.title || '';
  entryForm.elements.organization.value = entry?.organization || '';
  entryForm.elements.category.value = entry?.category || '';
  entryForm.elements.location.value = entry?.location || '';
  entryForm.elements.startDate.value = entry?.startDate || '';
  entryForm.elements.endDate.value = entry?.endDate || '';
  entryForm.elements.details.value = detailsToTextarea(entry?.details || []);
  entryForm.elements.isSelected.checked = entry?.isSelected !== false;
  document.querySelector('#entryDialogTitle').textContent = `${entry ? 'Edit' : 'Add'} ${typeLabels[type]}`;
  entryDialog.showModal();
}

async function saveEntry(event) {
  event.preventDefault();
  const formData = new FormData(entryForm);
  const id = formData.get('id');
  const entry = {
    type: formData.get('type'),
    title: formData.get('title'),
    organization: formData.get('organization'),
    category: formData.get('category'),
    location: formData.get('location'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    details: textareaToDetails(formData.get('details')),
    isSelected: entryForm.elements.isSelected.checked,
  };
  entry.selectedDetails = entry.details;

  if (id) {
    await api(`/entries/${id}`, { method: 'PUT', body: JSON.stringify(entry) });
  } else {
    await api('/entries', { method: 'POST', body: JSON.stringify(entry) });
  }

  entryDialog.close();
  await loadData();
}

async function toggleEntry(entry, field, value) {
  const updated = { ...entry, [field]: value };
  await api(`/entries/${entry.id}`, { method: 'PUT', body: JSON.stringify(updated) });
  await loadData();
}

async function toggleDetail(entry, detail, checked) {
  const selected = new Set(entry.selectedDetails || []);
  if (checked) {
    selected.add(detail);
  } else {
    selected.delete(detail);
  }
  await toggleEntry(entry, 'selectedDetails', Array.from(selected));
}

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
    await api(`/entries/${entry.id}`, { method: 'DELETE' });
    await loadData();
  });

  return card;
}

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

function contactLine(profile) {
  return [profile.email, profile.phone, profile.location, profile.website].filter(Boolean).join(' | ');
}

function renderResumeSection(title, entries) {
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
    ${renderResumeSection('Experience', state.entries.filter((entry) => entry.type === 'jobs'))}
    ${renderResumeSection('Skills', state.entries.filter((entry) => entry.type === 'skills'))}
    ${renderResumeSection('Certifications', state.entries.filter((entry) => entry.type === 'certifications'))}
    ${renderResumeSection('Awards', state.entries.filter((entry) => entry.type === 'awards'))}
  `;
}

async function loadData() {
  const [profile, entries] = await Promise.all([api('/profile'), api('/entries')]);
  state.profile = profile;
  state.entries = entries;
  fillProfileForm();
  renderCollections();
  renderResume();
}

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

async function saveGeminiKey() {
  const input = document.querySelector('#geminiKeyInput');
  await api('/settings/gemini-key', {
    method: 'PUT',
    body: JSON.stringify({ geminiApiKey: input.value.trim() }),
  });
  input.value = '';
  document.querySelector('#suggestionsBox').textContent = 'Gemini API key saved locally in SQLite.';
}

async function reviewWithAi() {
  const text = document.querySelector('#aiTextInput').value.trim();
  const box = document.querySelector('#suggestionsBox');
  if (!text) {
    box.textContent = 'Enter resume content first.';
    return;
  }

  box.textContent = 'Reviewing...';
  try {
    const result = await api('/suggestions', {
      method: 'POST',
      body: JSON.stringify({ text, context: state.profile.headline }),
    });
    box.innerHTML = `
      <p><strong>Source:</strong> ${escapeHtml(result.source)}</p>
      <ul>${(result.suggestions || []).map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`).join('')}</ul>
    `;
  } catch (error) {
    box.textContent = 'AI review failed. Check the API key and try again.';
    console.error(error);
  }
}

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

async function initialize() {
  setupNavigation();
  setupEvents();
  await loadData();
}

initialize().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<main class="p-4"><h1>ResumeCraft could not start</h1><p>${escapeHtml(error.message)}</p></main>`;
});
