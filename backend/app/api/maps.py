from flask import Blueprint, request, jsonify
import requests
from config import Config

maps_bp = Blueprint('maps_bp', __name__)

@maps_bp.route('/reverse-geocode', methods=['POST'])
def reverse_geocode_proxy():
    data = request.get_json()
    if not data or 'lat' not in data or 'lng' not in data:
        return jsonify({"error": "Missing coordinates"}), 400

    lat = data['lat']
    lng = data['lng']
    api_key = Config.GOOGLE_MAPS_API_KEY
    
    geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={api_key}"

    try:
        response = requests.get(geocode_url)
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to contact Geocoding service: {e}"}), 503

@maps_bp.route('/geocode', methods=['POST'])
def geocode_address():
    data = request.get_json()
    if not data or 'address' not in data:
        return jsonify({"error": "Missing address"}), 400

    address = data['address']
    api_key = Config.GOOGLE_MAPS_API_KEY
    
    if not api_key:
        return jsonify({"error": "Google Maps API key not configured"}), 500
    
    # URL encode the address
    import urllib.parse
    encoded_address = urllib.parse.quote_plus(address)
    geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json?address={encoded_address}&key={api_key}"

    try:
        response = requests.get(geocode_url, timeout=10)
        response.raise_for_status()
        geocode_data = response.json()
        
        # Log the response for debugging
        print(f"Geocoding response for '{address}': {geocode_data.get('status', 'UNKNOWN')}")
        
        return jsonify(geocode_data)
    except requests.exceptions.Timeout:
        return jsonify({"error": "Geocoding service timeout"}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to contact Geocoding service: {str(e)}"}), 503