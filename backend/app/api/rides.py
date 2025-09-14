from flask import Blueprint, request, jsonify
from ..models.ride_model import Ride, RideRequest
from ..models.user_model import User
from ..utils.jwt_utils import token_required, role_required
from ..utils.distance_utils import calculate_haversine_distance, calculate_smart_score
from .. import mongo
from bson.objectid import ObjectId
import random
import string

rides_bp = Blueprint('rides_bp', __name__)

@rides_bp.route('/go-live', methods=['POST'])
@token_required
@role_required('driver')
def go_live():
    """Driver endpoint to go live and start accepting rides"""
    data = request.get_json()
    
    required_fields = ['pickup_location', 'destination_location', 
                      'pickup_address', 'destination_address']
    
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
    
    driver_id = request.current_user['user_id']
    
    # Check if driver is already live
    existing_ride = Ride.find_by_driver_id(driver_id)
    if existing_ride:
        return jsonify({"error": "You are already live. End current ride first."}), 409
    
    # Validate coordinates
    pickup_coords = data['pickup_location']
    dest_coords = data['destination_location']
    
    if not isinstance(pickup_coords, list) or len(pickup_coords) != 2:
        return jsonify({"error": "Invalid pickup location format"}), 400
    if not isinstance(dest_coords, list) or len(dest_coords) != 2:
        return jsonify({"error": "Invalid destination location format"}), 400
    
    # Create GeoJSON Point objects
    pickup_geojson = {
        "type": "Point",
        "coordinates": pickup_coords
    }
    
    dest_geojson = {
        "type": "Point", 
        "coordinates": dest_coords
    }
    
    # Create new ride
    new_ride = Ride(
        driver_id=driver_id,
        pickup_location=pickup_geojson,
        destination_location=dest_geojson,
        pickup_address=data['pickup_address'],
        destination_address=data['destination_address'],
        seats_available=data.get('seats_available', 1)
    )
    
    result = new_ride.save()
    
    return jsonify({
        "message": "You are now live!",
        "ride_id": str(result.inserted_id)
    }), 201

@rides_bp.route('/go-offline', methods=['POST'])
@token_required
@role_required('driver')
def go_offline():
    """Driver endpoint to go offline"""
    driver_id = request.current_user['user_id']
    
    ride = Ride.find_by_driver_id(driver_id)
    if not ride:
        return jsonify({"error": "You are not currently live"}), 400
    
    Ride.update_status(ride['_id'], 'completed')
    
    return jsonify({"message": "You are now offline"}), 200

@rides_bp.route('/nearby', methods=['POST'])
@token_required
@role_required('rider')
def find_nearby_rides():
    """Find nearby drivers for riders using geospatial search"""
    data = request.get_json()
    
    if 'current_location' not in data:
        return jsonify({"error": "Current location required"}), 400
    
    rider_coords = data['current_location']
    if not isinstance(rider_coords, list) or len(rider_coords) != 2:
        return jsonify({"error": "Invalid location format"}), 400
    
    # Create GeoJSON point for rider location
    rider_location = {
        "type": "Point",
        "coordinates": rider_coords
    }
    
    # Find nearby rides
    max_distance = data.get('max_distance_km', 10)
    nearby_rides = Ride.find_nearby_rides(rider_location, max_distance)
    
    # Calculate smart scores and prepare response
    rides_with_scores = []
    for ride in nearby_rides:
        driver_info = ride['driver_info']
        
        # Calculate smart score
        smart_score = calculate_smart_score(
            distance_meters=ride['distance'],
            driver_rating=driver_info.get('averageRating', 0)
        )
        
        # Calculate fare suggestion
        pickup_coords = ride['pickup_location']['coordinates']
        dest_coords = ride['destination_location']['coordinates']
        trip_distance = calculate_haversine_distance(pickup_coords, dest_coords)
        suggested_fare = max(20, int(trip_distance * 8))
        
        rides_with_scores.append({
            "ride_id": str(ride['_id']),
            "driver": {
                "name": driver_info['name'],
                "rating": driver_info.get('averageRating', 0),
                "phone": driver_info.get('phone_number', 'Not available')
            },
            "pickup_address": ride['pickup_address'],
            "destination_address": ride['destination_address'],
            "distance_km": round(ride['distance'] / 1000, 2),
            "smart_score": smart_score,
            "suggested_fare": suggested_fare,
            "seats_available": ride['seats_available']
        })
    
    # Sort by smart score
    rides_with_scores.sort(key=lambda x: x['smart_score'], reverse=True)
    
    return jsonify({
        "nearby_rides": rides_with_scores,
        "total_found": len(rides_with_scores)
    }), 200

@rides_bp.route('/request', methods=['POST'])
@token_required
@role_required('rider')
def request_ride():
    """Rider requests a specific ride"""
    data = request.get_json()
    
    required_fields = ['ride_id', 'pickup_location', 'destination_location',
                      'pickup_address', 'destination_address']
    
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
    
    rider_id = request.current_user['user_id']
    
    # Validate ride exists
    ride = mongo.db.rides.find_one({
        "_id": ObjectId(data['ride_id']),
        "status": "active"
    })
    
    if not ride:
        return jsonify({"error": "Ride not found or no longer available"}), 404
    
    # Check for existing requests
    existing_request = mongo.db.ride_requests.find_one({
        "rider_id": ObjectId(rider_id),
        "driver_id": ride['driver_id'],
        "status": "pending"
    })
    
    if existing_request:
        return jsonify({"error": "You already have a pending request with this driver"}), 409
    
    # Create GeoJSON points
    pickup_geojson = {
        "type": "Point",
        "coordinates": data['pickup_location']
    }
    
    dest_geojson = {
        "type": "Point",
        "coordinates": data['destination_location']
    }
    
    # Create ride request
    ride_request = RideRequest(
        rider_id=rider_id,
        driver_id=ride['driver_id'],
        pickup_location=pickup_geojson,
        destination_location=dest_geojson,
        pickup_address=data['pickup_address'],
        destination_address=data['destination_address']
    )
    
    result = ride_request.save()
    
    return jsonify({
        "message": "Ride requested successfully!",
        "request_id": str(result.inserted_id)
    }), 201

@rides_bp.route('/requests', methods=['GET'])
@token_required
@role_required('driver')
def get_ride_requests():
    """Get all pending ride requests for the driver"""
    driver_id = request.current_user['user_id']
    
    # Find requests with rider information
    pipeline = [
        {
            "$match": {
                "driver_id": ObjectId(driver_id),
                "status": "pending"
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "rider_id", 
                "foreignField": "_id",
                "as": "rider_info"
            }
        },
        {
            "$lookup": {
                "from": "user_profiles",
                "localField": "rider_id",
                "foreignField": "user_id", 
                "as": "rider_profile"
            }
        },
        {
            "$unwind": "$rider_info"
        }
    ]
    
    requests = list(mongo.db.ride_requests.aggregate(pipeline))
    
    formatted_requests = []
    for req in requests:
        rider_profile = req.get('rider_profile', [{}])[0] if req.get('rider_profile') else {}
        
        formatted_requests.append({
            "request_id": str(req['_id']),
            "rider": {
                "name": req['rider_info']['name'],
                "phone": rider_profile.get('phone_number', 'Not available'),
                "rating": req['rider_info'].get('averageRating', 0)
            },
            "pickup_address": req['pickup_address'],
            "destination_address": req['destination_address'],
            "requested_at": req['created_at'].strftime("%Y-%m-%d %H:%M")
        })
    
    return jsonify({
        "requests": formatted_requests,
        "total": len(formatted_requests)
    }), 200

@rides_bp.route('/requests/<request_id>/respond', methods=['POST'])
@token_required
@role_required('driver')
def respond_to_request(request_id):
    """Driver accepts or rejects a ride request"""
    data = request.get_json()
    
    if 'action' not in data or data['action'] not in ['accept', 'reject']:
        return jsonify({"error": "Invalid action. Use 'accept' or 'reject'"}), 400
    
    # Find the request
    ride_request = RideRequest.find_by_id(request_id)
    if not ride_request:
        return jsonify({"error": "Request not found"}), 404
    
    # Verify it's for this driver
    driver_id = request.current_user['user_id']
    if str(ride_request['driver_id']) != driver_id:
        return jsonify({"error": "Unauthorized"}), 403
    
    if data['action'] == 'accept':
        # Generate OTP
        otp = ''.join(random.choices(string.digits, k=4))
        RideRequest.update_status(request_id, 'accepted', otp)
        
        return jsonify({
            "message": "Ride request accepted!",
            "otp": otp,
            "note": "Share this OTP with the rider to start the trip"
        }), 200
    else:
        RideRequest.update_status(request_id, 'rejected')
        return jsonify({"message": "Ride request rejected"}), 200

@rides_bp.route('/fare-estimate', methods=['POST'])
@token_required
def estimate_fare():
    """Calculate fare estimate using Haversine formula"""
    data = request.get_json()
    
    required_fields = ['pickup_location', 'destination_location']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing pickup or destination location"}), 400
    
    pickup_coords = data['pickup_location']
    dest_coords = data['destination_location']
    
    # Calculate distance
    distance_km = calculate_haversine_distance(pickup_coords, dest_coords)
    
    # Fare calculation
    base_fare = 20
    per_km_rate = 8
    estimated_fare = max(base_fare, int(distance_km * per_km_rate))
    
    return jsonify({
        "distance_km": round(distance_km, 2),
        "estimated_fare": estimated_fare,
        "fare_breakdown": {
            "base_fare": base_fare,
            "per_km_rate": per_km_rate,
            "total_distance": round(distance_km, 2)
        }
    }), 200