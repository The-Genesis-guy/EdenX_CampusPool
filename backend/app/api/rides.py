from flask import Blueprint, request, jsonify
from app.models.ride_model import Ride, RideRequest
from app.models.user_model import User
from app.utils.jwt_utils import token_required, role_required
from app.utils.distance_utils import calculate_haversine_distance, calculate_smart_score, calculate_cost_sharing_fare
from app import mongo
from bson.objectid import ObjectId
import random
import string
import datetime

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
    
    # Update ride status
    Ride.update_status(ride['_id'], 'completed')
    
    # Update any pending requests to cancelled
    mongo.db.ride_requests.update_many(
        {"driver_id": ObjectId(driver_id), "status": "pending"},
        {"$set": {"status": "cancelled", "updated_at": datetime.datetime.utcnow()}}
    )
    
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
    max_distance = data.get('max_distance_km', 15)
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
        
        # Calculate cost-sharing fare (rider's pickup to destination)
        rider_pickup = rider_coords
        rider_destination = data.get('destination_location', rider_coords)
        
        if rider_destination != rider_coords:
            trip_distance = calculate_haversine_distance(rider_pickup, rider_destination)
            suggested_fare = calculate_cost_sharing_fare(trip_distance)
        else:
            # Fallback to driver's route distance
            pickup_coords = ride['pickup_location']['coordinates']
            dest_coords = ride['destination_location']['coordinates']
            trip_distance = calculate_haversine_distance(pickup_coords, dest_coords)
            suggested_fare = calculate_cost_sharing_fare(trip_distance)
        
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
    
    # Validate ride exists and is active
    ride = mongo.db.rides.find_one({
        "_id": ObjectId(data['ride_id']),
        "status": "active"
    })
    
    if not ride:
        return jsonify({"error": "Ride not found or no longer available"}), 404
    
    # Check for existing requests from this rider to any driver
    existing_request = mongo.db.ride_requests.find_one({
        "rider_id": ObjectId(rider_id),
        "status": {"$in": ["pending", "accepted"]}
    })
    
    if existing_request:
        return jsonify({"error": "You already have an active ride request"}), 409
    
    # Create GeoJSON points
    pickup_geojson = {
        "type": "Point",
        "coordinates": data['pickup_location']
    }
    
    dest_geojson = {
        "type": "Point",
        "coordinates": data['destination_location']
    }
    
    # Calculate fare for this specific request
    trip_distance = calculate_haversine_distance(data['pickup_location'], data['destination_location'])
    calculated_fare = calculate_cost_sharing_fare(trip_distance)
    
    # Create ride request
    ride_request = RideRequest(
        rider_id=rider_id,
        driver_id=ride['driver_id'],
        pickup_location=pickup_geojson,
        destination_location=dest_geojson,
        pickup_address=data['pickup_address'],
        destination_address=data['destination_address'],
        estimated_fare=calculated_fare
    )
    
    result = ride_request.save()
    
    return jsonify({
        "message": "Ride requested successfully!",
        "request_id": str(result.inserted_id),
        "estimated_fare": calculated_fare
    }), 201

@rides_bp.route('/request-status/<request_id>', methods=['GET'])
@token_required
@role_required('rider')
def get_request_status(request_id):
    """Get status of a specific ride request"""
    rider_id = request.current_user['user_id']
    
    # Find the request with driver info
    pipeline = [
        {
            "$match": {
                "_id": ObjectId(request_id),
                "rider_id": ObjectId(rider_id)
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "driver_id",
                "foreignField": "_id",
                "as": "driver_info"
            }
        },
        {
            "$lookup": {
                "from": "user_profiles",
                "localField": "driver_id",
                "foreignField": "user_id",
                "as": "driver_profile"
            }
        },
        {
            "$unwind": "$driver_info"
        }
    ]
    
    request_data = list(mongo.db.ride_requests.aggregate(pipeline))
    
    if not request_data:
        return jsonify({"error": "Request not found"}), 404
    
    request_info = request_data[0]
    driver_profile = request_info.get('driver_profile', [{}])[0] if request_info.get('driver_profile') else {}
    
    response_data = {
        "request_id": request_id,
        "status": request_info['status'],
        "driver": {
            "name": request_info['driver_info']['name'],
            "phone": driver_profile.get('phone_number', 'Not available'),
            "rating": request_info['driver_info'].get('averageRating', 0)
        },
        "pickup_address": request_info['pickup_address'],
        "destination_address": request_info['destination_address'],
        "estimated_fare": request_info.get('estimated_fare', 0),
        "created_at": request_info['created_at'].isoformat(),
        "updated_at": request_info.get('updated_at', request_info['created_at']).isoformat()
    }
    
    # Add OTP if request is accepted
    if request_info['status'] == 'accepted' and 'otp' in request_info:
        response_data['otp'] = request_info['otp']
        response_data['message'] = "Your ride has been accepted! Share the OTP with your driver."
    elif request_info['status'] == 'rejected':
        response_data['message'] = "Your ride request was declined. Try requesting another ride."
    elif request_info['status'] == 'pending':
        response_data['message'] = "Waiting for driver response..."
    elif request_info['status'] == 'started':
        response_data['message'] = "Your ride has started! Enjoy your trip."
    elif request_info['status'] == 'completed':
        response_data['message'] = "Ride completed successfully!"
    
    return jsonify(response_data), 200

@rides_bp.route('/my-requests', methods=['GET'])
@token_required
@role_required('rider')
def get_my_requests():
    """Get all ride requests for the logged-in rider"""
    rider_id = request.current_user['user_id']
    
    pipeline = [
        {
            "$match": {
                "rider_id": ObjectId(rider_id)
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "driver_id",
                "foreignField": "_id",
                "as": "driver_info"
            }
        },
        {
            "$unwind": "$driver_info"
        },
        {
            "$sort": {"created_at": -1}
        }
    ]
    
    requests = list(mongo.db.ride_requests.aggregate(pipeline))
    
    formatted_requests = []
    for req in requests:
        formatted_requests.append({
            "request_id": str(req['_id']),
            "status": req['status'],
            "driver_name": req['driver_info']['name'],
            "pickup_address": req['pickup_address'],
            "destination_address": req['destination_address'],
            "estimated_fare": req.get('estimated_fare', 0),
            "created_at": req['created_at'].strftime("%Y-%m-%d %H:%M"),
            "otp": req.get('otp') if req['status'] == 'accepted' else None
        })
    
    return jsonify({
        "requests": formatted_requests,
        "total": len(formatted_requests)
    }), 200

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
        },
        {
            "$sort": {"created_at": -1}
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
            "estimated_fare": req.get('estimated_fare', 0),
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
    
    if ride_request['status'] != 'pending':
        return jsonify({"error": "Request is no longer pending"}), 400
    
    if data['action'] == 'accept':
        # Generate 4-digit OTP
        otp = ''.join(random.choices(string.digits, k=4))
        RideRequest.update_status(request_id, 'accepted', otp)
        
        # Reject all other pending requests for this rider
        mongo.db.ride_requests.update_many(
            {
                "rider_id": ride_request['rider_id'],
                "status": "pending",
                "_id": {"$ne": ObjectId(request_id)}
            },
            {
                "$set": {
                    "status": "cancelled",
                    "updated_at": datetime.datetime.utcnow()
                }
            }
        )
        
        return jsonify({
            "message": "Ride request accepted!",
            "otp": otp,
            "note": "Share this OTP with the rider to start the trip",
            "rider_phone": ride_request.get('rider_phone', 'Not available')
        }), 200
    else:
        RideRequest.update_status(request_id, 'rejected')
        return jsonify({"message": "Ride request rejected"}), 200

@rides_bp.route('/verify-otp', methods=['POST'])
@token_required
@role_required('driver')
def verify_otp():
    """Verify OTP and start the ride"""
    data = request.get_json()
    
    required_fields = ['request_id', 'otp']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
    
    driver_id = request.current_user['user_id']
    
    # Find the accepted request
    ride_request = mongo.db.ride_requests.find_one({
        "_id": ObjectId(data['request_id']),
        "driver_id": ObjectId(driver_id),
        "status": "accepted"
    })
    
    if not ride_request:
        return jsonify({"error": "Request not found or not accepted"}), 404
    
    # Verify OTP
    if ride_request.get('otp') != data['otp']:
        return jsonify({"error": "Invalid OTP"}), 400
    
    # Update request status to started
    RideRequest.update_status(data['request_id'], 'started')
    
    return jsonify({
        "message": "OTP verified! Ride has started.",
        "status": "started"
    }), 200

@rides_bp.route('/complete-ride', methods=['POST'])
@token_required
@role_required('driver')
def complete_ride():
    """Complete the active ride"""
    data = request.get_json()
    
    if 'request_id' not in data:
        return jsonify({"error": "Request ID required"}), 400
    
    driver_id = request.current_user['user_id']
    
    # Find the active request
    ride_request = mongo.db.ride_requests.find_one({
        "_id": ObjectId(data['request_id']),
        "driver_id": ObjectId(driver_id),
        "status": "started"
    })
    
    if not ride_request:
        return jsonify({"error": "Active ride not found"}), 404
    
    # Update request status to completed
    RideRequest.update_status(data['request_id'], 'completed')
    
    # Update both rider and driver ratings if provided
    rating_data = data.get('ratings', {})
    if rating_data.get('rider_rating'):
        User.update_rating(ride_request['rider_id'], rating_data['rider_rating'])
    
    return jsonify({
        "message": "Ride completed successfully!",
        "final_fare": ride_request.get('estimated_fare', 0)
    }), 200

@rides_bp.route('/fare-estimate', methods=['POST'])
@token_required
def estimate_fare():
    """Calculate fare estimate using cost-sharing model"""
    data = request.get_json()
    
    required_fields = ['pickup_location', 'destination_location']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing pickup or destination location"}), 400
    
    pickup_coords = data['pickup_location']
    dest_coords = data['destination_location']
    
    # Calculate distance
    distance_km = calculate_haversine_distance(pickup_coords, dest_coords)
    
    # Cost-sharing fare calculation
    estimated_fare = calculate_cost_sharing_fare(distance_km)
    
    return jsonify({
        "distance_km": round(distance_km, 2),
        "estimated_fare": estimated_fare,
        "fare_breakdown": {
            "base_fare": 15,
            "cost_sharing_rate": "₹5-8 per km",
            "total_distance": round(distance_km, 2),
            "note": "Cost-effective shared ride pricing"
        }
    }), 200

@rides_bp.route('/active-ride', methods=['GET'])
@token_required
def get_active_ride():
    """Get active ride information for both rider and driver"""
    user_id = request.current_user['user_id']
    user_role = request.current_user['role']
    
    if user_role == 'driver':
        # Find active ride as driver
        active_request = mongo.db.ride_requests.find_one({
            "driver_id": ObjectId(user_id),
            "status": {"$in": ["accepted", "started"]}
        })
        
        if active_request:
            # Get rider info
            rider_info = mongo.db.users.find_one({"_id": active_request['rider_id']})
            rider_profile = mongo.db.user_profiles.find_one({"user_id": active_request['rider_id']})
            
            return jsonify({
                "has_active_ride": True,
                "ride_info": {
                    "request_id": str(active_request['_id']),
                    "status": active_request['status'],
                    "rider": {
                        "name": rider_info['name'],
                        "phone": rider_profile.get('phone_number', 'Not available') if rider_profile else 'Not available'
                    },
                    "pickup_address": active_request['pickup_address'],
                    "destination_address": active_request['destination_address'],
                    "estimated_fare": active_request.get('estimated_fare', 0),
                    "otp": active_request.get('otp') if active_request['status'] == 'accepted' else None
                }
            }), 200
    else:
        # Find active ride as rider
        active_request = mongo.db.ride_requests.find_one({
            "rider_id": ObjectId(user_id),
            "status": {"$in": ["pending", "accepted", "started"]}
        })
        
        if active_request:
            # Get driver info
            driver_info = mongo.db.users.find_one({"_id": active_request['driver_id']})
            driver_profile = mongo.db.user_profiles.find_one({"user_id": active_request['driver_id']})
            
            return jsonify({
                "has_active_ride": True,
                "ride_info": {
                    "request_id": str(active_request['_id']),
                    "status": active_request['status'],
                    "driver": {
                        "name": driver_info['name'],
                        "phone": driver_profile.get('phone_number', 'Not available') if driver_profile else 'Not available',
                        "rating": driver_info.get('averageRating', 0)
                    },
                    "pickup_address": active_request['pickup_address'],
                    "destination_address": active_request['destination_address'],
                    "estimated_fare": active_request.get('estimated_fare', 0),
                    "otp": active_request.get('otp') if active_request['status'] == 'accepted' else None,
                    "created_at": active_request['created_at'].isoformat()
                }
            }), 200
    
    return jsonify({"has_active_ride": False}), 200