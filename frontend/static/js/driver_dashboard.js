// Enhanced Driver Dashboard JavaScript with Real-time Updates

// Global variables
let isOnline = false;
let pickupCoordinates = null;
let destinationCoordinates = null;
let currentLocation = null;
let activeRideId = null;
let requestsRefreshInterval = null;
let acceptedRequestId = null;
let locationTrackingInterval = null;
let currentOTP = null;

// College coordinates (Kristu Jayanti College)
const COLLEGE_COORDS = [77.64038,13.05794];
const COLLEGE_ADDRESS = "Kristu Jayanti College, K Narayanapura, Kothanur, Bengaluru, Karnataka 560077, India";

// API Configuration
const API_URL = 'http://127.0.0.1:5000/api';

// Initialize Google Maps callback
window.initDriverApp = function() {
    console.log('Google Maps API loaded for driver dashboard');
    initializeMap();
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
    
    // Automatically fetch current location when page loads
    getCurrentLocation();
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

// Initialize event listeners for Map-First design
function initializeEventListeners() {
    // Toggle switch
    const onlineToggle = document.getElementById('online-toggle');
    if (onlineToggle) {
        onlineToggle.addEventListener('click', toggleOnlineStatus);
    }
    
    // Location buttons
    const collegeLocationBtn = document.getElementById('college-location-btn');
    if (collegeLocationBtn) {
        collegeLocationBtn.addEventListener('click', setCollegeDestination);
    }
    
    // Start helping button (renamed from start-ride-btn)
    const startHelpingBtn = document.getElementById('start-helping-btn');
    if (startHelpingBtn) {
        startHelpingBtn.addEventListener('click', startAcceptingRequests);
    }
    
    // Campus quick buttons
    const quickButtons = document.querySelectorAll('.quick-btn');
    quickButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const destination = e.target.getAttribute('data-destination');
            if (destination) {
                document.getElementById('destination-input').value = destination;
                
                // Set coordinates for common destinations
                if (destination.includes('Home')) {
                    // For home, try to get user's current location or use a default
                    try {
                        if (navigator.geolocation) {
                            const position = await new Promise((resolve, reject) => {
                                navigator.geolocation.getCurrentPosition(resolve, reject, {
                                    enableHighAccuracy: true,
                                    timeout: 5000,
                                    maximumAge: 300000
                                });
                            });
                            destinationCoordinates = [position.coords.longitude, position.coords.latitude];
                            
                            // Reverse geocode to get address
                            reverseGeocode(position.coords.latitude, position.coords.longitude, (address) => {
                                document.getElementById('destination-input').value = address;
                            });
                        } else {
                            // Fallback to college coordinates if geolocation fails
                            destinationCoordinates = COLLEGE_COORDS;
                            document.getElementById('destination-input').value = COLLEGE_ADDRESS;
                        }
                    } catch (error) {
                        console.error('Failed to get current location for home:', error);
                        // Fallback to college coordinates
                        destinationCoordinates = COLLEGE_COORDS;
                        document.getElementById('destination-input').value = COLLEGE_ADDRESS;
                    }
                } else if (destination.includes('College')) {
                    destinationCoordinates = COLLEGE_COORDS;
                    document.getElementById('destination-input').value = COLLEGE_ADDRESS;
                }
                
                // Remove active class from all buttons
                quickButtons.forEach(b => b.classList.remove('active'));
                // Add active class to clicked button
                e.target.classList.add('active');
                
                showStatus(`${destination} location set successfully`, 'success');
                
                // Compress the helper card when destination is set
                compressHelperCard();
            }
        });
    });
    
    // Close buttons for floating cards
    const closeResultsBtn = document.getElementById('close-results-btn');
    if (closeResultsBtn) {
        closeResultsBtn.addEventListener('click', () => {
            document.getElementById('results-card').classList.add('hidden');
        });
    }
    
    const closeRequestsBtn = document.getElementById('close-requests-btn');
    if (closeRequestsBtn) {
        closeRequestsBtn.addEventListener('click', () => {
            document.getElementById('requests-card').classList.add('hidden');
        });
    }
    
    // Profile form
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileSubmit);
    }
    
    // OTP modal
    const closeOtpModal = document.getElementById('close-otp-modal');
    if (closeOtpModal) {
        closeOtpModal.addEventListener('click', closeOtpModal);
    }
    
    // Request modal buttons
    const acceptRequestBtn = document.getElementById('accept-request-btn');
    if (acceptRequestBtn) {
        acceptRequestBtn.addEventListener('click', () => {
            // This will be handled by the request card click handlers
        });
    }
    
    const declineRequestBtn = document.getElementById('decline-request-btn');
    if (declineRequestBtn) {
        declineRequestBtn.addEventListener('click', () => {
            // This will be handled by the request card click handlers
        });
    }
    
    // View requests button
    const viewRequestsBtn = document.getElementById('view-requests-btn');
    if (viewRequestsBtn) {
        viewRequestsBtn.addEventListener('click', () => {
            const requestsCard = document.getElementById('requests-card');
            if (requestsCard) {
                requestsCard.classList.remove('hidden');
                requestsCard.classList.add('show');
                // Refresh the requests
                if (isOnline) {
                    loadRideRequests();
                }
            }
        });
    }
}

// Initialize Google Maps
let map;
let userMarker;

function initializeMap() {
    // Initialize the full-screen map
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 15,
        center: { lat: 13.05794, lng: 77.64038 }, // Kristu Jayanti College
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        styles: [
            {
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
            }
        ]
    });

    // Add college marker
    const collegeMarker = new google.maps.Marker({
        position: { lat: 13.05794, lng: 77.64038 },
        map: map,
        title: 'Kristu Jayanti College',
        icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="18" fill="#FF6B35" stroke="#fff" stroke-width="2"/>
                    <text x="20" y="26" text-anchor="middle" fill="white" font-size="16" font-weight="bold">🏫</text>
                </svg>
            `),
            scaledSize: new google.maps.Size(40, 40)
        }
    });

    // Get user's current location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            
            // Center map on user location
            map.setCenter(userLocation);
            
            // Add user marker
            userMarker = new google.maps.Marker({
                position: userLocation,
                map: map,
                title: 'Your Location',
                icon: {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                        <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="15" cy="15" r="12" fill="#004E89" stroke="#fff" stroke-width="2"/>
                            <text x="15" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="bold">🏍️</text>
                        </svg>
                    `),
                    scaledSize: new google.maps.Size(30, 30)
                }
            });
        });
    }
}

// Initialize Google Maps autocomplete
function initializeAutocomplete() {
    const destinationInput = document.getElementById('destination-input');
    
    if (!destinationInput) {
        console.error('Destination input element not found');
        return;
    }

    // Initialize autocomplete for destination only
    const destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput, {
        types: ['establishment', 'geocode'],
        componentRestrictions: { country: 'in' },
        fields: ['formatted_address', 'geometry', 'name']
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
            
            // Compress the helper card when destination is selected
            compressHelperCard();
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
    const statusIndicator = document.querySelector('.status-indicator');
    const routeSetup = document.getElementById('route-setup');
    const helperStats = document.getElementById('helper-stats');
    
    if (!isOnline) {
        // Going online - show route setup
        toggle.classList.add('active');
        statusIndicator.classList.remove('offline');
        statusIndicator.classList.add('online');
        statusIndicator.querySelector('.status-text').textContent = 'Available to help community';
        routeSetup.classList.remove('hidden');
        helperStats.classList.add('hidden');
        showStatus('Set your route to start helping the community!', 'info');
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
            pickupCoordinates = [longitude, latitude];
            
            // Reverse geocode to get address for display
            reverseGeocode(latitude, longitude, (address) => {
                showStatus(`Location detected: ${address}`, 'success');
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
        const seatsAvailable = document.getElementById('available-seats').value;
        const helperMessage = document.getElementById('helper-message').value;
        
        const response = await apiCall('/rides/go-live', 'POST', {
            pickup_location: pickupCoordinates,
            destination_location: destinationCoordinates,
            pickup_address: 'Current Location', // Auto-detected location
            destination_address: document.getElementById('destination-input').value,
            seats_available: parseInt(seatsAvailable),
            helper_message: helperMessage
        });

        activeRideId = response.ride_id;
        isOnline = true;
        
        // Update UI for Map-First design
        const routeSetup = document.getElementById('route-setup');
        const helperStats = document.getElementById('helper-stats');
        const requestsCard = document.getElementById('requests-card');
        
        routeSetup.classList.add('hidden');
        helperStats.classList.remove('hidden');
        requestsCard.classList.remove('hidden');
        requestsCard.classList.add('show');
        
        showStatus('🤝 You are now helping the community! Ride requests will appear here.', 'success');
        
        // Start polling for requests
        startRequestsPolling();
        // Start location tracking
        startLocationTracking();
        
    } catch (error) {
        console.error('Failed to go live:', error);
        showStatus(error.message || 'Failed to go online. Please try again.', 'error');
        
        // Reset toggle
        const toggle = document.getElementById('online-toggle');
        const statusIndicator = document.querySelector('.status-indicator');
        const routeSetup = document.getElementById('route-setup');
        
        toggle.classList.remove('active');
        statusIndicator.classList.remove('online');
        statusIndicator.classList.add('offline');
        statusIndicator.querySelector('.status-text').textContent = 'Taking a break';
        routeSetup.classList.add('hidden');
    }
}

// Go offline
async function goOffline() {
    try {
        // Always call go-offline API to update driver availability status
        console.log('Going offline - calling /rides/go-offline API');
        await apiCall('/rides/go-offline', 'POST');
        console.log('Successfully went offline');
        
        // Update state
        isOnline = false;
        activeRideId = null;
        acceptedRequestId = null;
        currentOTP = null;
        
        // Update UI for Map-First design
        const toggle = document.getElementById('online-toggle');
        const statusIndicator = document.querySelector('.status-indicator');
        const routeSetup = document.getElementById('route-setup');
        const helperStats = document.getElementById('helper-stats');
        const requestsCard = document.getElementById('requests-card');
        const activeRideCard = document.getElementById('active-ride-card');
        
        toggle.classList.remove('active');
        statusIndicator.classList.remove('online');
        statusIndicator.classList.add('offline');
        statusIndicator.querySelector('.status-text').textContent = 'Taking a break';
        
        routeSetup.classList.add('hidden');
        helperStats.classList.add('hidden');
        requestsCard.classList.add('hidden');
        requestsCard.classList.remove('show');
        activeRideCard.classList.add('hidden');
        activeRideCard.classList.remove('show');
        
        // Stop polling
        stopRequestsPolling();
        stopLocationTracking();
        
        showStatus('You are now offline. Toggle to go online when ready to help!', 'info');
        
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
    const container = document.getElementById('ride-requests-list');
    const noRequestsEl = document.getElementById('no-ride-requests');
    const requestsCard = document.getElementById('requests-card');
    
    if (requests.length === 0) {
        container.innerHTML = '';
        noRequestsEl.classList.remove('hidden');
        return;
    }
    
    // If we have requests, automatically show the requests card
    if (requestsCard) {
        requestsCard.classList.remove('hidden');
        requestsCard.classList.add('show');
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
    card.className = 'ride-request-card';
    card.innerHTML = `
        <div class="request-header">
            <div class="rider-info">
                <div class="rider-avatar">👤</div>
                <div class="rider-details">
                    <h4>${request.rider.name}</h4>
                    <div class="rider-meta">
                        ⭐ ${request.rider.rating.toFixed(1)} • ${request.rider.phone}
                    </div>
                </div>
            </div>
            <div class="request-time">
                ${request.requested_at}
            </div>
        </div>
        
        ${request.rider_message ? `
        <div class="request-message">
            "${request.rider_message}"
        </div>
        ` : ''}
        
        <div class="request-route">
            📍 ${request.pickup_address} → 🎯 ${request.destination_address}
        </div>
        
        <div class="request-cost">
            <span>Split cost:</span>
            <span class="cost-info">₹${request.estimated_fare}</span>
        </div>
        
        <div class="request-actions">
            <button class="btn btn-outline" onclick="respondToRequest('${request.request_id}', 'reject')">
                ❌ Sorry, can't help
            </button>
            <button class="btn btn-primary" onclick="respondToRequest('${request.request_id}', 'accept')">
                ✅ Sure! Let's ride together
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
            
            // Hide requests card
            const requestsCard = document.getElementById('requests-card');
            if (requestsCard) {
                requestsCard.classList.add('hidden');
                requestsCard.classList.remove('show');
            }
            
            // Show OTP modal for driver to verify with rider
            showOtpModal(response.otp, response.note);
            
            // Show status message - no active ride interface yet
            showStatus('✅ Request accepted! Please verify OTP with rider to start the ride.', 'success');
            
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
        <div style="background: var(--background-color); padding: 1.5rem; border-radius: 1rem; margin-bottom: 1rem; text-align: center;">
            <h4 style="color: var(--secondary-color); margin-bottom: 0.5rem;">🔐 OTP Verification</h4>
            <p style="color: var(--text-secondary); margin-bottom: 0;">Ask the rider for their OTP to start the trip</p>
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
async function showActiveRideInProgress() {
    const activeRideCard = document.getElementById('active-ride-card');
    
    // Fetch real rider data from backend
    try {
        const response = await apiCall('/rides/active-ride', 'GET');
        if (response.has_active_ride && response.ride_info) {
            const rideInfo = response.ride_info;
            
            // Update the active ride card content with real data
            const rideStatus = activeRideCard.querySelector('.ride-status');
            if (rideStatus) {
                rideStatus.textContent = 'In Transit';
            }
            
            // Populate ride buddies with real rider data
            const buddiesList = document.getElementById('active-ride-buddies');
            if (buddiesList) {
                buddiesList.innerHTML = `
                    <div class="ride-buddy-item">
                        <div class="buddy-info">
                            <span class="buddy-role">🏍️</span>
                            <span class="buddy-name">You (Helper)</span>
                        </div>
                    </div>
                    <div class="ride-buddy-item">
                        <div class="buddy-info">
                            <span class="buddy-role">🎒</span>
                            <span class="buddy-name">${rideInfo.rider?.name || 'Rider'}</span>
                        </div>
                        <div class="buddy-contact">
                            <span class="contact-label">📞 Phone:</span>
                            <span class="contact-info">${rideInfo.rider?.phone || 'Not provided'}</span>
                        </div>
                    </div>
                `;
            }
            
            // Show helpful chat messages
            const chatMessages = document.getElementById('active-ride-chat');
            if (chatMessages) {
                chatMessages.innerHTML = `
                    <div class="chat-message">
                        <span class="sender">System:</span>
                        <span class="message">Ride started! You can call the rider using the contact details above.</span>
                    </div>
                    <div class="chat-message">
                        <span class="sender">System:</span>
                        <span class="message">Share your location with the rider for better coordination.</span>
                    </div>
                `;
            }
            
            // Update ETA
            const etaElement = document.getElementById('active-ride-eta');
            if (etaElement) {
                etaElement.textContent = 'Calculating...';
            }
            
            // Add event listeners for action buttons
            const callBtn = activeRideCard.querySelector('#call-driver-btn'); // This ID is for rider, should be #call-rider-btn for driver
            if (callBtn && rideInfo.rider?.phone) {
                callBtn.addEventListener('click', () => {
                    window.open(`tel:${rideInfo.rider.phone}`, '_self');
                });
            }
        }
    } catch (error) {
        console.error('Failed to fetch active ride data:', error);
        showStatus('Failed to load ride details', 'error');
    }
    
    // Show the active ride card
    activeRideCard.classList.remove('hidden');
    activeRideCard.classList.add('show');
    
    // Add event listener for complete ride button if it exists
    const completeRideBtn = activeRideCard.querySelector('.btn-secondary');
    if (completeRideBtn && completeRideBtn.textContent.includes('Complete Ride')) {
        completeRideBtn.addEventListener('click', completeRide);
    }
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
        
        showStatus('🎉 Ride completed successfully! Thank you for helping the community!', 'success');
        
        // Reset state
        acceptedRequestId = null;
        currentOTP = null;
        
        // Hide active ride card and show requests card
        const activeRideCard = document.getElementById('active-ride-card');
        const requestsCard = document.getElementById('requests-card');
        
        activeRideCard.classList.add('hidden');
        activeRideCard.classList.remove('show');
        requestsCard.classList.remove('hidden');
        requestsCard.classList.add('show');
        
        // Restart polling for new requests
        startRequestsPolling();
        
    } catch (error) {
        console.error('Failed to complete ride:', error);
        showStatus(error.message || 'Failed to complete ride. Please try again.', 'error');
    }
}

// Show active ride section with ride info
function showActiveRideSection(rideInfo) {
    const activeRideCard = document.getElementById('active-ride-card');
    const rideStatus = activeRideCard.querySelector('.ride-status');
    
    if (rideInfo.status === 'accepted') {
        if (rideStatus) {
            rideStatus.textContent = 'Waiting for Rider';
        }
        showOtpModal(rideInfo.otp, "Ask the rider for their OTP to start the trip");
    } else if (rideInfo.status === 'started') {
        if (rideStatus) {
            rideStatus.textContent = 'In Transit';
        }
        showActiveRideInProgress();
    }
    
    // Show the active ride card
    activeRideCard.classList.remove('hidden');
    activeRideCard.classList.add('show');
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
    statusEl.className = `floating-status status-${type}`;
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
        phone_number: document.getElementById('phone').value,
        vehicle_model: document.getElementById('vehicle-model').value,
        vehicle_color: document.getElementById('vehicle-color').value,
        vehicle_plate: document.getElementById('vehicle-plate').value,
        emergency_contact: document.getElementById('emergency-contact').value,
        college_id: document.getElementById('college-id').value
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
    // Check if user has active rides
    let hasActiveRide = false;
    let warningMessage = '';
    
    if (isOnline) {
        hasActiveRide = true;
        warningMessage += 'You are currently online and helping the community. ';
    }
    
    if (acceptedRequestId) {
        hasActiveRide = true;
        warningMessage += 'You have an active ride in progress. ';
    }
    
    if (hasActiveRide) {
        warningMessage += 'Logging out will cancel any active rides and go offline. Are you sure you want to continue?';
        
        if (!confirm(warningMessage)) {
            return; // User cancelled logout
        }
    }
    
    try {
        // Go offline first if online
        if (isOnline) {
            await goOffline();
        }
        
        // Cancel any active ride requests
        if (acceptedRequestId) {
            try {
                await apiCall(`/rides/cancel-request/${acceptedRequestId}`, 'POST');
            } catch (error) {
                console.error('Failed to cancel active ride:', error);
            }
        }
        
        // Stop all polling and tracking
        stopRequestsPolling();
        stopLocationTracking();
        
        await apiCall('/auth/logout', 'POST');
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        clearAuthToken();
        window.location.href = '/';
    }
};

// Card compression functions
function compressHelperCard() {
    const helperCard = document.querySelector('.floating-helper-card');
    if (helperCard) {
        helperCard.classList.add('compressed');
        
        // Add click listener to expand when clicked
        helperCard.addEventListener('click', expandHelperCard, { once: true });
    }
}

function expandHelperCard() {
    const helperCard = document.querySelector('.floating-helper-card');
    if (helperCard) {
        helperCard.classList.remove('compressed');
    }
}

// Active ride functions
async function showActiveRide(rideInfo) {
    const activeRideCard = document.getElementById('active-ride-card');
    if (!activeRideCard) return;
    
    // Hide other cards
    const requestsCard = document.getElementById('requests-card');
    const helperStats = document.getElementById('helper-stats');
    if (requestsCard) requestsCard.classList.add('hidden');
    if (helperStats) helperStats.classList.add('hidden');
    
    // Fetch real rider data from backend
    try {
        const response = await apiCall('/rides/active-ride', 'GET');
        if (response.has_active_ride && response.ride_info) {
            const realRideInfo = response.ride_info;
            
            // Populate ride buddies with real contact information
            const buddiesList = document.getElementById('active-ride-buddies');
            if (buddiesList) {
                buddiesList.innerHTML = `
                    <div class="ride-buddy-item">
                        <div class="buddy-info">
                            <span class="buddy-role">🏍️</span>
                            <span class="buddy-name">You (Helper)</span>
                        </div>
                    </div>
                    <div class="ride-buddy-item">
                        <div class="buddy-info">
                            <span class="buddy-role">🎒</span>
                            <span class="buddy-name">${realRideInfo.rider?.name || 'Rider'}</span>
                        </div>
                        <div class="buddy-contact">
                            <span class="contact-label">📞 Phone:</span>
                            <span class="contact-info">${realRideInfo.rider?.phone || 'Not provided'}</span>
                        </div>
                    </div>
                `;
            }
            
            // Show helpful chat messages
            const chatMessages = document.getElementById('active-ride-chat');
            if (chatMessages) {
                chatMessages.innerHTML = `
                    <div class="chat-message">
                        <span class="sender">System:</span>
                        <span class="message">Ride started! You can call the rider using the contact details above.</span>
                    </div>
                    <div class="chat-message">
                        <span class="sender">System:</span>
                        <span class="message">Share your location with the rider for better coordination.</span>
                    </div>
                `;
            }
            
            // Update ETA
            const etaElement = document.getElementById('active-ride-eta');
            if (etaElement) {
                etaElement.textContent = 'Calculating...';
            }
            
            // Add event listeners for action buttons
            const callBtn = activeRideCard.querySelector('#call-driver-btn');
            if (callBtn && realRideInfo.rider?.phone) {
                callBtn.addEventListener('click', () => {
                    window.open(`tel:${realRideInfo.rider.phone}`, '_self');
                });
            }
        }
    } catch (error) {
        console.error('Failed to fetch active ride data:', error);
        showStatus('Failed to load ride details', 'error');
    }
    
    // Show active ride card
    activeRideCard.classList.remove('hidden');
    activeRideCard.classList.add('show');
}

function hideActiveRide() {
    const activeRideCard = document.getElementById('active-ride-card');
    if (activeRideCard) {
        activeRideCard.classList.add('hidden');
        activeRideCard.classList.remove('show');
    }
}

// Handle accepting a ride request
async function acceptRideRequest(requestId) {
    try {
        showStatus('Accepting ride request...', 'info');
        
        const response = await apiCall(`/rides/accept-request/${requestId}`, 'POST');
        
        // Hide requests card and show active ride
        document.getElementById('requests-card').classList.add('hidden');
        showActiveRide(response.ride_info);
        
        showStatus('Ride request accepted! Ask rider for OTP to start trip.', 'success');
        
    } catch (error) {
        console.error('Failed to accept ride request:', error);
        showStatus('Failed to accept ride request. Please try again.', 'error');
    }
}

// Handle declining a ride request
async function declineRideRequest(requestId) {
    try {
        showStatus('Declining ride request...', 'info');
        
        await apiCall(`/rides/decline-request/${requestId}`, 'POST');
        
        // Refresh requests list
        loadRideRequests();
        
        showStatus('Ride request declined.', 'info');
        
    } catch (error) {
        console.error('Failed to decline ride request:', error);
        showStatus('Failed to decline ride request. Please try again.', 'error');
    }
}



// Real-time location tracking for drivers
function startLocationTracking() {
    if (!navigator.geolocation) return;
    
    locationTrackingInterval = setInterval(() => {
        if (isOnline && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    try {
                        await apiCall('/rides/update-location', 'POST', {
                            current_location: [longitude, latitude]
                        });
                        console.log('📍 Location updated:', latitude.toFixed(4), longitude.toFixed(4));
                    } catch (error) {
                        console.error('Failed to update location:', error);
                    }
                },
                (error) => console.error('Geolocation error:', error),
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
            );
        }
    }, 10000); // Every 10 seconds
}

function stopLocationTracking() {
    if (locationTrackingInterval) {
        clearInterval(locationTrackingInterval);
        locationTrackingInterval = null;
        console.log('📍 Location tracking stopped');
    }
}

// ===============================
// PRE-BOOKING MARKETPLACE (PHASE 3)
// ===============================

function showPreBookingMarketplace() {
    // Hide other sections
    document.getElementById('requests-section').classList.add('hidden');
    document.getElementById('active-ride-section').classList.add('hidden');
    
    // Show pre-booking marketplace
    document.getElementById('prebook-marketplace-section').classList.remove('hidden');
    
    showStatus('📅 Browse future ride requests and plan your schedule!', 'info');
    loadPreBookingRequests();
}

async function loadPreBookingRequests() {
    if (!currentLocation) {
        getCurrentLocation();
        setTimeout(loadPreBookingRequests, 2000);
        return;
    }
    
    try {
        // Show browse section, hide schedule
        document.getElementById('prebook-requests-list').classList.remove('hidden');
        document.getElementById('my-accepted-list').classList.add('hidden');
        
        // Update button states
        document.getElementById('browse-prebooks-btn').classList.remove('btn-outline');
        document.getElementById('browse-prebooks-btn').classList.add('btn-primary');
        document.getElementById('my-accepted-prebooks-btn').classList.remove('btn-primary');
        document.getElementById('my-accepted-prebooks-btn').classList.add('btn-outline');
        
        const response = await apiCall('/rides/prebook/nearby', 'POST', {
            driver_location: currentLocation,
            max_distance_km: 25
        });
        
        displayPreBookingRequests(response.prebook_requests || []);
        
    } catch (error) {
        console.error('Failed to load pre-booking requests:', error);
        showStatus('Failed to load pre-booking requests. Please try again.', 'error');
    }
}

async function loadMyAcceptedPreBooks() {
    try {
        // Show schedule section, hide browse
        document.getElementById('prebook-requests-list').classList.add('hidden');
        document.getElementById('my-accepted-list').classList.remove('hidden');
        
        // Update button states
        document.getElementById('browse-prebooks-btn').classList.remove('btn-primary');
        document.getElementById('browse-prebooks-btn').classList.add('btn-outline');
        document.getElementById('my-accepted-prebooks-btn').classList.remove('btn-outline');
        document.getElementById('my-accepted-prebooks-btn').classList.add('btn-primary');
        
        const response = await apiCall('/rides/prebook/my-accepted');
        displayMyAcceptedPreBooks(response.accepted_prebooks || []);
        
    } catch (error) {
        console.error('Failed to load accepted pre-bookings:', error);
        showStatus('Failed to load your schedule. Please try again.', 'error');
    }
}

function displayPreBookingRequests(requests) {
    const container = document.getElementById('prebook-requests-list');
    const noRequestsEl = document.getElementById('no-prebook-requests');
    
    if (requests.length === 0) {
        container.innerHTML = '';
        noRequestsEl.classList.remove('hidden');
        return;
    }
    
    noRequestsEl.classList.add('hidden');
    container.innerHTML = '';
    
    requests.forEach(request => {
        const card = createPreBookingRequestCard(request);
        container.appendChild(card);
    });
}

function createPreBookingRequestCard(request) {
    const card = document.createElement('div');
    card.className = 'request-card';
    
    // Format datetime
    const requestDate = new Date(request.requested_datetime);
    const formattedDate = requestDate.toLocaleDateString('en-IN', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Calculate urgency color
    const hoursUntil = (requestDate - new Date()) / (1000 * 60 * 60);
    let urgencyColor = '#10b981'; // green
    if (hoursUntil < 12) urgencyColor = '#f59e0b'; // yellow
    if (hoursUntil < 4) urgencyColor = '#ef4444'; // red
    
    card.innerHTML = `
        <div class="request-header">
            <div class="rider-info">
                <h4>${request.rider.name}</h4>
                <div class="driver-rating">
                    ⭐ ${request.rider.rating.toFixed(1)} • 🏠 ${request.rider.home_distance_km}km away
                </div>
            </div>
            <div style="text-align: right;">
                <div style="background: ${urgencyColor}; color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: bold; margin-bottom: 0.25rem;">
                    ${request.time_until_ride}
                </div>
                <div style="background: var(--primary-color); color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: bold;">
                    Score: ${request.smart_score}/100
                </div>
            </div>
        </div>
        
        <div class="request-details">
            <div style="background: var(--background-color); padding: 1rem; border-radius: 0.5rem; margin: 0.75rem 0;">
                <p style="margin: 0 0 0.5rem 0;"><strong>📅 When:</strong> ${formattedDate}</p>
                <p style="margin: 0 0 0.5rem 0;"><strong>📍 From:</strong> ${request.pickup_address}</p>
                <p style="margin: 0 0 0.5rem 0;"><strong>🎯 To:</strong> ${request.destination_address}</p>
                <p style="margin: 0;"><strong>💰 Fare:</strong> ₹${request.estimated_fare}${request.max_fare ? ` (max ₹${request.max_fare})` : ''}</p>
                ${request.notes ? `<p style="margin: 0.5rem 0 0 0;"><strong>📝 Note:</strong> <em>${request.notes}</em></p>` : ''}
            </div>
        </div>
        
        <div class="request-actions">
            <button class="btn btn-danger" onclick="declinePreBooking('${request.request_id}')">
                Pass
            </button>
            <button class="btn btn-secondary" onclick="acceptPreBooking('${request.request_id}')">
                Accept Pre-Booking
            </button>
        </div>
    `;
    
    return card;
}

function displayMyAcceptedPreBooks(prebooks) {
    const container = document.getElementById('my-accepted-list');
    
    if (prebooks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No scheduled rides</h3>
                <p>Browse the marketplace to accept pre-booking requests and plan your schedule.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    prebooks.forEach(prebook => {
        const card = createAcceptedPreBookCard(prebook);
        container.appendChild(card);
    });
}

function createAcceptedPreBookCard(prebook) {
    const card = document.createElement('div');
    card.className = 'request-card';
    
    // Format datetime
    const requestDate = new Date(prebook.requested_datetime);
    const formattedDate = requestDate.toLocaleDateString('en-IN', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Calculate time until ride
    const timeUntil = requestDate - new Date();
    const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
    const daysUntil = Math.floor(hoursUntil / 24);
    
    let timeDisplay = '';
    if (daysUntil > 0) {
        timeDisplay = `in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`;
    } else if (hoursUntil > 0) {
        timeDisplay = `in ${hoursUntil} hour${hoursUntil > 1 ? 's' : ''}`;
    } else {
        timeDisplay = 'very soon!';
    }
    
    card.innerHTML = `
        <div class="request-header">
            <div class="rider-info">
                <h4>📅 ${formattedDate}</h4>
                <div style="color: var(--secondary-color); font-weight: 600; margin-top: 0.25rem;">
                    ✅ Confirmed - ${timeDisplay}
                </div>
            </div>
            <div style="background: var(--secondary-color); color: white; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-weight: bold;">
                ₹${prebook.estimated_fare}
            </div>
        </div>
        
        <div class="request-details">
            <div style="background: var(--background-color); padding: 1rem; border-radius: 0.5rem; margin: 0.75rem 0;">
                <p style="margin: 0 0 0.5rem 0;"><strong>👤 Rider:</strong> ${prebook.rider.name} (⭐ ${prebook.rider.rating.toFixed(1)})</p>
                <p style="margin: 0 0 0.5rem 0;"><strong>📞 Phone:</strong> <a href="tel:${prebook.rider.phone}">${prebook.rider.phone}</a></p>
                <p style="margin: 0 0 0.5rem 0;"><strong>📍 From:</strong> ${prebook.pickup_address}</p>
                <p style="margin: 0;"><strong>🎯 To:</strong> ${prebook.destination_address}</p>
                ${prebook.notes ? `<p style="margin: 0.5rem 0 0 0;"><strong>📝 Note:</strong> <em>${prebook.notes}</em></p>` : ''}
            </div>
        </div>
        
        <div class="request-actions">
            <button class="btn btn-danger" onclick="cancelAcceptedPreBook('${prebook.request_id}')">
                Cancel Booking
            </button>
            <button class="btn btn-outline" onclick="setReminderForRide('${prebook.request_id}')">
                📱 Set Reminder
            </button>
        </div>
    `;
    
    return card;
}

window.acceptPreBooking = async function(requestId) {
    try {
        const response = await apiCall(`/rides/prebook/accept/${requestId}`, 'POST');
        
        showEnhancedNotification('🎉 Pre-booking accepted! Added to your schedule.', 'success');
        
        // Refresh the marketplace
        loadPreBookingRequests();
        
    } catch (error) {
        console.error('Failed to accept pre-booking:', error);
        showStatus(error.message || 'Failed to accept pre-booking. Please try again.', 'error');
    }
};

window.declinePreBooking = async function(requestId) {
    // Just remove from view - no API call needed for decline
    showStatus('Request passed. Browse more opportunities below.', 'info');
    loadPreBookingRequests();
};

window.cancelAcceptedPreBook = async function(requestId) {
    if (!confirm('Are you sure you want to cancel this accepted pre-booking? The rider will be notified.')) {
        return;
    }
    
    try {
        await apiCall(`/rides/prebook/cancel/${requestId}`, 'POST');
        showStatus('Pre-booking cancelled. It will return to the marketplace for other drivers.', 'info');
        loadMyAcceptedPreBooks();
        
    } catch (error) {
        console.error('Failed to cancel pre-booking:', error);
        showStatus('Failed to cancel. Please try again.', 'error');
    }
};

window.setReminderForRide = function(requestId) {
    showStatus('📱 Set a phone reminder for this ride time! Feature coming soon.', 'info');
};