// Enhanced Rider Dashboard JavaScript with Real-time Updates

// Global variables
let map;
let currentMarkers = [];
let pickupCoordinates = null;
let destinationCoordinates = null;
let currentLocation = null;
let availableRides = [];
let selectedRideId = null;
let activeRequestId = null;
let statusPollingInterval = null;
let driverTrackingInterval = null;
let liveDriverMarker = null;
let directionsRenderer = null;

// College coordinates (Kristu Jayanti College)
const COLLEGE_COORDS = [77.64038,13.05794]; // [longitude, latitude]
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
    
    // Active ride modal buttons
    document.getElementById('close-active-ride-modal').addEventListener('click', closeActiveRideModal);
    document.getElementById('cancel-ride-btn').addEventListener('click', cancelActiveRide);
}

// Check for active ride on page load
async function checkForActiveRide() {
    try {
        const response = await apiCall('/rides/active-ride');
        
        if (response.has_active_ride) {
            activeRequestId = response.ride_info.request_id;
            showActiveRideModal(response.ride_info);
            startStatusPolling();
        }
    } catch (error) {
        console.error('Failed to check active ride:', error);
    }
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
            destination_location: destinationCoordinates,
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
    
    // Distance badge color based on distance
    let distanceBadge = '🟢';
    if (ride.distance_km > 5) distanceBadge = '🟡';
    if (ride.distance_km > 10) distanceBadge = '🔴';
    
    card.innerHTML = `
        <div class="driver-header">
            <div class="driver-info">
                <h4>${ride.driver.name}</h4>
                <div class="driver-rating">
                    ⭐ ${ride.driver.rating.toFixed(1)} • ${distanceBadge} ${ride.distance_km} km away
                </div>
            </div>
            <div class="smart-score">
                <div class="score-badge">${ride.smart_score}/100</div>
                <small>Smart Score</small>
            </div>
        </div>
        <div class="driver-details">
            <div class="route-info">
                <strong>📍 Route:</strong> ${ride.pickup_address} → ${ride.destination_address}
            </div>
            <div class="ride-details">
                <span><strong> Seats:</strong> ${ride.seats_available}</span>
                <span><strong>💰 Fare:</strong> ₹${ride.suggested_fare}</span>
            </div>
        </div>
        <div class="driver-footer">
            <button class="btn btn-primary" onclick="requestRide('${ride.ride_id}')">
                🚗 Request Ride
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

    // Add pickup location marker (rider's location)
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
        
        // Add info window for pickup
        const pickupInfoWindow = new google.maps.InfoWindow({
            content: `<div style="padding:10px;"><strong>Your Pickup</strong><br>${document.getElementById('pickup-input').value}</div>`
        });
        
        pickupMarker.addListener('click', () => {
            pickupInfoWindow.open(map, pickupMarker);
        });
        
        currentMarkers.push(pickupMarker);
        bounds.extend(pickupMarker.getPosition());
    }

    // Add destination marker
    if (destinationCoordinates) {
        const destMarker = new google.maps.Marker({
            position: { lat: destinationCoordinates[1], lng: destinationCoordinates[0] },
            map: map,
            title: 'Your Destination',
            icon: {
                url: 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%23dc2626"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
                scaledSize: new google.maps.Size(40, 40)
            }
        });
        
        const destInfoWindow = new google.maps.InfoWindow({
            content: `<div style="padding:10px;"><strong>Your Destination</strong><br>${document.getElementById('destination-input').value}</div>`
        });
        
        destMarker.addListener('click', () => {
            destInfoWindow.open(map, destMarker);
        });
        
        currentMarkers.push(destMarker);
        bounds.extend(destMarker.getPosition());
    }

    // Add driver markers
    rides.forEach((ride, index) => {
        // Use driver pickup location or fallback to a point near rider
        const driverLat = ride.driver_pickup_coords ? ride.driver_pickup_coords[1] : pickupCoordinates[1] + (Math.random() - 0.5) * 0.01;
        const driverLng = ride.driver_pickup_coords ? ride.driver_pickup_coords[0] : pickupCoordinates[0] + (Math.random() - 0.5) * 0.01;
        
        const driverMarker = new google.maps.Marker({
            position: { lat: driverLat, lng: driverLng },
            map: map,
            title: `${ride.driver.name} - Score: ${ride.smart_score}/100`,
            icon: {
                url: 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%232563eb"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
                scaledSize: new google.maps.Size(40, 40)
            }
        });

        // Add info window with driver details
        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div style="padding:15px;max-width:250px;">
                    <h4 style="margin:0 0 10px 0;color:#1f2937;">${ride.driver.name}</h4>
                    <div style="margin-bottom:10px;">
                        <span style="background:#fbbf24;color:white;padding:2px 8px;border-radius:12px;font-size:12px;">⭐ ${ride.driver.rating.toFixed(1)}</span>
                        <span style="background:#3b82f6;color:white;padding:2px 8px;border-radius:12px;font-size:12px;margin-left:5px;">${ride.smart_score}/100</span>
                    </div>
                    <p style="margin:5px 0;"><strong>Distance:</strong> ${ride.distance_km} km</p>
                    <p style="margin:5px 0;"><strong>Fare:</strong> ₹${ride.suggested_fare}</p>
                    <p style="margin:5px 0;font-size:12px;color:#6b7280;"><strong>Route:</strong> ${ride.pickup_address} → ${ride.destination_address}</p>
                    <button onclick="requestRide('${ride.ride_id}')" style="width:100%;margin-top:10px;padding:8px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">Request Ride</button>
                </div>
            `
        });

        // Add click listener for info window
        driverMarker.addListener('click', () => {
            // Close other info windows
            currentMarkers.forEach(marker => {
                if (marker.infoWindow) {
                    marker.infoWindow.close();
                }
            });
            infoWindow.open(map, driverMarker);
        });

        driverMarker.infoWindow = infoWindow;
        currentMarkers.push(driverMarker);
        bounds.extend(driverMarker.getPosition());
    });

    // Fit map to show all markers
    if (currentMarkers.length > 1) {
        map.fitBounds(bounds);
        
        // Add some padding
        google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
            if (map.getZoom() > 15) {
                map.setZoom(15);
            }
        });
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
        <div style="text-align: center; margin-bottom: 1.5rem;">
            <h4 style="margin-bottom: 0.5rem;">${ride.driver.name}</h4>
            <div class="driver-rating">
                ⭐ ${ride.driver.rating.toFixed(1)} • Smart Score: ${ride.smart_score}/100
            </div>
        </div>
        <div style="background: var(--background-color); padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem;">
            <div style="display: grid; gap: 0.75rem;">
                <p><strong>📍 Your Pickup:</strong> ${document.getElementById('pickup-input').value}</p>
                <p><strong>🎯 Your Destination:</strong> ${document.getElementById('destination-input').value}</p>
                <p><strong>📏 Distance to Driver:</strong> ${ride.distance_km} km away</p>
                <p><strong>💰 Estimated Fare:</strong> <span style="color: var(--primary-color); font-weight: bold;">₹${ride.suggested_fare}</span></p>
                <p><strong>🚗 Driver's Route:</strong> ${ride.pickup_address} → ${ride.destination_address}</p>
            </div>
        </div>
        <div style="background: #fef3c7; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
            <p style="font-size: 0.875rem; color: #92400e; margin: 0; text-align: center;">
                <strong>💡 Cost-sharing made simple!</strong><br>
                This fare covers petrol and vehicle costs for both of you.
            </p>
        </div>
        <p style="font-size: 0.875rem; color: var(--text-secondary); text-align: center;">
            The driver will receive your request and can accept or decline it. You'll be notified of their response.
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
        showLoading(true);
        
        const response = await apiCall('/rides/request', 'POST', {
            ride_id: selectedRideId,
            pickup_location: pickupCoordinates,
            destination_location: destinationCoordinates,
            pickup_address: document.getElementById('pickup-input').value,
            destination_address: document.getElementById('destination-input').value
        });

        closeRequestModal();
        
        // Set active request ID and start polling
        activeRequestId = response.request_id;
        startStatusPolling();
        
        showStatus('Ride request sent successfully! Waiting for driver confirmation...', 'success');
        
        // Show waiting modal
        showWaitingModal(response);
        
    } catch (error) {
        console.error('Request failed:', error);
        showStatus(error.message || 'Failed to send ride request. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// Show waiting modal
function showWaitingModal(requestData) {
    const modal = document.getElementById('active-ride-modal');
    const detailsContainer = document.getElementById('active-ride-details');
    
    detailsContainer.innerHTML = `
        <div style="text-align: center; margin-bottom: 1.5rem;">
            <div class="loading">
                <div class="spinner"></div>
            </div>
            <h4 style="margin: 1rem 0 0.5rem 0;">Request Sent!</h4>
            <p style="color: var(--text-secondary);">Waiting for driver response...</p>
        </div>
        <div style="background: var(--background-color); padding: 1.5rem; border-radius: 0.75rem;">
            <p><strong>Estimated Fare:</strong> ₹${requestData.estimated_fare}</p>
            <p><strong>Request ID:</strong> ${requestData.request_id}</p>
            <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 1rem;">
                The driver typically responds within 2-3 minutes. You'll be automatically notified when they respond.
            </p>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

// Start polling for request status
function startStatusPolling() {
    if (!activeRequestId) return;
    
    // Poll immediately
    checkRequestStatus();
    
    // Poll every 5 seconds
    statusPollingInterval = setInterval(() => {
        checkRequestStatus();
    }, 5000);
}

// Stop polling
function stopStatusPolling() {
    if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
        statusPollingInterval = null;
    }
}

// Check request status
async function checkRequestStatus() {
    if (!activeRequestId) return;
    
    try {
        const response = await apiCall(`/rides/request-status/${activeRequestId}`);
        updateRideStatus(response);
        
    } catch (error) {
        console.error('Failed to check status:', error);
        // Don't show error to avoid spam during polling
    }
}

// Update ride status based on response
function updateRideStatus(statusData) {
    const modal = document.getElementById('active-ride-modal');
    const detailsContainer = document.getElementById('active-ride-details');
    
    switch (statusData.status) {
        case 'pending':
            // Keep waiting state
            break;
            
case 'accepted':
            detailsContainer.innerHTML = `
                <div style="text-align: center; margin-bottom: 1.5rem;">
                    <div style="font-size: 3rem; margin-bottom: 0.5rem;">✅</div>
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--secondary-color);">Driver Accepted!</h4>
                    <p style="color: var(--text-secondary);">Get ready to share your OTP</p>
                </div>
                
                <div style="background: #dcfce7; padding: 2rem; border-radius: 1rem; margin-bottom: 1.5rem; text-align: center; border: 3px solid #10b981;">
                    <h4 style="color: #166534; margin-bottom: 1rem; font-size: 1.125rem;">
                        🔐 Share this OTP with your driver:
                    </h4>
                    <div style="font-size: 3rem; font-weight: bold; color: #10b981; 
                                background: white; padding: 1rem; border-radius: 1rem; 
                                border: 3px dashed #10b981; margin-bottom: 1rem; 
                                letter-spacing: 0.5rem; font-family: monospace;">
                        ${statusData.otp}
                    </div>
                </div>
                
                <div style="background: var(--background-color); padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1rem;">
                    <p><strong>👤 Driver:</strong> ${statusData.driver.name}</p>
                    <p><strong>⭐ Rating:</strong> ${statusData.driver.rating.toFixed(1)}/5.0</p>
                    <p><strong>📞 Phone:</strong> <a href="tel:${statusData.driver.phone}" style="color: var(--primary-color); text-decoration: none; font-weight: bold;">${statusData.driver.phone}</a></p>
                    <p><strong>💰 Fare:</strong> ₹${statusData.estimated_fare}</p>
                </div>
                
                <div id="eta-display"></div>
            `;
            
            // Start tracking driver location
            startDriverTracking();
            
            // Show route if coordinates available
            if (pickupCoordinates && destinationCoordinates) {
                setTimeout(() => showRouteDirections(pickupCoordinates, destinationCoordinates), 1000);
            }
            
            // Enhanced notification
            showEnhancedNotification(`🎉 Driver accepted! Your OTP is ${statusData.otp}`, 'success');
            break;
            
            // Show success notification
            showStatus('🎉 Great! Your ride has been accepted. Driver details are shown above.', 'success');
            break;
            
        case 'rejected':
            stopStatusPolling();
            stopDriverTracking();
            activeRequestId = null;
            closeActiveRideModal();
            showStatus('😔 Your ride request was declined. Please try requesting another ride.', 'warning');
            break;
            
        case 'started':
            detailsContainer.innerHTML = `
                <div style="text-align: center; margin-bottom: 1.5rem;">
                    <div style="font-size: 3rem; margin-bottom: 0.5rem;">🚗</div>
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--primary-color);">Ride Started!</h4>
                    <p style="color: var(--text-secondary);">Enjoy your trip</p>
                </div>
                <div style="background: var(--background-color); padding: 1.5rem; border-radius: 0.75rem;">
                    <div style="display: grid; gap: 0.75rem;">
                        <p><strong>👤 Driver:</strong> ${statusData.driver.name}</p>
                        <p><strong>📞 Contact:</strong> <a href="tel:${statusData.driver.phone}" style="color: var(--primary-color);">${statusData.driver.phone}</a></p>
                        <p><strong>📍 Pickup:</strong> ${statusData.pickup_address}</p>
                        <p><strong>🎯 Destination:</strong> ${statusData.destination_address}</p>
                        <p><strong>💰 Fare:</strong> ₹${statusData.estimated_fare}</p>
                    </div>
                </div>
            `;
            
            showStatus('🚀 Your ride has started! Have a safe journey.', 'success');
            break;
            
        case 'completed':
            stopStatusPolling();
            stopDriverTracking();
            activeRequestId = null;
            detailsContainer.innerHTML = `
                <div style="text-align: center; margin-bottom: 1.5rem;">
                    <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎉</div>
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--success-color);">Ride Completed!</h4>
                    <p style="color: var(--text-secondary);">Thank you for using CampusPool</p>
                </div>
                <div style="background: var(--background-color); padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1rem;">
                    <p><strong>Final Fare:</strong> ₹${statusData.estimated_fare}</p>
                    <p style="font-size: 0.875rem; color: var(--text-secondary);">
                        Please pay your driver the agreed amount. Rate your experience to help improve our service.
                    </p>
                </div>
                <button onclick="closeActiveRideModal()" class="btn btn-primary btn-full">
                    Close
                </button>
            `;
            
            showStatus('✅ Ride completed successfully! Thank you for using CampusPool.', 'success');
            break;
            
        case 'cancelled':
            stopStatusPolling();
            stopDriverTracking();
            activeRequestId = null;
            closeActiveRideModal();
            showStatus('ℹ️ Your ride request was cancelled.', 'info');
            break;
    }
}

// Show active ride modal
function showActiveRideModal(rideInfo) {
    const modal = document.getElementById('active-ride-modal');
    updateRideStatus(rideInfo);
    modal.classList.remove('hidden');
}

// Close active ride modal
function closeActiveRideModal() {
    document.getElementById('active-ride-modal').classList.add('hidden');
}

// Cancel active ride
async function cancelActiveRide() {
    if (!activeRequestId) return;
    
    if (!confirm('Are you sure you want to cancel this ride request?')) {
        return;
    }
    
    try {
        showStatus('Cancelling ride request...', 'info');
        
        await apiCall(`/rides/cancel-request/${activeRequestId}`, 'POST');
        
        stopStatusPolling();
        stopDriverTracking();
        activeRequestId = null;
        closeActiveRideModal();
        
        showStatus('Ride request cancelled successfully.', 'info');
        
    } catch (error) {
        console.error('Failed to cancel ride:', error);
        showStatus('Failed to cancel ride. Please try again.', 'error');
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
            setTimeout(() => {
                google.maps.event.trigger(map, 'resize');
                // Re-fit bounds if we have markers
                if (currentMarkers.length > 1) {
                    const bounds = new google.maps.LatLngBounds();
                    currentMarkers.forEach(marker => {
                        bounds.extend(marker.getPosition());
                    });
                    map.fitBounds(bounds);
                }
            }, 100);
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
    
    const profileData = {
        phone_number: document.getElementById('phone').value,
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
        showStatus('Profile completed successfully!', 'success');
    } catch (error) {
        console.error('Profile completion failed:', error);
        showStatus(error.message, 'error');
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopStatusPolling();
    stopDriverTracking();
});

// Logout function
window.handleLogout = async function() {
    try {
        stopStatusPolling();
        stopDriverTracking();
        await apiCall('/auth/logout', 'POST');
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        clearAuthToken();
        window.location.href = '/';
    }
};


// Track driver location in real-time during active ride
function startDriverTracking() {
    if (!activeRequestId) return;
    
    console.log('🚗 Starting driver tracking...');
    driverTrackingInterval = setInterval(async () => {
        try {
            const response = await apiCall(`/rides/driver-location/${activeRequestId}`);
            if (response.driver_location) {
                updateDriverMarkerOnMap(response.driver_location);
                updateETADisplay(response.driver_location);
            }
        } catch (error) {
            console.error('Failed to get driver location:', error);
        }
    }, 8000); // Every 8 seconds
}

function stopDriverTracking() {
    if (driverTrackingInterval) {
        clearInterval(driverTrackingInterval);
        driverTrackingInterval = null;
        console.log('🚗 Driver tracking stopped');
    }
    
    // Remove live driver marker
    if (liveDriverMarker) {
        liveDriverMarker.setMap(null);
        liveDriverMarker = null;
    }
}

function updateDriverMarkerOnMap(driverCoords) {
    if (!map || !driverCoords) return;
    
    // Remove old driver marker
    if (liveDriverMarker) {
        liveDriverMarker.setMap(null);
    }
    
    // Add new live driver marker with animation
    liveDriverMarker = new google.maps.Marker({
        position: { lat: driverCoords[1], lng: driverCoords[0] },
        map: map,
        title: 'Driver Live Location',
        icon: {
            url: 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="%23059669"><circle cx="12" cy="12" r="8" fill="%23ffffff" stroke="%23059669" stroke-width="3"/><circle cx="12" cy="12" r="3" fill="%23059669"/></svg>',
            scaledSize: new google.maps.Size(50, 50)
        },
        animation: google.maps.Animation.BOUNCE
    });
    
    // Stop bouncing after 1 second
    setTimeout(() => {
        if (liveDriverMarker) {
            liveDriverMarker.setAnimation(null);
        }
    }, 1000);
    
    console.log('📍 Driver marker updated:', driverCoords);
}

// Calculate and display ETA
function calculateETA(driverLocation, riderLocation) {
    if (!driverLocation || !riderLocation) return null;
    
    const distance = calculateDistance(driverLocation, riderLocation);
    const avgSpeed = 25; // km/h in city traffic
    const etaMinutes = Math.round((distance * 60) / avgSpeed);
    
    return {
        distance: distance.toFixed(1),
        eta: etaMinutes,
        etaText: etaMinutes < 60 ? `${etaMinutes} min` : `${Math.round(etaMinutes/60)}h ${etaMinutes%60}m`
    };
}

function calculateDistance(coord1, coord2) {
    const R = 6371; // Earth's radius in km
    const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
    const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function updateETADisplay(driverLocation) {
    if (!pickupCoordinates || !driverLocation) return;
    
    const eta = calculateETA(driverLocation, pickupCoordinates);
    if (eta && document.getElementById('eta-display')) {
        document.getElementById('eta-display').innerHTML = `
            <div style="background: #dbeafe; padding: 0.5rem; border-radius: 0.5rem; text-align: center; margin-top: 0.5rem;">
                🚗 Driver is ${eta.distance}km away • ETA: ${eta.etaText}
            </div>
        `;
    }
}

// Show route directions on map
function showRouteDirections(start, end) {
    if (!map) return;
    
    const directionsService = new google.maps.DirectionsService();
    
    if (!directionsRenderer) {
        directionsRenderer = new google.maps.DirectionsRenderer({
            suppressMarkers: false,
            polylineOptions: {
                strokeColor: '#2563eb',
                strokeWeight: 4,
                strokeOpacity: 0.8
            }
        });
        directionsRenderer.setMap(map);
    }
    
    const request = {
        origin: { lat: start[1], lng: start[0] },
        destination: { lat: end[1], lng: end[0] },
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: true
    };
    
    directionsService.route(request, (result, status) => {
        if (status === 'OK') {
            directionsRenderer.setDirections(result);
            const route = result.routes[0].legs[0];
            showStatus(`📍 Route: ${route.distance.text}, ${route.duration.text}`, 'info');
        }
    });
}

// Enhanced notifications with visual effects
function showEnhancedNotification(message, type, playSound = true) {
    showStatus(message, type);
    
    if (type === 'success') {
        // Flash screen green
        document.body.style.backgroundColor = '#dcfce7';
        setTimeout(() => {
            document.body.style.backgroundColor = '';
        }, 300);
        
        // Simple success sound
        if (playSound && window.AudioContext) {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
            } catch (e) {
                console.log('Audio not available');
            }
        }
    }
}