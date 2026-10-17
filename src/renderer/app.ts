import {
  Bike, Track, SuspensionSettingValues, SuspensionSetting, BackupFile,
  LOCAL_STORAGE_KEY, MAX_BIKES, MAX_TRACKS, MAX_NOTES_LENGTH,
  SUSPENSION_SETTING_MAX_VALUES, DEFAULT_SUSPENSION_SETTINGS,
  generateId, sortByName, isValidURL,
  normalizeBike, normalizeTrack, normalizeSetting,
  parseBackup, serializeBackup, backupFileName,
} from '../shared/schema';

// Data types and validation live in ../shared/schema.ts so the backup format
// stays identical to the Android app. Only UI state is declared here.

interface AppState extends BackupFile {
  hasUnsavedSettingsChanges: boolean;
  stagedSettingsBeforeEdit: SuspensionSettingValues | null; // To store settings before they are changed
  // Modal states
  showNewBikeModal: boolean;
  newBikeName: string;
  showNewTrackModal: boolean;
  newTrackName: string;
  newTrackMapLink: string;
  // Edit Track Modal states
  showEditTrackModal: boolean;
  editingTrackId: string | null;
  editTrackName: string;
  editTrackMapLink: string;
  // Import Setup Modal states
  showImportSetupModal: boolean;
  importSourceTrackId: string | null;
  importSourceCondition: 'Dry' | 'Wet';
  importSourceProfileId: 1 | 2 | 3; // Added import source profile
  importSetupModalInfoMessage: string;
  isImportSetupActionable: boolean;
  // Confirmation Modal State
  showConfirmationModal: boolean;
  confirmationModalTitle: string;
  confirmationModalDescription: string;
  confirmationModalConfirmText: string;
  confirmationModalVariant: 'default' | 'destructive';
  confirmationModalOnConfirm: (() => void) | null;
  confirmationModalOnDiscard: (() => void) | null; // Renamed from userOnCancel
  confirmationModalDiscardText: string; // Text for the discard button
  // App Actions Menu State
  isAppActionsMenuOpen: boolean;
}


let appState: AppState;
let isFirstAppLoad = false; // Flag for welcome toast

// DOM Elements
const sidebarEl = document.getElementById('sidebar')!;
const contentAreaEl = document.getElementById('content-area')!;
const modalContainerEl = document.getElementById('modal-container')!;
const toastContainerEl = document.getElementById('toast-container')!;
const headerActionsContainerEl = document.getElementById('header-actions-container')!;

// Hold-to-adjust functionality
const HOLD_INITIAL_DELAY = 400; // ms
const HOLD_SLOW_REPEATS = 5;
const HOLD_REPEAT_SLOW_INTERVAL = 150; // ms
const HOLD_MEDIUM_REPEATS = 10; // Additional repeats at medium speed
const HOLD_REPEAT_MEDIUM_INTERVAL = 75; // ms
const HOLD_REPEAT_FAST_INTERVAL = 40; // ms

interface HoldState {
  active: boolean;
  settingKey: keyof Omit<SuspensionSettingValues, 'notes'> | null;
  action: 'increment' | 'decrement' | null;
  timeoutId: number | null; // For initial delay
  repeatTimeoutId: number | null; // For the repeating chain of setTimeout
  repeatCount: number;
}

let holdState: HoldState = {
  active: false,
  settingKey: null,
  action: null,
  timeoutId: null,
  repeatTimeoutId: null,
  repeatCount: 0,
};


function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', duration: number = 4000) {
    const toastEl = document.createElement('div');
    toastEl.className = `toast ${type}`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');

    const messageEl = document.createElement('span');
    messageEl.className = 'toast-message';
    messageEl.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.onclick = () => {
        toastEl.classList.remove('show');
        setTimeout(() => toastEl.remove(), 300); // Remove after fade out
    };

    toastEl.appendChild(messageEl);
    toastEl.appendChild(closeBtn);
    toastContainerEl.appendChild(toastEl);

    // Trigger reflow to enable transition
    requestAnimationFrame(() => {
        toastEl.classList.add('show');
    });

    setTimeout(() => {
        toastEl.classList.remove('show');
        setTimeout(() => toastEl.remove(), 300); // Remove after fade out
    }, duration);
}


function saveStateToLocalStorage() {
  try {
    const stateToSave = { ...appState };
    // Don't save active modal states, menu states, or transient edit states
    stateToSave.showNewBikeModal = false;
    stateToSave.showNewTrackModal = false;
    stateToSave.showEditTrackModal = false;
    stateToSave.showImportSetupModal = false;
    stateToSave.showConfirmationModal = false;
    stateToSave.confirmationModalOnConfirm = null;
    stateToSave.confirmationModalOnDiscard = null;
    stateToSave.isAppActionsMenuOpen = false;
    stateToSave.stagedSettingsBeforeEdit = null; // Do not persist staged settings


    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
  } catch (e) {
    console.error("Error saving state to localStorage:", e);
    showToast("Error: Could not save changes. LocalStorage might be full or unavailable.", "error");
  }
}

function getDefaultAppState(): AppState {
  const defaultBikes: Bike[] = [
    { id: 'default-bike-1', name: 'Stark Varg MX 80HP 2025' }
  ];
  const defaultTracks: Track[] = [
    { id: 'default-track-4', name: 'Moto 101', mapLink: 'https://maps.app.goo.gl/FJtmW9fTsUYjV8QPA', activeCondition: 'Dry' },
    { id: 'default-track-5', name: 'Mildenhall MX', mapLink: 'https://maps.app.goo.gl/gNW6HGapgmNHfHWu9', activeCondition: 'Dry' },
    { id: 'default-track-6', name: 'Base Bike Settings', activeCondition: 'Dry' },
  ];

  return {
    bikes: sortByName(defaultBikes),
    tracks: sortByName(defaultTracks),
    settings: [],
    selectedBikeId: null,
    selectedTrackId: null,
    currentTrackCondition: 'Dry',
    selectedProfileId: 1, // Default to profile 1
    hasUnsavedSettingsChanges: false,
    stagedSettingsBeforeEdit: null,
    showNewBikeModal: false,
    newBikeName: '',
    showNewTrackModal: false,
    newTrackName: '',
    newTrackMapLink: '',
    showEditTrackModal: false,
    editingTrackId: null,
    editTrackName: '',
    editTrackMapLink: '',
    showImportSetupModal: false,
    importSourceTrackId: null,
    importSourceCondition: 'Dry',
    importSourceProfileId: 1, // Default import source profile
    importSetupModalInfoMessage: '',
    isImportSetupActionable: false,
    isSidebarCollapsed: false,
    showConfirmationModal: false,
    confirmationModalTitle: '',
    confirmationModalDescription: '',
    confirmationModalConfirmText: 'Confirm',
    confirmationModalVariant: 'default',
    confirmationModalOnConfirm: null,
    confirmationModalOnDiscard: null,
    confirmationModalDiscardText: 'Discard',
    isAppActionsMenuOpen: false,
    currentTheme: 'dark',
  };
}

function loadStateFromLocalStorage(): AppState {
  const storedState = localStorage.getItem(LOCAL_STORAGE_KEY);
  const defaultState = getDefaultAppState();

  if (!storedState) {
    isFirstAppLoad = true;
  }

  let effectiveState: AppState;

  if (storedState) {
    try {
        const parsedState = JSON.parse(storedState);
        effectiveState = { ...defaultState, ...parsedState };
        effectiveState.isSidebarCollapsed = parsedState.isSidebarCollapsed === true;
        effectiveState.isAppActionsMenuOpen = false;
        effectiveState.hasUnsavedSettingsChanges = false;
        effectiveState.stagedSettingsBeforeEdit = null;
        effectiveState.currentTheme = parsedState.currentTheme && ['light', 'dark'].includes(parsedState.currentTheme) ? parsedState.currentTheme : defaultState.currentTheme;
        effectiveState.selectedProfileId = [1, 2, 3].includes(parsedState.selectedProfileId) ? parsedState.selectedProfileId : 1;


        effectiveState.bikes = Array.isArray(parsedState.bikes) ? sortByName(parsedState.bikes.map(normalizeBike)) : defaultState.bikes;
        effectiveState.tracks = Array.isArray(parsedState.tracks) ? sortByName(parsedState.tracks.map(normalizeTrack)) : defaultState.tracks;
        effectiveState.settings = Array.isArray(parsedState.settings)
            ? parsedState.settings.filter((s: any) => typeof s === 'object' && s !== null).map(normalizeSetting)
            : defaultState.settings;

        effectiveState.showNewBikeModal = false;
        effectiveState.showNewTrackModal = false;
        effectiveState.showEditTrackModal = false;
        effectiveState.showImportSetupModal = false;
        effectiveState.showConfirmationModal = false;
        effectiveState.confirmationModalOnConfirm = null;
        effectiveState.confirmationModalOnDiscard = null;
        effectiveState.importSourceTrackId = null;
        effectiveState.importSourceCondition = 'Dry';
        effectiveState.importSourceProfileId = [1,2,3].includes(parsedState.importSourceProfileId) ? parsedState.importSourceProfileId : 1;
        effectiveState.importSetupModalInfoMessage = '';
        effectiveState.isImportSetupActionable = false;


    } catch (e) {
        console.error("Error parsing state from localStorage, using default state:", e);
        effectiveState = { ...defaultState };
        isFirstAppLoad = true;
        showToast("Error loading saved data. Starting with a default setup.", "error");
    }
  } else {
    effectiveState = { ...defaultState };
  }

  if (effectiveState.bikes.length > 0) {
    const currentSelectedBikeIsValid = effectiveState.selectedBikeId &&
                                     effectiveState.bikes.some(bike => bike.id === effectiveState.selectedBikeId);
    if (!currentSelectedBikeIsValid) {
      effectiveState.selectedBikeId = effectiveState.bikes[0].id;
    }
  } else {
    effectiveState.selectedBikeId = null;
  }

  effectiveState.tracks.forEach(track => {
      if (!track.activeCondition) {
          track.activeCondition = 'Dry';
      }
  });

  if (effectiveState.selectedTrackId) {
      const selectedTrack = effectiveState.tracks.find(t => t.id === effectiveState.selectedTrackId);
      if (selectedTrack) {
          effectiveState.currentTrackCondition = selectedTrack.activeCondition;
      } else {
          effectiveState.selectedTrackId = null;
          effectiveState.currentTrackCondition = 'Dry';
      }
  } else if (effectiveState.tracks.length > 0 && effectiveState.selectedBikeId) {
      const firstBikeTrack = effectiveState.tracks[0];
      effectiveState.selectedTrackId = firstBikeTrack.id;
      effectiveState.currentTrackCondition = firstBikeTrack.activeCondition;
  }
  // Ensure selectedProfileId is valid, defaulting to 1
  if (![1, 2, 3].includes(effectiveState.selectedProfileId)) {
    effectiveState.selectedProfileId = 1;
  }


  return effectiveState;
}

function applyCurrentTheme() {
  document.documentElement.setAttribute('data-theme', appState.currentTheme);
}

function handleThemeToggle() {
    appState.currentTheme = appState.currentTheme === 'dark' ? 'light' : 'dark';
    applyCurrentTheme();
    saveStateToLocalStorage();
    renderHeaderActionsMenu();
}


function _closeModalWithAnimation(modalId: string, onClosed: () => void) {
    const modalEl = document.getElementById(modalId);
    if (modalEl) {
        modalEl.classList.remove('modal-opening');
        modalEl.classList.add('modal-closing');

        const handleAnimationEnd = () => {
            modalEl.removeEventListener('animationend', handleAnimationEnd);
            modalEl.classList.remove('modal-closing');
            modalEl.style.display = 'none';
            onClosed();
        };
        modalEl.addEventListener('animationend', handleAnimationEnd);

        setTimeout(() => {
            if (modalEl.classList.contains('modal-closing')) {
                 handleAnimationEnd();
            }
        }, 300);
    } else {
        onClosed();
    }
}

function closeNewBikeModal() {
    _closeModalWithAnimation('new-bike-modal', () => {
        appState.showNewBikeModal = false;
        appState.newBikeName = '';
        renderModals();
    });
}

function closeNewTrackModal() {
     _closeModalWithAnimation('new-track-modal', () => {
        appState.showNewTrackModal = false;
        appState.newTrackName = '';
        appState.newTrackMapLink = '';
        renderModals();
    });
}

function closeEditTrackModal() {
    _closeModalWithAnimation('edit-track-modal', () => {
        appState.showEditTrackModal = false;
        appState.editingTrackId = null;
        appState.editTrackName = '';
        appState.editTrackMapLink = '';
        renderModals();
    });
}

function closeImportSetupModal() {
    _closeModalWithAnimation('import-setup-modal', () => {
        appState.showImportSetupModal = false;
        appState.importSourceTrackId = null;
        appState.importSourceCondition = 'Dry';
        appState.importSourceProfileId = 1;
        appState.importSetupModalInfoMessage = '';
        appState.isImportSetupActionable = false;
        renderModals();
    });
}

function closeConfirmationModalPopup(actionTaken: 'confirm' | 'discard' | 'cancel-true') {
    _closeModalWithAnimation('confirmation-modal', () => {
        appState.showConfirmationModal = false;
        appState.confirmationModalTitle = '';
        appState.confirmationModalDescription = '';
        appState.confirmationModalConfirmText = 'Confirm';
        appState.confirmationModalVariant = 'default';
        appState.confirmationModalOnConfirm = null;
        appState.confirmationModalOnDiscard = null;
        appState.confirmationModalDiscardText = 'Discard';
        renderModals();
    });
}


function openEditTrackForm(trackId: string) {
    const trackToEdit = appState.tracks.find(t => t.id === trackId);
    if (trackToEdit) {
        appState.editingTrackId = trackId;
        appState.editTrackName = trackToEdit.name;
        appState.editTrackMapLink = trackToEdit.mapLink || '';
        appState.showEditTrackModal = true;
        renderModals();
    } else {
        showToast("Could not find the selected track to edit. It might have been deleted.", "error");
        if (appState.selectedTrackId === trackId) handleTrackSelection(null, true);
        saveStateToLocalStorage();
        render();
    }
}

function showConfirmation(
    title: string,
    description: string,
    confirmText: string,
    onConfirm: () => void,
    variant: 'default' | 'destructive' = 'default',
    onDiscard?: (() => void) | null,
    discardText?: string
) {
    appState.confirmationModalTitle = title;
    appState.confirmationModalDescription = description;
    appState.confirmationModalConfirmText = confirmText;
    appState.confirmationModalOnConfirm = onConfirm;
    appState.confirmationModalVariant = variant;
    appState.confirmationModalOnDiscard = onDiscard;
    appState.confirmationModalDiscardText = discardText || (variant === 'destructive' ? 'Discard Anyway' : 'Discard Changes');
    appState.showConfirmationModal = true;
    renderModals();
}


function confirmAndProceed(actionDescription: string, proceedAction: () => void) {
    if (!appState.hasUnsavedSettingsChanges) {
        proceedAction();
        return;
    }

    showConfirmation(
        "Unsaved Suspension Settings",
        `You have unsaved changes for the current settings. How would you like to proceed before ${actionDescription}?`,
        "Save and Proceed",
        () => {
            appState.showConfirmationModal = false;
            handleSaveSettingsClick();
            proceedAction();
        },
        'default',
        () => {
            appState.showConfirmationModal = false;

            if (appState.hasUnsavedSettingsChanges && appState.stagedSettingsBeforeEdit && appState.selectedBikeId && appState.selectedTrackId) {
                let settingObj = appState.settings.find(
                    s => s.bikeId === appState.selectedBikeId &&
                         s.trackId === appState.selectedTrackId &&
                         s.condition === appState.currentTrackCondition &&
                         s.profileId === appState.selectedProfileId
                );
                if (settingObj) {
                    settingObj.settings = JSON.parse(JSON.stringify(appState.stagedSettingsBeforeEdit));
                }
            }

            appState.hasUnsavedSettingsChanges = false;
            appState.stagedSettingsBeforeEdit = null;

            proceedAction();
        },
        "Don't Save & Proceed"
    );
}


function handleBikeSelectionChange(newSelectedBikeId: string | null) {
    confirmAndProceed(
        "changing bikes",
        () => {
            appState.selectedBikeId = newSelectedBikeId;
            appState.hasUnsavedSettingsChanges = false;
            appState.stagedSettingsBeforeEdit = null;
            appState.selectedProfileId = 1; // Reset profile on bike change

            if (appState.selectedBikeId && appState.tracks.length > 0) {
                const firstTrack = appState.tracks[0];
                handleTrackSelection(firstTrack.id, true);
            } else {
                handleTrackSelection(null, true);
            }
            if (!(appState.selectedBikeId && appState.tracks.length > 0 && appState.selectedTrackId !== null)) {
                 saveStateToLocalStorage();
                 render();
            }
        }
    );
}

function handleTrackSelection(trackId: string | null, skipConfirmation: boolean = false) {
    const performSelection = () => {
        appState.selectedTrackId = trackId;
        appState.hasUnsavedSettingsChanges = false;
        appState.stagedSettingsBeforeEdit = null;
        appState.selectedProfileId = 1; // Reset profile on track change

        if (trackId) {
            const selectedTrack = appState.tracks.find(t => t.id === trackId);
            if (selectedTrack) {
                appState.currentTrackCondition = selectedTrack.activeCondition;
            } else {
                appState.selectedTrackId = null;
                appState.currentTrackCondition = 'Dry';
            }
        } else {
            appState.currentTrackCondition = 'Dry';
        }
        saveStateToLocalStorage();
        render();
    };

    if (skipConfirmation || appState.selectedTrackId === trackId) {
        performSelection();
    } else {
        confirmAndProceed("changing tracks", performSelection);
    }
}

function handleProfileSelection(profileId: 1 | 2 | 3) {
    if (profileId === appState.selectedProfileId) return;

    confirmAndProceed(
        `switching to profile ${profileId}`,
        () => {
            appState.selectedProfileId = profileId;
            appState.hasUnsavedSettingsChanges = false;
            appState.stagedSettingsBeforeEdit = null;
            saveStateToLocalStorage();
            render(); // Re-render content area for new profile
        }
    );
}


function renderSidebar() {
  sidebarEl.className = `sidebar ${appState.isSidebarCollapsed ? 'collapsed' : ''}`;
  const noBikes = appState.bikes.length === 0;
  const bikeLimitReached = appState.bikes.length >= MAX_BIKES;
  const trackLimitReached = appState.tracks.length >= MAX_TRACKS;

  const verticalTitleHTML = `
    <div class="collapsed-sidebar-vertical-title">
        <span>Bikes & Tracks</span>
    </div>
  `;

  sidebarEl.innerHTML = `
    <div class="sidebar-header">
        <span class="sidebar-main-title">Bikes & Tracks</span>
        <button class="btn-icon btn-size-icon btn-collapse-sidebar" id="collapse-sidebar-btn" aria-label="${appState.isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
            <i class="fas ${appState.isSidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}"></i>
        </button>
    </div>

    ${appState.isSidebarCollapsed ? verticalTitleHTML : ''}

    ${!appState.isSidebarCollapsed ? `
      <div class="sidebar-section bike-section">
        <h2 title="Bikes Configuration">
          <i class="fas fa-motorcycle icon"></i>
          <span>Bikes (${appState.bikes.length}/${MAX_BIKES})</span>
        </h2>
        <select id="bike-select" aria-label="Select Bike" ${noBikes ? 'disabled' : ''}>
          ${noBikes ? '<option value="">No bikes available</option>' : '<option value="">-- Select Bike --</option>'}
          ${appState.bikes.map(bike => `
            <option value="${bike.id}" ${appState.selectedBikeId === bike.id ? 'selected' : ''}>
              ${bike.name}
            </option>
          `).join('')}
        </select>
        <div class="add-bike-controls">
            <input type="text" id="new-bike-name-sidebar-input" placeholder="New Bike Name" value="${appState.newBikeName}" aria-label="New bike name" ${bikeLimitReached ? 'disabled' : ''}/>
            <button class="btn-primary btn-size-sm btn-add-bike-sidebar" id="new-bike-btn-sidebar" ${bikeLimitReached ? 'disabled' : ''} title="${bikeLimitReached ? `Max ${MAX_BIKES} bikes reached` : 'Add Bike'}">
                <i class="fas fa-plus-circle icon"></i>
                <span>Add</span>
            </button>
        </div>
        <button class="btn-danger btn-size-sm btn-block" id="delete-bike-btn" ${!appState.selectedBikeId ? 'disabled' : ''}>
            <i class="fas fa-trash-alt icon"></i>
            <span>Delete Selected Bike</span>
        </button>
      </div>

      <hr class="sidebar-separator"/>

      <div class="sidebar-section track-section">
        <h2 title="Track Management">
          <i class="fas fa-list-check icon"></i>
          <span>Tracks (${appState.tracks.length}/${MAX_TRACKS})</span>
        </h2>
        <div class="add-track-controls">
            <input type="text" id="new-track-name-sidebar-input" placeholder="New Track Name" value="${appState.newTrackName}" aria-label="New track name" ${noBikes || trackLimitReached ? 'disabled' : ''}/>
            <button class="btn-primary btn-size-sm btn-add-track-sidebar" id="new-track-btn-sidebar" ${noBikes || trackLimitReached ? 'disabled' : ''} title="${noBikes ? 'Add a bike first' : trackLimitReached ? `Max ${MAX_TRACKS} tracks reached` : 'Add Track'}">
                <i class="fas fa-plus-circle icon"></i>
                <span>Add</span>
            </button>
        </div>
        ${appState.tracks.length === 0 ? '<p class="no-tracks-message">No tracks added yet. Add one above!</p>' : ''}
        <ul class="track-list" id="track-list" role="listbox" aria-label="Tracks" ${noBikes ? 'style="opacity:0.5;"' : ''}>
          ${appState.tracks.map(track => `
            <li
              class="track-list-item ${appState.selectedTrackId === track.id ? 'selected' : ''}"
              data-track-id="${track.id}"
              role="option"
              aria-selected="${appState.selectedTrackId === track.id}"
              tabindex="0"
            >
              <span class="track-list-name">${track.name}</span>
              <span class="track-condition-badge badge-${track.activeCondition.toLowerCase()}">${track.activeCondition}</span>
              <button class="btn-icon btn-size-icon btn-edit-track" data-edit-track-id="${track.id}" aria-label="Edit track ${track.name}" title="Edit ${track.name}">
                <i class="fas fa-pencil-alt"></i>
              </button>
            </li>
          `).join('')}
        </ul>
      </div>
    ` : `
      <div class="sidebar-section bike-section">
        <h2 title="Bikes Configuration">
          <i class="fas fa-motorcycle icon"></i>
          <span>Bikes (${appState.bikes.length}/${MAX_BIKES})</span>
        </h2>
      </div>
      <hr class="sidebar-separator"/>
      <div class="sidebar-section track-section">
        <h2 title="Track Management">
          <i class="fas fa-list-check icon"></i>
          <span>Tracks (${appState.tracks.length}/${MAX_TRACKS})</span>
        </h2>
      </div>
    `}
  `;

  document.getElementById('collapse-sidebar-btn')?.addEventListener('click', () => {
    appState.isSidebarCollapsed = !appState.isSidebarCollapsed;
    saveStateToLocalStorage();
    render();
  });

 if (!appState.isSidebarCollapsed) {
    document.getElementById('bike-select')?.addEventListener('change', (e) => {
        handleBikeSelectionChange((e.target as HTMLSelectElement).value || null);
    });

    const newBikeNameInputSidebar = document.getElementById('new-bike-name-sidebar-input') as HTMLInputElement;
    if (newBikeNameInputSidebar) {
        newBikeNameInputSidebar.addEventListener('input', (e) => {
            appState.newBikeName = (e.target as HTMLInputElement).value;
        });
        newBikeNameInputSidebar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('new-bike-btn-sidebar')?.click();
            }
        });
    }

    document.getElementById('new-bike-btn-sidebar')?.addEventListener('click', () => {
        if (appState.bikes.length >= MAX_BIKES) {
            showToast(`Cannot add more bikes. Maximum of ${MAX_BIKES} bikes reached.`, "error");
            return;
        }
        if (appState.newBikeName.trim()) {
            const newBike: Bike = { id: generateId(), name: appState.newBikeName.trim() };
            appState.bikes.push(newBike);
            appState.bikes = sortByName(appState.bikes);
            const newBikeId = newBike.id;
            appState.newBikeName = '';
            handleBikeSelectionChange(newBikeId);
            showToast(`Bike "${newBike.name}" added successfully.`, "success");
        } else {
            showToast('Bike name cannot be empty.', "error");
            document.getElementById('new-bike-name-sidebar-input')?.focus();
        }
    });

    document.getElementById('delete-bike-btn')?.addEventListener('click', handleDeleteBike);

    const newTrackNameInputSidebar = document.getElementById('new-track-name-sidebar-input') as HTMLInputElement;
    if (newTrackNameInputSidebar) {
        newTrackNameInputSidebar.addEventListener('input', (e) => {
            appState.newTrackName = (e.target as HTMLInputElement).value;
        });
        newTrackNameInputSidebar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('new-track-btn-sidebar')?.click();
            }
        });
    }
    document.getElementById('new-track-btn-sidebar')?.addEventListener('click', () => {
        if (noBikes) {
            showToast("Please add a bike first before adding tracks.", "error");
            return;
        }
        if (appState.tracks.length >= MAX_TRACKS) {
            showToast(`Cannot add more tracks. Maximum of ${MAX_TRACKS} tracks reached.`, "error");
            return;
        }
        const newTrackNameTrimmed = appState.newTrackName.trim();
        if (newTrackNameTrimmed) {
            const newTrack: Track = {
                id: generateId(),
                name: newTrackNameTrimmed,
                activeCondition: 'Dry',
                mapLink: undefined
            };
            appState.tracks.push(newTrack);
            appState.tracks = sortByName(appState.tracks);
            appState.newTrackName = '';
            handleTrackSelection(newTrack.id);
            showToast(`Track "${newTrack.name}" added successfully.`, "success");
        } else {
            showToast('Track name cannot be empty.', "error");
            document.getElementById('new-track-name-sidebar-input')?.focus();
        }
    });


    document.querySelectorAll('.track-list-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.btn-edit-track')) return;
            const trackId = item.getAttribute('data-track-id');
            handleTrackSelection(trackId);
        });
        item.addEventListener('keydown', (e: Event) => {
            const keyboardEvent = e as KeyboardEvent;
            if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                if ((e.target as HTMLElement).closest('.btn-edit-track')) return;
                const trackId = (e.currentTarget as HTMLLIElement).getAttribute('data-track-id');
                handleTrackSelection(trackId);
            }
        });
    });

    document.querySelectorAll('.btn-edit-track').forEach(button => {
        button.addEventListener('click', (e) => {
            const trackId = (e.currentTarget as HTMLElement).getAttribute('data-edit-track-id');
            if (trackId) {
                confirmAndProceed(
                    "editing track information (current settings might be lost if not saved)",
                    () => openEditTrackForm(trackId)
                );
            }
        });
    });
  }
}

function handleDeleteBike() {
    if (appState.selectedBikeId) {
        const bikeToDelete = appState.bikes.find(b => b.id === appState.selectedBikeId);
        if (bikeToDelete) {
            showConfirmation(
                `Delete Bike: ${bikeToDelete.name}?`,
                `Are you sure you want to permanently delete the bike "${bikeToDelete.name}" and all its associated suspension settings? This action cannot be undone.`,
                "Delete Bike",
                () => {
                    appState.showConfirmationModal = false;

                    const bikeIdToDeleteConfirm = bikeToDelete.id;

                    appState.bikes = appState.bikes.filter(b => b.id !== bikeIdToDeleteConfirm);
                    appState.settings = appState.settings.filter(s => s.bikeId !== bikeIdToDeleteConfirm);
                    appState.hasUnsavedSettingsChanges = false;
                    appState.stagedSettingsBeforeEdit = null;

                    let newSelectedBikeId: string | null = null;
                    if (appState.bikes.length > 0) {
                        newSelectedBikeId = appState.bikes[0].id;
                    }
                    appState.selectedBikeId = newSelectedBikeId;
                    appState.selectedProfileId = 1; // Reset profile

                    if (appState.selectedBikeId) {
                        const currentTrackIsValid = appState.selectedTrackId && appState.tracks.some(t => t.id === appState.selectedTrackId);
                        if (currentTrackIsValid) {
                            const track = appState.tracks.find(t => t.id === appState.selectedTrackId)!;
                            appState.currentTrackCondition = track.activeCondition;
                        } else if (appState.tracks.length > 0) {
                            appState.selectedTrackId = appState.tracks[0].id;
                            appState.currentTrackCondition = appState.tracks[0].activeCondition;
                        } else {
                            appState.selectedTrackId = null;
                            appState.currentTrackCondition = 'Dry';
                        }
                    } else {
                        appState.selectedTrackId = null;
                        appState.currentTrackCondition = 'Dry';
                    }

                    saveStateToLocalStorage();
                    render();
                    showToast(`Bike "${bikeToDelete.name}" deleted successfully.`, "success");
                },
                'destructive',
                null
            );
        }
    }
}


function handleSaveSettingsClick() {
    if (!appState.selectedBikeId || !appState.selectedTrackId) {
        showToast("Cannot save settings. No bike or track selected.", "error");
        return;
    }
    if (appState.hasUnsavedSettingsChanges) {
        // The actual setting object would have been updated by handleSuspensionAdjust or handleNotesChange
        // and should already be in appState.settings correctly keyed by profileId.
        saveStateToLocalStorage();
        appState.hasUnsavedSettingsChanges = false;
        appState.stagedSettingsBeforeEdit = null;
        showToast(`Suspension settings for Profile ${appState.selectedProfileId} saved.`, "success");
        renderContentArea(); 
    } else {
        showToast("No unsaved changes to save.", "info");
    }
}


function handleSuspensionAdjust(settingKey: keyof Omit<SuspensionSettingValues, 'notes'>, action: 'increment' | 'decrement'): boolean {
    if (!appState.selectedBikeId || !appState.selectedTrackId) return false;

    let settingObj = appState.settings.find(
        s => s.bikeId === appState.selectedBikeId &&
             s.trackId === appState.selectedTrackId &&
             s.condition === appState.currentTrackCondition &&
             s.profileId === appState.selectedProfileId
    );

    if (!settingObj) {
        settingObj = {
            bikeId: appState.selectedBikeId,
            trackId: appState.selectedTrackId,
            condition: appState.currentTrackCondition,
            profileId: appState.selectedProfileId,
            settings: { ...DEFAULT_SUSPENSION_SETTINGS },
        };
        appState.settings.push(settingObj);
    }

    if (!appState.hasUnsavedSettingsChanges) {
        appState.stagedSettingsBeforeEdit = JSON.parse(JSON.stringify(settingObj.settings));
    }

    let currentValue = settingObj.settings[settingKey] ?? (settingKey === 'forkHeight' ? 0.0 : 0);
    const maxValue = SUSPENSION_SETTING_MAX_VALUES[settingKey];
    const step = (settingKey === 'forkHeight') ? 0.1 : 1;
    let newValue: number;

    if (action === 'increment') {
        newValue = currentValue + step;
        if (maxValue !== undefined) {
            newValue = Math.min(newValue, maxValue);
        }
    } else { // action === 'decrement'
        newValue = currentValue - step;
        newValue = Math.max(0, newValue);
    }

    if (settingKey === 'forkHeight') {
        newValue = parseFloat(newValue.toFixed(1)); 
    }
    
    let noEffectiveChange = false;
    if (settingKey === 'forkHeight') {
        if (Math.abs(newValue - currentValue) < 0.001) { 
            noEffectiveChange = true;
        }
    } else {
        if (newValue === currentValue) {
            noEffectiveChange = true;
        }
    }

    if (noEffectiveChange) {
        const kebabCaseKey = settingKey.replace(/([A-Z])/g, "-$1").toLowerCase();
        const incBtn = document.getElementById(`${kebabCaseKey}-increment-btn`) as HTMLButtonElement | null;
        const decBtn = document.getElementById(`${kebabCaseKey}-decrement-btn`) as HTMLButtonElement | null;
        if (decBtn) decBtn.disabled = newValue <= 0;
        if (incBtn && maxValue !== undefined) incBtn.disabled = newValue >= maxValue;
        return false; 
    }
    
    settingObj.settings[settingKey] = newValue;

    const kebabCaseKey = settingKey.replace(/([A-Z])/g, "-$1").toLowerCase();
    const valueSpan = document.getElementById(`${kebabCaseKey}-value`);
    const labelElement = document.querySelector(`label[for="${kebabCaseKey}-value"]`);
    const labelText = labelElement ? labelElement.textContent || settingKey : settingKey;

    if (valueSpan) {
        const displayVal = (settingKey === 'forkHeight') ? newValue.toFixed(1) : String(newValue);
        valueSpan.textContent = displayVal;
        valueSpan.setAttribute('aria-label', `${labelText} current value ${displayVal}`);
    }

    const incBtn = document.getElementById(`${kebabCaseKey}-increment-btn`) as HTMLButtonElement | null;
    const decBtn = document.getElementById(`${kebabCaseKey}-decrement-btn`) as HTMLButtonElement | null;

    if (decBtn) decBtn.disabled = newValue <= 0;
    if (incBtn && maxValue !== undefined) incBtn.disabled = newValue >= maxValue;

    if (!appState.hasUnsavedSettingsChanges) {
        appState.hasUnsavedSettingsChanges = true;
    }
    const saveButton = document.getElementById('save-suspension-settings-btn') as HTMLButtonElement | null;
    if (saveButton) saveButton.disabled = false;

    return true; // Indicates a change was made
}

function handleNotesChange(event: Event) {
    if (!appState.selectedBikeId || !appState.selectedTrackId) return;
    const textarea = event.target as HTMLTextAreaElement;
    let newNotesValue = textarea.value;

    if (newNotesValue.length > MAX_NOTES_LENGTH) {
        newNotesValue = newNotesValue.substring(0, MAX_NOTES_LENGTH);
        textarea.value = newNotesValue; // Update textarea if truncated
    }

    let settingObj = appState.settings.find(
        s => s.bikeId === appState.selectedBikeId &&
             s.trackId === appState.selectedTrackId &&
             s.condition === appState.currentTrackCondition &&
             s.profileId === appState.selectedProfileId
    );

    if (!settingObj) {
        settingObj = {
            bikeId: appState.selectedBikeId,
            trackId: appState.selectedTrackId,
            condition: appState.currentTrackCondition,
            profileId: appState.selectedProfileId,
            settings: { ...DEFAULT_SUSPENSION_SETTINGS },
        };
        appState.settings.push(settingObj);
    }
    
    if (!appState.hasUnsavedSettingsChanges) {
        appState.stagedSettingsBeforeEdit = JSON.parse(JSON.stringify(settingObj.settings));
    }

    if (settingObj.settings.notes !== newNotesValue) {
        settingObj.settings.notes = newNotesValue;
        if (!appState.hasUnsavedSettingsChanges) {
            appState.hasUnsavedSettingsChanges = true;
        }
        const saveButton = document.getElementById('save-suspension-settings-btn') as HTMLButtonElement | null;
        if (saveButton) saveButton.disabled = false;
    }
    
    const charCountEl = document.getElementById('notes-char-count');
    if (charCountEl) {
        charCountEl.textContent = `${newNotesValue.length} / ${MAX_NOTES_LENGTH}`;
    }
}


function stopHoldToAdjust() {
    if (holdState.timeoutId) {
        window.clearTimeout(holdState.timeoutId);
    }
    if (holdState.repeatTimeoutId) {
        window.clearTimeout(holdState.repeatTimeoutId);
    }
    holdState.active = false;
    holdState.settingKey = null;
    holdState.action = null;
    holdState.timeoutId = null;
    holdState.repeatTimeoutId = null;
    holdState.repeatCount = 0;

    document.querySelectorAll('.btn-control-adjust.active-hold').forEach(btn => {
        btn.classList.remove('active-hold');
    });
}

function startHoldToAdjust(settingKey: keyof Omit<SuspensionSettingValues, 'notes'>, action: 'increment' | 'decrement') {
    if (holdState.active) stopHoldToAdjust();

    holdState.active = true;
    holdState.settingKey = settingKey;
    holdState.action = action;
    holdState.repeatCount = 0;

    if (!handleSuspensionAdjust(settingKey, action)) {
        stopHoldToAdjust();
        return;
    }

    const kebabCaseKey = settingKey.replace(/([A-Z])/g, "-$1").toLowerCase();
    const pressedBtn = document.getElementById(`${kebabCaseKey}-${action}-btn`);
    if (pressedBtn) pressedBtn.classList.add('active-hold');


    function scheduleNextRepeat() {
        if (!holdState.active) return;

        let interval = HOLD_REPEAT_FAST_INTERVAL;
        if (holdState.repeatCount < HOLD_SLOW_REPEATS) {
            interval = HOLD_REPEAT_SLOW_INTERVAL;
        } else if (holdState.repeatCount < HOLD_SLOW_REPEATS + HOLD_MEDIUM_REPEATS) {
            interval = HOLD_REPEAT_MEDIUM_INTERVAL;
        }

        holdState.repeatTimeoutId = window.setTimeout(() => {
            if (!holdState.active || !holdState.settingKey || !holdState.action) return;
            if (!handleSuspensionAdjust(holdState.settingKey, holdState.action)) {
                stopHoldToAdjust();
                return;
            }
            holdState.repeatCount++;
            scheduleNextRepeat();
        }, interval);
    }

    holdState.timeoutId = window.setTimeout(() => {
        scheduleNextRepeat();
    }, HOLD_INITIAL_DELAY);
}

function renderContentArea() {
    if (!appState.selectedBikeId || !appState.selectedTrackId) {
        contentAreaEl.innerHTML = `
            <div class="empty-content-placeholder">
                <i class="fas fa-info-circle"></i>
                ${!appState.selectedBikeId ? '<p>Please select or add a bike to get started.</p>' : ''}
                ${appState.selectedBikeId && !appState.selectedTrackId && appState.tracks.length > 0 ? '<p>Please select a track from the sidebar.</p>' : ''}
                ${appState.selectedBikeId && appState.tracks.length === 0 ? '<p>No tracks available. Please add a track for the selected bike using the sidebar or the menu.</p>' : ''}
            </div>
        `;
        return;
    }

    const selectedBike = appState.bikes.find(b => b.id === appState.selectedBikeId);
    const selectedTrack = appState.tracks.find(t => t.id === appState.selectedTrackId);

    if (!selectedBike || !selectedTrack) {
        contentAreaEl.innerHTML = `<p class="error-message">Error: Selected bike or track not found.</p>`;
        if (!selectedBike) appState.selectedBikeId = null;
        if (!selectedTrack) appState.selectedTrackId = null;
        return;
    }

    const currentSettingsValues = appState.settings.find(
        s => s.bikeId === appState.selectedBikeId &&
             s.trackId === appState.selectedTrackId &&
             s.condition === appState.currentTrackCondition &&
             s.profileId === appState.selectedProfileId
    )?.settings || { ...DEFAULT_SUSPENSION_SETTINGS };

    const settingFields: Array<{ key: keyof Omit<SuspensionSettingValues, 'notes'>, label: string, unit?: string, group: 'front' | 'rear' | 'tyre' | 'forkSetup' }> = [
        { key: 'frontCompression', label: 'Front Compression', group: 'front' },
        { key: 'frontRebound', label: 'Front Rebound', group: 'front' },
        { key: 'frontAirPressure', label: 'Front Air Pressure', unit: 'psi', group: 'front' },
        { key: 'rearLowSpeedCompression', label: 'Rear LS Compression', group: 'rear' },
        { key: 'rearHighSpeedCompression', label: 'Rear HS Compression', group: 'rear' },
        { key: 'rearLowSpeedRebound', label: 'Rear LS Rebound', group: 'rear' },
        { key: 'rearHighSpeedRebound', label: 'Rear HS Rebound', group: 'rear' },
        { key: 'frontTyrePressure', label: 'Front Tyre Pressure', unit: 'psi', group: 'tyre' },
        { key: 'rearTyrePressure', label: 'Rear Tyre Pressure', unit: 'psi', group: 'tyre' },
        { key: 'forkHeight', label: 'Fork Height', unit: 'mm past top clamp', group: 'forkSetup' },
    ];

    const createSettingHTML = (field: { key: keyof Omit<SuspensionSettingValues, 'notes'>, label: string, unit?: string }) => {
        let value = currentSettingsValues[field.key] ?? (field.key === 'forkHeight' ? 0.0 : 0);
        if (typeof value !== 'number') { 
            value = (field.key === 'forkHeight' ? 0.0 : 0);
        }

        const displayValue = (field.key === 'forkHeight') ? value.toFixed(1) : String(value);
        const kebabCaseKey = field.key.replace(/([A-Z])/g, "-$1").toLowerCase();
        const maxValue = SUSPENSION_SETTING_MAX_VALUES[field.key];

        const atMin = value <= 0;
        const atMax = maxValue !== undefined && value >= maxValue;

        return `
            <div class="form-item-stack form-item-spacing">
                <label for="${kebabCaseKey}-value">${field.label}${field.unit ? ` (${field.unit})` : ''}</label>
                <div class="suspension-setting-interactive-area">
                    <div class="suspension-buttons">
                        <button class="btn-control-adjust" id="${kebabCaseKey}-decrement-btn" data-setting="${field.key}" data-action="decrement" aria-label="Decrease ${field.label}" title="Decrease" ${atMin ? 'disabled' : ''}>
                            <i class="fas fa-minus"></i>
                        </button>
                    </div>
                    <span id="${kebabCaseKey}-value" class="suspension-value" role="status" aria-live="polite" aria-atomic="true" tabindex="0" aria-label="${field.label} current value ${displayValue}">${displayValue}</span>
                    <div class="suspension-buttons">
                        <button class="btn-control-adjust" id="${kebabCaseKey}-increment-btn" data-setting="${field.key}" data-action="increment" aria-label="Increase ${field.label}" title="Increase" ${atMax ? 'disabled' : ''}>
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    };

    const frontFields = settingFields.filter(f => f.group === 'front');
    const rearFields = settingFields.filter(f => f.group === 'rear');
    const tyreFields = settingFields.filter(f => f.group === 'tyre');
    const forkSetupFields = settingFields.filter(f => f.group === 'forkSetup');


    const importableSettingsExist = appState.settings.some(s =>
        s.bikeId === appState.selectedBikeId &&
        (s.trackId !== appState.selectedTrackId || s.condition !== appState.currentTrackCondition || s.profileId !== appState.selectedProfileId) 
    );
    const isImportSetupBtnDisabled = !appState.selectedBikeId || !appState.selectedTrackId || !importableSettingsExist;

    const profileButtonsHTML = ([1, 2, 3] as Array<1 | 2 | 3>).map(pid => `
        <button 
            class="btn-profile-selector ${pid === appState.selectedProfileId ? 'active' : ''}" 
            data-profile-id="${pid}" 
            aria-label="Select Profile ${pid}" 
            title="Switch to Profile ${pid}"
            aria-pressed="${pid === appState.selectedProfileId}"
        >
            ${pid}
        </button>
    `).join('');
    
    const notesValue = currentSettingsValues.notes || '';


    contentAreaEl.innerHTML = `
        <div class="track-info-bar" id="track-info-bar">
            <a href="${selectedTrack.mapLink || '#'}" target="_blank" rel="noopener noreferrer" class="btn-link view-map-link" id="view-map-link" style="${selectedTrack.mapLink ? '' : 'opacity:0.5; pointer-events:none;'}" title="${selectedTrack.mapLink ? 'View map in new tab' : 'No map link provided'}">
                <i class="fas fa-map-marked-alt icon"></i> ${selectedTrack.mapLink ? 'View Map' : 'No Map Link'}
            </a>
            <h2 class="track-name-display" id="track-name-display" title="${selectedTrack.name}">${selectedTrack.name}</h2>
            <div class="track-condition-radio-group" role="radiogroup" aria-labelledby="track-condition-label">
                <span id="track-condition-label" class="track-condition-explicit-label">Condition:</span>
                <label class="custom-radio-label">
                    <input type="radio" name="track-condition" value="Dry" class="custom-radio-input" id="condition-dry" ${appState.currentTrackCondition === 'Dry' ? 'checked' : ''} ${!appState.selectedTrackId ? 'disabled' : ''}>
                    <span>Dry</span>
                </label>
                <label class="custom-radio-label">
                    <input type="radio" name="track-condition" value="Wet" class="custom-radio-input" id="condition-wet" ${appState.currentTrackCondition === 'Wet' ? 'checked' : ''} ${!appState.selectedTrackId ? 'disabled' : ''}>
                    <span>Wet</span>
                </label>
            </div>
        </div>

        <div class="suspension-settings-container">
            <div class="settings-title-container">
                <div class="profile-selector-group" role="group" aria-label="Suspension Profiles">
                    ${profileButtonsHTML}
                </div>
                <h3 class="settings-title">
                    <i class="fas fa-sliders-h icon"></i>
                    <span>Settings Profile ${appState.selectedProfileId} for ${selectedBike.name}</span>
                </h3>
                <button id="import-setup-btn" class="btn-secondary btn-size-sm" ${isImportSetupBtnDisabled ? 'disabled' : ''} title="${isImportSetupBtnDisabled ? 'No other settings available to import for this bike' : 'Import settings from another track/condition/profile for this bike'}">
                    <i class="fas fa-file-import icon"></i> Import Setup
                </button>
            </div>
            <p class="settings-value-description">Note: Settings are measured in clicks/quarter-turns out from fully closed (firmest/slowest).</p>
            <div class="suspension-form-grid">
                <div class="suspension-column">
                    <h3>Front Suspension</h3>
                    ${frontFields.map(createSettingHTML).join('')}
                </div>
                <div class="suspension-column">
                    <h3>Rear Suspension</h3>
                    ${rearFields.map(createSettingHTML).join('')}
                </div>
            </div>
        </div>

        <div class="settings-detail-grid">
            <div class="tyre-pressures-section">
                 <h3 class="settings-title">
                    <i class="fas fa-tachometer-alt icon"></i>
                    <span>Tyre Pressures for ${selectedBike.name}</span>
                </h3>
                 <div class="tyre-pressure-inputs-container">
                    ${tyreFields.map(createSettingHTML).join('')}
                </div>
            </div>

            <div class="fork-setup-section">
                 <h3 class="settings-title">
                    <i class="fas fa-ruler-vertical icon"></i>
                    <span>Fork Height Setup for ${selectedBike.name}</span>
                </h3>
                 <div class="fork-setup-inputs-container">
                    ${forkSetupFields.map(createSettingHTML).join('')}
                </div>
            </div>
        </div>

        <div class="notes-section">
            <h3 class="settings-title">
                <i class="fas fa-sticky-note icon"></i>
                <span>Notes for ${selectedBike.name}</span>
            </h3>
            <textarea id="notes-textarea" class="notes-textarea" maxlength="${MAX_NOTES_LENGTH}" placeholder="Add any relevant notes here (max ${MAX_NOTES_LENGTH} characters)..." aria-label="Notes for ${selectedBike.name}, Profile ${appState.selectedProfileId}">${notesValue}</textarea>
            <div class="notes-char-counter-container">
                <span id="notes-char-count" class="notes-char-count">${notesValue.length} / ${MAX_NOTES_LENGTH}</span>
            </div>
        </div>


        <div class="save-settings-action-bar">
            <button id="save-suspension-settings-btn" class="btn-primary btn-size-default" ${!appState.hasUnsavedSettingsChanges ? 'disabled' : ''}>
                <i class="fas fa-save icon"></i> Save Profile ${appState.selectedProfileId} Settings
            </button>
            <div class="gizmox-footer-text">&copy;GizMX Racing Development</div>
        </div>
    `;
    
    document.querySelectorAll('.btn-profile-selector').forEach(button => {
        button.addEventListener('click', (e) => {
            const profileId = parseInt((e.currentTarget as HTMLElement).dataset.profileId || '1', 10) as 1 | 2 | 3;
            handleProfileSelection(profileId);
        });
    });

    document.getElementById('import-setup-btn')?.addEventListener('click', handleOpenImportSetupModalClick);

    document.querySelectorAll('input[name="track-condition"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const newCondition = (e.target as HTMLInputElement).value as 'Dry' | 'Wet';
            if (newCondition === appState.currentTrackCondition) return;

            confirmAndProceed(
                `changing track condition to ${newCondition} (current settings might be lost if not saved)`,
                () => {
                    appState.currentTrackCondition = newCondition;
                    const trackToUpdate = appState.tracks.find(t => t.id === appState.selectedTrackId);
                    if (trackToUpdate) {
                        trackToUpdate.activeCondition = newCondition;
                    }
                    appState.hasUnsavedSettingsChanges = false;
                    appState.stagedSettingsBeforeEdit = null;
                    appState.selectedProfileId = 1; // Reset profile on condition change
                    saveStateToLocalStorage();
                    render();
                }
            );
        });
    });

    document.getElementById('save-suspension-settings-btn')?.addEventListener('click', handleSaveSettingsClick);

    settingFields.forEach(field => {
        const kebabCaseKey = field.key.replace(/([A-Z])/g, "-$1").toLowerCase();
        const incBtn = document.getElementById(`${kebabCaseKey}-increment-btn`);
        const decBtn = document.getElementById(`${kebabCaseKey}-decrement-btn`);

        const handleMouseDown = (action: 'increment' | 'decrement') => {
            startHoldToAdjust(field.key, action);
        };
        const handleMouseUpOrLeave = () => {
            stopHoldToAdjust();
        };

        incBtn?.addEventListener('mousedown', () => handleMouseDown('increment'));
        incBtn?.addEventListener('mouseup', handleMouseUpOrLeave);
        incBtn?.addEventListener('mouseleave', handleMouseUpOrLeave);
        decBtn?.addEventListener('mousedown', () => handleMouseDown('decrement'));
        decBtn?.addEventListener('mouseup', handleMouseUpOrLeave);
        decBtn?.addEventListener('mouseleave', handleMouseUpOrLeave);

        incBtn?.addEventListener('touchstart', (e) => { e.preventDefault(); handleMouseDown('increment'); }, { passive: false });
        incBtn?.addEventListener('touchend', handleMouseUpOrLeave);
        incBtn?.addEventListener('touchcancel', handleMouseUpOrLeave);
        decBtn?.addEventListener('touchstart', (e) => { e.preventDefault(); handleMouseDown('decrement'); }, { passive: false });
        decBtn?.addEventListener('touchend', handleMouseUpOrLeave);
        decBtn?.addEventListener('touchcancel', handleMouseUpOrLeave);

        incBtn?.addEventListener('contextmenu', e => e.preventDefault());
        decBtn?.addEventListener('contextmenu', e => e.preventDefault());
    });
    
    const notesTextarea = document.getElementById('notes-textarea') as HTMLTextAreaElement;
    if (notesTextarea) {
        notesTextarea.addEventListener('input', handleNotesChange);
    }
}

function updateImportSetupModalStatus() {
    if (!appState.showImportSetupModal || !appState.selectedBikeId || !appState.importSourceTrackId) {
        appState.isImportSetupActionable = false;
        appState.importSetupModalInfoMessage = 'Please select a source track.';
        return;
    }

    const sourceSettingExists = appState.settings.some(s =>
        s.bikeId === appState.selectedBikeId &&
        s.trackId === appState.importSourceTrackId &&
        s.condition === appState.importSourceCondition &&
        s.profileId === appState.importSourceProfileId
    );

    if (sourceSettingExists) {
        appState.isImportSetupActionable = true;
        appState.importSetupModalInfoMessage = `Settings available for Profile ${appState.importSourceProfileId}.`;
    } else {
        appState.isImportSetupActionable = false;
        appState.importSetupModalInfoMessage = `No settings found for this bike, track, condition, and Profile ${appState.importSourceProfileId}.`;
    }
}


function handleOpenImportSetupModalClick() {
    if (!appState.selectedBikeId || !appState.selectedTrackId) {
        showToast("Cannot import: Bike or track not selected.", "error");
        return;
    }

    const importableSettingsExist = appState.settings.some(s =>
        s.bikeId === appState.selectedBikeId &&
        (s.trackId !== appState.selectedTrackId || s.condition !== appState.currentTrackCondition || s.profileId !== appState.selectedProfileId)
    );

    if (!importableSettingsExist) {
        showToast("No other settings available to import for this bike.", "info");
        return;
    }

    const openModalAction = () => {
        const possibleSources = appState.settings.filter(s =>
            s.bikeId === appState.selectedBikeId! &&
            (s.trackId !== appState.selectedTrackId! || s.condition !== appState.currentTrackCondition || s.profileId !== appState.selectedProfileId )
        );

        if (possibleSources.length > 0) {
            appState.importSourceTrackId = possibleSources[0].trackId;
            appState.importSourceCondition = possibleSources[0].condition;
            appState.importSourceProfileId = possibleSources[0].profileId;
        } else {
            appState.importSourceTrackId = appState.tracks.length > 0 ? appState.tracks[0].id : null;
            appState.importSourceCondition = 'Dry';
            appState.importSourceProfileId = 1;
        }
        
        appState.showImportSetupModal = true;
        updateImportSetupModalStatus(); 
        renderModals();
    };

    if (appState.hasUnsavedSettingsChanges) {
        confirmAndProceed(
            "importing new settings (current unsaved settings on this page will be affected if you proceed without saving)",
            openModalAction
        );
    } else {
        openModalAction();
    }
}

function handleConfirmImportSetup() {
    if (!appState.selectedBikeId || !appState.selectedTrackId || !appState.importSourceTrackId) {
        showToast("Error: Missing bike or track selection for import.", "error");
        return;
    }

    const sourceSettingObj = appState.settings.find(s =>
        s.bikeId === appState.selectedBikeId &&
        s.trackId === appState.importSourceTrackId &&
        s.condition === appState.importSourceCondition &&
        s.profileId === appState.importSourceProfileId
    );

    if (!sourceSettingObj) {
        showToast(`Error: Source settings for Profile ${appState.importSourceProfileId} not found. Cannot import.`, "error");
        return;
    }

    let targetSettingObj = appState.settings.find(
        s => s.bikeId === appState.selectedBikeId &&
             s.trackId === appState.selectedTrackId &&
             s.condition === appState.currentTrackCondition &&
             s.profileId === appState.selectedProfileId 
    );

    const currentTargetSettingsValues = targetSettingObj
        ? targetSettingObj.settings
        : { ...DEFAULT_SUSPENSION_SETTINGS };

    if (!appState.hasUnsavedSettingsChanges) { // Stage before overwriting if no changes exist yet for current target
        appState.stagedSettingsBeforeEdit = JSON.parse(JSON.stringify(currentTargetSettingsValues));
    }

    if (!targetSettingObj) {
        targetSettingObj = {
            bikeId: appState.selectedBikeId,
            trackId: appState.selectedTrackId,
            condition: appState.currentTrackCondition,
            profileId: appState.selectedProfileId,
            settings: JSON.parse(JSON.stringify(sourceSettingObj.settings))
        };
        appState.settings.push(targetSettingObj);
    } else {
        targetSettingObj.settings = JSON.parse(JSON.stringify(sourceSettingObj.settings));
    }

    appState.hasUnsavedSettingsChanges = true;
    closeImportSetupModal();

    const sourceTrack = appState.tracks.find(t => t.id === appState.importSourceTrackId);
    showToast(`Settings from ${sourceTrack?.name || 'selected track'} (${appState.importSourceCondition}, P${appState.importSourceProfileId}) imported to current Profile ${appState.selectedProfileId}. Don't forget to save.`, "success", 6000);

    render();
}


function renderModals() {
    let modalsHTML = '';

    if (appState.showNewBikeModal) {
        modalsHTML += `
            <div id="new-bike-modal" class="modal modal-opening" role="dialog" aria-modal="true" aria-labelledby="new-bike-modal-title">
              <div class="modal-content-wrapper">
                <div class="modal-content">
                    <button class="modal-close-button" id="close-new-bike-modal-btn" aria-label="Close dialog">
                        <i class="fas fa-times"></i>
                    </button>
                    <h2 id="new-bike-modal-title"><i class="fas fa-motorcycle icon"></i> Add New Bike</h2>
                    <p class="modal-subtitle">Enter the name for your new bike.</p>
                    <div class="form-item-stack form-item-spacing">
                        <label for="new-bike-name-modal-input">Bike Name</label>
                        <input type="text" id="new-bike-name-modal-input" placeholder="e.g., Yamaha YZ250F 2023" value="${appState.newBikeName}" maxlength="50">
                    </div>
                    <div class="modal-buttons">
                        <button class="btn-outline btn-size-default modal-cancel-button" id="cancel-new-bike-modal-btn">Cancel</button>
                        <button class="btn-primary btn-size-default" id="save-new-bike-modal-btn">Add Bike</button>
                    </div>
                </div>
              </div>
            </div>
        `;
    }
    if (appState.showNewTrackModal) {
         modalsHTML += `
            <div id="new-track-modal" class="modal modal-opening" role="dialog" aria-modal="true" aria-labelledby="new-track-modal-title">
              <div class="modal-content-wrapper">
                <div class="modal-content">
                    <button class="modal-close-button" id="close-new-track-modal-btn" aria-label="Close dialog">
                        <i class="fas fa-times"></i>
                    </button>
                    <h2 id="new-track-modal-title"><i class="fas fa-road icon"></i> Add New Track</h2>
                    <p class="modal-subtitle">Enter the details for the new track.</p>
                    <div class="form-item-stack form-item-spacing">
                        <label for="new-track-name-modal-input">Track Name</label>
                        <input type="text" id="new-track-name-modal-input" placeholder="e.g., Glen Helen Raceway" value="${appState.newTrackName}" maxlength="50">
                    </div>
                    <div class="form-item-stack form-item-spacing">
                        <label for="new-track-map-link-modal-input">Map Link (Optional)</label>
                        <input type="url" id="new-track-map-link-modal-input" placeholder="e.g., https://maps.google.com/?q=GlenHelen" value="${appState.newTrackMapLink}">
                        <small id="new-track-map-link-error" class="input-error-message hidden" style="color: var(--destructive); font-size: 0.8rem; margin-top: 4px;">Invalid URL format.</small>
                    </div>
                    <div class="modal-buttons">
                        <button class="btn-outline btn-size-default modal-cancel-button" id="cancel-new-track-modal-btn">Cancel</button>
                        <button class="btn-primary btn-size-default" id="save-new-track-modal-btn">Add Track</button>
                    </div>
                </div>
              </div>
            </div>
        `;
    }
     if (appState.showEditTrackModal && appState.editingTrackId) {
        const trackBeingEdited = appState.tracks.find(t => t.id === appState.editingTrackId);
        modalsHTML += `
            <div id="edit-track-modal" class="modal modal-opening" role="dialog" aria-modal="true" aria-labelledby="edit-track-modal-title">
              <div class="modal-content-wrapper">
                <div class="modal-content">
                    <button class="modal-close-button" id="close-edit-track-modal-btn" aria-label="Close dialog">
                        <i class="fas fa-times"></i>
                    </button>
                    <h2 id="edit-track-modal-title"><i class="fas fa-edit icon"></i> Edit Track</h2>
                     <p class="modal-subtitle">Update the details for "${trackBeingEdited?.name || 'Selected Track'}".</p>
                    <div class="form-item-stack form-item-spacing">
                        <label for="edit-track-name-modal-input">Track Name</label>
                        <input type="text" id="edit-track-name-modal-input" value="${appState.editTrackName}" maxlength="50">
                    </div>
                    <div class="form-item-stack form-item-spacing">
                        <label for="edit-track-map-link-modal-input">Map Link (Optional)</label>
                        <input type="url" id="edit-track-map-link-modal-input" value="${appState.editTrackMapLink}">
                        <small id="edit-track-map-link-error" class="input-error-message hidden" style="color: var(--destructive); font-size: 0.8rem; margin-top: 4px;">Invalid URL format.</small>
                    </div>
                    <div class="edit-modal-buttons">
                        <button class="btn-danger btn-size-default" id="delete-track-modal-btn">
                            <i class="fas fa-trash-alt icon"></i> Delete Track
                        </button>
                        <div class="modal-buttons-right">
                            <button class="btn-outline btn-size-default modal-cancel-button" id="cancel-edit-track-modal-btn">Cancel</button>
                            <button class="btn-primary btn-size-default" id="save-edit-track-modal-btn">Save Changes</button>
                        </div>
                    </div>
                </div>
              </div>
            </div>
        `;
    }

    if (appState.showImportSetupModal && appState.selectedBikeId) {
        const selectedBike = appState.bikes.find(b => b.id === appState.selectedBikeId);
        const profileRadiosHTML = ([1, 2, 3] as Array<1 | 2 | 3>).map(pid => `
            <label class="custom-radio-label">
                <input type="radio" name="import-source-profile" value="${pid}" class="custom-radio-input" ${appState.importSourceProfileId === pid ? 'checked' : ''}>
                <span>P${pid}</span>
            </label>
        `).join('');

        modalsHTML += `
            <div id="import-setup-modal" class="modal modal-opening" role="dialog" aria-modal="true" aria-labelledby="import-setup-modal-title">
              <div class="modal-content-wrapper">
                <div class="modal-content">
                    <button class="modal-close-button" id="close-import-setup-modal-btn" aria-label="Close dialog">
                        <i class="fas fa-times"></i>
                    </button>
                    <h2 id="import-setup-modal-title"><i class="fas fa-file-import icon"></i> Import Suspension Setup</h2>
                    <p class="modal-subtitle">Import settings for <strong>${selectedBike?.name || 'current bike'}</strong> from another saved track/condition/profile.</p>

                    <div class="form-item-stack form-item-spacing">
                        <label for="import-source-track-select">Source Track</label>
                        <select id="import-source-track-select" ${appState.tracks.length === 0 ? 'disabled' : ''}>
                            ${appState.tracks.length === 0 ? '<option value="">No tracks available</option>' :
                                appState.tracks.map(track => `
                                    <option value="${track.id}" ${appState.importSourceTrackId === track.id ? 'selected' : ''}>
                                        ${track.name}
                                    </option>
                                `).join('')
                            }
                        </select>
                    </div>

                    <div class="form-item-stack form-item-spacing" role="radiogroup" aria-labelledby="import-source-condition-label">
                        <span id="import-source-condition-label" class="modal-label">Source Condition</span>
                        <div class="modal-radio-group">
                            <label class="custom-radio-label">
                                <input type="radio" name="import-source-condition" value="Dry" class="custom-radio-input" ${appState.importSourceCondition === 'Dry' ? 'checked' : ''}>
                                <span>Dry</span>
                            </label>
                            <label class="custom-radio-label">
                                <input type="radio" name="import-source-condition" value="Wet" class="custom-radio-input" ${appState.importSourceCondition === 'Wet' ? 'checked' : ''}>
                                <span>Wet</span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="form-item-stack form-item-spacing" role="radiogroup" aria-labelledby="import-source-profile-label">
                        <span id="import-source-profile-label" class="modal-label">Source Profile</span>
                        <div class="modal-radio-group">
                            ${profileRadiosHTML}
                        </div>
                    </div>


                    <p class="modal-info-message" id="import-setup-modal-info-text" aria-live="polite">${appState.importSetupModalInfoMessage}</p>

                    <div class="modal-buttons">
                        <button class="btn-outline btn-size-default modal-cancel-button" id="cancel-import-setup-modal-btn">Cancel</button>
                        <button class="btn-primary btn-size-default" id="confirm-import-setup-btn" ${!appState.isImportSetupActionable ? 'disabled' : ''}>
                            <i class="fas fa-check icon"></i> Import
                        </button>
                    </div>
                </div>
              </div>
            </div>
        `;
    }


    if (appState.showConfirmationModal) {
        modalsHTML += `
            <div id="confirmation-modal" class="modal modal-opening" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-modal-title-text" aria-describedby="confirmation-modal-description-text">
              <div class="modal-content-wrapper">
                <div class="modal-content confirmation-modal-content ${appState.confirmationModalVariant === 'destructive' ? 'variant-destructive' : ''}">
                    <div class="confirmation-modal-header">
                        <h2 id="confirmation-modal-title-text" class="confirmation-modal-title">${appState.confirmationModalTitle}</h2>
                    </div>
                    <p id="confirmation-modal-description-text" class="confirmation-modal-description">${appState.confirmationModalDescription}</p>
                    <div class="modal-buttons confirmation-modal-footer">
                        <button class="btn-outline btn-size-default modal-cancel-button" id="confirmation-modal-true-cancel-btn">Cancel</button>
                         <div class="modal-buttons-right">
                            ${appState.confirmationModalOnDiscard ? `
                                <button class="${appState.confirmationModalVariant === 'destructive' ? 'btn-secondary' : 'btn-secondary'} btn-size-default" id="confirmation-modal-discard-btn">
                                    ${appState.confirmationModalDiscardText}
                                </button>
                            ` : ''}
                            <button class="${appState.confirmationModalVariant === 'destructive' ? 'btn-danger' : 'btn-primary'} btn-size-default" id="confirmation-modal-confirm-btn">
                                ${appState.confirmationModalConfirmText}
                            </button>
                        </div>
                    </div>
                </div>
              </div>
            </div>
        `;
    }

    modalContainerEl.innerHTML = modalsHTML;

    const handleModalKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (appState.showNewBikeModal) closeNewBikeModal();
            else if (appState.showNewTrackModal) closeNewTrackModal();
            else if (appState.showEditTrackModal) closeEditTrackModal();
            else if (appState.showImportSetupModal) closeImportSetupModal();
            else if (appState.showConfirmationModal) closeConfirmationModalPopup('cancel-true');
        }
    };

    const activeModal = document.querySelector('.modal.modal-opening');
    if (activeModal) {
        const focusableElements = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const firstFocusable = activeModal.querySelector(focusableElements) as HTMLElement;
        firstFocusable?.focus();
        activeModal.addEventListener('keydown', handleModalKeydown as EventListener);
    }


    if (appState.showNewBikeModal) {
        document.getElementById('close-new-bike-modal-btn')?.addEventListener('click', closeNewBikeModal);
        document.getElementById('cancel-new-bike-modal-btn')?.addEventListener('click', closeNewBikeModal);
        const newBikeNameInput = document.getElementById('new-bike-name-modal-input') as HTMLInputElement;
        if (newBikeNameInput) {
            newBikeNameInput.addEventListener('input', e => appState.newBikeName = (e.target as HTMLInputElement).value);
            newBikeNameInput.addEventListener('keypress', e => {
                if (e.key === 'Enter') document.getElementById('save-new-bike-modal-btn')?.click();
            });
        }
        document.getElementById('save-new-bike-modal-btn')?.addEventListener('click', () => {
            if (appState.bikes.length >= MAX_BIKES) {
                showToast(`Cannot add more bikes. Maximum of ${MAX_BIKES} bikes reached.`, "error");
                return;
            }
            if (appState.newBikeName.trim()) {
                const newBike: Bike = { id: generateId(), name: appState.newBikeName.trim() };
                appState.bikes.push(newBike);
                appState.bikes = sortByName(appState.bikes);
                const newBikeId = newBike.id;
                appState.newBikeName = '';
                closeNewBikeModal();
                appState.hasUnsavedSettingsChanges = false;
                appState.stagedSettingsBeforeEdit = null;
                handleBikeSelectionChange(newBikeId);
                showToast(`Bike "${newBike.name}" added successfully.`, "success");
            } else {
                showToast('Bike name cannot be empty.', "error");
                newBikeNameInput?.focus();
            }
        });
    }
    if (appState.showNewTrackModal) {
        document.getElementById('close-new-track-modal-btn')?.addEventListener('click', closeNewTrackModal);
        document.getElementById('cancel-new-track-modal-btn')?.addEventListener('click', closeNewTrackModal);
        const newTrackNameInput = document.getElementById('new-track-name-modal-input') as HTMLInputElement;
        const newTrackMapLinkInput = document.getElementById('new-track-map-link-modal-input') as HTMLInputElement;
        const newTrackMapLinkError = document.getElementById('new-track-map-link-error') as HTMLElement;

        newTrackNameInput?.addEventListener('input', e => appState.newTrackName = (e.target as HTMLInputElement).value);
        newTrackMapLinkInput?.addEventListener('input', e => {
            appState.newTrackMapLink = (e.target as HTMLInputElement).value;
            if (!isValidURL(appState.newTrackMapLink)) {
                newTrackMapLinkError.classList.remove('hidden');
                newTrackMapLinkInput.setAttribute('aria-invalid', 'true');
            } else {
                newTrackMapLinkError.classList.add('hidden');
                newTrackMapLinkInput.removeAttribute('aria-invalid');
            }
        });
        const handleNewTrackEnter = (e: KeyboardEvent) => {
            if (e.key === 'Enter') document.getElementById('save-new-track-modal-btn')?.click();
        };
        newTrackNameInput?.addEventListener('keypress', handleNewTrackEnter);
        newTrackMapLinkInput?.addEventListener('keypress', handleNewTrackEnter);


        document.getElementById('save-new-track-modal-btn')?.addEventListener('click', () => {
            if (appState.tracks.length >= MAX_TRACKS) {
                showToast(`Cannot add more tracks. Maximum of ${MAX_TRACKS} tracks reached.`, "error");
                return;
            }
            if (!isValidURL(appState.newTrackMapLink)) {
                showToast('Map link is not a valid URL.', "error");
                newTrackMapLinkError.classList.remove('hidden');
                newTrackMapLinkInput?.focus();
                return;
            }
            if (appState.newTrackName.trim()) {
                const newTrack: Track = {
                    id: generateId(),
                    name: appState.newTrackName.trim(),
                    mapLink: appState.newTrackMapLink.trim() || undefined,
                    activeCondition: 'Dry'
                };
                appState.tracks.push(newTrack);
                appState.tracks = sortByName(appState.tracks);
                const newTrackId = newTrack.id;
                appState.newTrackName = '';
                appState.newTrackMapLink = '';
                closeNewTrackModal();
                appState.hasUnsavedSettingsChanges = false;
                appState.stagedSettingsBeforeEdit = null;
                handleTrackSelection(newTrackId);
                showToast(`Track "${newTrack.name}" added successfully.`, "success");
            } else {
                showToast('Track name cannot be empty.', "error");
                newTrackNameInput?.focus();
            }
        });
    }
    if (appState.showEditTrackModal && appState.editingTrackId) {
        document.getElementById('close-edit-track-modal-btn')?.addEventListener('click', closeEditTrackModal);
        document.getElementById('cancel-edit-track-modal-btn')?.addEventListener('click', closeEditTrackModal);
        const editTrackNameInput = document.getElementById('edit-track-name-modal-input') as HTMLInputElement;
        const editTrackMapLinkInput = document.getElementById('edit-track-map-link-modal-input') as HTMLInputElement;
        const editTrackMapLinkError = document.getElementById('edit-track-map-link-error') as HTMLElement;

        editTrackNameInput?.addEventListener('input', e => appState.editTrackName = (e.target as HTMLInputElement).value);
        editTrackMapLinkInput?.addEventListener('input', e => {
            appState.editTrackMapLink = (e.target as HTMLInputElement).value;
            if (!isValidURL(appState.editTrackMapLink)) {
                editTrackMapLinkError.classList.remove('hidden');
                editTrackMapLinkInput.setAttribute('aria-invalid', 'true');
            } else {
                editTrackMapLinkError.classList.add('hidden');
                editTrackMapLinkInput.removeAttribute('aria-invalid');
            }
        });

        document.getElementById('save-edit-track-modal-btn')?.addEventListener('click', () => {
            if (!isValidURL(appState.editTrackMapLink)) {
                showToast('Map link is not a valid URL.', "error");
                editTrackMapLinkError.classList.remove('hidden');
                editTrackMapLinkInput?.focus();
                return;
            }
            if (appState.editTrackName.trim() && appState.editingTrackId) {
                const trackIndex = appState.tracks.findIndex(t => t.id === appState.editingTrackId);
                if (trackIndex !== -1) {
                    appState.tracks[trackIndex].name = appState.editTrackName.trim();
                    appState.tracks[trackIndex].mapLink = appState.editTrackMapLink.trim() || undefined;
                    appState.tracks = sortByName(appState.tracks);
                    showToast(`Track "${appState.tracks[trackIndex].name}" updated.`, "success");
                }
                closeEditTrackModal();
                saveStateToLocalStorage();
                render();
            } else {
                showToast('Track name cannot be empty.', "error");
                editTrackNameInput?.focus();
            }
        });

        document.getElementById('delete-track-modal-btn')?.addEventListener('click', () => {
            if (appState.editingTrackId) {
                const trackToDelete = appState.tracks.find(t => t.id === appState.editingTrackId);
                if (trackToDelete) {
                    showConfirmation(
                        `Delete Track: ${trackToDelete.name}?`,
                        `Are you sure you want to permanently delete the track "${trackToDelete.name}" and all its associated suspension settings? This action cannot be undone.`,
                        "Delete Track",
                        () => {
                            appState.showConfirmationModal = false;
                            appState.showEditTrackModal = false;

                            const trackIdToDeleteConfirm = trackToDelete.id;
                            appState.tracks = appState.tracks.filter(t => t.id !== trackIdToDeleteConfirm);
                            appState.settings = appState.settings.filter(s => s.trackId !== trackIdToDeleteConfirm);
                            appState.hasUnsavedSettingsChanges = false;
                            appState.stagedSettingsBeforeEdit = null;

                            if (appState.selectedTrackId === trackIdToDeleteConfirm) {
                                let newSelectedTrackId: string | null = null;
                                if (appState.tracks.length > 0) {
                                    newSelectedTrackId = appState.tracks[0].id;
                                    appState.currentTrackCondition = appState.tracks[0].activeCondition;
                                } else {
                                    appState.currentTrackCondition = 'Dry';
                                }
                                appState.selectedTrackId = newSelectedTrackId;
                                appState.selectedProfileId = 1; // Reset profile
                            }

                            saveStateToLocalStorage();
                            render();
                            showToast(`Track "${trackToDelete.name}" deleted.`, "success");
                        },
                        'destructive',
                        null
                    );
                }
            }
        });
    }

    if (appState.showImportSetupModal) {
        document.getElementById('close-import-setup-modal-btn')?.addEventListener('click', closeImportSetupModal);
        document.getElementById('cancel-import-setup-modal-btn')?.addEventListener('click', closeImportSetupModal);
        document.getElementById('confirm-import-setup-btn')?.addEventListener('click', handleConfirmImportSetup);

        const sourceTrackSelect = document.getElementById('import-source-track-select') as HTMLSelectElement;
        sourceTrackSelect?.addEventListener('change', (e) => {
            appState.importSourceTrackId = (e.target as HTMLSelectElement).value;
            updateImportSetupModalStatus();
            renderModals(); 
        });

        document.querySelectorAll('input[name="import-source-condition"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                appState.importSourceCondition = (e.target as HTMLInputElement).value as 'Dry' | 'Wet';
                updateImportSetupModalStatus();
                renderModals();
            });
        });
        document.querySelectorAll('input[name="import-source-profile"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                appState.importSourceProfileId = parseInt((e.target as HTMLInputElement).value, 10) as 1 | 2 | 3;
                updateImportSetupModalStatus();
                renderModals();
            });
        });
    }


    if (appState.showConfirmationModal) {
        document.getElementById('confirmation-modal-confirm-btn')?.addEventListener('click', () => {
            if (appState.confirmationModalOnConfirm) {
                appState.confirmationModalOnConfirm();
            }
        });
        document.getElementById('confirmation-modal-discard-btn')?.addEventListener('click', () => {
             if (appState.confirmationModalOnDiscard) {
                appState.confirmationModalOnDiscard();
            }
        });
        document.getElementById('confirmation-modal-true-cancel-btn')?.addEventListener('click', () => {
            closeConfirmationModalPopup('cancel-true');
        });
    }
}

function renderHeaderActionsMenu() {
    const menuId = 'app-actions-menu-content-el';
    const triggerId = 'app-actions-menu-trigger';

    let menuContentHTML = '';
    if (appState.isAppActionsMenuOpen) {
        menuContentHTML = `
            <div class="app-actions-menu-content open" id="${menuId}" role="menu" aria-labelledby="${triggerId}">
                <button role="menuitem" class="app-actions-menu-item" id="app-action-new-bike" ${appState.bikes.length >= MAX_BIKES ? 'disabled aria-disabled="true"' : ''} title="${appState.bikes.length >= MAX_BIKES ? `Max ${MAX_BIKES} bikes reached` : 'Add a new bike profile'}">
                    <i class="fas fa-plus-circle icon"></i> New Bike
                </button>
                <button role="menuitem" class="app-actions-menu-item" id="app-action-new-track" ${appState.bikes.length === 0 || appState.tracks.length >= MAX_TRACKS ? 'disabled aria-disabled="true"' : ''} title="${appState.bikes.length === 0 ? 'Add a bike first' : appState.tracks.length >= MAX_TRACKS ? `Max ${MAX_TRACKS} tracks reached` : 'Add a new track'}">
                    <i class="fas fa-map-marked-alt icon"></i> New Track
                </button>
                <div class="app-actions-menu-separator"></div>
                <button role="menuitem" class="app-actions-menu-item" id="app-action-import">
                    <i class="fas fa-file-import icon"></i> Import Data
                </button>
                <button role="menuitem" class="app-actions-menu-item" id="app-action-export">
                    <i class="fas fa-file-export icon"></i> Export Data
                </button>
                <div class="app-actions-menu-separator"></div>
                <button role="menuitem" class="app-actions-menu-item destructive" id="app-action-reset">
                    <i class="fas fa-trash-restore icon"></i> Reset Application
                </button>
            </div>
        `;
    }

    headerActionsContainerEl.innerHTML = `
        <button class="theme-toggle-btn btn-icon btn-size-icon" id="theme-toggle-btn" aria-label="Toggle theme" title="Toggle ${appState.currentTheme === 'dark' ? 'light' : 'dark'} mode">
            <i class="fas ${appState.currentTheme === 'dark' ? 'fa-sun' : 'fa-moon'}"></i>
        </button>
        <button class="app-actions-trigger ${appState.isAppActionsMenuOpen ? 'active' : ''}" id="${triggerId}" aria-haspopup="true" aria-expanded="${appState.isAppActionsMenuOpen}" aria-controls="${menuId}" title="Application Actions">
            <i class="fas fa-ellipsis-v"></i>
        </button>
        ${menuContentHTML}
    `;

    document.getElementById('theme-toggle-btn')?.addEventListener('click', handleThemeToggle);
    document.getElementById(triggerId)?.addEventListener('click', (e) => {
        e.stopPropagation();
        appState.isAppActionsMenuOpen = !appState.isAppActionsMenuOpen;
        renderHeaderActionsMenu();
        if (appState.isAppActionsMenuOpen) {
             const menuElement = document.getElementById(menuId);
             if (menuElement) {
                (menuElement.querySelector('[role="menuitem"]:not([disabled])') as HTMLElement)?.focus();
             }
        }
    });

    if (appState.isAppActionsMenuOpen) {
        const closeMenuAndRender = () => {
            appState.isAppActionsMenuOpen = false;
            render();
        };

        document.getElementById('app-action-new-bike')?.addEventListener('click', () => {
            if (appState.bikes.length >= MAX_BIKES) {
                 showToast(`Cannot add more bikes. Maximum of ${MAX_BIKES} bikes reached.`, "error");
            } else {
                appState.newBikeName = '';
                appState.showNewBikeModal = true;
            }
            closeMenuAndRender();
        });
        document.getElementById('app-action-new-track')?.addEventListener('click', () => {
             if (appState.tracks.length >= MAX_TRACKS) {
                showToast(`Cannot add more tracks. Maximum of ${MAX_TRACKS} tracks reached.`, "error");
            } else {
                appState.newTrackName = ''; appState.newTrackMapLink = '';
                appState.showNewTrackModal = true;
            }
            closeMenuAndRender();
        });
        document.getElementById('app-action-import')?.addEventListener('click', () => { handleImportData(); closeMenuAndRender();});
        document.getElementById('app-action-export')?.addEventListener('click', () => { handleExportData(); closeMenuAndRender(); });
        document.getElementById('app-action-reset')?.addEventListener('click', () => { handleResetApplication(); closeMenuAndRender(); });

        const menuItems = Array.from(document.querySelectorAll(`#${menuId} [role="menuitem"]`)) as HTMLElement[];
        menuItems.forEach((item, index) => {
            item.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    menuItems[(index + 1) % menuItems.length]?.focus();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    menuItems[(index - 1 + menuItems.length) % menuItems.length]?.focus();
                } else if (e.key === 'Escape') {
                    appState.isAppActionsMenuOpen = false;
                    renderHeaderActionsMenu();
                    document.getElementById(triggerId)?.focus();
                } else if (e.key === 'Tab') {
                     appState.isAppActionsMenuOpen = false;
                     renderHeaderActionsMenu();
                }
            });
        });
    }
}

function handleImportData() {
    confirmAndProceed("importing data (all current data will be overwritten and unsaved changes lost)", async () => {
        let text: string | null;
        try {
            text = await window.desktop.openBackup();
        } catch (err) {
            console.error("Error reading file:", err);
            showToast("Could not read that file.", "error");
            return;
        }
        if (text === null) return; // dialog cancelled
        importBackupText(text);
    });
}

function importBackupText(text: string) {
    try {
        const defaults = getDefaultAppState();
        const backup = parseBackup(JSON.parse(text), { bikes: defaults.bikes, tracks: defaults.tracks, theme: defaults.currentTheme });
        appState = { ...defaults, ...backup, hasUnsavedSettingsChanges: false, stagedSettingsBeforeEdit: null };

        applyCurrentTheme();
        saveStateToLocalStorage();
        render();
        showToast("Data imported successfully!", "success");
    } catch (err) {
        console.error("Error importing data:", err);
        showToast("Error importing data. File might be corrupted or not valid JSON.", "error");
    }
}


async function handleExportData() {
    try {
        const dataStr = serializeBackup(appState);
        const fileName = backupFileName();
        const savedPath = await window.desktop.saveBackup(fileName, dataStr);
        if (savedPath) {
            showToast(`Data exported to ${savedPath}`, "success", 6000);
        }
    } catch (e) {
        console.error("Error exporting data:", e);
        showToast("Error exporting data. Check the folder is writable.", "error", 6000);
    }
}


function handleResetApplication() {
    showConfirmation(
        "Reset Application Data?",
        "Are you sure you want to reset all application data? This will delete all your bikes, tracks, and settings. This action cannot be undone.",
        "Reset Application",
        () => {
            appState.showConfirmationModal = false;
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            appState = getDefaultAppState();
            appState.hasUnsavedSettingsChanges = false;
            appState.stagedSettingsBeforeEdit = null;
            isFirstAppLoad = true;

            applyCurrentTheme();
            saveStateToLocalStorage();
            render();
            showToast("Application has been reset to default.", "success");
            if (isFirstAppLoad) {
                setTimeout(() => {
                     showToast("Welcome to Bike Setup Tracker! Add your first bike or explore the defaults.", "info", 7000);
                }, 300);
            }
        },
        'destructive',
        null,
        'Cancel'
    );
}

function render() {
  renderSidebar();
  renderContentArea();
  renderModals();
  renderHeaderActionsMenu();
}

function initApp() {
  appState = loadStateFromLocalStorage();
  applyCurrentTheme();

  document.addEventListener('click', (e) => {
    if (appState.isAppActionsMenuOpen) {
        const menu = document.getElementById('app-actions-menu-content-el');
        const trigger = document.getElementById('app-actions-menu-trigger');
        if (menu && trigger && !menu.contains(e.target as Node) && !trigger.contains(e.target as Node)) {
            appState.isAppActionsMenuOpen = false;
            renderHeaderActionsMenu();
        }
    }
  });

  // Dropping a backup file (e.g. one copied from an Android phone) onto the window imports it.
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.json')) return;
    confirmAndProceed("importing data (all current data will be overwritten and unsaved changes lost)", async () => {
        importBackupText(await file.text());
    });
  });

  window.addEventListener('beforeunload', (event) => {
    if (appState.hasUnsavedSettingsChanges) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  if (isFirstAppLoad) {
      setTimeout(() => {
          showToast("Welcome to Bike Setup Tracker! Add your first bike or explore the defaults.", "info", 7000);
      }, 500);
      isFirstAppLoad = false;
  }

  render();
}

// Start the app
initApp();