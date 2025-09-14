// Enhanced Driver Dashboard JavaScript with Real-time Updates

// Global variables
let isOnline = false;
let pickupCoordinates = null;
let destinationCoordinates = null;
let currentLocation = null;
let activeRideId = null;
let requestsRefreshInterval = null;
let acceptedRequestId = null;
let currentOTP = null;

// College coordinates (Kristu Jayanti College)
const COLLEGE_COORDS = [77.7334, 12.8627];
const COLLEGE_ADDRESS = "Kristu Jayanti College, K Narayanapura, Kothanur, Bengaluru, Karnataka 560077, India";

// API Configuration
const API_URL = 'http://127.0.0.1:5000/api';

// Initialize Google Maps callback
window.initDriverApp = function() {
    console.log('Google Maps API loaded for driver dashboard');
    initializeAutocomplete();
};

// Authentication and token management
function getAuthToken() {
    return localStorage.getItem('campuspool_token');
}

function clearAuthToken() {
    localStorage.removeItem('campuspool_token');
}

function checkAuth() {
    if (!getAuthToken()) {
        window.location.href = '/';
        return false;
    }
    return true;
}

// API helper function with better error handling
async function apiCall(endpoint, method = 'GET', data = null) {
    const token = getAuthToken();
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    const config = {
        method,
        headers
    };

    if (data && (method === 'POST' || method === 'PUT')) {
        config.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);
        
        if (response.status === 401) {
            // Token expired
            clearAuthToken();
            window.location.href = '/';
            return;
        }
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || `HTTP error! status: ${response.status}`);
        }
        
        return result;
    } catch (error) {
        console.error(`API call failed for ${endpoint}:`, error);
        throw error;
    }
}

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    initializeEventListeners();
    loadUserProfile();
    checkProfileCompletion();
    checkForActiveRide();
});

// Check for active ride on page load
async function checkForActiveRide() {
    try {
        const response = await apiCall('/rides/active-ride');
        
        if (response.has_active_ride) {
            const rideInfo = response.ride_info;
            
            if (rideInfo.status === 'accepted' || rideInfo.status === 'started') {
                acceptedRequestId = rideInfo.request_id;
                currentOTP = rideInfo.otp;
                
                // Show active ride section
                showActiveRideSection(rideInfo);
                
                // If we have an active ride, we should be online
                if (!isOnline) {
                    setOnlineState(true);
                }
                
                // Start polling if request is accepted but not started
                if (rideInfo.status === 'accepted') {
                    showOtpModal(rideInfo.otp, "Share this OTP with the rider to start the trip");
                }
            }
        }
    } catch (error) {
        console.error('Failed to check active ride:', error);
    }
}

// Initialize event listeners
function initializeEventListeners() {
    // Toggle switch
    document.getElementById('online-toggle').addEventListener('click', toggleOnlineStatus);
    
    // Location buttons
    document.getElementById('current-location-btn').addEventListener('click', getCurrentLocation);
    document.getElementById('college-location-btn').addEventListener('click', setCollegeDestination);
    
    // Start ride button
    document.getElementById('start-ride-btn').addEventListener('click', startAcceptingRequests);
    
    // Refresh requests
    document.getElementById('refresh-requests-btn').addEventListener('click', loadRideRequests);
    
    // Profile form
    document.getElementById('profile-form').addEventListener('submit', handleProfileSubmit);
    
    // OTP modal
    document.getElementById('close-otp-modal').addEventListener('click', closeOtpModal);
    
    // OTP verification
    document.getElementById('verify-otp-btn')?.addEventListener('click', verifyOTP);
    document.getElementById('complete-ride-btn')?.addEventListener('click', completeRide);
}

// Initialize Google Maps autocomplete
function initializeAutocomplete() {
    const pickupInput = document.getElementById('pickup-input');
    const destinationInput = document.getElementById('destination-input');
    
    if (!pickupInput || !destinationInput) {
        console.error('Input elements not found');
        return;
    }

    // Initialize autocomplete for pickup
    const pickupAutocomplete = new google.maps.places.Autocomplete(pickupInput, {
        types: ['establishment', 'geocode'],
        componentRestrictions: { country: 'in' },
        fields: ['formatted_address', 'geometry', 'name']
    });

    // Initialize autocomplete for destination
    const destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput, {
        types: ['establishment', 'geocode'],
        componentRestrictions: { country: 'in' },
        fields: ['formatted_address', 'geometry', 'name']
    });

    // Handle pickup place selection
    pickupAutocomplete.addListener('place_changed', () => {
        const place = pickupAutocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
            const address = place.name && place.name !== place.formatted_address 
                ? `${place.name}, ${place.formatted_address}` 
                : place.formatted_address;
            
            pickupInput.value = address;
            pickupCoordinates = [place.geometry.location.lng(), place.geometry.location.lat()];
            console.log('Pickup location set:', address, pickupCoordinates);
        }
    });

    // Handle destination place selection
    destinationAutocomplete.addListener('place_changed', () => {
        const place = destinationAutocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
            const address = place.name && place.name !== place.formatted_address 
                ? `${place.name}, ${place.formatted_address}` 
                : place.formatted_address;
            
            destinationInput.value = address;
            destinationCoordinates = [place.geometry.location.lng(), place.geometry.location.lat()];
            console.log('Destination location set:', address, destinationCoordinates);
        }
    });
}

// Set online state
function setOnlineState(online) {
    isOnline = online;
    const toggle = document.getElementById('online-toggle');
    
    if (online) {
        toggle.classList.add('active');
    } else {
        toggle.classList.remove('active');
    }
}

// Toggle online/offline status
function toggleOnlineStatus() {
    const toggle = document.getElementById('online-toggle');
    
    if (!isOnline) {
        // Going online - show route setup
        toggle.classList.add('active');
        document.getElementById('route-section').classList.remove('hidden');
        showStatus('Set your route to start accepting requests', 'info');
    } else {
        // Going offline
        goOffline();
    }
}

// Get current location
function getCurrentLocation() {
    if (!navigator.geolocation) {
        showStatus('Geolocation is not supported by this browser.', 'error');
        return;
    }

    showStatus('Getting your current location...', 'info');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            currentLocation = [longitude, latitude];
            
            // Reverse geocode to get address
            reverseGeocode(latitude, longitude, (address) => {
                document.getElementById('pickup-input').value = address;
                pickupCoordinates = [longitude, latitude];
                showStatus('Current location set as starting point', 'success');
            });
        },
        (error) => {
            let errorMessage = 'Unable to retrieve your location.';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Location access denied. Please allow location access.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Location information unavailable.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Location request timed out.';
                    break;
            }
            showStatus(errorMessage, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000
        }
    );
}

// Set college as destination
function setCollegeDestination() {
    document.getElementById('destination-input').value = COLLEGE_ADDRESS;
    destinationCoordinates = COLLEGE_COORDS;
    showStatus('College set as destination', 'success');
}

// Start accepting ride requests
async function startAcceptingRequests() {
    if (!pickupCoordinates) {
        showStatus('Please select your starting location first', 'error');
        return;
    }

    if (!destinationCoordinates) {
        showStatus('Please select your destination first', 'error');
        return;
    }

    try {
        const response = await apiCall('/rides/go-live', 'POST', {
            pickup_location: pickupCoordinates,
            destination_location: destinationCoordinates,
            pickup_address: document.getElementById('pickup-input').value,
            destination_address: document.getElementById('destination-input').value,
            seats_available: 1
        });

        activeRideId = response.ride_id;
        isOnline = true;
        
        // Update UI
        document.getElementById('route-section').classList.add('hidden');
        document.getElementById('online-status').classList.remove('hidden');
        document.getElementById('requests-section').classList.remove('hidden');
        
        showStatus('You are now online and accepting requests!', 'success');
        
        // Start polling for requests
        startRequestsPolling();
        
    } catch (error) {
        console.error('Failed to go live:', error);
        showStatus(error.message || 'Failed to go online. Please try again.', 'error');
        
        // Reset toggle
        document.getElementById('online-toggle').classList.remove('active');
        document.getElementById('route-section').classList.add('hidden');
    }
}

// Go offline
async function goOffline() {
    try {
        if (activeRideId) {
            await apiCall('/rides/go-offline', 'POST');
        }
        
        // Update state
        isOnline = false;
        activeRideId = null;
        acceptedRequestId = null;
        currentOTP = null;
        
        // Update UI
        const toggle = document.getElementById('online-toggle');
        toggle.classList.remove('active');
        document.getElementById('route-section').classList.add('hidden');
        document.getElementById('online-status').classList.add('hidden');
        document.getElementById('requests-section').classList.add('hidden');
        document.getElementById('active-ride-section').classList.add('hidden');
        
        // Stop polling
        stopRequestsPolling();
        
        showStatus('You are now offline', 'info');
        
    } catch (error) {
        console.error('Failed to go offline:', error);
        showStatus('Error going offline. Please try again.', 'error');
    }
}

// Start polling for ride requests
function startRequestsPolling() {
    loadRideRequests(); // Load immediately
    
    // Poll every 8 seconds
    requestsRefreshInterval = setInterval(() => {
        loadRideRequests();
    }, 8000);
}

// Stop polling for requests
function stopRequestsPolling() {
    if (requestsRefreshInterval) {
        clearInterval(requestsRefreshInterval);
        requestsRefreshInterval = null;
    }
}

// Load ride requests
async function loadRideRequests() {
    if (!isOnline) return;
    
    try {
        const response = await apiCall('/rides/requests');
        const requests = response.requests || [];
        
        displayRideRequests(requests);
        
    } catch (error) {
        console.error('Failed to load requests:', error);
        // Don't show error for polling failures to avoid spam
    }
}

// Display ride requests
function displayRideRequests(requests) {
    const container = document.getElementById('requests-list');
    const noRequestsEl = document.getElementById('no-requests');
    
    if (requests.length === 0) {
        container.innerHTML = '';
        noRequestsEl.classList.remove('hidden');
        return;
    }
    
    noRequestsEl.classList.add('hidden');
    container.innerHTML = '';
    
    requests.forEach(request => {
        const card = createRequestCard(request);
        container.appendChild(card);
    });
}

// Create individual request card
function createRequestCard(request) {
    const card = document.createElement('div');
    card.className = 'request-card';
    card.innerHTML = `
        <div class="request-header">
            <div class="rider-info">
                <h4>${request.rider.name}</h4>
                <div class="driver-rating">
                    ⭐ ${request.rider.rating.toFixed(1)} • Phone: ${request.rider.phone}
                </div>
            </div>
            <div class="request-time">
                ${request.requested_at}
            </div>
        </div>
        <div class="request-details">
            <strong>Pickup:</strong> ${request.pickup_address}<br>
            <strong>Destination:</strong> ${request.destination_address}<br>
            <strong>Estimated Fare:</strong> ₹${request.estimated_fare}
        </div>
        <div class="request-actions">
            <button class="btn btn-danger" onclick="respondToRequest('${request.request_id}', 'reject')">
                Decline
            </button>
            <button class="btn btn-secondary" onclick="respondToRequest('${request.request_id}', 'accept')">
                Accept
            </button>
        </div>
    `;
    return card;
}

// Respond to ride request
window.respondToRequest = async function(requestId, action) {
    try {
        const response = await apiCall(`/rides/requests/${requestId}/respond`, 'POST', {
            action: action
        });
        
        if (action === 'accept') {
            acceptedRequestId = requestId;
            currentOTP = response.otp;
            
            // Hide requests section and show active ride
            document.getElementById('requests-section').classList.add('hidden');
            
            showOtpModal(response.otp, response.note);
            
            // Stop polling for new requests
            stopRequestsPolling();
        }
        
        showStatus(response.message, action === 'accept' ? 'success' : 'info');
        
        // Refresh requests list if we declined
        if (action === 'reject') {
            setTimeout(() => {
                loadRideRequests();
            }, 1000);
        }
        
    } catch (error) {
        console.error('Failed to respond to request:', error);
        showStatus(error.message || 'Failed to respond to request. Please try again.', 'error');
    }
};

// Show OTP modal when ride is accepted
function showOtpModal(otp, note) {
    const modal = document.getElementById('otp-modal');
    const detailsContainer = document.getElementById('otp-details');
    
    detailsContainer.innerHTML = `
        <div style="background: var(--background-color); padding: 1.5rem; border-radius: 1rem; margin-bottom: 1rem;">
            <h4 style="font-size: 2rem; color: var(--secondary-color); margin-bottom: 0.5rem; text-align: center;">${otp}</h4>
            <p style="color: var(--text-secondary); margin-bottom: 0; text-align: center;">${note}</p>
        </div>
        <div style="background: #dcfce7; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
            <h5 style="margin: 0 0 0.5rem 0; color: #166534;">📍 Next Steps:</h5>
            <ol style="margin: 0; padding-left: 1.5rem; color: #166534; font-size: 0.875rem;">
                <li>Navigate to rider's pickup location</li>
                <li>Call/message the rider when you arrive</li>
                <li>Ask rider for the OTP to confirm identity</li>
                <li>Enter OTP below to start the trip</li>
            </ol>
        </div>
        <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
            <input type="text" id="otp-input" placeholder="Enter OTP from rider" 
                   style="flex: 1; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 0.5rem; font-size: 1rem; text-align: center; font-weight: bold; letter-spacing: 2px;"
                   maxlength="4">
            <button id="verify-otp-btn" class="btn btn-primary" style="white-space: nowrap;">
                ✅ Verify & Start
            </button>
        </div>
    `;
    
    modal.classList.remove('hidden');
    
    // Add event listener for OTP verification
    document.getElementById('verify-otp-btn').addEventListener('click', verifyOTP);
    
    // Add enter key support for OTP input
    document.getElementById('otp-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            verifyOTP();
        }
    });
}

// Verify OTP and start ride
async function verifyOTP() {
    const otpInput = document.getElementById('otp-input');
    const enteredOTP = otpInput.value.trim();
    
    if (!enteredOTP) {
        showStatus('Please enter the OTP shared by the rider', 'error');
        return;
    }
    
    if (enteredOTP !== currentOTP) {
        showStatus('Invalid OTP. Please check with the rider and try again.', 'error');
        otpInput.focus();
        return;
    }
    
    try {
        const response = await apiCall('/rides/verify-otp', 'POST', {
            request_id: acceptedRequestId,
            otp: enteredOTP
        });
        
        showStatus('🎉 OTP verified! Ride has started. Have a safe journey!', 'success');
        
        // Close OTP modal and show active ride section
        closeOtpModal();
        showActiveRideInProgress();
        
    } catch (error) {
        console.error('OTP verification failed:', error);
        showStatus(error.message || 'OTP verification failed. Please try again.', 'error');
    }
}

// Show active ride in progress
function showActiveRideInProgress() {
    const activeSection = document.getElementById('active-ride-section');
    const detailsContainer = document.getElementById('active-ride-details');
    
    detailsContainer.innerHTML = `
        <div style="background: #dcfce7; padding: 1.5rem; border-radius: 1rem; margin-bottom: 1.5rem; text-align: center;">
            <h4 style="color: #166534; margin-bottom: 0.5rem;">🚗 Ride In Progress</h4>
            <p style="color: #166534; margin: 0; font-size: 0.875rem;">Drive safely to the destination</p>
        </div>
        <div style="background: var(--background-color); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
            <p><strong>Request ID:</strong> ${acceptedRequestId}</p>
            <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;">
                Click "Complete Ride" when you reach the destination and the rider gets off.
            </p>
        </div>
        <button id="complete-ride-btn" class="btn btn-primary btn-full">
            🏁 Complete Ride
        </button>
    `;
    
    activeSection.classList.remove('hidden');
    
    // Add event listener for complete ride button
    document.getElementById('complete-ride-btn').addEventListener('click', completeRide);
}

// Complete the ride
async function completeRide() {
    if (!acceptedRequestId) {
        showStatus('No active ride to complete', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to complete this ride?')) {
        return;
    }
    
    try {
        const response = await apiCall('/rides/complete-ride', 'POST', {
            request_id: acceptedRequestId
        });
        
        showStatus('🎉 Ride completed successfully!', 'success');
        
        // Reset state
        acceptedRequestId = null;
        currentOTP = null;
        
        // Hide active ride section and show requests section
        document.getElementById('active-ride-section').classList.add('hidden');
        document.getElementById('requests-section').classList.remove('hidden');
        
        // Restart polling for new requests
        startRequestsPolling();
        
    } catch (error) {
        console.error('Failed to complete ride:', error);
        showStatus(error.message || 'Failed to complete ride. Please try again.', 'error');
    }
}

// Show active ride section with ride info
function showActiveRideSection(rideInfo) {
    const activeSection = document.getElementById('active-ride-section');
    const detailsContainer = document.getElementById('active-ride-details');
    
    let content = '';
    
    if (rideInfo.status === 'accepted') {
        content = `
            <div style="background: #fef3c7; padding: 1.5rem; border-radius: 1rem; margin-bottom: 1rem; text-align: center;">
                <h4 style="color: #92400e; margin-bottom: 0.5rem;">🔄 Waiting for Rider</h4>
                <p style="color: #92400e; margin: 0; font-size: 0.875rem;">Share OTP with rider to start the trip</p>
            </div>
            <div style="background: var(--background-color); padding: 1rem; border-radius: 0.5rem;">
                <p><strong>Rider:</strong> ${rideInfo.rider.name}</p>
                <p><strong>Phone:</strong> ${rideInfo.rider.phone}</p>
                <p><strong>OTP:</strong> <span style="font-size: 1.5rem; color: var(--secondary-color); font-weight: bold;">${rideInfo.otp}</span></p>
            </div>
        `;
    } else if (rideInfo.status === 'started') {
        content = `
            <div style="background: #dcfce7; padding: 1.5rem; border-radius: 1rem; margin-bottom: 1rem; text-align: center;">
                <h4 style="color: #166534; margin-bottom: 0.5rem;">🚗 Ride In Progress</h4>
                <p style="color: #166534; margin: 0; font-size: 0.875rem;">Drive safely to the destination</p>
            </div>
            <button id="complete-ride-btn" class="btn btn-primary btn-full">
                🏁 Complete Ride
            </button>
        `;
    }
    
    detailsContainer.innerHTML = content;
    activeSection.classList.remove('hidden');
    
    // Add event listeners if needed
    if (rideInfo.status === 'started') {
        document.getElementById('complete-ride-btn')?.addEventListener('click', completeRide);
    }
}

// Close OTP modal
function closeOtpModal() {
    document.getElementById('otp-modal').classList.add('hidden');
}

// Reverse geocode coordinates to address
async function reverseGeocode(lat, lng, callback) {
    try {
        const response = await fetch(`${API_URL}/maps/reverse-geocode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ lat, lng })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === 'OK' && data.results && data.results[0]) {
                callback(data.results[0].formatted_address);
            } else {
                callback(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
            }
        } else {
            callback(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        }
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        callback(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
}

// Status messages
function showStatus(message, type) {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.classList.remove('hidden');
    
    // Auto-hide success and info messages after 7 seconds
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            if (statusEl.textContent === message) { // Only hide if it's the same message
                statusEl.classList.add('hidden');
            }
        }, 7000);
    }
}

function hideStatus() {
    document.getElementById('status-message').classList.add('hidden');
}

// Profile management
async function loadUserProfile() {
    try {
        const profile = await apiCall('/auth/profile');
        document.getElementById('user-name').textContent = `Welcome, ${profile.user.name}!`;
    } catch (error) {
        console.error('Failed to load profile:', error);
        document.getElementById('user-name').textContent = 'Welcome!';
    }
}

async function checkProfileCompletion() {
    try {
        const response = await apiCall('/profiles/check');
        
        if (!response.profile_complete) {
            document.getElementById('profile-modal').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Failed to check profile:', error);
    }
}

async function handleProfileSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const profileData = {
        phone_number: formData.get('phone_number') || document.getElementById('phone').value,
        vehicle_model: formData.get('vehicle_model') || document.getElementById('vehicle-model').value,
        vehicle_color: formData.get('vehicle_color') || document.getElementById('vehicle-color').value,
        vehicle_plate: formData.get('vehicle_plate') || document.getElementById('vehicle-plate').value,
        emergency_contact: formData.get('emergency_contact') || document.getElementById('emergency-contact').value,
        college_id: formData.get('college_id') || document.getElementById('college-id').value
    };

    // Remove empty fields
    Object.keys(profileData).forEach(key => {
        if (!profileData[key]) {
            delete profileData[key];
        }
    });

    try {
        await apiCall('/profiles/complete', 'POST', profileData);
        document.getElementById('profile-modal').classList.add('hidden');
        showStatus('Driver profile completed successfully!', 'success');
    } catch (error) {
        console.error('Profile completion failed:', error);
        showStatus(error.message, 'error');
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopRequestsPolling();
});

// Logout function
window.handleLogout = async function() {
    try {
        // Go offline first if online
        if (isOnline) {
            await goOffline();
        }
        
        await apiCall('/auth/logout', 'POST');
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        clearAuthToken();
        window.location.href = '/';
    }
};


