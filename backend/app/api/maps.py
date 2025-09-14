# Add this to your existing backend/app/api/ directory as maps.py

from flask import Blueprint, request, jsonify
from ..utils.jwt_utils import token_required
import requests
import os

maps_bp = Blueprint('maps_bp', __name__)

@maps_bp.route('/reverse-geocode', methods=['POST'])
@token_required
def reverse_geocode():
    """Convert coordinates to human-readable address"""
    data = request.get_json()
    
    if 'lat' not in data or 'lng' not in data:
        return jsonify({"error": "Latitude and longitude required"}), 400
    
    lat = data['lat']
    lng = data['lng']
    
    # Get Google Maps API key from environment
    api_key = os.getenv('GOOGLE_MAPS_API_KEY')
    if not api_key:
        return jsonify({"error": "Maps API key not configured"}), 500
    
    try:
        # Call Google Maps Geocoding API
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {
            'latlng': f"{lat},{lng}",
            'key': api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            return jsonify(response.json()), 200
        else:
            return jsonify({"error": "Geocoding service unavailable"}), 503
            
    except requests.RequestException as e:
        return jsonify({"error": "Failed to connect to geocoding service"}), 503

@maps_bp.route('/autocomplete', methods=['POST'])
@token_required
def places_autocomplete():
    """Get place suggestions for autocomplete"""
    data = request.get_json()
    
    if 'input' not in data:
        return jsonify({"error": "Input query required"}), 400
    
    query = data['input']
    
    # Get Google Maps API key from environment
    api_key = os.getenv('GOOGLE_MAPS_API_KEY')
    if not api_key:
        return jsonify({"error": "Maps API key not configured"}), 500
    
    try:
        # Call Google Places Autocomplete API
        url = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
        params = {
            'input': query,
            'key': api_key,
            'components': 'country:in',  # Restrict to India
            'types': 'establishment|geocode'
        }
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            return jsonify(response.json()), 200
        else:
            return jsonify({"error": "Autocomplete service unavailable"}), 503
            
    except requests.RequestException as e:
        return jsonify({"error": "Failed to connect to autocomplete service"}), 503

@maps_bp.route('/place-details', methods=['POST'])
@token_required
def get_place_details():
    """Get detailed information about a place"""
    data = request.get_json()
    
    if 'place_id' not in data:
        return jsonify({"error": "Place ID required"}), 400
    
    place_id = data['place_id']
    
    # Get Google Maps API key from environment
    api_key = os.getenv('GOOGLE_MAPS_API_KEY')
    if not api_key:
        return jsonify({"error": "Maps API key not configured"}), 500
    
    try:
        # Call Google Places Details API
        url = "https://maps.googleapis.com/maps/api/place/details/json"
        params = {
            'place_id': place_id,
            'key': api_key,
            'fields': 'name,formatted_address,geometry,types,rating,user_ratings_total'
        }
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            return jsonify(response.json()), 200
        else:
            return jsonify({"error": "Place details service unavailable"}), 503
            
    except requests.RequestException as e:
        return jsonify({"error": "Failed to connect to place details service"}), 503

@maps_bp.route('/directions', methods=['POST'])
@token_required  
def get_directions():
    """Get driving directions between two points"""
    data = request.get_json()
    
    required_fields = ['origin', 'destination']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Origin and destination required"}), 400
    
    origin = data['origin']
    destination = data['destination']
    
    # Get Google Maps API key from environment
    api_key = os.getenv('GOOGLE_MAPS_API_KEY')
    if not api_key:
        return jsonify({"error": "Maps API key not configured"}), 500
    
    try:
        # Call Google Directions API
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            'origin': f"{origin['lat']},{origin['lng']}" if isinstance(origin, dict) else origin,
            'destination': f"{destination['lat']},{destination['lng']}" if isinstance(destination, dict) else destination,
            'key': api_key,
            'mode': 'driving',
            'alternatives': 'false',
            'optimize': 'true'
        }
        
        response = requests.get(url, params=params, timeout=15)
        
        if response.status_code == 200:
            directions_data = response.json()
            
            # Extract useful information
            if directions_data['status'] == 'OK' and directions_data['routes']:
                route = directions_data['routes'][0]
                leg = route['legs'][0]
                
                simplified_response = {
                    'status': 'OK',
                    'route': {
                        'distance': leg['distance']['text'],
                        'distance_value': leg['distance']['value'],  # in meters
                        'duration': leg['duration']['text'],
                        'duration_value': leg['duration']['value'],  # in seconds
                        'start_address': leg['start_address'],
                        'end_address': leg['end_address'],
                        'polyline': route['overview_polyline']['points']
                    }
                }
                
                return jsonify(simplified_response), 200
            else:
                return jsonify({
                    'status': 'NOT_FOUND',
                    'error': 'No route found between the specified points'
                }), 404
        else:
            return jsonify({"error": "Directions service unavailable"}), 503
            
    except requests.RequestException as e:
        return jsonify({"error": "Failed to connect to directions service"}), 503

@maps_bp.route('/distance-matrix', methods=['POST'])
@token_required
def get_distance_matrix():
    """Calculate distance and time between multiple origins and destinations"""
    data = request.get_json()
    
    required_fields = ['origins', 'destinations']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Origins and destinations required"}), 400
    
    origins = data['origins']
    destinations = data['destinations']
    
    # Get Google Maps API key from environment
    api_key = os.getenv('GOOGLE_MAPS_API_KEY')
    if not api_key:
        return jsonify({"error": "Maps API key not configured"}), 500
    
    try:
        # Format coordinates for API call
        origins_str = '|'.join([f"{o['lat']},{o['lng']}" if isinstance(o, dict) else str(o) for o in origins])
        destinations_str = '|'.join([f"{d['lat']},{d['lng']}" if isinstance(d, dict) else str(d) for d in destinations])
        
        # Call Google Distance Matrix API
        url = "https://maps.googleapis.com/maps/api/distancematrix/json"
        params = {
            'origins': origins_str,
            'destinations': destinations_str,
            'key': api_key,
            'mode': 'driving',
            'units': 'metric',
            'avoid': 'tolls'
        }
        
        response = requests.get(url, params=params, timeout=15)
        
        if response.status_code == 200:
            return jsonify(response.json()), 200
        else:
            return jsonify({"error": "Distance matrix service unavailable"}), 503
            
    except requests.RequestException as e:
        return jsonify({"error": "Failed to connect to distance matrix service"}), 503