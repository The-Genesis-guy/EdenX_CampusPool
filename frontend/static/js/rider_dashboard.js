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
let ridesRefreshPolling = null;
let rideStatusPolling = null;
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
    
    // Check for ongoing ride after map is initialized
    setTimeout(() => {
        checkForOngoingRide();
    }, 1000); // Small delay to ensure everything is loaded
};

// Initialize Google Places Autocomplete
function initializeAutocomplete() {
    const pickupInput = document.getElementById('pickup-input');
    const destinationInput = document.getElementById('destination-input');
    
    if (pickupInput && window.google && window.google.maps) {
        const pickupAutocomplete = new google.maps.places.Autocomplete(pickupInput);
        pickupAutocomplete.addListener('place_changed', () => {
            const place = pickupAutocomplete.getPlace();
            if (place.geometry && place.geometry.location) {
                pickupCoordinates = [place.geometry.location.lng(), place.geometry.location.lat()];
                console.log('Pickup coordinates set:', pickupCoordinates);
            }
        });
    }
    
    if (destinationInput && window.google && window.google.maps) {
        const destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput);
        destinationAutocomplete.addListener('place_changed', () => {
            const place = destinationAutocomplete.getPlace();
            if (place.geometry && place.geometry.location) {
                destinationCoordinates = [place.geometry.location.lng(), place.geometry.location.lat()];
                console.log('Destination coordinates set:', destinationCoordinates);
            }
        });
    }
}

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
});

// Initialize event listeners for Map-First design
function initializeEventListeners() {
    // Location buttons
    const currentLocationBtn = document.getElementById('current-location-btn');
    if (currentLocationBtn) {
        currentLocationBtn.addEventListener('click', getCurrentLocation);
    }
    
    const collegeLocationBtn = document.getElementById('college-location-btn');
    if (collegeLocationBtn) {
        collegeLocationBtn.addEventListener('click', setCollegeDestination);
    }
    
    // Search button
    const searchRidesBtn = document.getElementById('search-rides-btn');
    if (searchRidesBtn) {
        searchRidesBtn.addEventListener('click', () => {
        searchForRides();
    });
    }
    
    // Clear search button
    const clearSearchBtn = document.getElementById('clear-search-btn');
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            clearAllSearchData();
        });
    }
    
    // Campus quick buttons
    const quickButtons = document.querySelectorAll('.quick-btn');
    quickButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const destination = e.target.getAttribute('data-destination');
            if (destination) {
                // Determine which input is focused or should be filled
                const pickupInput = document.getElementById('pickup-input');
                const destinationInput = document.getElementById('destination-input');
                let targetInput, targetCoordinates;
                
                // Check if pickup input is focused or empty, otherwise use destination
                if (document.activeElement === pickupInput || !pickupInput.value.trim()) {
                    targetInput = pickupInput;
                    targetCoordinates = 'pickupCoordinates';
                } else {
                    targetInput = destinationInput;
                    targetCoordinates = 'destinationCoordinates';
                }
                
                targetInput.value = destination;
                
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
                            const coords = [position.coords.longitude, position.coords.latitude];
                            
                            if (targetInput === pickupInput) {
                                pickupCoordinates = coords;
                                console.log('Pickup coordinates set to current location:', pickupCoordinates);
                            } else {
                                destinationCoordinates = coords;
                                console.log('Destination coordinates set to current location:', destinationCoordinates);
                            }
                            
                            // Reverse geocode to get address
                            reverseGeocode(position.coords.latitude, position.coords.longitude, (address) => {
                                targetInput.value = address;
                            });
                        } else {
                            // Fallback to college coordinates if geolocation fails
                            const coords = COLLEGE_COORDS;
                            if (targetInput === pickupInput) {
                                pickupCoordinates = coords;
                                console.log('Pickup coordinates set to college (geolocation fallback):', pickupCoordinates);
                            } else {
                                destinationCoordinates = coords;
                                console.log('Destination coordinates set to college (geolocation fallback):', destinationCoordinates);
                            }
                            targetInput.value = COLLEGE_ADDRESS;
                        }
                    } catch (error) {
                        console.error('Failed to get current location for home:', error);
                        // Fallback to college coordinates
                        const coords = COLLEGE_COORDS;
                        if (targetInput === pickupInput) {
                            pickupCoordinates = coords;
                            console.log('Pickup coordinates set to college (fallback):', pickupCoordinates);
                        } else {
                            destinationCoordinates = coords;
                            console.log('Destination coordinates set to college (fallback):', destinationCoordinates);
                        }
                        targetInput.value = COLLEGE_ADDRESS;
                    }
                } else if (destination.includes('College')) {
                    const coords = COLLEGE_COORDS;
                    if (targetInput === pickupInput) {
                        pickupCoordinates = coords;
                        console.log('Pickup coordinates set to college:', pickupCoordinates);
                    } else {
                        destinationCoordinates = coords;
                        console.log('Destination coordinates set to college:', destinationCoordinates);
                    }
                    targetInput.value = COLLEGE_ADDRESS;
                }
                
                // Remove active class from all buttons
                quickButtons.forEach(b => b.classList.remove('active'));
                // Add active class to clicked button
                e.target.classList.add('active');
                
                showStatus(`${destination} location set successfully`, 'success');
                
                // Compress the search card when destination is set
                compressSearchCard();
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
    
    // Profile form
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileSubmit);
    }
    
    // Request modal buttons
    const confirmRequestBtn = document.getElementById('confirm-request-btn');
    if (confirmRequestBtn) {
        confirmRequestBtn.addEventListener('click', confirmRideRequest);
    }
    
    const cancelRequestBtn = document.getElementById('cancel-request-btn');
    if (cancelRequestBtn) {
        cancelRequestBtn.addEventListener('click', closeRequestModal);
    }
    
    // Active ride modal buttons
    const closeActiveRideModalBtn = document.getElementById('close-active-ride-modal');
    if (closeActiveRideModalBtn) {
        closeActiveRideModalBtn.addEventListener('click', closeActiveRideModal);
    }
    
    const cancelRideBtn = document.getElementById('cancel-ride-btn');
    if (cancelRideBtn) {
        cancelRideBtn.addEventListener('click', cancelActiveRide);
    }
    
    // View results button
    const viewResultsBtn = document.getElementById('view-results-btn');
    if (viewResultsBtn) {
        viewResultsBtn.addEventListener('click', () => {
            const resultsCard = document.getElementById('results-card');
            if (resultsCard && availableRides.length > 0) {
                resultsCard.classList.remove('hidden');
                resultsCard.classList.add('show');
            } else if (resultsCard) {
                // If no rides available, show the empty state
                resultsCard.classList.remove('hidden');
                resultsCard.classList.add('show');
                showNoRides();
            }
        });
    }
}

// This function has been replaced by checkForOngoingRide()

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
            
            // Compress the search card when destination is selected
            compressSearchCard();
        }
    });
}

// Initialize map
function initializeMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    // Initialize the full-screen map
    map = new google.maps.Map(mapContainer, {
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
            const userMarker = new google.maps.Marker({
                position: userLocation,
                map: map,
                title: 'Your Location',
                icon: {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                        <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="15" cy="15" r="12" fill="#004E89" stroke="#fff" stroke-width="2"/>
                            <text x="15" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="bold">🎒</text>
                        </svg>
                    `),
                    scaledSize: new google.maps.Size(30, 30)
                }
            });
        });
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

    // Clear previous results before searching
    resetSearchResults();

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
            // Stop polling if no rides found
            stopRidesRefreshPolling();
        } else {
            showRidesFound();
            displayRides(availableRides);
            showStatus(`Found ${availableRides.length} available ride buddy(ies)`, 'success');
            // Start polling to refresh rides when drivers go offline
            startRidesRefreshPolling();
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
    const container = document.getElementById('ride-buddies-list');
    if (!container) return;
    
    container.innerHTML = '';

    rides.forEach(ride => {
        const card = createRideCard(ride);
        container.appendChild(card);
    });
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
    
    if (!modal || !detailsContainer) return;
    
    const pickupInput = document.getElementById('pickup-input');
    const destinationInput = document.getElementById('destination-input');
    
    detailsContainer.innerHTML = `
        <div style="text-align: center; margin-bottom: 1.5rem;">
            <h4 style="margin-bottom: 0.5rem;">${ride.driver.name}</h4>
            <div class="driver-rating">
                ⭐ ${ride.driver.rating.toFixed(1)} • Match Score: ${ride.smart_score}/100
            </div>
        </div>
        <div style="background: var(--background-color); padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem;">
            <div style="display: grid; gap: 0.75rem;">
                <p><strong>📍 Your Pickup:</strong> ${pickupInput?.value || 'Not set'}</p>
                <p><strong>🎯 Your Destination:</strong> ${destinationInput?.value || 'Not set'}</p>
                <p><strong>📏 Distance to Driver:</strong> ${ride.distance_km} km away</p>
                <p><strong>💰 Split Cost:</strong> <span style="color: var(--primary-color); font-weight: bold;">₹${ride.suggested_fare}</span></p>
                <p><strong>🚗 Driver's Route:</strong> ${ride.pickup_address} → ${ride.destination_address}</p>
            </div>
        </div>
        <div style="background: #fef3c7; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
            <p style="font-size: 0.875rem; color: #92400e; margin: 0; text-align: center;">
                <strong>💡 Cost-sharing made simple!</strong><br>
                This cost covers petrol and vehicle expenses for both of you.
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
        stopRidesRefreshPolling(); // Stop rides refresh polling when request is made
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
    
    if (!modal || !detailsContainer) return;
    
    detailsContainer.innerHTML = `
        <div style="text-align: center; margin-bottom: 1.5rem;">
            <div class="loading">
                <div class="spinner"></div>
            </div>
            <h4 style="margin: 1rem 0 0.5rem 0;">Request Sent!</h4>
            <p style="color: var(--text-secondary);">Waiting for driver response...</p>
        </div>
        <div style="background: var(--background-color); padding: 1.5rem; border-radius: 0.75rem;">
            <p><strong>Split Cost:</strong> ₹${requestData.estimated_fare}</p>
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
        // This function is deprecated - use checkRideStatus instead
        
    } catch (error) {
        console.error('Failed to check status:', error);
        // Don't show error to avoid spam during polling
    }
}

// Update ride status based on response
function updateRideStatus(statusData) {
    const modal = document.getElementById('active-ride-modal');
    const detailsContainer = document.getElementById('active-ride-details');
    
    if (!modal || !detailsContainer) return;
    
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
            // Restart rides refresh polling
            startRidesRefreshPolling();
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
            // Restart rides refresh polling
            startRidesRefreshPolling();
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
            // Restart rides refresh polling
            startRidesRefreshPolling();
            break;
    }
}

// Show active ride modal
function showActiveRideModal(rideInfo) {
    const modal = document.getElementById('active-ride-modal');
    if (modal) {
        // This function is deprecated - use showActiveRide instead
    modal.classList.remove('hidden');
    }
}

// Close active ride modal
function closeActiveRideModal() {
    const modal = document.getElementById('active-ride-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
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
        
        // Restart rides refresh polling
        startRidesRefreshPolling();
        
    } catch (error) {
        console.error('Failed to cancel ride:', error);
        showStatus('Failed to cancel ride. Please try again.', 'error');
    }
}

// Close request modal
function closeRequestModal() {
    const modal = document.getElementById('request-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    selectedRideId = null;
}

// View switching removed - Map-First design only uses full-screen map

// Show/hide UI states
function showRidesFound() {
    const resultsCard = document.getElementById('results-card');
    const noRidesEl = document.getElementById('no-ride-buddies');
    
    if (resultsCard) {
        resultsCard.classList.remove('hidden');
        resultsCard.classList.add('show');
    }
    
    if (noRidesEl) {
        noRidesEl.classList.add('hidden');
    }
}

function showNoRides() {
    const resultsCard = document.getElementById('results-card');
    const noRidesEl = document.getElementById('no-ride-buddies');
    
    if (resultsCard) {
        resultsCard.classList.remove('hidden');
        resultsCard.classList.add('show');
    }
    
    if (noRidesEl) {
        noRidesEl.classList.remove('hidden');
    }
    
    // Clear the ride buddies list
    const rideBuddiesList = document.getElementById('ride-buddies-list');
    if (rideBuddiesList) {
        rideBuddiesList.innerHTML = '';
    }
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) {
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
        }
    }
}

// Status messages
function showStatus(message, type) {
    const statusEl = document.getElementById('status-message');
    if (statusEl) {
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
}

function hideStatus() {
    const statusEl = document.getElementById('status-message');
    if (statusEl) {
        statusEl.classList.add('hidden');
    }
}

// Profile management
async function loadUserProfile() {
    try {
        const profile = await apiCall('/auth/profile');
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) {
            userNameEl.textContent = `Welcome, ${profile.user.name}!`;
        }
    } catch (error) {
        console.error('Failed to load profile:', error);
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) {
            userNameEl.textContent = 'Welcome!';
        }
    }
}

async function checkProfileCompletion() {
    try {
        const response = await apiCall('/profiles/check');
        
        if (!response.profile_complete) {
            const profileModal = document.getElementById('profile-modal');
            if (profileModal) {
                profileModal.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error('Failed to check profile:', error);
    }
}

async function handleProfileSubmit(e) {
    e.preventDefault();
    
    const profileData = {
        phone_number: document.getElementById('phone')?.value,
        emergency_contact: document.getElementById('emergency-contact')?.value,
        college_id: document.getElementById('college-id')?.value
    };

    // Remove empty fields
    Object.keys(profileData).forEach(key => {
        if (!profileData[key]) {
            delete profileData[key];
        }
    });

    try {
        await apiCall('/profiles/complete', 'POST', profileData);
        const profileModal = document.getElementById('profile-modal');
        if (profileModal) {
            profileModal.classList.add('hidden');
        }
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
    stopRidesRefreshPolling();
});

// Logout function
window.handleLogout = async function() {
    // Check if user has active ride requests
    if (activeRequestId) {
        const warningMessage = 'You have an active ride request in progress. Logging out will cancel your ride request. Are you sure you want to continue?';
        
        if (!confirm(warningMessage)) {
            return; // User cancelled logout
        }
    }
    
    try {
        // Cancel any active ride requests
        if (activeRequestId) {
            try {
                await apiCall(`/rides/cancel-request/${activeRequestId}`, 'POST');
            } catch (error) {
                console.error('Failed to cancel active ride request:', error);
            }
        }
        
        // Stop all polling and tracking
        stopStatusPolling();
        stopDriverTracking();
        stopRidesRefreshPolling();
        
        await apiCall('/auth/logout', 'POST');
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        clearAuthToken();
        window.location.href = '/';
    }
};

// Card compression functions
function compressSearchCard() {
    const searchCard = document.querySelector('.floating-search-card');
    if (searchCard) {
        searchCard.classList.add('compressed');
        
        // Add click listener to expand when clicked
        searchCard.addEventListener('click', expandSearchCard, { once: true });
    }
}

function expandSearchCard() {
    const searchCard = document.querySelector('.floating-search-card');
    if (searchCard) {
        searchCard.classList.remove('compressed');
    }
}

// Rides refresh polling functions
function startRidesRefreshPolling() {
    // Only start polling if we have both pickup and destination coordinates and no active request
    if (pickupCoordinates && destinationCoordinates && !ridesRefreshPolling && !activeRequestId) {
        console.log('Starting rides refresh polling...');
        ridesRefreshPolling = setInterval(async () => {
            try {
                // Only refresh if we don't have an active request
                if (!activeRequestId) {
                    // Refresh available rides silently (without showing loading)
                    console.log('Refreshing available rides...');
                    const response = await apiCall('/rides/nearby', 'POST', {
                        current_location: pickupCoordinates,
                        destination_location: destinationCoordinates,
                        max_distance_km: 15
                    });

                    const newRides = response.nearby_rides || [];
                    console.log('Found rides:', newRides.length, 'Previous:', availableRides.length);
                    
                    // Only update if the number of rides has changed
                    if (newRides.length !== availableRides.length) {
                        console.log('Ride count changed, updating UI');
                        availableRides = newRides;
                        
                        if (availableRides.length === 0) {
                            showNoRides();
                        } else {
                            showRidesFound();
                            displayRides(availableRides);
                        }
                    }
                }
            } catch (error) {
                console.error('Error refreshing rides:', error);
            }
        }, 5000); // Refresh every 5 seconds for testing
    }
}

function stopRidesRefreshPolling() {
    if (ridesRefreshPolling) {
        console.log('Stopping rides refresh polling...');
        clearInterval(ridesRefreshPolling);
        ridesRefreshPolling = null;
    }
}

// Active ride functions for rider
async function showActiveRide(rideInfo) {
    const activeRideCard = document.getElementById('active-ride-card');
    if (!activeRideCard) return;
    
    // Hide other cards
    const resultsCard = document.getElementById('results-card');
    if (resultsCard) {
        resultsCard.classList.add('hidden');
    }
    
    // Check if we already have the active ride card visible to avoid unnecessary API calls
    if (activeRideCard.classList.contains('show')) {
        console.log('Active ride card already visible, skipping API call to prevent spam');
        return;
    }
    
    // Check if we're already processing this request to prevent duplicate calls
    if (window.isProcessingActiveRide) {
        console.log('Already processing active ride, skipping duplicate call');
        return;
    }
    window.isProcessingActiveRide = true;
    
    // Fetch real driver data from backend
    try {
        const response = await apiCall('/rides/request-status/' + activeRequestId, 'GET');
        console.log('Fetching real driver data:', response);
        console.log('Active request ID:', activeRequestId);
        
        if (response && response.driver) {
            // Use real data from backend
            const realDriverName = response.driver.name || 'Driver';
            const realDriverPhone = (response.driver.phone && response.driver.phone !== 'Hidden until ride accepted') 
                ? response.driver.phone 
                : 'Not available yet';
            const realOtp = response.otp || 'Waiting...';
            const realMessage = response.message || 'Driver accepted your request!';
            
            // Update header with real driver name
            const headerTitle = activeRideCard.querySelector('.active-ride-header h3');
            if (headerTitle) {
                console.log('Updating header title with real driver name:', realDriverName);
                headerTitle.textContent = `🚗 Ride with ${realDriverName}`;
            } else {
                console.error('Header title element not found!');
            }
            
            // Update ride status
            const rideStatus = activeRideCard.querySelector('.ride-status');
            if (rideStatus) {
                switch (response.status) {
                    case 'accepted':
                        rideStatus.textContent = 'Driver Accepted';
                        break;
                    case 'started':
                        rideStatus.textContent = 'In Transit';
                        break;
                    default:
                        rideStatus.textContent = 'With Driver';
                }
            }
            
            // Populate ride buddies with real contact information
            const buddiesList = document.getElementById('active-ride-buddies');
            if (buddiesList) {
                console.log('Updating ride buddies list with real data');
                buddiesList.innerHTML = `
                    <div class="ride-buddy-item">
                        <div class="buddy-info">
                            <span class="buddy-role">🎒</span>
                            <span class="buddy-name">You (Rider)</span>
                        </div>
                    </div>
                    <div class="ride-buddy-item">
                        <div class="buddy-info">
                            <span class="buddy-role">🏍️</span>
                            <span class="buddy-name">${realDriverName}</span>
                        </div>
                        <div class="buddy-contact">
                            <span class="contact-label">📞 Phone:</span>
                            <span class="contact-info">${realDriverPhone}</span>
                        </div>
                    </div>
                `;
            }
            
            // Show status-specific chat messages
            const chatMessages = document.getElementById('active-ride-chat');
            if (chatMessages) {
                let messages = [];
                
                if (realMessage) {
                    messages.push({
                        sender: 'System:',
                        message: realMessage
                    });
                }
                
                switch (response.status) {
                    case 'pending':
                        messages.push({
                            sender: 'System:',
                            message: 'Waiting for driver to respond to your request...'
                        });
                        break;
                    case 'accepted':
                        messages.push({
                            sender: 'System:',
                            message: 'Driver accepted! Share your OTP with the driver to start the trip.'
                        });
                        break;
                    case 'started':
                        messages.push({
                            sender: 'System:',
                            message: 'Ride started! You can call the driver using the contact details above.'
                        });
                        break;
                }
                
                chatMessages.innerHTML = messages.map(msg => `
                    <div class="chat-message">
                        <span class="sender">${msg.sender}</span>
                        <span class="message">${msg.message}</span>
                    </div>
                `).join('');
            }
            
            // Update OTP and ETA with real data
            const otpElement = document.getElementById('rider-otp-display');
            if (otpElement) {
                console.log('Updating rider OTP with real data:', realOtp);
                otpElement.textContent = realOtp;
            } else {
                console.error('OTP element not found!');
            }
            
            const etaElement = document.getElementById('rider-eta-display');
            if (etaElement) {
                etaElement.textContent = 'Calculating...';
            }
            
            // Add event listeners for action buttons with real data
            const callBtn = activeRideCard.querySelector('#call-driver-btn');
            if (callBtn) {
                // Remove existing listeners
                callBtn.replaceWith(callBtn.cloneNode(true));
                const newCallBtn = activeRideCard.querySelector('#call-driver-btn');
                
                if (realDriverPhone && realDriverPhone !== 'Not provided' && realDriverPhone !== 'Not available yet') {
                    newCallBtn.textContent = `📞 Call ${realDriverName}`;
                    newCallBtn.addEventListener('click', () => {
                        window.open(`tel:${realDriverPhone}`, '_self');
                    });
                } else {
                    newCallBtn.disabled = true;
                    newCallBtn.textContent = '📞 Phone Not Available';
                }
            }
            
            // Add event listener for share location button
            const shareBtn = activeRideCard.querySelector('#share-location-btn');
            if (shareBtn) {
                // Remove existing listeners
                shareBtn.replaceWith(shareBtn.cloneNode(true));
                const newShareBtn = activeRideCard.querySelector('#share-location-btn');
                
                newShareBtn.addEventListener('click', () => {
                    shareRiderLocation();
                });
            }
        } else {
            console.error('No driver data found in response:', response);
            showStatus('Failed to load driver information', 'error');
        }
    } catch (error) {
        console.error('Failed to fetch real driver data:', error);
        showStatus('Failed to load driver details', 'error');
    } finally {
        // Clear the processing flag
        window.isProcessingActiveRide = false;
    }
    
    // Show active ride card
    console.log('Showing active ride card');
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

// Display available rides
function displayRides(rides) {
    const ridesList = document.getElementById('ride-buddies-list');
    if (!ridesList) return;
    
    ridesList.innerHTML = '';
    
    rides.forEach(ride => {
        const rideCard = createRideCard(ride);
        ridesList.appendChild(rideCard);
    });
}

// Create a ride card element
function createRideCard(ride) {
    const card = document.createElement('div');
    card.className = 'ride-buddy-card';
    
    // Handle different data structures from API
    const driverName = ride.driver?.name || ride.driver_name || 'Driver';
    const rating = ride.driver?.rating || ride.rating || 4.5;
    const distance = ride.distance_km ? `${ride.distance_km} km` : (ride.distance || '2 min');
    const message = ride.driver_message || ride.message || 'Ready to help you reach your destination!';
    const cost = ride.suggested_fare || ride.cost || '20';
    const rideId = ride._id || ride.ride_id || ride.id;
    
    card.innerHTML = `
        <div class="buddy-header">
            <div class="buddy-avatar">🏍️</div>
            <div class="buddy-details">
                <div class="buddy-name">${driverName}</div>
                <div class="buddy-meta">
                    <span class="buddy-rating">⭐ ${rating.toFixed ? rating.toFixed(1) : rating}</span>
                    <span class="buddy-distance">${distance} away</span>
                </div>
            </div>
        </div>
        
        <div class="buddy-message">
            ${message}
        </div>
        
        <div class="buddy-route">
            <span class="route-info">📍 ${ride.pickup_address} → ${ride.destination_address}</span>
        </div>
        
        <div class="buddy-cost">
            <span class="cost-info">💰 Split cost: ₹${cost} each</span>
        </div>
        
        <div class="buddy-actions">
            <button class="btn btn-outline chat-btn" data-ride-id="${rideId}">💬 Chat First</button>
            <button class="btn btn-primary join-btn" data-ride-id="${rideId}">🤝 Join Ride</button>
        </div>
    `;
    
    // Add event listeners
    const joinBtn = card.querySelector('.join-btn');
    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            console.log('Join Ride clicked for ride:', rideId);
            // Check if this is a test ride (fake ID)
            if (rideId && rideId.toString().startsWith('test_ride_')) {
                // Use the test endpoint for fake rides
                testBackendRideRequest();
            } else {
                // Use normal flow for real rides
                submitRideRequest(rideId);
            }
        });
    }
    
    const chatBtn = card.querySelector('.chat-btn');
    if (chatBtn) {
        chatBtn.addEventListener('click', () => {
            showStatus('Chat functionality coming soon!', 'info');
        });
    }
    
    return card;
}

// Handle ride request submission
async function submitRideRequest(rideId) {
    try {
        showStatus('Sending ride request...', 'info');
        
        // Get pickup and destination inputs
        const pickupInput = document.getElementById('pickup-input');
        const destinationInput = document.getElementById('destination-input');
        
        // Validate required fields
        if (!pickupCoordinates || !destinationCoordinates) {
            showStatus('Please select both pickup and destination locations.', 'error');
            return;
        }
        
        if (!pickupInput || !pickupInput.value.trim()) {
            showStatus('Please enter pickup location.', 'error');
            return;
        }
        
        if (!destinationInput || !destinationInput.value.trim()) {
            showStatus('Please enter destination location.', 'error');
            return;
        }
        
        const requestData = {
            ride_id: rideId,
            pickup_location: pickupCoordinates,
            destination_location: destinationCoordinates,
            pickup_address: pickupInput.value,
            destination_address: destinationInput.value
        };
        
        console.log('Sending ride request with data:', requestData);
        console.log('Pickup coordinates:', pickupCoordinates);
        console.log('Destination coordinates:', destinationCoordinates);
        console.log('Pickup address:', pickupInput.value);
        console.log('Destination address:', destinationInput.value);
        
        const response = await apiCall('/rides/request', 'POST', requestData);

        console.log('Ride request response:', response);

        // Set active request ID and start polling for ride status
        activeRequestId = response.request_id;
        stopRidesRefreshPolling(); // Stop rides refresh polling when request is made
        
        // Start polling for ride status updates
        startRideStatusPolling();
        
        // Show simple "request sent" message - no demo data
        showStatus('Ride request sent successfully! Waiting for driver response...', 'success');
        
    } catch (error) {
        console.error('Failed to send ride request:', error);
        showStatus('Failed to send ride request. Please try again.', 'error');
    }
}

// Test function removed - use real data only

// Test function removed - use real data only

// Test function using the backend test endpoint
// Test function removed - use real data only

// Test functions removed - use real data only

// Test function removed - use real data only

// Test function removed - use real data only

// Test function removed - use real data only

// Start polling for ride status updates
function startRideStatusPolling() {
    if (rideStatusPolling) {
        clearInterval(rideStatusPolling);
    }
    
    rideStatusPolling = setInterval(async () => {
        if (activeRequestId) {
            await checkRideStatus();
        }
    }, 10000); // Check every 10 seconds to reduce API calls
}

// Stop ride status polling
function stopRideStatusPolling() {
    if (rideStatusPolling) {
        clearInterval(rideStatusPolling);
        rideStatusPolling = null;
    }
}

// Check ride status from backend
async function checkRideStatus() {
    try {
        const response = await apiCall(`/rides/request-status/${activeRequestId}`, 'GET');
        console.log('Ride status response:', response);
        
        // Check if status has changed to avoid unnecessary updates
        if (window.lastRideStatus === response.status) {
            console.log('Status unchanged, skipping UI update');
            return;
        }
        window.lastRideStatus = response.status;
        
        // Also check if we're already processing to prevent duplicate calls
        if (window.isProcessingRideStatus) {
            console.log('Already processing ride status, skipping duplicate call');
            return;
        }
        window.isProcessingRideStatus = true;
        
        // Handle different statuses
        switch (response.status) {
            case 'pending':
                // Just show status message, no active ride interface yet
                showStatus('⏳ Waiting for driver response...', 'info');
                break;
                
            case 'accepted':
                // Now show the active ride interface with real driver data
                await showActiveRide({
                    status: response.status,
                    otp: response.otp,
                    driver_name: response.driver?.name || 'Driver',
                    driver_phone: (response.driver?.phone && response.driver.phone !== 'Hidden until ride accepted') 
                        ? response.driver.phone 
                        : 'Not available yet',
                    estimated_duration: 'Calculating...',
                    message: response.message,
                    pickup_address: response.pickup_address,
                    destination_address: response.destination_address,
                    estimated_fare: response.estimated_fare
                });
                showStatus('🎉 Driver accepted your request! Share your OTP with the driver.', 'success');
                break;
                
            case 'started':
                // Update active ride interface with real data
                await showActiveRide({
                    status: response.status,
                    otp: response.otp,
                    driver_name: response.driver?.name || 'Driver',
                    driver_phone: (response.driver?.phone && response.driver.phone !== 'Hidden until ride accepted') 
                        ? response.driver.phone 
                        : 'Not available yet',
                    estimated_duration: 'Calculating...',
                    message: response.message,
                    pickup_address: response.pickup_address,
                    destination_address: response.destination_address,
                    estimated_fare: response.estimated_fare
                });
                showStatus('🚀 Your ride has started! Have a safe journey.', 'success');
                startDriverLocationTracking(); // Start tracking driver location
                break;
                
            case 'rejected':
                showStatus('😔 Your ride request was declined. Please try another driver.', 'warning');
                hideActiveRide();
                stopRideStatusPolling();
                enableSearchInterface(); // Re-enable search functionality
                startRidesRefreshPolling(); // Start looking for other rides
                break;
                
            case 'completed':
                showStatus('✅ Ride completed successfully! Thank you for using CampusPool.', 'success');
                hideActiveRide();
                stopRideStatusPolling();
                stopDriverLocationTracking();
                enableSearchInterface(); // Re-enable search functionality
                startRidesRefreshPolling(); // Start looking for other rides
                break;
                
            case 'cancelled':
                showStatus('ℹ️ Your ride request was cancelled.', 'info');
                hideActiveRide();
                stopRideStatusPolling();
                enableSearchInterface(); // Re-enable search functionality
                startRidesRefreshPolling();
                break;
        }
        
    } catch (error) {
        console.error('Failed to check ride status:', error);
    } finally {
        // Clear the processing flag
        window.isProcessingRideStatus = false;
    }
}

// Start tracking driver location during active ride
function startDriverLocationTracking() {
    if (driverTrackingInterval) {
        clearInterval(driverTrackingInterval);
    }
    
    driverTrackingInterval = setInterval(async () => {
        if (activeRequestId) {
            await updateDriverLocation();
        }
    }, 5000); // Update every 5 seconds
}

// Stop tracking driver location
function stopDriverLocationTracking() {
    if (driverTrackingInterval) {
        clearInterval(driverTrackingInterval);
        driverTrackingInterval = null;
    }
}

// Update driver location on map
async function updateDriverLocation() {
    try {
        const response = await apiCall(`/rides/driver-location/${activeRequestId}`, 'GET');
        
        if (response.driver_location) {
            // Update driver marker on map
            const driverCoords = response.driver_location;
            if (liveDriverMarker) {
                liveDriverMarker.setMap(null);
            }
            
            liveDriverMarker = new google.maps.Marker({
                position: { lat: driverCoords[1], lng: driverCoords[0] },
                map: map,
                title: 'Your Driver',
                icon: {
                    url: 'data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%23FF6B35"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
                    scaledSize: new google.maps.Size(40, 40)
                }
            });
            
            // Center map on driver location
            map.setCenter({ lat: driverCoords[1], lng: driverCoords[0] });
        }
        
    } catch (error) {
        console.error('Failed to update driver location:', error);
    }
}

// Share rider location with driver
async function shareRiderLocation() {
    try {
        if (!navigator.geolocation) {
            showStatus('Geolocation is not supported by this browser.', 'error');
            return;
        }
        
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000
            });
        });
        
        const coords = [position.coords.longitude, position.coords.latitude];
        
        // Call backend to share location (we'll need to add this endpoint)
        const response = await apiCall('/rides/share-rider-location', 'POST', {
            request_id: activeRequestId,
            current_location: coords
        });
        
        showStatus('📍 Location shared with driver!', 'success');
        
    } catch (error) {
        console.error('Failed to share location:', error);
        showStatus('Failed to share location. Please try again.', 'error');
    }
}

// Test functions removed - use real data only

// Check for ongoing ride when dashboard loads
async function checkForOngoingRide() {
    try {
        console.log('Checking for ongoing ride...');
        
        const response = await apiCall('/rides/active-ride', 'GET');
        console.log('Active ride check response:', response);
        
        if (response.has_active_ride && response.ride_info) {
            const rideInfo = response.ride_info;
            console.log('Found ongoing ride:', rideInfo);
            
            // Set the active request ID
            activeRequestId = rideInfo.request_id;
            
            // Only show active ride interface for accepted/started rides
            if (rideInfo.status === 'accepted' || rideInfo.status === 'started') {
                await showActiveRide({
                    status: rideInfo.status,
                    otp: rideInfo.otp,
                    driver_name: rideInfo.driver?.name || 'Driver',
                    driver_phone: (rideInfo.driver?.phone && rideInfo.driver.phone !== 'Hidden until ride accepted') 
                        ? rideInfo.driver.phone 
                        : 'Not available yet',
                    estimated_duration: 'Calculating...',
                    message: getStatusMessage(rideInfo.status),
                    pickup_address: rideInfo.pickup_address,
                    destination_address: rideInfo.destination_address,
                    estimated_fare: rideInfo.estimated_fare
                });
            }
            
            // Start appropriate polling based on status
            if (rideInfo.status === 'pending' || rideInfo.status === 'accepted') {
                startRideStatusPolling();
            } else if (rideInfo.status === 'started') {
                startDriverLocationTracking();
            }
            
            // Show appropriate status message
            if (rideInfo.status === 'pending') {
                showStatus('⏳ You have a pending ride request. Waiting for driver response...', 'info');
            } else {
                showStatus(`Found ongoing ride: ${getStatusMessage(rideInfo.status)}`, 'info');
            }
            
            // Disable search functionality when there's an ongoing ride
            disableSearchInterface();
            
        } else {
            console.log('No ongoing ride found');
            // Enable search functionality when no ongoing ride
            enableSearchInterface();
        }
        
    } catch (error) {
        console.error('Failed to check for ongoing ride:', error);
    }
}

// Get status message for display
function getStatusMessage(status) {
    switch (status) {
        case 'pending':
            return 'Waiting for driver response...';
        case 'accepted':
            return 'Driver accepted your request!';
        case 'started':
            return 'Ride in progress...';
        case 'completed':
            return 'Ride completed successfully!';
        case 'rejected':
            return 'Ride request was declined';
        case 'cancelled':
            return 'Ride was cancelled';
        default:
            return 'Ride status unknown';
    }
}

// Disable search interface when there's an ongoing ride
function disableSearchInterface() {
    const searchCard = document.querySelector('.floating-search-card');
    const searchBtn = document.getElementById('search-rides-btn');
    const pickupInput = document.getElementById('pickup-input');
    const destinationInput = document.getElementById('destination-input');
    
    if (searchCard) {
        searchCard.style.opacity = '0.6';
        searchCard.style.pointerEvents = 'none';
    }
    
    if (searchBtn) {
        searchBtn.disabled = true;
        searchBtn.textContent = '🚫 Ongoing Ride Active';
    }
    
    if (pickupInput) {
        pickupInput.disabled = true;
        pickupInput.placeholder = 'Search disabled - ongoing ride active';
    }
    
    if (destinationInput) {
        destinationInput.disabled = true;
        destinationInput.placeholder = 'Search disabled - ongoing ride active';
    }
}

// Enable search interface when no ongoing ride
function enableSearchInterface() {
    const searchCard = document.querySelector('.floating-search-card');
    const searchBtn = document.getElementById('search-rides-btn');
    const pickupInput = document.getElementById('pickup-input');
    const destinationInput = document.getElementById('destination-input');
    
    if (searchCard) {
        searchCard.style.opacity = '1';
        searchCard.style.pointerEvents = 'auto';
    }
    
    if (searchBtn) {
        searchBtn.disabled = false;
        searchBtn.textContent = '🔍 Find Ride Buddies';
    }
    
    if (pickupInput) {
        pickupInput.disabled = false;
        pickupInput.placeholder = '📍 From: Choose pickup location...';
    }
    
    if (destinationInput) {
        destinationInput.disabled = false;
        destinationInput.placeholder = '🎯 To: Choose destination...';
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopRideStatusPolling();
    stopDriverLocationTracking();
    stopRidesRefreshPolling();
});

// This function has been replaced by checkRideStatus()


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


// Pre-booking functions removed - not needed for basic campus ride sharing

// Reset search results (but keep user input)
function resetSearchResults() {
    // Hide results card if it's showing
    const resultsCard = document.getElementById('results-card');
    if (resultsCard) {
        resultsCard.classList.add('hidden');
        resultsCard.classList.remove('show');
    }
    
    // Clear map markers (but keep coordinates for new search)
    if (currentMarkers) {
        currentMarkers.forEach(marker => marker.setMap(null));
        currentMarkers = [];
    }
    
    // Clear available rides
    availableRides = [];
    
    hideStatus();
}

// Clear all search data (for when user wants to start fresh)
function clearAllSearchData() {
    // Hide results card if it's showing
    const resultsCard = document.getElementById('results-card');
    if (resultsCard) {
        resultsCard.classList.add('hidden');
        resultsCard.classList.remove('show');
    }
    
    // Reset search form
    const pickupInput = document.getElementById('pickup-input');
    const destinationInput = document.getElementById('destination-input');
    if (pickupInput) pickupInput.value = '';
    if (destinationInput) destinationInput.value = '';
    
    // Clear coordinates
    pickupCoordinates = null;
    destinationCoordinates = null;
    
    // Stop rides refresh polling
    stopRidesRefreshPolling();
    
    // Clear map markers
    if (currentMarkers) {
        currentMarkers.forEach(marker => marker.setMap(null));
        currentMarkers = [];
    }
    
    // Clear available rides
    availableRides = [];
    
    hideStatus();
}