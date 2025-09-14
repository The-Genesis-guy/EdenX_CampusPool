// Define initApp immediately to ensure it's available when Google Maps API loads
window.initApp = function() {
    console.log('Google Maps API loaded successfully');
    // Initialize Places Autocomplete
    if (typeof initializePlacesAutocomplete === 'function') {
        initializePlacesAutocomplete();
    } else {
        console.log('initializePlacesAutocomplete not yet defined, will retry...');
        setTimeout(() => {
            if (typeof initializePlacesAutocomplete === 'function') {
                initializePlacesAutocomplete();
            }
        }, 100);
    }
};

// Global variable to store coordinates
let currentCoordinates = null;
let authToken = null;

// Token management functions
function setAuthToken(token) {
    authToken = token;
    localStorage.setItem('campuspool_token', token);
}

function getAuthToken() {
    if (!authToken) {
        authToken = localStorage.getItem('campuspool_token');
    }
    return authToken;
}

function clearAuthToken() {
    authToken = null;
    localStorage.removeItem('campuspool_token');
}

function isAuthenticated() {
    return getAuthToken() !== null;
}

// Initialize Places Autocomplete
function initializePlacesAutocomplete() {
    const addressInput = document.getElementById('register-address');
    
    if (!addressInput) {
        console.error('Address input not found');
        return;
    }
    
    // Check if already initialized
    if (addressInput.hasAttribute('data-autocomplete-initialized')) {
        console.log('Autocomplete already initialized');
        return;
    }

    // Create autocomplete instance
    const autocomplete = new google.maps.places.Autocomplete(addressInput, {
        types: ['establishment', 'geocode'],
        componentRestrictions: { country: 'in' },
        fields: ['formatted_address', 'geometry', 'name']
    });
    
    // Mark as initialized
    addressInput.setAttribute('data-autocomplete-initialized', 'true');

    // Listen for place selection
    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        
        if (!place.geometry || !place.geometry.location) {
            return;
        }

        // Build complete address
        let completeAddress = place.name && place.name !== place.formatted_address 
            ? place.name + ', ' + place.formatted_address 
            : place.formatted_address;

        // Update address and coordinates
        addressInput.value = completeAddress;
        currentCoordinates = [place.geometry.location.lng(), place.geometry.location.lat()];
        
        // Show success message
        const addressStatus = document.getElementById('address-status');
        if (addressStatus) {
            addressStatus.textContent = "✅ Address selected!";
            addressStatus.style.color = "#28a745";
        }
    });

    console.log('Places Autocomplete initialized successfully');
}

document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'http://127.0.0.1:5000/api';

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const messageArea = document.getElementById('message-area');
    const appView = document.getElementById('app-view');
    const showLoginLink = document.getElementById('show-login-link');
    const showRegisterLink = document.getElementById('show-register-link');
    const getLocationBtn = document.getElementById('get-location-btn');
    const addressInput = document.getElementById('register-address');
    const addressStatus = document.getElementById('address-status');

    // Check if user is already authenticated
    if (isAuthenticated()) {
        verifyTokenAndShowApp();
    }
    
    // Initialize autocomplete if Google Maps API is already loaded
    if (typeof google !== 'undefined' && typeof google.maps !== 'undefined' && typeof google.maps.places !== 'undefined') {
        console.log('Google Maps API already loaded, initializing autocomplete...');
        initializePlacesAutocomplete();
    } else {
        console.log('Google Maps API not yet loaded, waiting for callback...');
    }
    
    // Fallback: Try to initialize autocomplete after delays
    setTimeout(() => {
        if (typeof google !== 'undefined' && typeof google.maps !== 'undefined' && typeof google.maps.places !== 'undefined') {
            const addressInput = document.getElementById('register-address');
            if (addressInput && !addressInput.hasAttribute('data-autocomplete-initialized')) {
                console.log('Fallback (2s): Initializing autocomplete...');
                initializePlacesAutocomplete();
            }
        }
    }, 2000);
    
    // Additional fallback after 5 seconds
    setTimeout(() => {
        if (typeof google !== 'undefined' && typeof google.maps !== 'undefined' && typeof google.maps.places !== 'undefined') {
            const addressInput = document.getElementById('register-address');
            if (addressInput && !addressInput.hasAttribute('data-autocomplete-initialized')) {
                console.log('Fallback (5s): Initializing autocomplete...');
                initializePlacesAutocomplete();
            }
        }
    }, 5000);

    registerForm.addEventListener('submit', handleRegister);
    loginForm.addEventListener('submit', handleLogin);
    showLoginLink.addEventListener('click', showLogin);
    showRegisterLink.addEventListener('click', showRegister);
    getLocationBtn.addEventListener('click', handleGetLocation);

    async function verifyTokenAndShowApp() {
        try {
            const response = await fetch(`${API_URL}/auth/verify-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('User authenticated:', data.user);
                showApp();
            } else {
                clearAuthToken();
                showLogin();
            }
        } catch (error) {
            console.error('Token verification failed:', error);
            clearAuthToken();
            showLogin();
        }
    }

    function showApp() {
        loginForm.classList.add('hidden');
        registerForm.classList.add('hidden');
        messageArea.classList.add('hidden');
        appView.classList.remove('hidden');
        loadUserProfile();
    }

    async function loadUserProfile() {
        try {
            const response = await fetch(`${API_URL}/auth/profile`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('User profile:', data.user);
                // Update UI with user data
                updateUserInterface(data.user);
            }
        } catch (error) {
            console.error('Failed to load profile:', error);
        }
    }

    function updateUserInterface(user) {
        // Update the app interface with user information
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = `Welcome, ${user.name}!`;
        }
        
        const userRoleElement = document.getElementById('user-role');
        if (userRoleElement) {
            userRoleElement.textContent = `Role: ${user.role}`;
        }
    }

    function handleGetLocation() {
        if (!navigator.geolocation) {
            addressStatus.textContent = "❌ Geolocation is not supported by your browser.";
            addressStatus.style.color = "#dc3545";
            return;
        }
        
        addressStatus.textContent = "📍 Getting your location...";
        addressStatus.style.color = "#007bff";
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                currentCoordinates = [longitude, latitude];
                
                // Show coordinates briefly before converting to address
                addressStatus.textContent = `📍 Found location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                addressStatus.style.color = "#28a745";
                
                // Convert to address after a short delay
                setTimeout(() => {
                    reverseGeocode(latitude, longitude);
                }, 1000);
            },
            (error) => {
                let errorMessage = "❌ Unable to retrieve your location.";
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = "❌ Location access denied. Please allow location access and try again.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = "❌ Location information unavailable.";
                        break;
                    case error.TIMEOUT:
                        errorMessage = "❌ Location request timed out.";
                        break;
                }
                addressStatus.textContent = errorMessage;
                addressStatus.style.color = "#dc3545";
                console.error("Geolocation error:", error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 // 5 minutes
            }
        );
    }

async function reverseGeocode(lat, lng) {
    addressStatus.textContent = "🔄 Converting coordinates to address...";
    addressStatus.style.color = "#007bff";
    
    // For registration, we'll use a simpler approach
    try {
        // Try to get address using browser's built-in reverse geocoding if available
        if (window.google && window.google.maps) {
            const geocoder = new google.maps.Geocoder();
            const latLng = { lat: lat, lng: lng };
            
            geocoder.geocode({ location: latLng }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    addressInput.value = results[0].formatted_address;
                    addressStatus.textContent = "✅ Address found!";
                    addressStatus.style.color = "#28a745";
                } else {
                    // Fallback to coordinates
                    addressInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                    addressStatus.textContent = "✅ Location set using coordinates";
                    addressStatus.style.color = "#28a745";
                }
            });
        } else {
            // If Google Maps not available, try our API
            await tryAPIReverseGeocode(lat, lng);
        }
    } catch (error) {
        // Fallback to coordinates
        addressInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        addressStatus.textContent = "✅ Location set using coordinates";
        addressStatus.style.color = "#28a745";
        console.log("Using coordinates as fallback:", error);
    }
}

async function tryAPIReverseGeocode(lat, lng) {
    try {
        const response = await fetch(`${API_URL}/maps/reverse-geocode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
                // No auth header needed for registration
            },
            body: JSON.stringify({ lat: lat, lng: lng })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'OK' && data.results && data.results[0]) {
                addressInput.value = data.results[0].formatted_address;
                addressStatus.textContent = "✅ Address found!";
                addressStatus.style.color = "#28a745";
                return;
            }
        }
        
        // Fallback to coordinates if API fails
        throw new Error('API geocoding failed');
        
    } catch (error) {
        // Final fallback
        addressInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        addressStatus.textContent = "✅ Location set using coordinates";
        addressStatus.style.color = "#28a745";
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    // Prevent double submission
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';
        
        // Validate required fields
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const address = addressInput.value.trim();
        
        if (!name || !email || !password || !address) {
            showMessage("Please fill in all required fields.", 'error');
            return;
        }
        
        if (password.length < 6) {
            showMessage("Password must be at least 6 characters long.", 'error');
            return;
        }
        
        if (!currentCoordinates) {
            showMessage("⚠️ Please use 'Use My Location' or enter an address first.", 'error');
            const submitBtn = document.querySelector('#register-form button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Register';
            return;
        }
        const body = {
            name: name,
            email: email,
            password: password,
            homeAddress: address,
            coordinates: currentCoordinates,
            role: document.querySelector('input[name="role"]:checked').value
        };
        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Registration failed');
            showMessage(data.message, 'success');
        } catch (error) {
            showMessage(error.message, 'error');
        }
        finally {
            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = 'Register';
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const body = {
            email: document.getElementById('login-email').value,
            password: document.getElementById('login-password').value
        };
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Login failed');
            
            // Store the JWT token
            setAuthToken(data.token);
            localStorage.setItem('campuspool_user_data', JSON.stringify(data.user));

if (data.user.role === 'rider') {
    window.location.href = '/rider';
} else if (data.user.role === 'driver') {
    window.location.href = '/driver';
}
            else {
                showApp(); // fallback, in case role is missing or new
            }
            
        } catch (error) {
            showMessage(error.message, 'error');
        }
    }

    async function handleLogout() {
        try {
            await fetch(`${API_URL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            clearAuthToken();
            showLogin();
        }
    }

    function showMessage(message, type) {
        messageArea.textContent = message;
        messageArea.className = type === 'success' ? 'message-success' : 'message-error';
        messageArea.classList.remove('hidden');
    }

    function showLogin() {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        messageArea.classList.add('hidden');
        appView.classList.add('hidden');
    }

    function showRegister() {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        messageArea.classList.add('hidden');
        appView.classList.add('hidden');
    }

    // Add logout functionality
    window.handleLogout = handleLogout;
});