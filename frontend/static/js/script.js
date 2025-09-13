// Global function for Google Maps API callback
function initApp() {
    console.log('Google Maps API loaded successfully');
    // Initialize Places Autocomplete
    initializePlacesAutocomplete();
}

// Global variable to store coordinates
let currentCoordinates = null;

// Initialize Google Places Autocomplete
function initializePlacesAutocomplete() {
    const addressInput = document.getElementById('register-address');
    
    if (!addressInput) {
        console.error('Address input not found');
        return;
    }

    // Create autocomplete instance
    const autocomplete = new google.maps.places.Autocomplete(addressInput, {
        types: ['establishment', 'geocode'],
        componentRestrictions: { country: 'in' },
        fields: ['formatted_address', 'geometry', 'name']
    });

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

    registerForm.addEventListener('submit', handleRegister);
    loginForm.addEventListener('submit', handleLogin);
    showLoginLink.addEventListener('click', showLogin);
    showRegisterLink.addEventListener('click', showRegister);
    getLocationBtn.addEventListener('click', handleGetLocation);

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
        
        const url = `${API_URL}/maps/reverse-geocode`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: lat, lng: lng })
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            if (data.status === 'OK' && data.results && data.results[0]) {
                const address = data.results[0].formatted_address;
                addressInput.value = address;
                addressStatus.textContent = "✅ Address found! Please confirm it's correct.";
                addressStatus.style.color = "#28a745";
            } else {
                throw new Error(data.error || 'Could not find address.');
            }
        } catch (error) {
            addressStatus.textContent = "⚠️ Could not fetch address. Please enter manually.";
            addressStatus.style.color = "#ffc107";
            console.error("Reverse Geocoding Error:", error);
            
            // Fallback: try to get a basic address using coordinates
            addressInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        
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
            showMessage("⚠️ For better accuracy, please select an address from the suggestions or use 'Use My Location'.", 'error');
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
            loginForm.classList.add('hidden');
            registerForm.classList.add('hidden');
            messageArea.classList.add('hidden');
            appView.classList.remove('hidden');
        } catch (error) {
            showMessage(error.message, 'error');
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
});