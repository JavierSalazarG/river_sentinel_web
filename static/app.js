// API_BASE viene de config.js

// Estado de autenticacion
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

// Elementos del DOM
const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const loginFormContainer = document.getElementById('login-form-container');
const loginError = document.getElementById('login-error');

// Elementos de la app
let healthStatus, devicesList, detectionsList, alertsList, alertsBadge;
let consoleEl, createForm, editForm, editModal;
let refreshBtn, refreshDetectionsBtn, refreshAlertsBtn;
let detectionDeviceFilter, alertFilter, clearConsoleBtn;

// Cache de datos
let devicesCache = {};
let latestDetections = {};
let workersCache = {};
let categoriesCache = {};
let componentsCache = {};

// Mapa y marcadores
let map = null;
let markers = {};

// Mapa selector de ubicacion
let locationPickerMap = null;
let locationPickerMarker = null;

// Seccion activa (para admin)
let currentSection = 'dashboard';

// ==================== HELPERS DE ROL ====================

function isAdmin() {
    return currentUser && currentUser.role === 'admin';
}

function isWorker() {
    return currentUser && currentUser.role === 'worker';
}

// ==================== INICIALIZACION ====================

document.addEventListener('DOMContentLoaded', () => {
    if (authToken && currentUser) {
        showApp();
    } else {
        showAuthScreen();
    }

    loginForm.addEventListener('submit', handleLogin);
});

// ==================== AUTENTICACION ====================

function showApp() {
    authScreen.classList.add('hidden');
    appEl.classList.remove('hidden');

    initAppElements();
    initRoleBasedUI();
    initMap();
    updateUserDisplay();
    checkHealth();
    loadLatestDetections().then(() => {
        loadDevices();
    });
    loadDetections();
    loadAlerts();
    loadUnacknowledgedCount();

    // Cargar datos de admin si aplica
    if (isAdmin()) {
        loadWorkers();
        loadAssignments();
    }

    setInterval(checkHealth, 30000);
    setInterval(loadUnacknowledgedCount, 60000);
}

function initAppElements() {
    healthStatus = document.getElementById('health-status');
    devicesList = document.getElementById('devices-list');
    detectionsList = document.getElementById('detections-list');
    alertsList = document.getElementById('alerts-list');
    alertsBadge = document.getElementById('alerts-badge');
    consoleEl = document.getElementById('console');
    createForm = document.getElementById('create-device-form');
    editForm = document.getElementById('edit-device-form');
    editModal = document.getElementById('edit-modal');
    refreshBtn = document.getElementById('refresh-devices');
    refreshDetectionsBtn = document.getElementById('refresh-detections');
    refreshAlertsBtn = document.getElementById('refresh-alerts');
    detectionDeviceFilter = document.getElementById('detection-device-filter');
    alertFilter = document.getElementById('alert-filter');
    clearConsoleBtn = document.getElementById('clear-console');

    // Event listeners
    if (createForm) createForm.addEventListener('submit', handleCreateDevice);
    if (editForm) editForm.addEventListener('submit', handleUpdateDevice);
    if (refreshBtn) refreshBtn.addEventListener('click', loadDevices);
    if (refreshDetectionsBtn) refreshDetectionsBtn.addEventListener('click', loadDetections);
    if (refreshAlertsBtn) refreshAlertsBtn.addEventListener('click', loadAlerts);
    if (detectionDeviceFilter) detectionDeviceFilter.addEventListener('change', loadDetections);
    if (alertFilter) alertFilter.addEventListener('change', loadAlerts);
    if (clearConsoleBtn) clearConsoleBtn.addEventListener('click', clearConsole);

    // Admin forms
    const createWorkerForm = document.getElementById('create-worker-form');
    if (createWorkerForm) createWorkerForm.addEventListener('submit', handleCreateWorker);

    const assignDeviceForm = document.getElementById('assign-device-form');
    if (assignDeviceForm) assignDeviceForm.addEventListener('submit', handleAssignDevice);

    // Component modal forms (necesarios para workers y admins)
    const updateStatusForm = document.getElementById('update-component-status-form');
    if (updateStatusForm) updateStatusForm.addEventListener('submit', handleUpdateComponentStatus);

    const createMaintenanceForm = document.getElementById('create-maintenance-form');
    if (createMaintenanceForm) createMaintenanceForm.addEventListener('submit', handleCreateMaintenance);
}

function initRoleBasedUI() {
    const adminNav = document.getElementById('admin-nav');
    const roleBadge = document.getElementById('user-role-badge');
    const headerSubtitle = document.getElementById('header-subtitle');
    const navWorkers = document.getElementById('nav-workers');
    const navAssignments = document.getElementById('nav-assignments');
    const navComponents = document.getElementById('nav-components');
    const navStats = document.getElementById('nav-stats');

    const navConfig = document.getElementById('nav-config');
    const btnAddDevice = document.getElementById('btn-add-device');

    if (isAdmin()) {
        // Mostrar elementos de admin
        if (adminNav) adminNav.classList.remove('hidden');
        if (btnAddDevice) btnAddDevice.classList.remove('hidden');
        if (roleBadge) {
            roleBadge.textContent = 'Admin';
            roleBadge.classList.add('admin');
        }
        if (headerSubtitle) headerSubtitle.textContent = 'Panel de Administracion';
        // Mostrar todas las tabs de navegacion
        if (navWorkers) navWorkers.classList.remove('hidden');
        if (navAssignments) navAssignments.classList.remove('hidden');
        if (navComponents) navComponents.classList.remove('hidden');
        if (navStats) navStats.classList.remove('hidden');
        if (navConfig) navConfig.classList.remove('hidden');
    } else {
        // Workers solo ven Dashboard (acceden a componentes via click en dispositivo)
        if (adminNav) adminNav.classList.remove('hidden');
        if (btnAddDevice) btnAddDevice.classList.add('hidden');
        if (roleBadge) {
            roleBadge.textContent = 'Worker';
            roleBadge.classList.remove('admin');
        }
        if (headerSubtitle) headerSubtitle.textContent = 'Panel de Monitorizacion';
        // Ocultar tabs exclusivas de admin
        if (navWorkers) navWorkers.classList.add('hidden');
        if (navAssignments) navAssignments.classList.add('hidden');
        // Ocultar tab de Componentes (workers acceden via click en dispositivo)
        if (navComponents) navComponents.classList.add('hidden');
        // Ocultar tab de Estadisticas (solo admin por ahora)
        if (navStats) navStats.classList.add('hidden');
        // Ocultar tab de Configuracion (solo admin)
        if (navConfig) navConfig.classList.add('hidden');

        // Ocultar botones de editar/eliminar en dispositivos
        document.querySelectorAll('.device-actions').forEach(el => el.classList.add('hidden'));
    }

    // Mostrar seccion inicial
    showSection('dashboard');
}

function updateUserDisplay() {
    const userName = document.getElementById('user-name');
    if (currentUser && userName) {
        userName.textContent = currentUser.name || currentUser.email.split('@')[0];
    }
}

// ==================== NAVEGACION POR SECCIONES ====================

function showSection(section) {
    currentSection = section;

    // Ocultar todas las secciones
    document.getElementById('section-dashboard')?.classList.add('hidden');
    document.getElementById('section-workers')?.classList.add('hidden');
    document.getElementById('section-assignments')?.classList.add('hidden');
    document.getElementById('section-components')?.classList.add('hidden');
    document.getElementById('section-stats')?.classList.add('hidden');
    document.getElementById('section-config')?.classList.add('hidden');
    document.getElementById('section-download')?.classList.add('hidden');

    // Mostrar seccion seleccionada
    const sectionEl = document.getElementById(`section-${section}`);
    if (sectionEl) sectionEl.classList.remove('hidden');

    // Actualizar botones de navegacion
    document.querySelectorAll('.admin-nav .nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.admin-nav .nav-btn[onclick="showSection('${section}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Cargar datos si es necesario
    if (section === 'workers') {
        loadWorkers();
    } else if (section === 'assignments') {
        loadAssignments();
        updateAssignmentSelects();
    } else if (section === 'components') {
        loadComponentsSection();
    } else if (section === 'stats') {
        loadStatsSection();
    } else if (section === 'config') {
        loadConfigSection();
    } else if (section === 'download') {
        loadDownloadSection();
    }
}

// ==================== LOGIN CON SEGURIDAD ====================

// Configuracion de seguridad
const LOGIN_SECURITY = {
    maxAttempts: 5,
    lockoutTime: 60, // segundos
    attemptResetTime: 300 // 5 minutos para resetear intentos
};

// Estado de intentos de login
let loginAttempts = parseInt(localStorage.getItem('loginAttempts') || '0');
let lockoutUntil = parseInt(localStorage.getItem('lockoutUntil') || '0');
let lastAttemptTime = parseInt(localStorage.getItem('lastAttemptTime') || '0');
let lockoutInterval = null;

// Inicializar estado de seguridad al cargar
function initLoginSecurity() {
    const now = Date.now();

    // Resetear intentos si ha pasado el tiempo de reset
    if (lastAttemptTime && (now - lastAttemptTime) > LOGIN_SECURITY.attemptResetTime * 1000) {
        resetLoginAttempts();
    }

    // Verificar si hay lockout activo
    if (lockoutUntil > now) {
        showLockout();
    } else if (lockoutUntil > 0) {
        // Lockout expirado, resetear
        resetLoginAttempts();
    }

    updateAttemptsDisplay();
}

// Mostrar/ocultar contrasena
function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        button.classList.add('active');
        button.setAttribute('aria-label', 'Ocultar contrasena');
    } else {
        input.type = 'password';
        button.classList.remove('active');
        button.setAttribute('aria-label', 'Mostrar contrasena');
    }
}

// Sanitizar entrada para prevenir XSS
function sanitizeInput(str) {
    if (!str) return '';
    return str
        .replace(/[<>]/g, '') // Eliminar < y >
        .replace(/javascript:/gi, '') // Eliminar javascript:
        .replace(/on\w+\s*=/gi, '') // Eliminar event handlers
        .trim()
        .substring(0, 500); // Limitar longitud
}

// Validar formato de email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
}

// Mostrar lockout
function showLockout() {
    const lockoutEl = document.getElementById('login-lockout');
    const timerEl = document.getElementById('lockout-timer');
    const submitBtn = document.getElementById('login-submit-btn');
    const attemptsEl = document.getElementById('login-attempts');

    lockoutEl.classList.remove('hidden');
    attemptsEl.classList.add('hidden');
    submitBtn.disabled = true;

    // Actualizar timer
    function updateTimer() {
        const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
        if (remaining <= 0) {
            clearInterval(lockoutInterval);
            lockoutEl.classList.add('hidden');
            submitBtn.disabled = false;
            resetLoginAttempts();
            updateAttemptsDisplay();
        } else {
            timerEl.textContent = remaining;
        }
    }

    updateTimer();
    lockoutInterval = setInterval(updateTimer, 1000);
}

// Actualizar display de intentos
function updateAttemptsDisplay() {
    const attemptsEl = document.getElementById('login-attempts');
    const countEl = document.getElementById('attempts-count');
    const remaining = LOGIN_SECURITY.maxAttempts - loginAttempts;

    if (loginAttempts > 0 && remaining > 0 && remaining <= 3) {
        attemptsEl.classList.remove('hidden');
        countEl.textContent = remaining;
    } else {
        attemptsEl.classList.add('hidden');
    }
}

// Registrar intento fallido
function recordFailedAttempt() {
    loginAttempts++;
    lastAttemptTime = Date.now();
    localStorage.setItem('loginAttempts', loginAttempts.toString());
    localStorage.setItem('lastAttemptTime', lastAttemptTime.toString());

    if (loginAttempts >= LOGIN_SECURITY.maxAttempts) {
        lockoutUntil = Date.now() + (LOGIN_SECURITY.lockoutTime * 1000);
        localStorage.setItem('lockoutUntil', lockoutUntil.toString());
        showLockout();
    } else {
        updateAttemptsDisplay();
    }

    // Efecto de shake en el formulario
    const formContainer = document.getElementById('login-form-container');
    formContainer.classList.add('shake');
    setTimeout(() => formContainer.classList.remove('shake'), 500);
}

// Resetear intentos
function resetLoginAttempts() {
    loginAttempts = 0;
    lockoutUntil = 0;
    lastAttemptTime = 0;
    localStorage.removeItem('loginAttempts');
    localStorage.removeItem('lockoutUntil');
    localStorage.removeItem('lastAttemptTime');
    if (lockoutInterval) {
        clearInterval(lockoutInterval);
        lockoutInterval = null;
    }
}

// Mostrar estado de carga
function setLoginLoading(loading) {
    const submitBtn = document.getElementById('login-submit-btn');
    const btnText = document.getElementById('login-btn-text');
    const btnLoading = document.getElementById('login-btn-loading');

    submitBtn.disabled = loading;
    btnText.classList.toggle('hidden', loading);
    btnLoading.classList.toggle('hidden', !loading);
}

async function handleLogin(e) {
    e.preventDefault();
    loginError.classList.add('hidden');

    // Verificar lockout
    if (lockoutUntil > Date.now()) {
        return;
    }

    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const totpInput = document.getElementById('login-totp');
    const totpGroup = document.getElementById('totp-group');

    // Sanitizar entradas
    const email = sanitizeInput(emailInput.value.toLowerCase());
    const password = passwordInput.value; // No sanitizar password para permitir caracteres especiales
    const totpCode = sanitizeInput(totpInput.value);

    // Validaciones de frontend
    if (!isValidEmail(email)) {
        loginError.textContent = 'Por favor, introduce un email valido';
        loginError.classList.remove('hidden');
        emailInput.focus();
        return;
    }

    if (password.length < 6) {
        loginError.textContent = 'La contrasena debe tener al menos 6 caracteres';
        loginError.classList.remove('hidden');
        passwordInput.focus();
        return;
    }

    if (password.length > 128) {
        loginError.textContent = 'La contrasena es demasiado larga';
        loginError.classList.remove('hidden');
        passwordInput.focus();
        return;
    }

    // Mostrar loading
    setLoginLoading(true);

    try {
        const loginData = { email, password };
        if (totpCode && totpCode.length === 6) {
            loginData.totp_code = totpCode;
        }

        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest' // Ayuda a prevenir CSRF
            },
            body: JSON.stringify(loginData)
        });

        const data = await response.json();

        if (!response.ok) {
            recordFailedAttempt();
            throw new Error(data.error || 'Credenciales incorrectas');
        }

        // Verificar si requiere 2FA
        if (data.requires_2fa) {
            setLoginLoading(false);
            totpGroup.classList.remove('hidden');
            totpInput.focus();
            loginError.textContent = 'Introduce el codigo de tu app de autenticacion';
            loginError.classList.remove('hidden');
            loginError.style.background = '#dbeafe';
            loginError.style.color = '#1e40af';
            return;
        }

        // Login exitoso - resetear intentos
        resetLoginAttempts();

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        // Resetear formulario y ocultar 2FA
        loginForm.reset();
        totpGroup.classList.add('hidden');
        loginError.style.background = '';
        loginError.style.color = '';

        setLoginLoading(false);
        showApp();

    } catch (error) {
        setLoginLoading(false);
        loginError.textContent = error.message;
        loginError.classList.remove('hidden');
        loginError.style.background = '';
        loginError.style.color = '';
    }
}

// Inicializar seguridad cuando se muestra la pantalla de auth
function showAuthScreen() {
    authScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
    initLoginSecurity();
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');

    if (map) {
        map.remove();
        map = null;
    }

    showAuthScreen();
    toggleUserMenu();
}

function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
    const userMenu = document.querySelector('.user-menu');
    const dropdown = document.getElementById('user-dropdown');
    if (userMenu && !userMenu.contains(e.target)) {
        dropdown?.classList.add('hidden');
    }
});

// ==================== GESTION DE WORKERS (ADMIN) ====================

async function loadWorkers() {
    if (!isAdmin()) return;

    const workersList = document.getElementById('workers-list');
    if (!workersList) return;

    try {
        const response = await apiRequest('GET', '/admin/workers');
        const workers = await response.json();

        workersCache = {};
        workers.forEach(w => {
            workersCache[w.id] = w;
        });

        if (workers.length === 0) {
            workersList.innerHTML = '<p class="empty-state">No hay workers registrados</p>';
            return;
        }

        workersList.innerHTML = workers.map(worker => `
            <div class="worker-item clickable" data-id="${worker.id}" onclick="viewWorker('${worker.id}')">
                <div class="worker-info">
                    <div class="worker-name">${escapeHtml(worker.name || worker.email.split('@')[0])}</div>
                    <div class="worker-email">${escapeHtml(worker.email)}</div>
                    <div class="worker-meta">
                        ${worker.device_count || 0} dispositivos asignados
                        ${worker.created_at ? ` - Creado: ${formatDate(worker.created_at)}` : ''}
                    </div>
                </div>
                <div class="worker-actions">
                    <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteWorker('${worker.id}')">Eliminar</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        workersList.innerHTML = '<p class="empty-state">Error cargando workers</p>';
    }
}

async function handleCreateWorker(e) {
    e.preventDefault();

    const email = document.getElementById('worker-email').value;
    const name = document.getElementById('worker-name').value || null;
    const password = document.getElementById('worker-password').value;

    try {
        const response = await apiRequest('POST', '/admin/workers', { email, password, name });

        if (response.ok) {
            document.getElementById('create-worker-form').reset();
            loadWorkers();
            updateAssignmentSelects();
        }
    } catch (error) {
        console.error('Error creating worker:', error);
    }
}

async function deleteWorker(id) {
    if (!confirm('Estas seguro de que quieres eliminar este worker?')) {
        return;
    }

    try {
        const response = await apiRequest('DELETE', `/admin/workers/${id}`);

        if (response.ok) {
            loadWorkers();
            loadAssignments();
            updateAssignmentSelects();
        }
    } catch (error) {
        console.error('Error deleting worker:', error);
    }
}

async function viewWorker(id) {
    try {
        const response = await apiRequest('GET', `/admin/workers/${id}`);
        const data = await response.json();

        const modal = document.getElementById('worker-modal');
        const detailsEl = document.getElementById('worker-details');
        const devicesListEl = document.getElementById('worker-devices-list');

        const worker = data.worker;
        const devices = data.devices || [];

        detailsEl.innerHTML = `
            <p><strong>Email:</strong> ${escapeHtml(worker.email)}</p>
            <p><strong>Nombre:</strong> ${escapeHtml(worker.name || 'No especificado')}</p>
            <p><strong>Rol:</strong> ${worker.role}</p>
            <p><strong>Creado:</strong> ${formatDate(worker.created_at)}</p>
        `;

        if (devices.length === 0) {
            devicesListEl.innerHTML = '<p class="empty-state">Sin dispositivos asignados</p>';
        } else {
            devicesListEl.innerHTML = devices.map(d => `
                <div class="device-item small">
                    <span class="device-name">${escapeHtml(d.name)}</span>
                    <span class="device-status ${d.status}">${d.status}</span>
                </div>
            `).join('');
        }

        modal.classList.remove('hidden');
    } catch (error) {
        console.error('Error loading worker:', error);
    }
}

function closeWorkerModal() {
    document.getElementById('worker-modal')?.classList.add('hidden');
}

// ==================== GESTION DE ASIGNACIONES (ADMIN) ====================

async function loadAssignments() {
    if (!isAdmin()) return;

    const assignmentsList = document.getElementById('assignments-list');
    if (!assignmentsList) return;

    try {
        const response = await apiRequest('GET', '/admin/assignments');
        const assignments = await response.json();

        if (assignments.length === 0) {
            assignmentsList.innerHTML = '<p class="empty-state">No hay asignaciones</p>';
            return;
        }

        assignmentsList.innerHTML = assignments.map(a => `
            <div class="assignment-item" data-worker="${a.worker_id}" data-device="${a.device_id}">
                <div class="assignment-info">
                    <div class="assignment-worker">${escapeHtml(a.worker_name || a.worker_email)}</div>
                    <div class="assignment-device">${escapeHtml(a.device_name)}</div>
                    <div class="assignment-meta">
                        Asignado: ${formatDate(a.assigned_at)}
                        ${a.notes ? ` - ${escapeHtml(a.notes)}` : ''}
                    </div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="unassignDevice('${a.worker_id}', '${a.device_id}')">
                    Desasignar
                </button>
            </div>
        `).join('');
    } catch (error) {
        assignmentsList.innerHTML = '<p class="empty-state">Error cargando asignaciones</p>';
    }
}

function updateAssignmentSelects() {
    const workerSelect = document.getElementById('assign-worker');
    const deviceSelect = document.getElementById('assign-device');

    if (workerSelect) {
        workerSelect.innerHTML = '<option value="">Selecciona un worker</option>';
        Object.values(workersCache).forEach(worker => {
            const option = document.createElement('option');
            option.value = worker.id;
            option.textContent = worker.name || worker.email;
            workerSelect.appendChild(option);
        });
    }

    if (deviceSelect) {
        deviceSelect.innerHTML = '<option value="">Selecciona un dispositivo</option>';
        Object.values(devicesCache).forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name;
            deviceSelect.appendChild(option);
        });
    }
}

async function handleAssignDevice(e) {
    e.preventDefault();

    const workerId = document.getElementById('assign-worker').value;
    const deviceId = document.getElementById('assign-device').value;
    const notes = document.getElementById('assign-notes').value || null;

    if (!workerId || !deviceId) {
        alert('Selecciona un worker y un dispositivo');
        return;
    }

    try {
        const response = await apiRequest('POST', '/admin/assignments', {
            worker_id: workerId,
            device_id: deviceId,
            notes: notes
        });

        if (response.ok) {
            document.getElementById('assign-device-form').reset();
            loadAssignments();
        }
    } catch (error) {
        console.error('Error assigning device:', error);
    }
}

async function unassignDevice(workerId, deviceId) {
    if (!confirm('Estas seguro de que quieres desasignar este dispositivo?')) {
        return;
    }

    try {
        const response = await apiRequest('DELETE', `/admin/assignments?worker_id=${workerId}&device_id=${deviceId}`);

        if (response.ok) {
            loadAssignments();
        }
    } catch (error) {
        console.error('Error unassigning device:', error);
    }
}

// ==================== MAPA ====================

function initLocationPickerMap() {
    const mapContainer = document.getElementById('location-picker-map');
    if (!mapContainer) return;

    // Si ya existe, solo invalidar tamaño
    if (locationPickerMap) {
        locationPickerMap.invalidateSize();
        return;
    }

    // Centro por defecto (se actualizara con geolocation)
    const defaultCenter = [40.4168, -3.7038]; // Madrid

    locationPickerMap = L.map('location-picker-map').setView(defaultCenter, 6);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19
    }).addTo(locationPickerMap);

    // Click en el mapa para seleccionar ubicacion
    locationPickerMap.on('click', function(e) {
        setLocationMarker(e.latlng.lat, e.latlng.lng);
    });

    // Intentar obtener ubicacion del usuario
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                locationPickerMap.setView([lat, lng], 14);
                setLocationMarker(lat, lng);
            },
            (error) => {
                console.log('Geolocation no disponible:', error.message);
            },
            { timeout: 5000 }
        );
    }

    setTimeout(() => {
        locationPickerMap.invalidateSize();
    }, 100);

    // Sincronizar inputs manuales con el mapa
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');

    function syncMapFromInputs() {
        const lat = parseFloat(latInput?.value);
        const lng = parseFloat(lngInput?.value);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            if (locationPickerMarker) {
                locationPickerMarker.setLatLng([lat, lng]);
            } else {
                locationPickerMarker = L.marker([lat, lng], { draggable: true }).addTo(locationPickerMap);
                locationPickerMarker.on('dragend', function(e) {
                    const pos = e.target.getLatLng();
                    updateLocationInputs(pos.lat, pos.lng);
                });
            }
            locationPickerMap.setView([lat, lng], Math.max(locationPickerMap.getZoom(), 12));
            const coordsDisplay = document.getElementById('selected-coords');
            if (coordsDisplay) {
                coordsDisplay.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                coordsDisplay.style.color = 'var(--text)';
            }
        }
    }

    latInput?.addEventListener('change', syncMapFromInputs);
    lngInput?.addEventListener('change', syncMapFromInputs);
}

function setLocationMarker(lat, lng) {
    // Actualizar o crear marcador
    if (locationPickerMarker) {
        locationPickerMarker.setLatLng([lat, lng]);
    } else {
        locationPickerMarker = L.marker([lat, lng], {
            draggable: true
        }).addTo(locationPickerMap);

        // Actualizar coords cuando se arrastra el marcador
        locationPickerMarker.on('dragend', function(e) {
            const pos = e.target.getLatLng();
            updateLocationInputs(pos.lat, pos.lng);
        });
    }

    updateLocationInputs(lat, lng);
    locationPickerMap.setView([lat, lng], Math.max(locationPickerMap.getZoom(), 12));
}

function updateLocationInputs(lat, lng) {
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    const coordsDisplay = document.getElementById('selected-coords');

    if (latInput) latInput.value = lat.toFixed(6);
    if (lngInput) lngInput.value = lng.toFixed(6);
    if (coordsDisplay) {
        coordsDisplay.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        coordsDisplay.style.color = 'var(--text)';
    }
}

function resetLocationPicker() {
    if (locationPickerMarker && locationPickerMap) {
        locationPickerMap.removeLayer(locationPickerMarker);
        locationPickerMarker = null;
    }
    const coordsDisplay = document.getElementById('selected-coords');
    if (coordsDisplay) {
        coordsDisplay.textContent = 'Sin ubicacion seleccionada';
        coordsDisplay.style.color = 'var(--text-muted)';
    }
}

function useMyLocation() {
    if (!navigator.geolocation) {
        alert('Tu navegador no soporta geolocalizacion');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            if (locationPickerMap) {
                setLocationMarker(lat, lng);
            } else {
                updateLocationInputs(lat, lng);
            }
        },
        (error) => {
            alert('No se pudo obtener tu ubicacion: ' + error.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

function initMap() {
    if (map) return;

    map = L.map('map').setView([36.7628, -4.7053], 11);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(map);

    setTimeout(() => {
        map.invalidateSize();
    }, 100);
}

function createMarkerIcon(score, status) {
    let color = '#10b981';

    if (status === 'offline') {
        color = '#6b7280';
    } else if (score !== null) {
        if (score >= 0.7) {
            color = '#ef4444';
        } else if (score >= 0.4) {
            color = '#f59e0b';
        }
    }

    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background: ${color};
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
    });
}

function updateMap(devices) {
    if (!map) return;

    Object.values(markers).forEach(marker => map.removeLayer(marker));
    markers = {};

    const validDevices = devices.filter(d => d.latitude !== 0 || d.longitude !== 0);

    if (validDevices.length === 0) return;

    validDevices.forEach(device => {
        const latestDetection = latestDetections[device.id];
        const score = latestDetection ? latestDetection.detection_score : null;
        const scorePercent = score !== null ? Math.round(score * 100) : null;
        const scoreClass = scorePercent !== null ? (scorePercent >= 70 ? 'high' : scorePercent >= 40 ? 'medium' : 'low') : '';

        const popupContent = `
            <div class="map-popup">
                <h4>${escapeHtml(device.name)}</h4>
                ${device.description ? `<p>${escapeHtml(device.description)}</p>` : ''}
                <p>Estado: <strong>${device.status}</strong></p>
                ${device.battery_level ? `<p>Bateria: ${device.battery_level}%</p>` : ''}
                ${scorePercent !== null ? `
                    <span class="score-indicator ${scoreClass}">
                        Deteccion: ${scorePercent}%
                    </span>
                ` : '<p style="color:#888;">Sin detecciones</p>'}
            </div>
        `;

        const marker = L.marker([device.latitude, device.longitude], {
            icon: createMarkerIcon(score, device.status)
        }).addTo(map);

        marker.bindPopup(popupContent);
        markers[device.id] = marker;
    });

    if (validDevices.length > 0) {
        const group = L.featureGroup(Object.values(markers));
        map.fitBounds(group.getBounds().pad(0.2));
    }
}

async function loadLatestDetections() {
    try {
        const response = await fetch(`${API_BASE}/detections?limit=100`);
        const detections = await response.json();

        latestDetections = {};
        detections.forEach(d => {
            if (!latestDetections[d.device_id]) {
                latestDetections[d.device_id] = d;
            }
        });
    } catch (error) {
        console.error('Error loading latest detections:', error);
    }
}

// ==================== HEALTH CHECK ====================

async function checkHealth() {
    try {
        const response = await fetch('/health');
        const data = await response.json();

        healthStatus.textContent = data.status === 'healthy' ? 'Conectado' : 'Desconectado';
        healthStatus.className = `health-badge ${data.status}`;
    } catch (error) {
        healthStatus.textContent = 'Error';
        healthStatus.className = 'health-badge unhealthy';
    }
}

// ==================== DISPOSITIVOS ====================

async function loadDevices() {
    try {
        // Workers solo ven sus dispositivos asignados
        const endpoint = isWorker() ? '/users/devices' : '/devices';
        const response = await apiRequest('GET', endpoint);
        const devices = await response.json();

        devicesCache = {};
        devices.forEach(d => {
            devicesCache[d.id] = d;
        });

        const devicesCount = document.getElementById('devices-count');
        if (devicesCount) {
            devicesCount.textContent = `${devices.length} dispositivo${devices.length !== 1 ? 's' : ''}`;
        }

        updateDeviceFilter(devices);
        updateMap(devices);
        updateAssignmentSelects();

        if (devices.length === 0) {
            devicesList.innerHTML = '<p class="empty-state">No hay dispositivos registrados</p>';
            return;
        }

        devicesList.innerHTML = devices.map(device => `
            <div class="device-item clickable" data-id="${device.id}" onclick="openDeviceConfigModal('${device.id}')">
                <div class="device-info">
                    <div class="device-name">${escapeHtml(device.name)}</div>
                    <div class="device-id-small">${escapeHtml(device.device_id)}</div>
                    <div class="device-meta">
                        ${device.latitude.toFixed(4)}, ${device.longitude.toFixed(4)}
                        ${device.description ? ` - ${escapeHtml(device.description)}` : ''}
                        ${device.battery_level ? ` - ${device.battery_level}%` : ''}
                    </div>
                    ${device.last_seen_at ? `<div class="device-lastseen">Ultima conexion: ${formatDate(device.last_seen_at)}</div>` : ''}
                    <div class="device-hint">Click para configurar</div>
                </div>
                <span class="device-status ${device.status}">${device.status}</span>
                ${isAdmin() ? `
                    <div class="device-actions">
                        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openEditModal('${device.id}')">Editar</button>
                        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteDevice('${device.id}')">Eliminar</button>
                    </div>
                ` : ''}
            </div>
        `).join('');
    } catch (error) {
        devicesList.innerHTML = '<p class="empty-state">Error cargando dispositivos</p>';
    }
}

function updateDeviceFilter(devices) {
    const currentValue = detectionDeviceFilter?.value;
    if (detectionDeviceFilter) {
        detectionDeviceFilter.innerHTML = '<option value="">Todos los dispositivos</option>';
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name;
            detectionDeviceFilter.appendChild(option);
        });
        detectionDeviceFilter.value = currentValue;
    }
}

// ==================== DETECCIONES ====================

async function loadDetections() {
    try {
        let endpoint = '/detections?limit=50';
        const deviceId = detectionDeviceFilter?.value;
        if (deviceId) {
            endpoint += `&device_id=${deviceId}`;
        }

        const response = await apiRequest('GET', endpoint);
        const detections = await response.json();

        if (detections.length === 0) {
            detectionsList.innerHTML = '<p class="empty-state">No hay detecciones</p>';
            return;
        }

        detectionsList.innerHTML = detections.map(detection => {
            const device = devicesCache[detection.device_id] || { name: 'Desconocido', device_id: detection.device_id };
            const scorePercent = Math.round(detection.detection_score * 100);
            const scoreClass = scorePercent >= 70 ? 'high' : scorePercent >= 40 ? 'medium' : 'low';

            return `
                <div class="detection-item">
                    <div class="detection-score ${scoreClass}">${scorePercent}%</div>
                    <div class="detection-info">
                        <div class="detection-device">${escapeHtml(device.name)}</div>
                        <div class="detection-meta">
                            ${formatDate(detection.detected_at)}
                            ${detection.rssi ? ` - RSSI: ${detection.rssi}` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        detectionsList.innerHTML = '<p class="empty-state">Error cargando detecciones</p>';
    }
}

// ==================== ALERTAS ====================

async function loadAlerts() {
    try {
        let endpoint = '/alerts?limit=50';
        const ackFilter = alertFilter?.value;
        if (ackFilter !== '' && ackFilter !== undefined) {
            endpoint += `&acknowledged=${ackFilter}`;
        }

        const response = await apiRequest('GET', endpoint);
        const alerts = await response.json();

        if (alerts.length === 0) {
            alertsList.innerHTML = '<p class="empty-state">No hay alertas</p>';
            return;
        }

        alertsList.innerHTML = alerts.map(alert => {
            const deviceName = alert.device_name || 'Desconocido';
            return `
                <div class="alert-item ${alert.acknowledged ? 'acknowledged' : ''}" data-id="${alert.id}">
                    <div class="alert-severity ${alert.severity}">${getSeverityIcon(alert.severity)}</div>
                    <div class="alert-info">
                        <div class="alert-message">${escapeHtml(alert.message || 'Alerta')}</div>
                        <div class="alert-meta">
                            ${escapeHtml(deviceName)} - ${formatDate(alert.created_at)}
                            ${alert.acknowledged ? ` - Reconocida por ${escapeHtml(alert.acknowledged_by || '')}` : ''}
                        </div>
                    </div>
                    ${!alert.acknowledged ? `
                        <button class="btn btn-secondary btn-sm" onclick="acknowledgeAlert('${alert.id}')">
                            Reconocer
                        </button>
                    ` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        alertsList.innerHTML = '<p class="empty-state">Error cargando alertas</p>';
    }
}

async function loadUnacknowledgedCount() {
    try {
        const response = await fetch(`${API_BASE}/alerts/count`);
        const data = await response.json();

        if (data.count > 0) {
            alertsBadge.textContent = data.count;
            alertsBadge.classList.remove('hidden');
        } else {
            alertsBadge.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error loading unacknowledged count:', error);
    }
}

async function acknowledgeAlert(id) {
    try {
        const response = await apiRequest('PUT', `/alerts/${id}/ack`, { acknowledged_by: currentUser?.email || 'panel_usuario' });

        if (response.ok) {
            loadAlerts();
            loadUnacknowledgedCount();
        }
    } catch (error) {
        console.error('Error acknowledging alert:', error);
    }
}

function getSeverityIcon(severity) {
    switch (severity) {
        case 'critical': return '!';
        case 'high': return '!';
        case 'medium': return '!';
        case 'warning': return '!';
        case 'low': return 'i';
        default: return '?';
    }
}

// ==================== UTILIDADES ====================

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return mins <= 1 ? 'Hace un momento' : `Hace ${mins} min`;
    }

    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ==================== CRUD DISPOSITIVOS ====================

async function handleCreateDevice(e) {
    e.preventDefault();

    const formData = new FormData(createForm);
    const data = {
        device_id: formData.get('device_id'),
        name: formData.get('name'),
        description: formData.get('description') || '',
        latitude: parseFloat(formData.get('latitude')),
        longitude: parseFloat(formData.get('longitude'))
    };

    try {
        const response = await apiRequest('POST', '/devices', data);

        if (response.ok) {
            closeCreateDeviceModal();
            loadDevices();
        }
    } catch (error) {
        console.error('Error creating device:', error);
    }
}

async function openEditModal(id) {
    try {
        const response = await apiRequest('GET', `/devices/${id}`);
        const device = await response.json();

        document.getElementById('edit-id').value = device.id;
        document.getElementById('edit-name').value = device.name;
        document.getElementById('edit-description').value = device.description || '';
        document.getElementById('edit-latitude').value = device.latitude;
        document.getElementById('edit-longitude').value = device.longitude;
        document.getElementById('edit-status').value = device.status;

        editModal.classList.remove('hidden');
    } catch (error) {
        console.error('Error loading device:', error);
    }
}

function closeModal() {
    editModal.classList.add('hidden');
}

async function handleUpdateDevice(e) {
    e.preventDefault();

    const id = document.getElementById('edit-id').value;
    const data = {
        name: document.getElementById('edit-name').value,
        description: document.getElementById('edit-description').value,
        latitude: parseFloat(document.getElementById('edit-latitude').value),
        longitude: parseFloat(document.getElementById('edit-longitude').value),
        status: document.getElementById('edit-status').value
    };

    try {
        const response = await apiRequest('PUT', `/devices/${id}`, data);

        if (response.ok) {
            closeModal();
            loadDevices();
        }
    } catch (error) {
        console.error('Error updating device:', error);
    }
}

async function deleteDevice(id) {
    if (!confirm('Estas seguro de que quieres eliminar este dispositivo?')) {
        return;
    }

    try {
        const response = await apiRequest('DELETE', `/devices/${id}`);

        if (response.ok) {
            loadDevices();
        }
    } catch (error) {
        console.error('Error deleting device:', error);
    }
}

// ==================== API REQUEST ====================

async function apiRequest(method, endpoint, body = null) {
    const url = `${API_BASE}${endpoint}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (body) {
        options.body = JSON.stringify(body);
    }

    const startTime = performance.now();
    const response = await fetch(url, options);
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    const responseClone = response.clone();
    let responseBody;

    try {
        responseBody = await responseClone.json();
    } catch {
        responseBody = await responseClone.text();
    }

    logToConsole(method, url, response.status, responseBody, duration);

    if (response.status === 401 && authToken) {
        logout();
    }

    return response;
}

// ==================== CONSOLA ====================

function logToConsole(method, url, status, body, duration) {
    if (!consoleEl) return;

    const isSuccess = status >= 200 && status < 300;

    const welcome = consoleEl.querySelector('.console-welcome');
    if (welcome) {
        welcome.remove();
    }

    const entry = document.createElement('div');
    entry.className = 'console-entry';
    entry.innerHTML = `
        <div>
            <span class="console-method ${method}">${method}</span>
            <span class="console-url">${url}</span>
            <span class="console-status ${isSuccess ? 'success' : 'error'}">${status}</span>
            <span style="color: #64748b; font-size: 0.75rem;">${duration}ms</span>
        </div>
        <div class="console-body">${typeof body === 'object' ? JSON.stringify(body, null, 2) : body}</div>
    `;

    consoleEl.insertBefore(entry, consoleEl.firstChild);

    const entries = consoleEl.querySelectorAll('.console-entry');
    if (entries.length > 50) {
        entries[entries.length - 1].remove();
    }
}

function clearConsole() {
    if (consoleEl) {
        consoleEl.innerHTML = '<p class="console-welcome">Las respuestas de la API apareceran aqui...</p>';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== GESTION DE COMPONENTES ====================

function loadComponentsSection() {
    // Mostrar catalogo solo para admins
    const catalogSection = document.getElementById('components-catalog');
    const assignSection = document.getElementById('assign-component-section');

    if (isAdmin()) {
        catalogSection?.classList.remove('hidden');
        assignSection?.classList.remove('hidden');
        loadCategories();
        loadCatalogComponents();
    } else {
        catalogSection?.classList.add('hidden');
        assignSection?.classList.add('hidden');
    }

    loadNeedsAttention();
    updateDeviceComponentSelect();

    // Event listeners para formularios del catalogo (solo admin)
    const createCategoryForm = document.getElementById('create-category-form');
    if (createCategoryForm && !createCategoryForm.dataset.initialized) {
        createCategoryForm.addEventListener('submit', handleCreateCategory);
        createCategoryForm.dataset.initialized = 'true';
    }

    const createComponentForm = document.getElementById('create-component-form');
    if (createComponentForm && !createComponentForm.dataset.initialized) {
        createComponentForm.addEventListener('submit', handleCreateCatalogComponent);
        createComponentForm.dataset.initialized = 'true';
    }
}

// ==================== CATEGORIAS ====================

async function loadCategories() {
    const categoriesList = document.getElementById('categories-list');
    const categorySelect = document.getElementById('component-category');

    try {
        const response = await apiRequest('GET', '/components/categories');
        const categories = await response.json();

        categoriesCache = {};
        categories.forEach(c => {
            categoriesCache[c.id] = c;
        });

        // Actualizar select
        if (categorySelect) {
            categorySelect.innerHTML = '<option value="">Categoria</option>';
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                categorySelect.appendChild(option);
            });
        }

        if (!categoriesList) return;

        if (categories.length === 0) {
            categoriesList.innerHTML = '<p class="empty-state">No hay categorias</p>';
            return;
        }

        categoriesList.innerHTML = categories.map(cat => `
            <div class="category-item" data-id="${cat.id}">
                <div class="category-info">
                    <strong>${escapeHtml(cat.name)}</strong>
                    ${cat.description ? ` - ${escapeHtml(cat.description)}` : ''}
                </div>
                <button class="btn btn-danger btn-sm" onclick="deleteCategory('${cat.id}')">X</button>
            </div>
        `).join('');
    } catch (error) {
        if (categoriesList) {
            categoriesList.innerHTML = '<p class="empty-state">Error cargando categorias</p>';
        }
    }
}

async function handleCreateCategory(e) {
    e.preventDefault();

    const name = document.getElementById('category-name').value;
    const description = document.getElementById('category-description').value || null;

    try {
        const response = await apiRequest('POST', '/components/categories', { name, description });

        if (response.ok) {
            document.getElementById('category-name').value = '';
            document.getElementById('category-description').value = '';
            loadCategories();
        }
    } catch (error) {
        console.error('Error creating category:', error);
    }
}

async function deleteCategory(id) {
    if (!confirm('Eliminar esta categoria? Se eliminaran todos sus componentes.')) {
        return;
    }

    try {
        const response = await apiRequest('DELETE', `/components/categories/${id}`);

        if (response.ok) {
            loadCategories();
            loadCatalogComponents();
        }
    } catch (error) {
        console.error('Error deleting category:', error);
    }
}

// ==================== CATALOGO DE COMPONENTES ====================

async function loadCatalogComponents() {
    const componentsList = document.getElementById('catalog-components-list');
    const assignSelect = document.getElementById('assign-component-select');

    try {
        const response = await apiRequest('GET', '/components');
        const components = await response.json();

        componentsCache = {};
        components.forEach(c => {
            componentsCache[c.id] = c;
        });

        // Actualizar select de asignacion
        if (assignSelect) {
            assignSelect.innerHTML = '<option value="">Selecciona componente</option>';
            components.forEach(comp => {
                const option = document.createElement('option');
                option.value = comp.id;
                option.textContent = `${comp.category_name}: ${comp.name}`;
                assignSelect.appendChild(option);
            });
        }

        if (!componentsList) return;

        if (components.length === 0) {
            componentsList.innerHTML = '<p class="empty-state">No hay componentes en el catalogo</p>';
            return;
        }

        componentsList.innerHTML = components.map(comp => `
            <div class="component-catalog-item" data-id="${comp.id}">
                <div class="component-info">
                    <span class="component-category">${escapeHtml(comp.category_name)}</span>
                    <strong>${escapeHtml(comp.name)}</strong>
                    ${comp.specifications ? ` - ${escapeHtml(comp.specifications)}` : ''}
                </div>
                <button class="btn btn-danger btn-sm" onclick="deleteCatalogComponent('${comp.id}')">X</button>
            </div>
        `).join('');
    } catch (error) {
        if (componentsList) {
            componentsList.innerHTML = '<p class="empty-state">Error cargando componentes</p>';
        }
    }
}

async function handleCreateCatalogComponent(e) {
    e.preventDefault();

    const category_id = document.getElementById('component-category').value;
    const name = document.getElementById('component-name').value;
    const specifications = document.getElementById('component-specs').value || null;

    if (!category_id) {
        alert('Selecciona una categoria');
        return;
    }

    try {
        const response = await apiRequest('POST', '/components', { category_id, name, specifications });

        if (response.ok) {
            document.getElementById('component-name').value = '';
            document.getElementById('component-specs').value = '';
            loadCatalogComponents();
        }
    } catch (error) {
        console.error('Error creating component:', error);
    }
}

async function deleteCatalogComponent(id) {
    if (!confirm('Eliminar este componente del catalogo?')) {
        return;
    }

    try {
        const response = await apiRequest('DELETE', `/components/${id}`);

        if (response.ok) {
            loadCatalogComponents();
        }
    } catch (error) {
        console.error('Error deleting component:', error);
    }
}

// ==================== COMPONENTES QUE NECESITAN ATENCION ====================

async function loadNeedsAttention() {
    const attentionList = document.getElementById('needs-attention-list');
    const countEl = document.getElementById('attention-count');

    try {
        const response = await apiRequest('GET', '/components/needs-attention');
        const components = await response.json();

        if (countEl) {
            countEl.textContent = `${components.length} componente${components.length !== 1 ? 's' : ''}`;
        }

        if (!attentionList) return;

        if (components.length === 0) {
            attentionList.innerHTML = '<p class="empty-state">No hay componentes que necesiten atencion</p>';
            return;
        }

        attentionList.innerHTML = components.map(comp => `
            <div class="attention-item ${comp.status}" data-id="${comp.device_component_id}">
                <div class="attention-status ${comp.status}">
                    ${getStatusIcon(comp.status)}
                </div>
                <div class="attention-info">
                    <div class="attention-component">${escapeHtml(comp.component_name)}</div>
                    <div class="attention-device">${escapeHtml(comp.device_name)} - ${escapeHtml(comp.category_name)}</div>
                    <div class="attention-meta">
                        ${getStatusText(comp.status)}
                        ${comp.notes ? ` - ${escapeHtml(comp.notes)}` : ''}
                    </div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="openComponentModal('${comp.device_id}', '${comp.device_component_id}')">
                    Ver
                </button>
            </div>
        `).join('');
    } catch (error) {
        if (attentionList) {
            attentionList.innerHTML = '<p class="empty-state">Error cargando componentes</p>';
        }
    }
}

function getStatusIcon(status) {
    switch (status) {
        case 'needs_replacement': return '!';
        case 'needs_repair': return '!';
        case 'replaced': return '-';
        default: return '?';
    }
}

function getStatusText(status) {
    switch (status) {
        case 'ok': return 'Funcionando';
        case 'needs_repair': return 'Necesita reparacion';
        case 'needs_replacement': return 'Necesita sustitucion';
        case 'replaced': return 'Sustituido';
        default: return status;
    }
}

// ==================== COMPONENTES POR DISPOSITIVO ====================

function updateDeviceComponentSelect() {
    const deviceSelect = document.getElementById('device-component-select');
    if (!deviceSelect) return;

    deviceSelect.innerHTML = '<option value="">Selecciona un dispositivo</option>';
    Object.values(devicesCache).forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = device.name;
        deviceSelect.appendChild(option);
    });
}

// Tiempo de espera para ocultar componentes sustituidos (15 minutos en ms)
const REPLACED_HIDE_TIMEOUT_MS = 15 * 60 * 1000;

// Intervalo para actualizar contadores
let componentCountdownInterval = null;

async function loadDeviceComponents() {
    const deviceSelect = document.getElementById('device-component-select');
    const componentsList = document.getElementById('device-components-list');
    const assignSection = document.getElementById('assign-component-section');
    const deviceId = deviceSelect?.value;

    // Limpiar intervalo anterior
    if (componentCountdownInterval) {
        clearInterval(componentCountdownInterval);
        componentCountdownInterval = null;
    }

    if (!deviceId) {
        if (componentsList) {
            componentsList.innerHTML = '<p class="empty-state">Selecciona un dispositivo</p>';
        }
        assignSection?.classList.add('hidden');
        return;
    }

    if (isAdmin()) {
        assignSection?.classList.remove('hidden');
    }

    try {
        const response = await apiRequest('GET', `/devices/${deviceId}/components`);
        const components = await response.json();

        if (!componentsList) return;

        // Filtrar componentes sustituidos que ya expiraron (15 min)
        const now = new Date();
        const visibleComponents = components.filter(comp => {
            if (comp.status === 'replaced' && comp.replaced_at) {
                const replacedAt = new Date(comp.replaced_at);
                const elapsed = now - replacedAt;
                return elapsed < REPLACED_HIDE_TIMEOUT_MS;
            }
            return true;
        });

        if (visibleComponents.length === 0) {
            componentsList.innerHTML = '<p class="empty-state">Este dispositivo no tiene componentes asignados</p>';
            return;
        }

        componentsList.innerHTML = visibleComponents.map(comp => {
            const countdownHtml = getReplacedCountdownHtml(comp);
            return `
                <div class="device-component-item ${comp.status}" data-id="${comp.id}" data-replaced-at="${comp.replaced_at || ''}">
                    <div class="component-status-indicator ${comp.status}"></div>
                    <div class="component-info">
                        <span class="component-category">${escapeHtml(comp.category_name)}</span>
                        <strong>${escapeHtml(comp.component_name)}</strong>
                        <div class="component-meta">
                            ${getStatusText(comp.status)}
                            ${comp.notes ? ` - ${escapeHtml(comp.notes)}` : ''}
                        </div>
                        ${countdownHtml}
                    </div>
                    <div class="component-actions">
                        <button class="btn btn-secondary btn-sm" onclick="openComponentModal('${deviceId}', '${comp.id}')">
                            Detalles
                        </button>
                        ${isAdmin() ? `
                            <button class="btn btn-danger btn-sm" onclick="removeComponentFromDevice('${deviceId}', '${comp.id}')">
                                Quitar
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Iniciar intervalo para actualizar contadores si hay componentes sustituidos
        const hasReplacedComponents = visibleComponents.some(c => c.status === 'replaced' && c.replaced_at);
        if (hasReplacedComponents) {
            componentCountdownInterval = setInterval(() => {
                updateReplacedCountdowns();
            }, 1000);
        }
    } catch (error) {
        if (componentsList) {
            componentsList.innerHTML = '<p class="empty-state">Error cargando componentes</p>';
        }
    }
}

function getReplacedCountdownHtml(comp) {
    if (comp.status !== 'replaced' || !comp.replaced_at) {
        return '';
    }

    const replacedAt = new Date(comp.replaced_at);
    const now = new Date();
    const elapsed = now - replacedAt;
    const remaining = REPLACED_HIDE_TIMEOUT_MS - elapsed;

    if (remaining <= 0) {
        return '';
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    return `
        <div class="replaced-countdown" data-component-id="${comp.id}">
            <span class="countdown-icon">&#128337;</span>
            <span class="countdown-text">Se ocultara en <strong class="countdown-time">${timeStr}</strong></span>
        </div>
    `;
}

function updateReplacedCountdowns() {
    const countdownElements = document.querySelectorAll('.replaced-countdown');
    const now = new Date();
    let needsReload = false;

    countdownElements.forEach(el => {
        const componentItem = el.closest('.device-component-item');
        const replacedAtStr = componentItem?.dataset.replacedAt;

        if (!replacedAtStr) return;

        const replacedAt = new Date(replacedAtStr);
        const elapsed = now - replacedAt;
        const remaining = REPLACED_HIDE_TIMEOUT_MS - elapsed;

        if (remaining <= 0) {
            // El tiempo expiro, ocultar el componente
            componentItem.style.display = 'none';
            needsReload = true;
        } else {
            // Actualizar el contador
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            const timeEl = el.querySelector('.countdown-time');
            if (timeEl) {
                timeEl.textContent = timeStr;
            }
        }
    });

    // Si algun componente expiro, verificar si quedan componentes visibles
    if (needsReload) {
        const componentsList = document.getElementById('device-components-list');
        const visibleItems = componentsList?.querySelectorAll('.device-component-item:not([style*="display: none"])');
        if (visibleItems && visibleItems.length === 0) {
            componentsList.innerHTML = '<p class="empty-state">Este dispositivo no tiene componentes asignados</p>';
            if (componentCountdownInterval) {
                clearInterval(componentCountdownInterval);
                componentCountdownInterval = null;
            }
        }
    }
}

async function assignComponentToDevice() {
    const deviceSelect = document.getElementById('device-component-select');
    const componentSelect = document.getElementById('assign-component-select');

    const deviceId = deviceSelect?.value;
    const componentId = componentSelect?.value;

    if (!deviceId || !componentId) {
        alert('Selecciona un dispositivo y un componente');
        return;
    }

    try {
        const response = await apiRequest('POST', `/devices/${deviceId}/components`, {
            component_id: componentId
        });

        if (response.ok) {
            componentSelect.value = '';
            loadDeviceComponents();
        }
    } catch (error) {
        console.error('Error assigning component:', error);
    }
}

async function removeComponentFromDevice(deviceId, componentId) {
    if (!confirm('Quitar este componente del dispositivo?')) {
        return;
    }

    try {
        const response = await apiRequest('DELETE', `/devices/${deviceId}/components/${componentId}`);

        if (response.ok) {
            loadDeviceComponents();
        }
    } catch (error) {
        console.error('Error removing component:', error);
    }
}

// ==================== MODAL DE COMPONENTE ====================

async function openComponentModal(deviceId, componentId) {
    const modal = document.getElementById('component-modal');
    const detailsEl = document.getElementById('component-details');
    const maintenanceList = document.getElementById('maintenance-list');

    try {
        const response = await apiRequest('GET', `/devices/${deviceId}/components/${componentId}`);
        const comp = await response.json();

        document.getElementById('component-device-id').value = deviceId;
        document.getElementById('component-id').value = componentId;
        document.getElementById('component-status').value = comp.status;
        document.getElementById('component-notes').value = comp.notes || '';

        detailsEl.innerHTML = `
            <p><strong>Componente:</strong> ${escapeHtml(comp.component_name)}</p>
            <p><strong>Categoria:</strong> ${escapeHtml(comp.category_name)}</p>
            <p><strong>Dispositivo:</strong> ${escapeHtml(comp.device_name)}</p>
            <p><strong>Estado:</strong> <span class="status-badge ${comp.status}">${getStatusText(comp.status)}</span></p>
            <p><strong>Instalado:</strong> ${formatDate(comp.installed_at)}${comp.installed_by_name ? ` por ${escapeHtml(comp.installed_by_name)}` : ''}</p>
            ${comp.notes ? `<p><strong>Notas:</strong> ${escapeHtml(comp.notes)}</p>` : ''}
        `;

        // Cargar historial de mantenimiento
        loadMaintenanceHistory(deviceId, componentId);

        modal?.classList.remove('hidden');
    } catch (error) {
        console.error('Error loading component:', error);
    }
}

function closeComponentModal() {
    document.getElementById('component-modal')?.classList.add('hidden');
}

async function loadMaintenanceHistory(deviceId, componentId) {
    const maintenanceList = document.getElementById('maintenance-list');
    if (!maintenanceList) return;

    try {
        const response = await apiRequest('GET', `/devices/${deviceId}/components/${componentId}/maintenance`);
        const maintenances = await response.json();

        if (maintenances.length === 0) {
            maintenanceList.innerHTML = '<p class="empty-state">Sin mantenimientos registrados</p>';
            return;
        }

        maintenanceList.innerHTML = maintenances.map(m => `
            <div class="maintenance-item">
                <div class="maintenance-type ${m.maintenance_type}">${getMaintenanceTypeText(m.maintenance_type)}</div>
                <div class="maintenance-info">
                    ${m.description ? escapeHtml(m.description) : 'Sin descripcion'}
                    <div class="maintenance-meta">
                        ${formatDate(m.performed_at)}${m.performed_by_name ? ` - ${escapeHtml(m.performed_by_name)}` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        maintenanceList.innerHTML = '<p class="empty-state">Error cargando mantenimientos</p>';
    }
}

function getMaintenanceTypeText(type) {
    switch (type) {
        case 'inspection': return 'Inspeccion';
        case 'repair': return 'Reparacion';
        case 'replacement': return 'Sustitucion';
        default: return type;
    }
}

async function handleUpdateComponentStatus(e) {
    e.preventDefault();

    const deviceId = document.getElementById('component-device-id').value;
    const componentId = document.getElementById('component-id').value;
    const status = document.getElementById('component-status').value;
    const notes = document.getElementById('component-notes').value || null;

    try {
        const response = await apiRequest('PUT', `/devices/${deviceId}/components/${componentId}`, {
            status,
            notes
        });

        if (response.ok) {
            // Refrescar la lista de componentes del dispositivo (seccion admin)
            loadDeviceComponents();
            // Refrescar lista de componentes que necesitan atencion
            loadNeedsAttention();
            // Refrescar el modal de componentes del dispositivo (si esta abierto - workers)
            const deviceComponentsModal = document.getElementById('device-components-modal');
            if (deviceComponentsModal && !deviceComponentsModal.classList.contains('hidden')) {
                const modalDeviceId = document.getElementById('device-components-modal-id')?.value;
                const deviceName = document.getElementById('device-components-title')?.textContent;
                if (modalDeviceId) {
                    openDeviceComponentsModal(modalDeviceId, deviceName || '');
                }
            }
            // Recargar el modal de detalles con datos actualizados
            openComponentModal(deviceId, componentId);
        }
    } catch (error) {
        console.error('Error updating component:', error);
    }
}

async function handleCreateMaintenance(e) {
    e.preventDefault();

    const deviceId = document.getElementById('component-device-id').value;
    const componentId = document.getElementById('component-id').value;
    const maintenance_type = document.getElementById('maintenance-type').value;
    const description = document.getElementById('maintenance-description').value || null;

    try {
        const response = await apiRequest('POST', `/devices/${deviceId}/components/${componentId}/maintenance`, {
            maintenance_type,
            description
        });

        if (response.ok) {
            document.getElementById('maintenance-description').value = '';
            loadMaintenanceHistory(deviceId, componentId);
        }
    } catch (error) {
        console.error('Error creating maintenance:', error);
    }
}

// ==================== ESTADISTICAS ====================

let detectionsChart = null;
let alertsChart = null;

async function loadStatsSection() {
    // Cargar todo en paralelo
    Promise.all([
        loadStatsOverview(),
        loadDetectionTrends(),
        loadAlertTrends(),
        loadDeviceRankings(),
        loadComponentRankings(),
        loadMaintenanceByDevice(),
        loadWorkerPerformance()
    ]);
}

async function loadStatsOverview() {
    try {
        const response = await apiRequest('GET', '/stats/overview');
        const data = await response.json();

        // Dispositivos
        document.getElementById('stat-devices-total').textContent = data.devices.total;
        const activeCount = data.devices.by_status?.active || 0;
        const offlineCount = data.devices.by_status?.offline || 0;
        document.getElementById('stat-devices-detail').textContent =
            `${activeCount} activos, ${offlineCount} offline`;

        // Detecciones
        document.getElementById('stat-detections-total').textContent = data.detections.total;
        const avgScore = (data.detections.avg_score * 100).toFixed(1);
        document.getElementById('stat-detections-detail').textContent =
            `${data.detections.today} hoy, promedio ${avgScore}%`;

        // Alertas
        document.getElementById('stat-alerts-total').textContent = data.alerts.total;
        document.getElementById('stat-alerts-detail').textContent =
            `${data.alerts.unacknowledged} pendientes, ${data.alerts.today} hoy`;

        // Componentes
        document.getElementById('stat-components-total').textContent = data.components.total_installed;
        document.getElementById('stat-components-detail').textContent =
            `${data.components.needing_attention} necesitan atencion`;

    } catch (error) {
        console.error('Error loading stats overview:', error);
    }
}

async function loadDetectionTrends() {
    try {
        const response = await apiRequest('GET', '/stats/detections/trends?days=30');
        const trends = await response.json();

        const ctx = document.getElementById('chart-detections');
        if (!ctx) return;

        // Destruir chart anterior si existe
        if (detectionsChart) {
            detectionsChart.destroy();
        }

        const labels = trends.map(t => formatChartDate(t.date));
        const counts = trends.map(t => t.count);
        const avgScores = trends.map(t => (t.avg_score * 100).toFixed(1));

        detectionsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Detecciones',
                        data: counts,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Score Promedio %',
                        data: avgScores,
                        borderColor: '#2563eb',
                        backgroundColor: 'transparent',
                        borderDash: [5, 5],
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    y: {
                        type: 'linear',
                        position: 'left',
                        beginAtZero: true,
                        title: { display: true, text: 'Detecciones' }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: 'Score %' },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });

    } catch (error) {
        console.error('Error loading detection trends:', error);
    }
}

async function loadAlertTrends() {
    try {
        const response = await apiRequest('GET', '/stats/alerts/trends?days=30');
        const trends = await response.json();

        const ctx = document.getElementById('chart-alerts');
        if (!ctx) return;

        // Destruir chart anterior si existe
        if (alertsChart) {
            alertsChart.destroy();
        }

        const labels = trends.map(t => formatChartDate(t.date));
        const counts = trends.map(t => t.count);

        alertsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Alertas',
                    data: counts,
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: '#dc2626',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                },
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });

    } catch (error) {
        console.error('Error loading alert trends:', error);
    }
}

async function loadDeviceRankings() {
    try {
        const [alertsRes, detectionsRes] = await Promise.all([
            apiRequest('GET', '/stats/devices/top-alerts?limit=5'),
            apiRequest('GET', '/stats/devices/top-detections?limit=5')
        ]);

        const alertsRanking = await alertsRes.json();
        const detectionsRanking = await detectionsRes.json();

        // Ranking de alertas
        const alertsList = document.getElementById('ranking-alerts');
        if (alertsList) {
            if (alertsRanking.length === 0) {
                alertsList.innerHTML = '<p class="empty-state">Sin datos</p>';
            } else {
                alertsList.innerHTML = alertsRanking.map((item, idx) =>
                    createRankingItem(idx + 1, item.device_name, `${item.count} alertas`, item.count)
                ).join('');
            }
        }

        // Ranking de detecciones
        const detectionsList = document.getElementById('ranking-detections');
        if (detectionsList) {
            if (detectionsRanking.length === 0) {
                detectionsList.innerHTML = '<p class="empty-state">Sin datos</p>';
            } else {
                detectionsList.innerHTML = detectionsRanking.map((item, idx) =>
                    createRankingItem(idx + 1, item.device_name, `${item.count} detecciones`, item.count)
                ).join('');
            }
        }

    } catch (error) {
        console.error('Error loading device rankings:', error);
    }
}

async function loadComponentRankings() {
    try {
        const response = await apiRequest('GET', '/stats/components/top-replaced?limit=5');
        const ranking = await response.json();

        const list = document.getElementById('ranking-replacements');
        if (!list) return;

        if (ranking.length === 0) {
            list.innerHTML = '<p class="empty-state">Sin reemplazos registrados</p>';
            return;
        }

        list.innerHTML = ranking.map((item, idx) =>
            createRankingItem(idx + 1, item.component_name, item.category_name, item.count)
        ).join('');

    } catch (error) {
        console.error('Error loading component rankings:', error);
    }
}

async function loadMaintenanceByDevice() {
    try {
        const response = await apiRequest('GET', '/stats/maintenance/by-device');
        const data = await response.json();

        const container = document.getElementById('maintenance-by-device');
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = '<p class="empty-state">Sin mantenimientos registrados</p>';
            return;
        }

        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Dispositivo</th>
                        <th>Inspecciones</th>
                        <th>Reparaciones</th>
                        <th>Sustituciones</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(item => `
                        <tr>
                            <td><strong>${escapeHtml(item.device_name)}</strong></td>
                            <td>${item.inspections}</td>
                            <td>${item.repairs}</td>
                            <td>${item.replacements}</td>
                            <td><strong>${item.total}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error('Error loading maintenance by device:', error);
    }
}

async function loadWorkerPerformance() {
    try {
        const response = await apiRequest('GET', '/stats/workers/performance');
        const data = await response.json();

        const container = document.getElementById('worker-performance');
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = '<p class="empty-state">Sin workers registrados</p>';
            return;
        }

        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Worker</th>
                        <th>Dispositivos</th>
                        <th>Alertas Reconocidas</th>
                        <th>Mantenimientos</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(item => `
                        <tr>
                            <td>
                                <strong>${escapeHtml(item.worker_name || item.worker_email.split('@')[0])}</strong>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(item.worker_email)}</div>
                            </td>
                            <td>${item.devices_assigned}</td>
                            <td>${item.alerts_acknowledged}</td>
                            <td>${item.maintenances_done}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error('Error loading worker performance:', error);
    }
}

function createRankingItem(position, name, detail, count) {
    const posClass = position === 1 ? 'gold' : position === 2 ? 'silver' : position === 3 ? 'bronze' : '';
    return `
        <div class="ranking-item">
            <div class="ranking-position ${posClass}">${position}</div>
            <div class="ranking-info">
                <div class="ranking-name">${escapeHtml(name)}</div>
                <div class="ranking-detail">${escapeHtml(detail)}</div>
            </div>
            <div class="ranking-count">${count}</div>
        </div>
    `;
}

function formatChartDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

// ==================== MODAL DE COMPONENTES DE DISPOSITIVO (para workers) ====================

let deviceComponentsCountdownInterval = null;

async function openDeviceComponentsModal(deviceId, deviceName) {
    const modal = document.getElementById('device-components-modal');
    const titleEl = document.getElementById('device-components-title');
    const listEl = document.getElementById('device-components-modal-list');
    const idInput = document.getElementById('device-components-modal-id');

    // Limpiar intervalo anterior
    if (deviceComponentsCountdownInterval) {
        clearInterval(deviceComponentsCountdownInterval);
        deviceComponentsCountdownInterval = null;
    }

    if (titleEl) titleEl.textContent = deviceName;
    if (idInput) idInput.value = deviceId;

    modal?.classList.remove('hidden');

    try {
        const response = await apiRequest('GET', `/devices/${deviceId}/components`);
        const components = await response.json();

        if (!listEl) return;

        // Filtrar componentes sustituidos que ya expiraron (15 min)
        const now = new Date();
        const visibleComponents = components.filter(comp => {
            if (comp.status === 'replaced' && comp.replaced_at) {
                const replacedAt = new Date(comp.replaced_at);
                const elapsed = now - replacedAt;
                return elapsed < REPLACED_HIDE_TIMEOUT_MS;
            }
            return true;
        });

        if (visibleComponents.length === 0) {
            listEl.innerHTML = '<p class="empty-state">Este dispositivo no tiene componentes asignados</p>';
            return;
        }

        listEl.innerHTML = visibleComponents.map(comp => {
            const countdownHtml = getReplacedCountdownHtml(comp);
            return `
                <div class="device-component-item ${comp.status}" data-id="${comp.id}" data-replaced-at="${comp.replaced_at || ''}">
                    <div class="component-status-indicator ${comp.status}"></div>
                    <div class="component-info">
                        <span class="component-category">${escapeHtml(comp.category_name)}</span>
                        <strong>${escapeHtml(comp.component_name)}</strong>
                        <div class="component-meta">
                            ${getStatusText(comp.status)}
                            ${comp.notes ? ` - ${escapeHtml(comp.notes)}` : ''}
                        </div>
                        ${countdownHtml}
                    </div>
                    <div class="component-actions">
                        <button class="btn btn-secondary btn-sm" onclick="openComponentModal('${deviceId}', '${comp.id}')">
                            Detalles
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Iniciar intervalo para actualizar contadores si hay componentes sustituidos
        const hasReplacedComponents = visibleComponents.some(c => c.status === 'replaced' && c.replaced_at);
        if (hasReplacedComponents) {
            deviceComponentsCountdownInterval = setInterval(() => {
                updateDeviceComponentsModalCountdowns(deviceId);
            }, 1000);
        }
    } catch (error) {
        if (listEl) {
            listEl.innerHTML = '<p class="empty-state">Error cargando componentes</p>';
        }
    }
}

function closeDeviceComponentsModal() {
    document.getElementById('device-components-modal')?.classList.add('hidden');
    if (deviceComponentsCountdownInterval) {
        clearInterval(deviceComponentsCountdownInterval);
        deviceComponentsCountdownInterval = null;
    }
}

function updateDeviceComponentsModalCountdowns(deviceId) {
    const listEl = document.getElementById('device-components-modal-list');
    const countdownElements = listEl?.querySelectorAll('.replaced-countdown');
    if (!countdownElements) return;

    const now = new Date();
    let needsReload = false;

    countdownElements.forEach(el => {
        const componentItem = el.closest('.device-component-item');
        const replacedAtStr = componentItem?.dataset.replacedAt;

        if (!replacedAtStr) return;

        const replacedAt = new Date(replacedAtStr);
        const elapsed = now - replacedAt;
        const remaining = REPLACED_HIDE_TIMEOUT_MS - elapsed;

        if (remaining <= 0) {
            componentItem.style.display = 'none';
            needsReload = true;
        } else {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            const timeEl = el.querySelector('.countdown-time');
            if (timeEl) {
                timeEl.textContent = timeStr;
            }
        }
    });

    if (needsReload) {
        const visibleItems = listEl?.querySelectorAll('.device-component-item:not([style*="display: none"])');
        if (visibleItems && visibleItems.length === 0) {
            listEl.innerHTML = '<p class="empty-state">Este dispositivo no tiene componentes asignados</p>';
            if (deviceComponentsCountdownInterval) {
                clearInterval(deviceComponentsCountdownInterval);
                deviceComponentsCountdownInterval = null;
            }
        }
    }
}

// Hacer funciones accesibles globalmente para onclick
window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.deleteDevice = deleteDevice;
window.acknowledgeAlert = acknowledgeAlert;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.showSection = showSection;
window.loadWorkers = loadWorkers;
window.viewWorker = viewWorker;
window.deleteWorker = deleteWorker;
window.closeWorkerModal = closeWorkerModal;
window.loadAssignments = loadAssignments;
window.unassignDevice = unassignDevice;
window.loadNeedsAttention = loadNeedsAttention;
window.loadDeviceComponents = loadDeviceComponents;
window.assignComponentToDevice = assignComponentToDevice;
window.removeComponentFromDevice = removeComponentFromDevice;
window.openComponentModal = openComponentModal;
window.closeComponentModal = closeComponentModal;
window.deleteCategory = deleteCategory;
window.deleteCatalogComponent = deleteCatalogComponent;
window.openDeviceComponentsModal = openDeviceComponentsModal;
window.closeDeviceComponentsModal = closeDeviceComponentsModal;
window.useMyLocation = useMyLocation;
window.openCreateDeviceModal = openCreateDeviceModal;
window.closeCreateDeviceModal = closeCreateDeviceModal;
window.exportData = exportData;
window.testConnection = testConnection;
window.clearLocalData = clearLocalData;
window.setup2FA = setup2FA;
window.verify2FA = verify2FA;
window.disable2FA = disable2FA;
window.cancel2FASetup = cancel2FASetup;

// ==================== MODAL CREAR DISPOSITIVO ====================

function openCreateDeviceModal() {
    const modal = document.getElementById('create-device-modal');
    modal?.classList.remove('hidden');

    // Cerrar al hacer click fuera del contenido
    modal?.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeCreateDeviceModal();
        }
    }, { once: true });

    // Inicializar mapa despues de que el modal sea visible
    setTimeout(() => {
        initLocationPickerMap();
    }, 100);
}

function closeCreateDeviceModal() {
    const modal = document.getElementById('create-device-modal');
    modal?.classList.add('hidden');
    resetLocationPicker();
    document.getElementById('create-device-form')?.reset();
}

// ==================== SECCION CONFIGURACION ====================

function loadConfigSection() {
    // Mostrar info del sistema
    document.getElementById('config-backend-url').textContent = CONFIG.API_URL;
    document.getElementById('config-user-email').textContent = currentUser?.email || '-';
    document.getElementById('config-user-role').textContent = currentUser?.role || '-';

    // Estado de conexion
    testConnection(true);

    // Cargar estado 2FA
    load2FAStatus();
}

// ==================== 2FA ====================

async function load2FAStatus() {
    const statusEl = document.getElementById('2fa-status');
    const setupSection = document.getElementById('2fa-setup-section');
    const disableSection = document.getElementById('2fa-disable-section');

    try {
        const response = await fetch(`${API_BASE}/auth/2fa/status`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Error obteniendo estado 2FA');

        const data = await response.json();

        if (data.totp_enabled) {
            statusEl.textContent = 'Activo';
            statusEl.style.color = 'var(--success)';
            setupSection.classList.add('hidden');
            disableSection.classList.remove('hidden');
        } else {
            statusEl.textContent = 'No configurado';
            statusEl.style.color = 'var(--warning)';
            setupSection.classList.remove('hidden');
            disableSection.classList.add('hidden');
        }
    } catch (error) {
        statusEl.textContent = 'Error';
        statusEl.style.color = 'var(--danger)';
        console.error('Error loading 2FA status:', error);
    }
}

async function setup2FA() {
    const qrContainer = document.getElementById('2fa-qr-container');
    const setupBtn = document.getElementById('btn-setup-2fa');

    try {
        setupBtn.disabled = true;
        setupBtn.textContent = 'Generando...';

        const response = await fetch(`${API_BASE}/auth/2fa/setup`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Error configurando 2FA');
        }

        const data = await response.json();

        // Mostrar QR code
        document.getElementById('2fa-qr-image').src = data.qr_code_b64;
        document.getElementById('2fa-secret').textContent = data.secret;
        qrContainer.classList.remove('hidden');
        setupBtn.classList.add('hidden');

    } catch (error) {
        alert('Error: ' + error.message);
        setupBtn.disabled = false;
        setupBtn.textContent = 'Configurar 2FA';
    }
}

function cancel2FASetup() {
    document.getElementById('2fa-qr-container').classList.add('hidden');
    document.getElementById('btn-setup-2fa').classList.remove('hidden');
    document.getElementById('btn-setup-2fa').disabled = false;
    document.getElementById('btn-setup-2fa').textContent = 'Configurar 2FA';
    document.getElementById('2fa-verify-code').value = '';
}

async function verify2FA() {
    const code = document.getElementById('2fa-verify-code').value;

    if (!code || code.length !== 6) {
        alert('Introduce un codigo de 6 digitos');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/2fa/verify`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Codigo invalido');
        }

        alert('2FA activado correctamente!');
        cancel2FASetup();
        load2FAStatus();

        // Actualizar usuario en cache
        if (currentUser) {
            currentUser.totp_enabled = true;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        }

    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function disable2FA() {
    const password = document.getElementById('2fa-disable-password').value;

    if (!password) {
        alert('Introduce tu contrasena para desactivar 2FA');
        return;
    }

    if (!confirm('Estas seguro de que quieres desactivar 2FA? Tu cuenta sera menos segura.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/2fa/disable`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error desactivando 2FA');
        }

        alert('2FA desactivado');
        document.getElementById('2fa-disable-password').value = '';
        load2FAStatus();

        // Actualizar usuario en cache
        if (currentUser) {
            currentUser.totp_enabled = false;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        }

    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function testConnection(silent = false) {
    const statusEl = document.getElementById('config-connection-status');

    try {
        const start = performance.now();
        const response = await fetch(`${API_BASE}/devices`, {
            method: 'HEAD',
            headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
        });
        const latency = Math.round(performance.now() - start);

        if (response.ok || response.status === 401) {
            if (statusEl) {
                statusEl.textContent = `Conectado (${latency}ms)`;
                statusEl.style.color = 'var(--success)';
            }
            if (!silent) alert(`Conexion exitosa. Latencia: ${latency}ms`);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        if (statusEl) {
            statusEl.textContent = 'Error de conexion';
            statusEl.style.color = 'var(--danger)';
        }
        if (!silent) alert('Error de conexion: ' + error.message);
    }
}

function exportData() {
    const data = {
        exportDate: new Date().toISOString(),
        user: currentUser,
        devices: Object.values(devicesCache),
        workers: Object.values(workersCache),
        categories: Object.values(categoriesCache),
        components: Object.values(componentsCache)
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `centinela-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function clearLocalData() {
    if (!confirm('Esto cerrara tu sesion y limpiara todos los datos locales. Continuar?')) {
        return;
    }

    // Limpiar caches
    devicesCache = {};
    workersCache = {};
    categoriesCache = {};
    componentsCache = {};
    latestDetections = {};

    // Cerrar sesion
    logout();
}

// ==================== CONFIGURACION DISPOSITIVO ESP ====================

// Estado del modal de configuracion
let currentConfigDeviceId = null;
let currentConfigTab = 'info';
let camWifiEnabled = false;
let camWifiPending = false;

// Abrir modal de configuracion
async function openDeviceConfigModal(deviceId) {
    currentConfigDeviceId = deviceId;
    const device = devicesCache[deviceId];

    if (!device) {
        alert('Dispositivo no encontrado');
        return;
    }

    // Establecer nombre en el titulo
    document.getElementById('config-device-name').textContent = device.name;
    document.getElementById('config-device-id').value = deviceId;

    // Mostrar tab de info por defecto
    showConfigTab('info');

    // Cargar datos del dispositivo
    await loadDeviceConfigInfo(deviceId);

    // Cargar configuracion ESP si existe
    await loadEspConfig(deviceId);

    // Mostrar modal
    document.getElementById('device-config-modal').classList.remove('hidden');
}

// Cerrar modal
function closeDeviceConfigModal() {
    document.getElementById('device-config-modal').classList.add('hidden');
    currentConfigDeviceId = null;
}

// Cambiar tab
function showConfigTab(tabName) {
    currentConfigTab = tabName;

    // Actualizar botones
    document.querySelectorAll('.config-tab').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(tabName));
    });

    // Mostrar contenido
    document.querySelectorAll('.config-tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    document.getElementById(`config-tab-${tabName}`).classList.remove('hidden');
}

// Cargar info del dispositivo
async function loadDeviceConfigInfo(deviceId) {
    const device = devicesCache[deviceId];

    // Info basica
    document.getElementById('config-info-id').textContent = device.device_id;
    document.getElementById('config-info-last-seen').textContent = device.last_seen_at
        ? formatDate(device.last_seen_at)
        : 'Nunca';
    document.getElementById('config-info-battery').textContent = device.battery_level
        ? `${device.battery_level}%`
        : 'N/A';

    // Cargar info extendida del ESP si esta disponible
    try {
        const response = await apiRequest('GET', `/devices/${deviceId}/esp-status`);
        if (response.ok) {
            const espStatus = await response.json();
            document.getElementById('config-info-session').textContent =
                espStatus.current_session ? `${espStatus.current_session}/3` : '-';
            document.getElementById('config-info-boots').textContent =
                espStatus.boot_count ?? '-';
            document.getElementById('config-info-sleep').textContent =
                espStatus.deep_sleep_enabled ? 'Habilitado' : 'Deshabilitado';

            // Ultima deteccion
            if (espStatus.last_detection) {
                document.getElementById('config-info-detection').textContent =
                    `${espStatus.last_detection.score}%`;
                document.getElementById('config-info-detection-date').textContent =
                    formatDate(espStatus.last_detection.date);
            }
        }
    } catch (error) {
        // Si no hay endpoint de ESP status, usar valores por defecto
        document.getElementById('config-info-session').textContent = '-';
        document.getElementById('config-info-boots').textContent = '-';
        document.getElementById('config-info-sleep').textContent = '-';
        document.getElementById('config-info-detection').textContent = '-';
        document.getElementById('config-info-detection-date').textContent = '-';
    }

    // Cargar ultima deteccion desde el endpoint normal
    try {
        const detResponse = await apiRequest('GET', `/detections?device_id=${deviceId}&limit=1`);
        if (detResponse.ok) {
            const detections = await detResponse.json();
            if (detections.length > 0) {
                const det = detections[0];
                document.getElementById('config-info-detection').textContent =
                    `${Math.round(det.detection_score * 100)}%`;
                document.getElementById('config-info-detection-date').textContent =
                    formatDate(det.detected_at);
            }
        }
    } catch (error) {
        // Ignorar errores
    }
}

// Cargar configuracion ESP
async function loadEspConfig(deviceId) {
    try {
        const response = await apiRequest('GET', `/devices/${deviceId}/config`);
        if (response.ok) {
            const config = await response.json();

            // Horarios
            if (config.wake_hours && config.wake_hours.length >= 3) {
                document.getElementById('config-hour-1').value = config.wake_hours[0];
                document.getElementById('config-hour-2').value = config.wake_hours[1];
                document.getElementById('config-hour-3').value = config.wake_hours[2];
            }

            // Fotos
            if (config.photos_per_session) {
                document.getElementById('config-photos-count').value = config.photos_per_session;
            }
            if (config.photo_interval_min) {
                document.getElementById('config-photos-interval').value = config.photo_interval_min;
            }

            // Deep sleep
            document.getElementById('config-sleep-enabled').checked =
                config.deep_sleep_enabled !== false;

            // Estado WiFi CAM
            updateCamWifiStatus(config.cam_wifi_enabled, config.cam_wifi_pending);

            // Stats SD
            if (config.sd_stats) {
                document.getElementById('config-sd-used').textContent =
                    formatBytes(config.sd_stats.used_bytes);
                document.getElementById('config-sd-free').textContent =
                    formatBytes(config.sd_stats.free_bytes);
                document.getElementById('config-sd-images').textContent =
                    config.sd_stats.total_images ?? '-';
                document.getElementById('config-sd-days').textContent =
                    config.sd_stats.days_stored ?? '-';
            }
        }
    } catch (error) {
        // Usar valores por defecto si no hay config guardada
        console.log('No hay configuracion ESP guardada, usando valores por defecto');
    }
}

// Guardar configuracion ESP
async function saveEspConfig(event) {
    event.preventDefault();

    const config = {
        wake_hours: [
            parseInt(document.getElementById('config-hour-1').value),
            parseInt(document.getElementById('config-hour-2').value),
            parseInt(document.getElementById('config-hour-3').value)
        ],
        photos_per_session: parseInt(document.getElementById('config-photos-count').value),
        photo_interval_min: parseInt(document.getElementById('config-photos-interval').value),
        deep_sleep_enabled: document.getElementById('config-sleep-enabled').checked
    };

    // Validar horarios
    if (config.wake_hours.some(h => h < 0 || h > 23)) {
        alert('Las horas deben estar entre 0 y 23');
        return;
    }

    // Validar que los horarios esten ordenados
    if (config.wake_hours[0] >= config.wake_hours[1] ||
        config.wake_hours[1] >= config.wake_hours[2]) {
        alert('Los horarios deben estar en orden ascendente');
        return;
    }

    try {
        const response = await apiRequest('PUT', `/devices/${currentConfigDeviceId}/config`, config);
        if (response.ok) {
            alert('Configuracion guardada. Se aplicara en la proxima conexion del dispositivo.');
            logToConsole('PUT', `/devices/${currentConfigDeviceId}/config`, 200, config);
        } else {
            const error = await response.json();
            alert('Error guardando configuracion: ' + (error.detail || 'Error desconocido'));
        }
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
}

// Restaurar configuracion por defecto
function resetEspConfig() {
    if (!confirm('Restaurar valores por defecto?')) return;

    document.getElementById('config-hour-1').value = 9;
    document.getElementById('config-hour-2').value = 15;
    document.getElementById('config-hour-3').value = 18;
    document.getElementById('config-photos-count').value = 3;
    document.getElementById('config-photos-interval').value = 3;
    document.getElementById('config-sleep-enabled').checked = true;
}

// Actualizar estado WiFi CAM
function updateCamWifiStatus(enabled, pending) {
    camWifiEnabled = enabled;
    camWifiPending = pending;

    const statusBox = document.getElementById('cam-wifi-status');
    const indicator = statusBox.querySelector('.wifi-indicator');
    const stateText = statusBox.querySelector('.wifi-state');
    const hintText = statusBox.querySelector('.wifi-hint');

    const btnEnable = document.getElementById('btn-enable-cam-wifi');
    const btnDisable = document.getElementById('btn-disable-cam-wifi');

    if (enabled) {
        indicator.className = 'wifi-indicator online';
        stateText.textContent = 'WiFi Habilitado';
        hintText.textContent = 'La CAM tiene WiFi activo. Puedes conectarte para gestionar imagenes.';
        btnEnable.classList.add('hidden');
        btnDisable.classList.remove('hidden');
    } else if (pending) {
        indicator.className = 'wifi-indicator pending';
        stateText.textContent = 'Pendiente de activacion';
        hintText.textContent = 'El comando se enviara cuando el Gateway conecte con la CAM.';
        btnEnable.classList.add('hidden');
        btnDisable.classList.remove('hidden');
        btnDisable.textContent = 'Cancelar';
    } else {
        indicator.className = 'wifi-indicator offline';
        stateText.textContent = 'WiFi Deshabilitado';
        hintText.textContent = 'La CAM esta en modo deep sleep o WiFi apagado.';
        btnEnable.classList.remove('hidden');
        btnDisable.classList.add('hidden');
        btnDisable.textContent = 'Deshabilitar WiFi';
    }
}

// Habilitar WiFi de la CAM
async function enableCamWifi() {
    if (!confirm('Habilitar WiFi de la CAM?\n\nEl comando se enviara al Gateway, que lo reenviara a la CAM en la proxima sesion.\n\nEl WiFi estara activo maximo 30 minutos.')) {
        return;
    }

    try {
        const response = await apiRequest('POST', `/devices/${currentConfigDeviceId}/enable-cam-wifi`);
        if (response.ok) {
            updateCamWifiStatus(false, true);
            alert('Comando enviado. El WiFi se activara en la proxima sesion del dispositivo.');
            logToConsole('POST', `/devices/${currentConfigDeviceId}/enable-cam-wifi`, 200);
        } else {
            const error = await response.json();
            alert('Error: ' + (error.detail || 'No se pudo enviar el comando'));
        }
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
}

// Deshabilitar WiFi de la CAM
async function disableCamWifi() {
    const action = camWifiPending ? 'Cancelar comando pendiente' : 'Deshabilitar WiFi de la CAM';
    if (!confirm(`${action}?`)) {
        return;
    }

    try {
        const response = await apiRequest('POST', `/devices/${currentConfigDeviceId}/disable-cam-wifi`);
        if (response.ok) {
            updateCamWifiStatus(false, false);
            alert(camWifiPending ? 'Comando cancelado' : 'WiFi deshabilitado');
            logToConsole('POST', `/devices/${currentConfigDeviceId}/disable-cam-wifi`, 200);
        } else {
            const error = await response.json();
            alert('Error: ' + (error.detail || 'No se pudo completar la accion'));
        }
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
}

// Refrescar imagenes de la CAM
async function refreshCamImages() {
    if (!camWifiEnabled) {
        alert('El WiFi de la CAM no esta habilitado');
        return;
    }

    const grid = document.getElementById('cam-images-grid');
    grid.innerHTML = '<p class="empty-state">Cargando imagenes...</p>';

    try {
        const response = await apiRequest('GET', `/devices/${currentConfigDeviceId}/cam-images`);
        if (response.ok) {
            const data = await response.json();

            // Actualizar selector de carpetas
            const folderSelect = document.getElementById('cam-images-folder');
            folderSelect.innerHTML = '<option value="">Todas las carpetas</option>';
            if (data.folders) {
                data.folders.forEach(folder => {
                    folderSelect.innerHTML += `<option value="${folder}">${folder}</option>`;
                });
            }

            // Mostrar imagenes
            if (data.images && data.images.length > 0) {
                grid.innerHTML = data.images.map(img => `
                    <div class="image-thumb" onclick="viewCamImage('${img.path}')">
                        <img src="${img.thumbnail || img.url}" alt="${img.name}" loading="lazy">
                        <div class="image-date">${img.date || img.name}</div>
                    </div>
                `).join('');
            } else {
                grid.innerHTML = '<p class="empty-state">No hay imagenes</p>';
            }

            // Actualizar stats
            if (data.stats) {
                document.getElementById('config-sd-used').textContent =
                    formatBytes(data.stats.used_bytes);
                document.getElementById('config-sd-free').textContent =
                    formatBytes(data.stats.free_bytes);
                document.getElementById('config-sd-images').textContent =
                    data.stats.total_images ?? '-';
                document.getElementById('config-sd-days').textContent =
                    data.stats.days_stored ?? '-';
            }
        } else {
            grid.innerHTML = '<p class="empty-state">Error cargando imagenes</p>';
        }
    } catch (error) {
        grid.innerHTML = '<p class="empty-state">Error de conexion</p>';
    }
}

// Ver imagen de la CAM
function viewCamImage(path) {
    // Abrir imagen en nueva ventana o modal
    window.open(`${API_BASE}/devices/${currentConfigDeviceId}/cam-image?path=${encodeURIComponent(path)}`, '_blank');
}

// Eliminar imagenes antiguas
async function deleteOldImages() {
    const days = prompt('Eliminar imagenes con mas de X dias de antiguedad:', '30');
    if (!days) return;

    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum < 1) {
        alert('Introduce un numero valido de dias');
        return;
    }

    if (!confirm(`Eliminar todas las imagenes con mas de ${daysNum} dias?\n\nEsta accion no se puede deshacer.`)) {
        return;
    }

    try {
        const response = await apiRequest('DELETE', `/devices/${currentConfigDeviceId}/cam-images?older_than_days=${daysNum}`);
        if (response.ok) {
            const result = await response.json();
            alert(`Eliminadas ${result.deleted_count} imagenes`);
            refreshCamImages();
        } else {
            const error = await response.json();
            alert('Error: ' + (error.detail || 'No se pudieron eliminar las imagenes'));
        }
    } catch (error) {
        alert('Error de conexion: ' + error.message);
    }
}

// Formato de bytes
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Event listener para formulario de config
document.addEventListener('DOMContentLoaded', () => {
    const espConfigForm = document.getElementById('esp-config-form');
    if (espConfigForm) {
        espConfigForm.addEventListener('submit', saveEspConfig);
    }
});

// ==================== SECCION DESCARGA APP ====================

const GITHUB_REPO = 'JavierSalazarG/river_sentinel_web';
const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
let downloadDataLoaded = false;

async function loadDownloadSection() {
    // Solo cargar una vez
    if (downloadDataLoaded) return;

    const loading = document.getElementById('download-loading');
    const content = document.getElementById('download-content');
    const error = document.getElementById('download-error');
    const errorMsg = document.getElementById('download-error-msg');

    try {
        const response = await fetch(GITHUB_RELEASES_API);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('No hay releases disponibles todavia.');
            }
            throw new Error('Error al obtener informacion del release.');
        }

        const release = await response.json();

        // Buscar el APK en los assets
        const apkAsset = release.assets.find(asset => asset.name.endsWith('.apk'));

        // Actualizar version
        document.getElementById('download-version').textContent = release.tag_name;

        // Actualizar fecha
        const releaseDate = new Date(release.published_at);
        document.getElementById('download-date').textContent =
            releaseDate.toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });

        // Actualizar boton de descarga
        const downloadBtn = document.getElementById('download-apk-btn');

        if (apkAsset) {
            // Mostrar tamano
            const sizeInMB = (apkAsset.size / (1024 * 1024)).toFixed(1);
            document.getElementById('download-size').textContent = `${sizeInMB} MB`;

            // Activar boton
            downloadBtn.href = apkAsset.browser_download_url;
            downloadBtn.innerHTML = `<span class="download-icon">⬇</span> Descargar APK (${sizeInMB} MB)`;
        } else {
            document.getElementById('download-size').textContent = 'APK no disponible';
            downloadBtn.classList.add('disabled');
            downloadBtn.style.pointerEvents = 'none';
            downloadBtn.style.opacity = '0.5';
            downloadBtn.innerHTML = 'APK no disponible';
        }

        // Mostrar notas del release
        if (release.body) {
            const notesContainer = document.getElementById('download-notes');
            const notesList = document.getElementById('download-notes-list');

            // Parsear notas
            const notes = release.body
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('#'))
                .map(line => line.replace(/^[-*]\s*/, ''));

            if (notes.length > 0) {
                notesList.innerHTML = notes
                    .slice(0, 5)
                    .map(note => `<li>${escapeHtmlDownload(note)}</li>`)
                    .join('');
                notesContainer.classList.remove('hidden');
            }
        }

        // Mostrar contenido
        loading.classList.add('hidden');
        content.classList.remove('hidden');
        downloadDataLoaded = true;

    } catch (err) {
        console.error('Error cargando release:', err);
        loading.classList.add('hidden');
        error.classList.remove('hidden');
        errorMsg.textContent = err.message;
    }
}

function escapeHtmlDownload(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
