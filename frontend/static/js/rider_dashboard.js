// Rider Dashboard JavaScript

// Global variables
let map;
let currentMarkers = [];
let pickupCoordinates = null;
let destinationCoordinates = null;
let currentLocation = null;
let availableRides = [];
let selectedRideId = null;

// College coordinates (Kristu Jayanti College)
const COLLEGE_COORDS = [77.7334, 12.8627]; // [longitude, latitude]
const COLLEGE_ADDRESS = "Kristu Jayanti College, K Narayanapura, Kothanur, Bengaluru, Karnataka 560077, India";

// API Configuration
const API_URL = 'http://127.0.0.1:5000/api';

// Initialize Google Maps callback
window.initRiderApp = function() {
    console.log('Google Maps API loaded for rider dashboard');
    initializeAutocomplete();
    initializeMap();
};

// Authentication and token management
function getAuthToken() {
    return localStorage.getItem('campuspool_token');
}

function clearAuthToken() {
    localStorage.removeItem('campuspool_token');
}

// Check authentication and redirect if needed
function checkAuth() {
    if (!getAuthToken()) {
        window.location.href = '/';
        return false;
    }
    return true;
}

// API helper function
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
});

// Initialize event listeners
function initializeEventListeners() {
    // Location buttons
    document.getElementById('current-location-btn').addEventListener('click', getCurrentLocation);
    document.getElementById('college-location-btn').addEventListener('click', setCollegeDestination);
    
    // Search button
    document.getElementById('search-rides-btn').addEventListener('click', searchForRides);
    
    // View toggle
    document.getElementById('map-view-btn').addEventListener('click', () => switchView('map'));
    document.getElementById('list-view-btn').addEventListener('click', () => switchView('list'));
    
    // Profile form
    document.getElementById('profile-form').addEventListener('submit', handleProfileSubmit);
    
    // Request modal buttons
    document.getElementById('confirm-request-btn').addEventListener('click', confirmRideRequest);
    document.getElementById('cancel-request-btn').addEventListener('click', closeRequestModal);
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

// Initialize map
function initializeMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    // Default to Bengaluru coordinates
    map = new google.maps.Map(mapContainer, {
        zoom: 12,
        center: { lat: 12.9716, lng: 77.5946 }, // Bengaluru
        styles: [
            {
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
            }
        ]
    });
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
                showStatus('Current location set as pickup point', 'success');
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

// Search for available rides
async function searchForRides() {
    if (!pickupCoordinates) {
        showStatus('Please select a pickup location first', 'error');
        return;
    }

    if (!destinationCoordinates) {
        showStatus('Please select a destination first', 'error');
        return;
    }

    // Show loading state
    showLoading(true);
    hideStatus();

    try {
        const response = await apiCall('/rides/nearby', 'POST', {
            current_location: pickupCoordinates,
            max_distance_km: 15
        });

        availableRides = response.nearby_rides || [];
        
        if (availableRides.length === 0) {
            showNoRides();
            showStatus('No rides available in your area. Try adjusting your pickup location.', 'warning');
        } else {
            showRidesFound();
            displayRides(availableRides);
            showStatus(`Found ${availableRides.length} available ride(s)`, 'success');
        }

    } catch (error) {
        console.error('Search failed:', error);
        showStatus('Failed to search for rides. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// Display rides in list and map
function displayRides(rides) {
    displayRidesList(rides);
    displayRidesOnMap(rides);
}

// Display rides as cards
function displayRidesList(rides) {
    const container = document.getElementById('drivers-list');
    container.innerHTML = '';

    rides.forEach(ride => {
        const card = createRideCard(ride);
        container.appendChild(card);
    });
}

// Create individual ride card
function createRideCard(ride) {
    const card = document.createElement('div');
    card.className = 'driver-card';
    card.innerHTML = `
        <div class="driver-header">
            <div class="driver-info">
                <h4>${ride.driver.name}</h4>
                <div class="driver-rating">
                    ⭐ ${ride.driver.rating.toFixed(1)} • ${ride.distance_km} km away
                </div>
            </div>
            <div class="smart-score">
                ${ride.smart_score}/100
            </div>
        </div>
        <div class="driver-details">
            <strong>Route:</strong> ${ride.pickup_address} → ${ride.destination_address}<br>
            <strong>Available Seats:</strong> ${ride.seats_available}
        </div>
        <div class="driver-footer">
            <div class="fare-info">₹${ride.suggested_fare}</div>
            <button class="btn btn-primary" onclick="requestRide('${ride.ride_id}')">
                Request Ride
            </button>
        </div>
    `;
    return card;
}

// Display rides on map
function displayRidesOnMap(rides) {
    // Clear existing markers
    currentMarkers.forEach(marker => marker.setMap(null));
    currentMarkers = [];

    if (rides.length === 0) return;

    // Create bounds to fit all markers
    const bounds = new google.maps.LatLngBounds();

    // Add pickup location marker
    if (pickupCoordinates) {
        const pickupMarker = new google.maps.Marker({
            position: { lat: pickupCoordinates[1], lng: pickupCoordinates[0] },
            map: map,
            title: 'Your Pickup Location',
            icon: {
                url: 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%23059669"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
                scaledSize: new google.maps.Size(40, 40)
            }
        });
        currentMarkers.push(pickupMarker);
        bounds.extend(pickupMarker.getPosition());
    }

    // Add driver markers
    rides.forEach(ride => {
        const driverMarker = new google.maps.Marker({
            position: { 
                lat: ride.pickup_location ? ride.pickup_location[1] : pickupCoordinates[1], 
                lng: ride.pickup_location ? ride.pickup_location[0] : pickupCoordinates[0]
            },
            map: map,
            title: `${ride.driver.name} - Score: ${ride.smart_score}/100`,
            icon: {
                url: 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%232563eb"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
                scaledSize: new google.maps.Size(40, 40)
            }
        });

        // Add click listener for ride request
        driverMarker.addListener('click', () => {
            requestRide(ride.ride_id);
        });

        currentMarkers.push(driverMarker);
        bounds.extend(driverMarker.getPosition());
    });

    // Fit map to show all markers
    if (currentMarkers.length > 1) {
        map.fitBounds(bounds);
    } else if (currentMarkers.length === 1) {
        map.setCenter(currentMarkers[0].getPosition());
        map.setZoom(15);
    }
}

// Request a ride
window.requestRide = function(rideId) {
    selectedRideId = rideId;
    const ride = availableRides.find(r => r.ride_id === rideId);
    
    if (!ride) {
        showStatus('Ride not found', 'error');
        return;
    }

    // Show request confirmation modal
    showRequestModal(ride);
};

// Show request confirmation modal
function showRequestModal(ride) {
    const modal = document.getElementById('request-modal');
    const detailsContainer = document.getElementById('request-details');
    
    detailsContainer.innerHTML = `
        <div style="text-align: center; margin-bottom: 1rem;">
            <h4>${ride.driver.name}</h4>
            <div class="driver-rating">
                ⭐ ${ride.driver.rating.toFixed(1)} • Smart Score: ${ride.smart_score}/100
            </div>
        </div>
        <div style="background: var(--background-color); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
            <p><strong>Pickup:</strong> ${document.getElementById('pickup-input').value}</p>
            <p><strong>Destination:</strong> ${document.getElementById('destination-input').value}</p>
            <p><strong>Distance:</strong> ${ride.distance_km} km away</p>
            <p><strong>Estimated Fare:</strong> ₹${ride.suggested_fare}</p>
        </div>
        <p style="font-size: 0.875rem; color: var(--text-secondary); text-align: center;">
            The driver will receive your request and can accept or decline it.
        </p>
    `;
    
    modal.classList.remove('hidden');
}

// Confirm ride request
async function confirmRideRequest() {
    if (!selectedRideId || !pickupCoordinates || !destinationCoordinates) {
        showStatus('Missing ride information', 'error');
        return;
    }

    try {
        const response = await apiCall('/rides/request', 'POST', {
            ride_id: selectedRideId,
            pickup_location: pickupCoordinates,
            destination_location: destinationCoordinates,
            pickup_address: document.getElementById('pickup-input').value,
            destination_address: document.getElementById('destination-input').value
        });

        closeRequestModal();
        showStatus('Ride request sent successfully! Wait for driver confirmation.', 'success');
        
        // You might want to redirect to a "waiting" page or show request status
        
    } catch (error) {
        console.error('Request failed:', error);
        showStatus('Failed to send ride request. Please try again.', 'error');
    }
}

// Close request modal
function closeRequestModal() {
    document.getElementById('request-modal').classList.add('hidden');
    selectedRideId = null;
}

// Switch between map and list view
function switchView(view) {
    const mapView = document.getElementById('map-view-btn');
    const listView = document.getElementById('list-view-btn');
    const mapContainer = document.getElementById('map-container');
    const driversSection = document.getElementById('drivers-section');

    if (view === 'map') {
        mapView.classList.add('active');
        listView.classList.remove('active');
        mapContainer.classList.remove('hidden');
        driversSection.classList.add('hidden');
        
        // Trigger map resize
        if (map) {
            google.maps.event.trigger(map, 'resize');
        }
    } else {
        mapView.classList.remove('active');
        listView.classList.add('active');
        mapContainer.classList.add('hidden');
        driversSection.classList.remove('hidden');
    }
}

// Show/hide UI states
function showRidesFound() {
    document.getElementById('view-toggle').classList.remove('hidden');
    document.getElementById('drivers-section').classList.remove('hidden');
    document.getElementById('map-container').classList.remove('hidden');
    document.getElementById('no-drivers').classList.add('hidden');
    
    // Default to map view
    switchView('map');
}

function showNoRides() {
    document.getElementById('view-toggle').classList.add('hidden');
    document.getElementById('drivers-section').classList.remove('hidden');
    document.getElementById('map-container').classList.add('hidden');
    document.getElementById('no-drivers').classList.remove('hidden');
    
    // Clear the drivers list
    document.getElementById('drivers-list').innerHTML = '';
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

// Status messages
function showStatus(message, type) {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.classList.remove('hidden');
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusEl.classList.add('hidden');
        }, 5000);
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
        showStatus('Profile completed successfully!', 'success');
    } catch (error) {
        console.error('Profile completion failed:', error);
        showStatus(error.message, 'error');
    }
}

// Logout function
window.handleLogout = async function() {
    try {
        await apiCall('/auth/logout', 'POST');
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        clearAuthToken();
        window.location.href = '/';
    }
};